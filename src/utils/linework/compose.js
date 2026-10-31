// Composes a Linework design: the base layer plus up to three stacked plates,
// each generated with the angular (A) or circuit (B) engine, into a flat list
// of vector items in design units (CELL per grid cell, origin at the grid's
// top-left). DocumentEditor colours them and turns each into a vector block.
//
// Items: { key, name, kind, layer, contours, centre, blur? }
//   kind — 'ink' (lines), 'outline' (tile borders), 'ground' (a plate's
//          background, or the base's when split from the canvas colour),
//          'shadow' (a plate's drop shadow) or 'rim' (a plate's edge).
//   key  — stable for the same seed and settings, so regenerating carries
//          each layer's edits across.

import { plateCells } from '../../modes/linework/settings';
import { angularLayer } from './angular';
import { circuitLayer, replicateBundles } from './circuit';
import {
  add, inset, clipToPlanes, halfPlanesOf, rectPoly, polyContour, mapContour,
  SYM_OPS, SYM_DOMAIN, fitSymmetry, applyLinear, contoursBounds,
} from './geometry';

export const CELL = 100;

const rotation = (deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, s, c];
};
const NAMES = { ink: 'Lines', outline: 'Outlines', ground: 'Ground', shadow: 'Shadow', rim: 'Rim' };

// The base layer's size and rotation for the grid: the whole grid, or for a
// diamond the largest square that fits it turned 45°.
export function baseFrame(settings, grid) {
  if (settings.orientation === 'diamond') {
    const n = Math.max(1, Math.floor(Math.min(grid.cols, grid.rows) / Math.SQRT2 + 1e-6));
    return { w: n * CELL, h: n * CELL, rot: 45, cells: n };
  }
  return { w: grid.cols * CELL, h: grid.rows * CELL, rot: 0, cells: null };
}

// settings: the document's lineworkSettings. grid: { cols, rows }.
// maskFor(layerIndex, cols, rows): the layer's region mask over a cols × rows
// cell grid (a Set of "col,row"), or null.
// baseGround: include a ground item for the base layer (ground split from canvas).
// areas: cell rects { x, y, w, h } the base layer fills (a page layout's grid
// areas); the whole grid by default. Plates sit on the first area.
export function composeLinework(settings, grid, { maskFor = () => null, baseGround = false, areas = null } = {}) {
  const W = grid.cols * CELL, H = grid.rows * CELL;
  const frames = (areas?.length ? areas : [{ x: 0, y: 0, w: grid.cols, h: grid.rows }]).map(a => {
    const base = baseFrame(settings, { cols: a.w, rows: a.h });
    const baseM = rotation(base.rot);
    const centre = [(a.x + a.w / 2) * CELL, (a.y + a.h / 2) * CELL];
    const basePlanes = halfPlanesOf(rectPoly(-base.w / 2, -base.h / 2, base.w, base.h).map(p => add(applyLinear(baseM, p), centre)));
    return { base, baseM, centre, basePlanes };
  });
  const n = Math.max(1, settings.linesPerCell ?? 3);
  const ratio = Math.min(0.95, Math.max(0.05, settings.lineRatio ?? 0.5));
  const items = [];
  const counts = {};
  const nameFor = (layer, label) => {
    const k = `${layer}:${label}`;
    counts[k] = (counts[k] ?? 0) + 1;
    return `${label} ${counts[k]}`;
  };

  // One layer in one frame; `tag` prefixes its items' keys.
  const buildLayer = (cfg, li, { base, baseM, centre, basePlanes }, tag) => {
    const plate = li > 0;
    const [pw, ph] = plate ? plateCells(cfg, { w: base.w, h: base.h }) : [0, 0];
    const lw = plate ? pw * CELL : base.w, lh = plate ? ph * CELL : base.h;
    const rotDeg = base.rot + (plate && cfg.shape === 'diamond' ? 45 : 0);
    const m = rotation(rotDeg);
    const t = plate ? add(centre, applyLinear(baseM, [(cfg.ox ?? 0) * CELL, (cfg.oy ?? 0) * CELL])) : centre;
    const toDesign = (P) => P.map(p => add(applyLinear(m, p), t));
    // Plates are cut to the canvas too.
    const finish = (P) => (plate ? clipToPlanes(toDesign(P), basePlanes) : toDesign(P));
    const C = CELL * (cfg.scale ?? 1);
    const p = C / n;
    const L = { w: lw, h: lh, C, p, lineW: p * ratio, ratio };
    const sym = fitSymmetry(cfg.sym ?? 'none', lw, lh);
    const seed = cfg.seed | 0;
    const layerRect = rectPoly(-lw / 2, -lh / 2, lw, lh);
    const layerPlanes = halfPlanesOf(layerRect);
    const push = (item) => items.push({ layer: li, layerId: cfg.id ?? (li ? `p${li}` : 'base'), ...item });

    // A plate's shadow and ground sit under its lines.
    if (plate && cfg.shadow && cfg.shadow !== 'none' && (cfg.depth ?? 0) > 0) {
      const d = cfg.depth * CELL;
      const off = [d * Math.SQRT1_2, d * Math.SQRT1_2];
      const P = clipToPlanes(toDesign(layerRect).map(q => add(q, off)), basePlanes);
      const soft = cfg.shadow === 'soft';
      if (P) push({ key: `${tag}:shadow`, name: NAMES.shadow, kind: 'shadow', contours: [polyContour(P)], blur: soft ? d * 0.6 : 0, opacity: soft ? 0.55 : 1 });
    }
    if (plate || baseGround) {
      const P = finish(layerRect);
      if (P) push({ key: `${tag}:ground`, name: NAMES.ground, kind: 'ground', contours: [polyContour(P)] });
    }

    if (cfg.style === 'circuit') {
      // Circuit symmetry: mirrors only; rotations become their mirror equivalent.
      const csym = sym === 'mirror-x' || sym === 'mirror-y' || sym === 'none' ? sym : 'mirror-both';
      const S = Math.max(1, cfg.bundle ?? 1) * C;
      const bc = Math.max(1, Math.floor(lw / S + 1e-6)), br = Math.max(1, Math.floor(lh / S + 1e-6));
      const mask = cfg.mask && cfg.mask !== 'none' ? maskFor(li, bc, br) : null;
      const R = circuitLayer(L, cfg, seed, csym, mask ? (i, j) => mask.has(`${i},${j}`) : null);
      // One circuit is built whole (already symmetric), so it isn't copied.
      for (const b of replicateBundles(R.bundles, R.whole ? 'none' : csym)) {
        push({
          key: `${tag}:b:${b.key}`, name: nameFor(li, cfg.route === 'single' ? 'Circuit' : b.single ? 'Eye' : 'Bundle'), kind: 'ink',
          contours: b.contours.map(c => mapContour(c, m, t)), centre: add(applyLinear(m, b.centre), t),
        });
      }
    } else {
      const planes = SYM_DOMAIN[sym];
      const ops = SYM_OPS[sym];
      const dom = sym === 'none' ? null : [
        -lw / 2, -lh / 2,
        planes.some(q => q.n[0] === -1) ? 0 : lw / 2,
        planes.some(q => q.n[1] === -1) ? 0 : lh / 2,
      ];
      const cols = Math.max(1, Math.round(lw / C)), rows = Math.max(1, Math.round(lh / C));
      const mask = cfg.mask && cfg.mask !== 'none' ? maskFor(li, cols, rows) : null;
      const inside = mask ? (x, y) => mask.has(`${Math.floor((x + lw / 2) / C)},${Math.floor((y + lh / 2) / C)}`) : null;
      const { regions, outlines } = angularLayer(L, cfg, seed, dom, inside, { ops, planes });
      // Clip to the symmetry domain, copy by each map, clip to the layer.
      // With outlines on, the content shrinks by half a line all round so the
      // full-width Edge (below) frames it like the borders between tiles.
      const fx = cfg.outline ? (lw - L.lineW) / lw : 1, fy = cfg.outline ? (lh - L.lineW) / lh : 1;
      const at = (op, v) => { const q = applyLinear(op, v); return [q[0] * fx, q[1] * fy]; };
      const place = (shapes, opIdx) => {
        const op = ops[opIdx];
        const out = [];
        for (const sh of shapes) {
          let s = clipToPlanes(sh.s, planes);
          if (!s) continue;
          let h = sh.h ? clipToPlanes(sh.h, planes) : null;
          s = clipToPlanes(s.map(v => at(op, v)), layerPlanes);
          if (!s) continue;
          h = h ? clipToPlanes(h.map(v => at(op, v)), layerPlanes) : null;
          s = finish(s);
          if (!s) continue;
          h = h ? finish(h) : null;
          out.push(polyContour(s, true));
          if (h) out.push(polyContour(h, false));
        }
        return out;
      };
      for (const reg of regions) {
        ops.forEach((_, oi) => {
          const contours = place(reg.shapes, oi);
          if (!contours.length) return;
          const b = contoursBounds(contours);
          push({
            key: `${tag}:a:${reg.key}#${oi}`, name: nameFor(li, reg.name), kind: 'ink', contours,
            centre: b ? [b.x + b.w / 2, b.y + b.h / 2] : centre,
          });
        });
      }
      if (outlines.length) {
        const contours = ops.flatMap((_, oi) => place(outlines, oi));
        if (contours.length) push({ key: `${tag}:outline`, name: NAMES.outline, kind: 'outline', contours, centre: t });
        // Tiles draw half of each shared border, so the layer's own edge
        // would be half as thick as the borders inside it; its own full-width
        // Edge layer evens that up (and can be recoloured or hidden alone).
        const outer = finish(layerRect), innerP = inset(layerRect, L.lineW);
        const inner = innerP ? finish(innerP) : null;
        if (outer) {
          push({
            key: `${tag}:edge`, name: 'Edge', kind: 'outline', centre: t,
            contours: [polyContour(outer, true), ...(inner ? [polyContour(inner, false)] : [])],
          });
        }
      }
    }

    // A frame around the base, a rim around a plate.
    const ring = (width) => {
      const outer = layerRect, inner = inset(layerRect, width * CELL);
      const so = finish(outer), si = inner ? finish(inner) : null;
      return so ? [polyContour(so, true), ...(si ? [polyContour(si, false)] : [])] : null;
    };
    if (!plate && (cfg.frame ?? 0) > 0) {
      const contours = ring(cfg.frame);
      if (contours) push({ key: `${tag}:frame`, name: 'Frame', kind: 'ink', contours, centre: t });
    }
    if (plate && (cfg.rim ?? 0) > 0) {
      const contours = ring(cfg.rim);
      if (contours) push({ key: `${tag}:rim`, name: NAMES.rim, kind: 'rim', contours, centre: t });
    }
  };

  const layers = settings.layers ?? [];
  layers.forEach((cfg, li) => {
    if (!cfg || (li > 0 && !cfg.enabled)) return;
    if (li === 0) frames.forEach((f, ai) => buildLayer(cfg, 0, f, ai ? `L0a${ai}` : 'L0'));
    else buildLayer(cfg, li, frames[0], `P${cfg.id ?? li}`);
  });

  for (const it of items) it.centre ??= frames[0].centre;
  return { width: W, height: H, items, baseCells: frames[0].base.cells };
}

// Plates as groups: the layer index each plate's items belong to.
export const plateOf = (item) => (item.layer > 0 ? item.layer : null);

