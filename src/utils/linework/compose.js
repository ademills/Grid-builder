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
import { cellCircuitLayer, cellCircuitSize } from './cellCircuit';
import { tilingCells } from './tilings';
import {
  add, inset, clipToPlanes, halfPlanesOf, rectPoly, polyContour, mapContour,
  SYM_OPS, SYM_DOMAIN, fitSymmetry, applyLinear, contoursBounds, roundedRectPoly,
} from './geometry';

export const CELL = 100;

const rotation = (deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, -s, s, c];
};
const NAMES = { ink: 'Lines', outline: 'Outlines', ground: 'Ground', shadow: 'Shadow', rim: 'Rim' };

// A plate's background (cfg.backing): 'square' (its rectangle, corners
// rounded by cfg.corner), 'none', or — circuit plates only — one built from
// its bundles: 'outline' (round them all, filling what they enclose),
// 'sticker' (round each one) or 'infill' (between each one's lines).
// Outline and sticker stand cfg.pad cells clear of the lines.
const BANDED = { outline: 'Outline', sticker: 'Sticker', infill: 'In-fill' };

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
// The base layer's frame in each area: its size, rotation and centre.
function baseFrames(settings, grid, areas) {
  return (areas?.length ? areas : [{ x: 0, y: 0, w: grid.cols, h: grid.rows }]).map(a => {
    const base = baseFrame(settings, { cols: a.w, rows: a.h });
    const baseM = rotation(base.rot);
    const centre = [(a.x + a.w / 2) * CELL, (a.y + a.h / 2) * CELL];
    const basePlanes = halfPlanesOf(rectPoly(-base.w / 2, -base.h / 2, base.w, base.h).map(p => add(applyLinear(baseM, p), centre)));
    return { base, baseM, centre, basePlanes };
  });
}

const lineSize = (settings) => ({
  n: Math.max(1, settings.linesPerCell ?? 3),
  ratio: Math.min(0.95, Math.max(0.05, settings.lineRatio ?? 0.5)),
});

// The base layer's cells (hexagons, triangles or Voronoi) as polygons in
// design units, for View › Grid to draw. Built with the same size, seed and
// symmetry as the layer itself. Null for square cells.
export function lineworkGridCells(settings, grid, { areas = null } = {}) {
  const tiling = settings.tiling ?? 'square';
  const cfg = settings.layers?.[0];
  if (tiling === 'square' || !cfg) return null;
  const { n, ratio } = lineSize(settings);
  return baseFrames(settings, grid, areas).flatMap(({ base, baseM, centre }) => {
    const C = CELL * (cfg.scale ?? 1);
    const L = { w: base.w, h: base.h, C, p: C / n, ratio };
    const seed = cfg.seed | 0, regularity = settings.regularity ?? 0.5;
    let cells;
    if (cfg.style === 'circuit') {
      cells = tilingCells(tiling, L.w, L.h, cellCircuitSize(L, cfg, tiling), { seed, regularity });
    } else {
      const sym = fitSymmetry(cfg.sym ?? 'none', L.w, L.h);
      cells = tilingCells(tiling, L.w, L.h, Math.max(1, cfg.tile) * C, { seed, ops: SYM_OPS[sym], planes: SYM_DOMAIN[sym], regularity });
    }
    return cells.map(c => c.P.map(p => add(applyLinear(baseM, p), centre)));
  });
}

export function composeLinework(settings, grid, { maskFor = () => null, baseGround = false, areas = null } = {}) {
  const W = grid.cols * CELL, H = grid.rows * CELL;
  const frames = baseFrames(settings, grid, areas);
  const { n, ratio } = lineSize(settings);
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

    // A plate's background shape, its corners rounded; inset by d.
    let backing = plate ? (cfg.backing ?? 'square') : 'square';
    if (BANDED[backing] && cfg.style !== 'circuit') backing = 'square';
    const banded = plate && !!BANDED[backing];
    const radius = plate ? Math.max(0, cfg.corner ?? 0) * Math.min(lw, lh) / 2 : 0;
    const plateShape = (d = 0) => (lw - 2 * d > 0 && lh - 2 * d > 0
      ? roundedRectPoly(-lw / 2 + d, -lh / 2 + d, lw - 2 * d, lh - 2 * d, Math.max(0, radius - d)) : null);
    const shadow = plate && backing !== 'none' && cfg.shadow && cfg.shadow !== 'none' && (cfg.depth ?? 0) > 0
      ? { d: cfg.depth * CELL, soft: cfg.shadow === 'soft' } : null;
    const shadowItem = (contours) => {
      const off = [shadow.d * Math.SQRT1_2, shadow.d * Math.SQRT1_2];
      return { key: `${tag}:shadow`, name: NAMES.shadow, kind: 'shadow', contours: contours.map(c => mapContour(c, [1, 0, 0, 1], off)),
        blur: shadow.soft ? shadow.d * 0.6 : 0, opacity: shadow.soft ? 0.55 : 1 };
    };

    // A plate's shadow and ground sit under its lines. A banded ground is
    // only known once the bundles are built: it goes in here afterwards.
    const groundAt = items.length;
    if (plate ? backing === 'square' : baseGround) {
      const P = finish(plateShape());
      if (P) {
        if (shadow) {
          const S = clipToPlanes(P.map(q => add(q, [shadow.d * Math.SQRT1_2, shadow.d * Math.SQRT1_2])), basePlanes);
          if (S) push({ ...shadowItem([]), contours: [polyContour(S)] });
        }
        push({ key: `${tag}:ground`, name: NAMES.ground, kind: 'ground', contours: [polyContour(P)] });
      }
    }
    // Banded grounds: each bundle's band (one group per copy), plus the
    // cells an Outline encloses.
    const bands = [];
    const bandOpts = banded ? { band: backing === 'infill' ? 0 : (cfg.pad ?? 0.15) * CELL, holes: backing === 'outline' } : {};
    const toBand = (groups) => { for (const g of groups ?? []) bands.push(g.map(c => mapContour(c, m, t))); };

    const tiling = settings.tiling ?? 'square';
    if (cfg.style === 'circuit' && tiling !== 'square') {
      // Circuits through hexagons, triangles or Voronoi cells (no symmetry or mask).
      const R = cellCircuitLayer(L, cfg, seed, tiling, settings.regularity ?? 0.5, cfg.route === 'single', bandOpts);
      for (const b of R.bundles) {
        if (b.band) toBand([b.band]);
        push({
          key: `${tag}:c:${b.index}`, name: nameFor(li, cfg.route === 'single' ? 'Circuit' : 'Bundle'), kind: 'ink',
          contours: b.contours.map(c => mapContour(c, m, t)), centre: add(applyLinear(m, b.centre), t),
        });
      }
    } else if (cfg.style === 'circuit') {
      // Circuit symmetry: mirrors only; rotations become their mirror equivalent.
      const csym = sym === 'mirror-x' || sym === 'mirror-y' || sym === 'none' ? sym : 'mirror-both';
      const S = Math.max(1, cfg.bundle ?? 1) * C;
      const bc = Math.max(1, Math.floor(lw / S + 1e-6)), br = Math.max(1, Math.floor(lh / S + 1e-6));
      const mask = cfg.mask && cfg.mask !== 'none' ? maskFor(li, bc, br) : null;
      const R = circuitLayer(L, cfg, seed, csym, mask ? (i, j) => mask.has(`${i},${j}`) : null, bandOpts);
      for (const P of R.holes ?? []) bands.push([polyContour(toDesign(P))]);
      // One circuit is built whole (already symmetric), so it isn't copied.
      for (const b of replicateBundles(R.bundles, R.whole ? 'none' : csym)) {
        toBand(b.bands);
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
      const { regions, outlines } = angularLayer(L, { ...cfg, tiling, regularity: settings.regularity }, seed, dom, inside, { ops, planes });
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

    if (banded && bands.length) {
      // Every piece is a solid wound the same way, so they merge where they meet.
      const contours = bands.flat();
      items.splice(groundAt, 0, ...[
        ...(shadow ? [shadowItem(contours)] : []),
        { key: `${tag}:ground`, name: BANDED[backing], kind: 'ground', contours },
      ].map(it => ({ layer: li, layerId: cfg.id ?? `p${li}`, ...it })));
    }

    // A frame around the base, a rim around a plate (square backing only).
    const ring = (width) => {
      const outer = plateShape(), inner = plateShape(width * CELL);
      const so = finish(outer), si = inner ? finish(inner) : null;
      return so ? [polyContour(so, true), ...(si ? [polyContour(si, false)] : [])] : null;
    };
    if (!plate && (cfg.frame ?? 0) > 0) {
      const contours = ring(cfg.frame);
      if (contours) push({ key: `${tag}:frame`, name: 'Frame', kind: 'ink', contours, centre: t });
    }
    if (plate && backing === 'square' && (cfg.rim ?? 0) > 0) {
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

