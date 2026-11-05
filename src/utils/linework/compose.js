// Composes a Linework design: the base layer plus up to three stacked plates,
// each generated with the angular (A), circuit (B) or continuous (C) engine, into a flat list
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
import { continuousLayer } from './continuous';
import { tilingCells } from './tilings';
import { shapeCutter, shapeSubtracter, cellsForShape, shapeInPlate, intersectRings, insetRings, subtractRings, ringsContours, isShapePlate } from './shapeClip';
import {
  add, inset, clipToPlanes, halfPlanesOf, rectPoly, polyContour, mapContour,
  SYM_OPS, SYM_DOMAIN, fitSymmetry, applyLinear, contoursBounds, roundedRectPoly, hash,
} from './geometry';

export const CELL = 100;

// A layer's engine: 'angular' (the default), 'circuit' or 'continuous'.
const styleOf = cfg => (cfg.style === 'circuit' || cfg.style === 'continuous' ? cfg.style : 'angular');
// Circuits and continuous lines are laid out on whole cells, centred: a
// circuit's are Bundle size across, continuous lines' one grid cell (they
// merge cells their own way).
const gridded = cfg => styleOf(cfg) !== 'angular';
const cellOf = (cfg, C) => (styleOf(cfg) === 'circuit' ? Math.max(1, cfg.bundle ?? 1) * C : C);

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
    // Plates are cut to the area (the canvas), not to the base layer: on a
    // diamond they can reach past the base into the corners.
    const areaRect = rectPoly(a.x * CELL, a.y * CELL, a.w * CELL, a.h * CELL);
    return { base, baseM, centre, basePlanes, areaRect, areaPlanes: halfPlanesOf(areaRect) };
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
  if (tiling === 'square' || !cfg || styleOf(cfg) === 'continuous') return null;
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

// A layer's size and placement in one frame: lw × lh, turned by m about its
// centre t (design units). An upright plate (one made from an SVG) sits on
// the canvas as drawn: not turned with a diamond base, its offset in canvas
// cells.
function layerPlace(cfg, li, { base, baseM, centre }) {
  const plate = li > 0;
  const [pw, ph] = plate ? plateCells(cfg, { w: base.w, h: base.h }) : [0, 0];
  const upright = plate && !!cfg.upright;
  const rotDeg = upright ? 0 : base.rot + (plate && cfg.shape === 'diamond' && !isShapePlate(cfg) ? 45 : 0);
  const off = [(cfg.ox ?? 0) * CELL, (cfg.oy ?? 0) * CELL];
  return {
    lw: plate ? pw * CELL : base.w, lh: plate ? ph * CELL : base.h, m: rotation(rotDeg),
    t: plate ? add(centre, upright ? off : applyLinear(baseM, off)) : centre,
  };
}

// A shape plate in Mask mode is a plate with a region mask of its shape,
// inverted (the editor's maskFor rasterises it, as a silhouette).
const asShapeMask = (cfg, li) => (li > 0 && isShapePlate(cfg) && cfg.shapeMode === 'mask'
  ? { ...cfg, mask: 'shape', maskMode: 'invert', maskShapes: 'one' } : cfg);
// A shape plate in Cutout mode (the default): cut to the shape itself.
const cutsToShape = (cfg, li) => li > 0 && isShapePlate(cfg) && (cfg.shapeMode ?? 'cutout') === 'cutout';
// Each shown plate's box on the canvas, in grid cells (for dragging plates
// on the canvas): { id, cx, cy, w, h, rot (degrees), baseRot, area }, bottom
// to top. area: the cells the plates sit on ({ x, y, w, h }).
export function plateBoxes(settings, grid, { areas = null } = {}) {
  const frames = baseFrames(settings, grid, areas);
  const f = frames[0];
  const area = areas?.[0] ?? { x: 0, y: 0, w: grid.cols, h: grid.rows };
  return (settings.layers ?? []).flatMap((cfg, li) => {
    if (li === 0 || !cfg.enabled) return [];
    const { lw, lh, m, t } = layerPlace(cfg, li, f);
    return [{ id: cfg.id, cx: t[0] / CELL, cy: t[1] / CELL, w: lw / CELL, h: lh / CELL,
      rot: Math.round(Math.atan2(m[2], m[0]) * 180 / Math.PI), baseRot: f.base.rot, area, upright: !!cfg.upright }];
  });
}

// A plate's Offset X / Y for its centre at (cx, cy) on the canvas, in cells
// (the inverse of layerPlace): measured from the area's centre, turned back
// into the base's frame unless the plate is upright.
export function plateOffsetFor(box, cx, cy) {
  const dx = cx - (box.area.x + box.area.w / 2), dy = cy - (box.area.y + box.area.h / 2);
  if (box.upright || !box.baseRot) return [dx, dy];
  const a = (-box.baseRot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c * dx - s * dy, s * dx + c * dy];
}

// A design point in a layer's own frame (m is a rotation: its inverse is its transpose).
const toLocal = ({ m, t }, q) => applyLinear([m[0], m[2], m[1], m[3]], [q[0] - t[0], q[1] - t[1]]);

// Hand-built layers (v1.11). A layer keeps, for each frame it's built in
// (its tag), the route or tiles it was edited to: cfg.hand[tag] = { sig,
// ...data } -- a circuit's route (circuit.js, cellCircuit.js) or an angular
// layer's { tiles } (angular.js). It's drawn while sig, the settings and
// size the layer's layout comes from, still matches; anything else lays the
// layer out afresh.
const HAND_KEYS = {
  circuit: ['seed', 'bundle', 'scale', 'route', 'fill', 'loop', 'straight', 'density', 'maxLen', 'edgeExit', 'weave', 'eyes', 'mask', 'maskMode'],
  angular: ['seed', 'tile', 'scale', 'subdiv', 'minTile'],
  // A continuous layer keeps its turn cells' rules, by cell: its route comes
  // from these, and the cells from the size.
  continuous: ['seed', 'scale', 'route', 'maxLen', 'straight', 'mergeCells', 'mergeMax', 'merge', 'mask', 'maskMode'],
};
function handSig(cfg, settings, lw, lh, sym) {
  const style = styleOf(cfg);
  // Continuous lines are always laid out on square cells.
  const tiling = style === 'continuous' ? 'square' : settings.tiling ?? 'square';
  // Merged tiles move the tiles too (left out while off, so older layouts still match).
  const merge = style === 'angular' && cfg.merge > 0 ? [cfg.merge] : [];
  // Exact mask edges change which cells are filled (left out while off, as merge is).
  if (cfg.maskEdge === 'exact' && masked(cfg)) merge.push('exact');
  return JSON.stringify([style, ...HAND_KEYS[style].map(k => cfg[k] ?? null), ...merge, tiling,
    tiling === 'square' ? null : settings.regularity ?? 0.5, sym, Math.round(lw), Math.round(lh)]);
}

const insidePoly = (P, [x, y]) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const masked = (cfg) => cfg.mask && cfg.mask !== 'none';

// A mask's separate shapes: its cells joined edge to edge, each with its
// bounding box in cells, in reading order.
export function maskShapes(mask, cols, rows) {
  const seen = new Set();
  const shapes = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k0 = `${i},${j}`;
      if (!mask.has(k0) || seen.has(k0)) continue;
      const cells = new Set([k0]);
      seen.add(k0);
      const todo = [[i, j]];
      let x0 = i, y0 = j, x1 = i, y1 = j;
      while (todo.length) {
        const [a, b] = todo.pop();
        x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
        for (const [c, d] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]]) {
          const k = `${c},${d}`;
          if (c < 0 || d < 0 || c >= cols || d >= rows || seen.has(k) || !mask.has(k)) continue;
          seen.add(k);
          cells.add(k);
          todo.push([c, d]);
        }
      }
      shapes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cells });
    }
  }
  return shapes;
}

// edit (a hand edit, see lineworkHandEdit): { at: [x, y] } a design point
// -- the topmost layer there takes out what's at that point or grows
// something new into it -- or { remove: Set of item keys }; rng draws the
// randomness for anything grown. The changed layers come back as `edits`:
// [{ li, layerId, tag, op: 'remove' | 'grow', hand }], hand being the
// layer's new cfg.hand[tag].
// maskShapeFor(layerIndex, lw, lh): an exact mask's outline (rings in the
// layer's box, -0.5…0.5) for a layer with maskEdge 'exact', or null (none,
// or not traced yet: the cells are used meanwhile).
export function composeLinework(settings, grid, { maskFor = () => null, maskShapeFor = () => null, baseGround = false, areas = null, edit = null } = {}) {
  const W = grid.cols * CELL, H = grid.rows * CELL;
  const frames = baseFrames(settings, grid, areas);
  const { n, ratio } = lineSize(settings);
  const items = [];
  const edits = [];
  const counts = {};
  const nameFor = (layer, label) => {
    const k = `${layer}:${label}`;
    counts[k] = (counts[k] ?? 0) + 1;
    return `${label} ${counts[k]}`;
  };
  const layers = (settings.layers ?? []).map(asShapeMask);
  const framesOf = (cfg, li) => (li === 0 ? frames.map((f, ai) => [f, ai ? `L0a${ai}` : 'L0']) : [[frames[0], `P${cfg.id ?? li}`]]);
  const shown = (cfg, li) => cfg && (li === 0 || cfg.enabled);

  // The layer and frame a point edit goes to: the topmost one under it.
  let target = null;
  if (edit?.at) {
    for (let li = layers.length - 1; li >= 0 && !target; li--) {
      if (!shown(layers[li], li)) continue;
      for (const [f, tag] of framesOf(layers[li], li)) {
        const place = layerPlace(layers[li], li, f);
        const [x, y] = toLocal(place, edit.at);
        if (Math.abs(x) <= place.lw / 2 && Math.abs(y) <= place.lh / 2) { target = { li, tag, at: [x, y] }; break; }
      }
    }
  }
  // The edit for one layer's frame, as its engine takes it, or null.
  // remove: item keys `${tag}:b:<bundle>#<copy>` (`:c:` on cells) or
  // `${tag}:a:<region>#<copy>`, a region's key being its tile's or, for a
  // split tile, `<tile>:<part>`.
  // run: the engine run it's for (layerRuns), whose tag the keys carry.
  const editFor = (li, frameTag, run, style) => {
    if (edit?.at) {
      return target && target.li === li && target.tag === frameTag && run.owns(target.at)
        ? { at: [target.at[0] - run.c[0], target.at[1] - run.c[1]], rng: edit.rng } : null;
    }
    if (!edit?.remove) return null;
    const tag = run.tag;
    const ids = new Set();
    for (const k of edit.remove) {
      const m = /^([^:]+):([abc]):(.+)#\d+$/.exec(k);
      if (!m || m[1] !== tag) continue;
      if (style === 'angular' && m[2] === 'a') ids.add(m[3].replace(/:\d+$/, ''));
      if (style === 'circuit' && m[2] !== 'a') ids.add(Number(m[3]));
    }
    return ids.size ? { remove: ids, rng: edit.rng } : null;
  };

  // The cells a masked layer fills over a cols × rows grid: the mask's own
  // (Invert) or every other one (Remove). Null for no mask.
  const keptFor = (cfg, li) => (cols, rows) => {
    const mask = maskFor(li, cols, rows);
    if (!mask || cfg.maskMode === 'invert') return mask;
    const rest = new Set();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (!mask.has(`${i},${j}`)) rest.add(`${i},${j}`);
    return rest;
  };

  // The runs of its engine a layer is built from: one over the whole layer
  // or, with a mask's shapes taken separately (cfg.maskShapes 'each'), one
  // per separate shape it keeps -- sized to its bounding box, centred and
  // mirrored on it, with its own seed. A run: { cfg, tag, lw, lh, c (its
  // centre in the layer's frame), maskAt(cols, rows) (the cells it fills),
  // owns(point), sub }.
  // An exact mask's outline in the layer's own frame, or null.
  const exactFor = (cfg, li, lw, lh) => {
    if (cfg.maskEdge !== 'exact' || !masked(cfg) || cfg.mask === 'shape') return null;
    const rings = maskShapeFor(li, lw, lh);
    return rings?.length ? rings.map(r => r.map(([x, y]) => [x * lw, y * lh])) : null;
  };
  // With an exact mask, the cells to lay out are those the outline touches
  // (Invert) or doesn't wholly cover (Remove); the lines are then cut to it.
  const exactCells = (cfg, shape, lw, lh) => (cols, rows) => {
    const C = CELL * (cfg.scale ?? 1);
    const g = gridded(cfg) ? cellOf(cfg, C) : null;
    const cw = g ?? lw / cols, ch = g ?? lh / rows;
    return cellsForShape(shape, { cols, rows, cw, ch, ox: g ? -cols * g / 2 : -lw / 2, oy: g ? -rows * g / 2 : -lh / 2, invert: cfg.maskMode === 'invert' });
  };

  const layerRuns = (cfg, li, lw, lh, tag) => {
    const exact = exactFor(cfg, li, lw, lh);
    const keep = exact ? exactCells(cfg, exact, lw, lh) : keptFor(cfg, li);
    const whole = { cfg, tag, lw, lh, c: [0, 0], maskAt: keep, owns: () => true, exact };
    if (!masked(cfg) || cfg.maskShapes !== 'each' || exact) return [whole];
    // The grid the layer reads its mask on (as in runLayer): bundles, or cells.
    const C = CELL * (cfg.scale ?? 1);
    const circuit = gridded(cfg);
    const g = cellOf(cfg, C);
    const cols = circuit ? Math.max(1, Math.floor(lw / g + 1e-6)) : Math.max(1, Math.round(lw / C));
    const rows = circuit ? Math.max(1, Math.floor(lh / g + 1e-6)) : Math.max(1, Math.round(lh / C));
    const mask = keep(cols, rows);
    if (!mask?.size) return [whole];
    const ox = circuit ? -cols * g / 2 : -lw / 2, oy = circuit ? -rows * g / 2 : -lh / 2;
    const cellAt = ([x, y]) => `${Math.floor((x - ox) / g)},${Math.floor((y - oy) / g)}`;
    return maskShapes(mask, cols, rows).map((sh, k) => {
      const own = new Set([...sh.cells].map(key => {
        const [i, j] = key.split(',').map(Number);
        return `${i - sh.x},${j - sh.y}`;
      }));
      return {
        // A bundle running off a shape's box would stop dead inside the design.
        cfg: { ...cfg, edgeExit: 0, seed: hash(cfg.seed | 0, k + 1) & 0x7fffffff },
        tag: `${tag}s${k + 1}`, lw: sh.w * g, lh: sh.h * g,
        c: [ox + (sh.x + sh.w / 2) * g, oy + (sh.y + sh.h / 2) * g],
        maskAt: () => own, owns: at => sh.cells.has(cellAt(at)), sub: [sh.x, sh.y],
      };
    });
  };

  // One run of a layer's engine (see layerRuns): its lines, placed at t.
  const runLayer = (run, li, frame, frameTag, { m, t, bands, bandOpts }) => {
    const { cfg, tag, lw, lh } = run;
    const { centre, areaPlanes } = frame;
    const plate = li > 0;
    const toDesign = (P) => P.map(p => add(applyLinear(m, p), t));
    const finish = (P) => (plate ? clipToPlanes(toDesign(P), areaPlanes) : toDesign(P));
    const C = CELL * (cfg.scale ?? 1);
    const p = C / n;
    const L = { w: lw, h: lh, C, p, lineW: p * ratio, ratio };
    const sym = fitSymmetry(cfg.sym ?? 'none', lw, lh);
    const seed = cfg.seed | 0;
    const layerRect = rectPoly(-lw / 2, -lh / 2, lw, lh);
    const layerPlanes = halfPlanesOf(layerRect);
    const push = (item) => items.push({ layer: li, layerId: cfg.id ?? (li ? `p${li}` : 'base'), ...item });
    const toBand = (groups) => { for (const g of groups ?? []) bands.push(g.map(c => mapContour(c, m, t))); };

    const tiling = settings.tiling ?? 'square';
    // Circuit symmetry: mirrors only; rotations become their mirror equivalent.
    const csym = sym === 'mirror-x' || sym === 'mirror-y' || sym === 'none' ? sym : 'mirror-both';
    // A hand-built layout, while it's current; and any edit to make to it.
    const style = styleOf(cfg);
    // A shape's run (layerRuns) is laid out for that shape where it is.
    const sig = handSig(cfg, settings, lw, lh, style === 'circuit' ? csym : sym) + (run.sub ? `@${run.sub}` : '');
    const stored = cfg.hand?.[tag];
    const hand = stored && stored.sig === sig ? stored : null;
    const editHere = editFor(li, frameTag, run, style);
    const record = (op, data) => edits.push({ li, layerId: cfg.id ?? (li ? `p${li}` : 'base'), tag, op, hand: { sig, ...data } });
    if (style === 'continuous') {
      // Continuous lines (square cells only). The mask is read on the cell grid.
      const S = C;
      const bc = Math.max(1, Math.floor(lw / S + 1e-6)), br = Math.max(1, Math.floor(lh / S + 1e-6));
      const mask = masked(cfg) ? run.maskAt(bc, br) : null;
      const R = continuousLayer(L, cfg, seed, mask ? (i, j) => mask.has(`${i},${j}`) : null, { hand, edit: editHere });
      if (R.edited) record(R.edited.op, { rules: R.edited.rules });
      for (const g of R.groups) {
        push({
          key: `${tag}:l:${g.key}`, name: nameFor(li, g.name), kind: 'ink',
          contours: g.contours.map(c => mapContour(c, m, t)), centre: add(applyLinear(m, g.centre), t),
        });
      }
    } else if (cfg.style === 'circuit' && tiling !== 'square') {
      // Circuits through hexagons, triangles or Voronoi cells. The mask is
      // read on a bundle-sized grid, each cell by its centre.
      const S = Math.max(1, cfg.bundle ?? 1) * C;
      const bc = Math.max(1, Math.floor(lw / S + 1e-6)), br = Math.max(1, Math.floor(lh / S + 1e-6));
      const mask = masked(cfg) ? run.maskAt(bc, br) : null;
      const inside = mask ? (x, y) => mask.has(`${Math.floor((x + bc * S / 2) / S)},${Math.floor((y + br * S / 2) / S)}`) : null;
      const R = cellCircuitLayer(L, cfg, seed, tiling, settings.regularity ?? 0.5, cfg.route === 'single',
        { ...bandOpts, sym: csym, inside, hand, edit: editHere });
      if (R.edited) record(R.edited.op, R.edited.route);
      for (const b of replicateBundles(R.bundles, R.whole ? 'none' : csym, { keepWinding: true })) {
        toBand(b.bands);
        push({
          key: `${tag}:c:${b.key}`, name: nameFor(li, cfg.route === 'single' ? 'Circuit' : b.single ? 'Eye' : 'Bundle'), kind: 'ink',
          contours: b.contours.map(c => mapContour(c, m, t)), centre: add(applyLinear(m, b.centre), t),
        });
      }
    } else if (cfg.style === 'circuit') {
      const S = Math.max(1, cfg.bundle ?? 1) * C;
      const bc = Math.max(1, Math.floor(lw / S + 1e-6)), br = Math.max(1, Math.floor(lh / S + 1e-6));
      const mask = masked(cfg) ? run.maskAt(bc, br) : null;
      const R = circuitLayer(L, cfg, seed, csym, mask ? (i, j) => mask.has(`${i},${j}`) : null, { ...bandOpts, hand, edit: editHere });
      if (R.edited) record(R.edited.op, R.edited.route);
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
      const mask = masked(cfg) ? run.maskAt(cols, rows) : null;
      const inside = mask ? (x, y) => mask.has(`${Math.floor((x + lw / 2) / C)},${Math.floor((y + lh / 2) / C)}`) : null;
      const fill = (tiles) => angularLayer(L, { ...cfg, tiling, regularity: settings.regularity }, seed, dom, inside, { ops, planes }, tiles);
      // With outlines on, the content shrinks by half a line all round so the
      // full-width Edge (below) frames it like the borders between tiles.
      // A shape's run has no Edge of its own (its box isn't an edge in the design).
      const edged = cfg.outline && !run.sub;
      const edgeW = L.lineW * (cfg.outlineWeight ?? 1);
      const fx = edged ? (lw - edgeW) / lw : 1, fy = edged ? (lh - edgeW) / lh : 1;
      let A = fill(hand?.tiles ?? null);
      if (editHere) {
        const done = editTiles(A.tiles, hand?.tiles ?? {}, editHere, ops, [fx, fy]);
        if (done) {
          record(done.op, { tiles: done.tiles });
          A = fill(done.tiles);
        }
      }
      const { regions, outlines } = A;
      // Clip to the symmetry domain, copy by each map, clip to the layer.
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
        const outer = finish(layerRect), innerP = inset(layerRect, edgeW);
        const inner = innerP ? finish(innerP) : null;
        if (outer && !run.sub) {
          push({
            key: `${tag}:edge`, name: 'Edge', kind: 'outline', centre: t,
            contours: [polyContour(outer, true), ...(inner ? [polyContour(inner, false)] : [])],
          });
        }
      }
    }
  };

  // One layer in one frame; `tag` prefixes its items' keys.
  const buildLayer = (cfg, li, frame, tag) => {
    const { areaPlanes: basePlanes } = frame;
    const plate = li > 0;
    const { lw, lh, m, t } = layerPlace(cfg, li, frame);
    const toDesign = (P) => P.map(p => add(applyLinear(m, p), t));
    // Plates are cut to the canvas too.
    const finish = (P) => (plate ? clipToPlanes(toDesign(P), basePlanes) : toDesign(P));
    const push = (item) => items.push({ layer: li, layerId: cfg.id ?? (li ? `p${li}` : 'base'), ...item });

    // A plate's background shape, its corners rounded; inset by d. The base
    // layer takes the same backings: Square is its ground when split from
    // the canvas (as before), the banded ones follow its bundles.
    let backing = cfg.backing ?? 'square';
    if (BANDED[backing] && cfg.style !== 'circuit') backing = 'square';
    const banded = !!BANDED[backing];
    const radius = plate ? Math.max(0, cfg.corner ?? 0) * Math.min(lw, lh) / 2 : 0;
    const plateShape = (d = 0) => (lw - 2 * d > 0 && lh - 2 * d > 0
      ? roundedRectPoly(-lw / 2 + d, -lh / 2 + d, lw - 2 * d, lh - 2 * d, Math.max(0, radius - d)) : null);
    // The base casts a shadow only from a banded ground (a square one fills the canvas).
    const shadow = (plate ? backing !== 'none' : banded) && cfg.shadow && cfg.shadow !== 'none' && (cfg.depth ?? 0) > 0
      ? { d: cfg.depth * CELL, soft: cfg.shadow === 'soft' } : null;
    const shadowItem = (contours) => {
      const off = [shadow.d * Math.SQRT1_2, shadow.d * Math.SQRT1_2];
      return { key: `${tag}:shadow`, name: NAMES.shadow, kind: 'shadow', contours: contours.map(c => mapContour(c, [1, 0, 0, 1], off)),
        blur: shadow.soft ? shadow.d * 0.6 : 0, opacity: shadow.soft ? 0.55 : 1 };
    };

    // A plate's shadow and ground sit under its lines. A banded ground is
    // only known once the bundles are built: it goes in here afterwards.
    const groundAt = items.length;
    if (plate ? backing === 'square' : baseGround && backing === 'square') {
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
    const runs = layerRuns(cfg, li, lw, lh, tag);
    for (const run of runs) {
      runLayer(run, li, frame, tag, { m, t: add(t, applyLinear(m, run.c)), bands, bandOpts });
    }
    const exact = runs[0]?.exact;

    if (banded && bands.length) {
      // Every piece is a solid wound the same way, so they merge where they meet.
      let contours = bands.flat();
      // The base layer's padded background and its shadow stop at its edge
      // rather than spilling past the grid (a plate's float free, as it does).
      const toEdge = plate ? c => c : (c => shapeCutter([toDesign(rectPoly(-lw / 2, -lh / 2, lw, lh))])(c) ?? []);
      contours = toEdge(contours);
      const shadowed = shadow ? shadowItem(contours) : null;
      items.splice(groundAt, 0, ...[
        ...(shadowed ? [{ ...shadowed, contours: toEdge(shadowed.contours) }] : []),
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

    if (exact) cutToMask(cfg, exact, { toDesign, groundAt, lw, lh, tag, push, plate, frame });
    if (cutsToShape(cfg, li)) cutToShape(cfg, li, frame, tag, { lw, lh, toDesign, groundAt, backing, shadow, push });
  };

  // Exact mask edges: the layer's lines and tile outlines cut to the mask's
  // outline (kept inside it for Invert, outside it for Remove), with an
  // optional Outline along the cut, maskOutline cells wide on the kept side.
  // Grounds, shadows, rims, the Edge and the Frame stay as they are.
  const cutToMask = (cfg, local, { toDesign, groundAt, lw, lh, tag, push, plate, frame }) => {
    const shape = local.map(r => toDesign(r));
    const invert = cfg.maskMode === 'invert';
    const cut = invert ? shapeCutter(shape) : shapeSubtracter(shape);
    const fixed = (it) => it.kind === 'ground' || it.kind === 'shadow' || it.kind === 'rim' || it.key.endsWith(':edge') || it.key.endsWith(':frame');
    const mine = items.splice(groundAt);
    for (const it of mine) {
      if (fixed(it)) { items.push(it); continue; }
      const contours = cut(it.contours);
      if (contours) items.push({ ...it, contours });
    }
    const w = Math.max(0, cfg.maskOutline ?? 0) * CELL;
    if (w > 0) {
      const band = invert ? subtractRings(shape, insetRings(shape, w)) : subtractRings(insetRings(shape, -w), shape);
      let clipped = intersectRings(band, [toDesign(rectPoly(-lw / 2, -lh / 2, lw, lh))]);
      if (plate) clipped = intersectRings(clipped, [frame.areaRect]);
      if (clipped.length) push({ key: `${tag}:maskOutline`, name: 'Mask outline', kind: 'outline', contours: ringsContours(clipped) });
    }
  };

  // Cutout: everything the plate drew is cut to its shape (within the
  // canvas). A square background becomes the shape itself, its shadow the
  // shape's; the rim and the plate's Edge give way to the shape's Outline.
  const cutToShape = (cfg, li, frame, tag, { lw, lh, toDesign, groundAt, backing, shadow, push }) => {
    const shape = intersectRings(shapeInPlate(cfg.shapeClip, lw, lh, p => toDesign([p])[0]), [frame.areaRect]);
    const mine = items.splice(groundAt);
    if (!shape.length) return;
    const cut = shapeCutter(shape);
    const kept = [];
    let ground = null;
    for (const it of mine) {
      if (it.kind === 'shadow' || it.key === `${tag}:rim` || it.key === `${tag}:edge`) continue;
      if (it.kind === 'ground' && backing === 'square') { ground = { ...it, contours: ringsContours(shape) }; continue; }
      const contours = cut(it.contours);
      if (!contours) continue;
      if (it.kind === 'ground') ground = { ...it, contours };
      else kept.push({ ...it, contours });
    }
    if (ground && shadow) {
      const o = shadow.d * Math.SQRT1_2;
      const moved = shape.map(r => r.map(([x, y]) => [x + o, y + o]));
      const S = backing === 'square' ? intersectRings(moved, [frame.areaRect]) : null;
      const contours = S ? ringsContours(S) : ground.contours.map(c => mapContour(c, [1, 0, 0, 1], [o, o]));
      if (contours.length) {
        items.push({ layer: li, layerId: ground.layerId, key: `${tag}:shadow`, name: NAMES.shadow, kind: 'shadow', contours,
          blur: shadow.soft ? shadow.d * 0.6 : 0, opacity: shadow.soft ? 0.55 : 1 });
      }
    }
    if (ground) items.push(ground);
    items.push(...kept);
    const w = Math.max(0, cfg.shapeOutline ?? 0) * CELL;
    if (w > 0) {
      const bands = outlineBands(shape, w, cfg);
      const onGround = cfg.shapeOutlineInk === false;
      bands.forEach((band, i) => {
        const clipped = intersectRings(band, [frame.areaRect]);
        if (!clipped.length) return;
        push({ key: `${tag}:shapeOutline${i ? i + 1 : ''}`, name: i ? 'Outline 2' : 'Outline', kind: 'outline',
          contours: ringsContours(clipped), ...(onGround ? { onGround } : {}) });
      });
    }
  };

  layers.forEach((cfg, li) => {
    if (!shown(cfg, li)) return;
    for (const [f, tag] of framesOf(cfg, li)) buildLayer(cfg, li, f, tag);
  });

  for (const it of items) it.centre ??= frames[0].centre;
  return { width: W, height: H, items, baseCells: frames[0].base.cells, edits };
}

// An edit to an angular layer's hand-built tiles (tiles: angularLayer's,
// own: the layer's { [tile key]: 0 | [kind, seed] }). remove takes out
// those tiles; at takes out the tile there or, when it's empty, fills it
// with one of its fills at random. The point is found in the symmetry
// domain by trying each map back (scale: the outline's shrink).
// Returns { op, tiles } or null.
function editTiles(tiles, own, edit, ops, scale) {
  const next = { ...own };
  if (edit.remove) {
    const gone = tiles.filter(t => t.filled && edit.remove.has(t.key));
    for (const t of gone) next[t.key] = 0;
    return gone.length ? { op: 'remove', tiles: next } : null;
  }
  const q0 = [edit.at[0] / scale[0], edit.at[1] / scale[1]];
  for (const op of ops) {
    const q = applyLinear([op[0], op[2], op[1], op[3]], q0);
    const tile = tiles.find(t => insidePoly(t.P, q));
    if (!tile) continue;
    if (tile.filled) {
      next[tile.key] = 0;
      return { op: 'remove', tiles: next };
    }
    next[tile.key] = [tile.kinds[Math.floor(edit.rng() * tile.kinds.length)], Math.floor(edit.rng() * 0x7fffffff)];
    return { op: 'grow', tiles: next };
  }
  return null;
}

// A shape plate's outline rings, w wide: inside the shape's edge, centred
// on it or outside it (cfg.shapeOutlinePos), and for a double outline
// (cfg.shapeOutlineDouble) a second ring cfg.shapeOutlineGap cells further
// in (further out, for Outside). A ring from offset a to b (a < b, positive
// inwards) is the shape inset by a, less the shape inset by b.
function outlineBands(shape, w, cfg) {
  const pos = cfg.shapeOutlinePos ?? 'inside';
  const a = pos === 'outside' ? -w : pos === 'centre' ? -w / 2 : 0;
  const ring = (from, to) => subtractRings(from === 0 ? shape : insetRings(shape, from), insetRings(shape, to));
  const out = [ring(a, a + w)];
  if (cfg.shapeOutlineDouble) {
    const g = Math.max(0, cfg.shapeOutlineGap ?? 0.1) * CELL;
    out.push(pos === 'outside' ? ring(a - w - g, a - g) : ring(a + w + g, a + 2 * w + g));
  }
  return out.filter(b => b.length);
}

// Plates as groups: the layer index each plate's items belong to.
export const plateOf = (item) => (item.layer > 0 ? item.layer : null);

