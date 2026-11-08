// Dragging Linework plates on the canvas with the Move tool (v1.14). All in
// grid cells, on boxes from compose.js plateBoxes: { id, cx, cy, w, h, rot,
// baseRot, area, upright }.
//
// Moving snaps the plate's box (its bounding box, for a turned plate) to the
// canvas's edges and centre and to the other plates' edges and centres,
// within `threshold` cells; failing that, its offset snaps to half cells.
// Resizing works on plates that aren't turned: a handle moves its edges, the
// opposite ones stay put, and those edges snap the same way.
//
// Smart guides (v1.16): failing an edge, a move also snaps to equal spacing
// -- the same gap as between the plates beside it, or halfway between two --
// and every move and resize reports the gaps to the nearest plate or canvas
// edge on each side (measureGaps), equal ones marked, for the overlay to
// label.

const rad = d => (d * Math.PI) / 180;

export function boxCorners({ cx, cy, w, h, rot }) {
  const c = Math.cos(rad(rot)), s = Math.sin(rad(rot));
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => [cx + c * x - s * y, cy + s * x + c * y]);
}

export function boxBounds(box) {
  const P = boxCorners(box);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
}

// Whether point p (cells) is inside the box.
export function inBox(box, [x, y]) {
  const c = Math.cos(rad(-box.rot)), s = Math.sin(rad(-box.rot));
  const dx = x - box.cx, dy = y - box.cy;
  const u = c * dx - s * dy, v = s * dx + c * dy;
  return Math.abs(u) <= box.w / 2 && Math.abs(v) <= box.h / 2;
}

// The topmost plate under p, or null.
export const hitPlate = (boxes, p) => [...boxes].reverse().find(b => inBox(b, p)) ?? null;

const square = box => ((box.rot % 360) + 360) % 360 === 0;
export const canResize = square;

// A plate's resize handles: corners and edge middles, for plates that aren't turned.
export function handlesOf(box) {
  if (!square(box)) return [];
  const { l, r, t, b } = boxBounds(box);
  const mx = (l + r) / 2, my = (t + b) / 2;
  return [
    ['nw', l, t], ['n', mx, t], ['ne', r, t], ['e', r, my],
    ['se', r, b], ['s', mx, b], ['sw', l, b], ['w', l, my],
  ].map(([key, x, y]) => ({ key, x, y }));
}

// Lines a box's edges and centre can snap to: the canvas area's and the other plates'.
function snapLines(area, others) {
  const xs = [area.x, area.x + area.w / 2, area.x + area.w];
  const ys = [area.y, area.y + area.h / 2, area.y + area.h];
  for (const o of others) {
    const { l, r, t, b } = boxBounds(o);
    xs.push(l, (l + r) / 2, r);
    ys.push(t, (t + b) / 2, b);
  }
  return { xs, ys };
}

// The shift (and the line it lands on) that brings the nearest of `values`
// onto one of `lines`, within threshold; or null.
function nearest(values, lines, threshold) {
  let best = null;
  for (const v of values) for (const line of lines) {
    const d = line - v;
    if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
  }
  return best;
}

const half = v => Math.round(v * 2) / 2;

// Along one axis: a box's span [lo, hi] and the cross span it covers, for
// neighbours either side (others overlapping it across).
const spanOf = (b, axis) => (axis === 'x' ? { lo: b.l, hi: b.r, a: b.t, z: b.b } : { lo: b.t, hi: b.b, a: b.l, z: b.r });
const overlaps = (A, B) => A.a < B.z - 1e-6 && B.a < A.z - 1e-6;

// The nearest plate before and after `me` along an axis (or null).
function neighbours(me, spans) {
  let before = null, after = null;
  for (const o of spans) {
    if (!overlaps(me, o)) continue;
    if (o.hi <= me.lo + 1e-6 && (!before || o.hi > before.hi)) before = o;
    if (o.lo >= me.hi - 1e-6 && (!after || o.lo < after.lo)) after = o;
  }
  return { before, after };
}

// The shift along `axis` that spaces the box evenly with its neighbours, or
// null: halfway between the plates either side, or the same gap as between
// the neighbour and the plate beyond it.
function equalShift(bounds, otherBounds, axis, threshold) {
  const me = spanOf(bounds, axis), spans = otherBounds.map(o => spanOf(o, axis));
  const { before, after } = neighbours(me, spans);
  const size = me.hi - me.lo;
  const options = [];
  if (before && after && after.lo - before.hi > size) options.push((before.hi + after.lo - size) / 2 - me.lo);
  if (before) {
    const beyond = neighbours(before, spans).before;
    if (beyond) options.push(before.hi + (before.lo - beyond.hi) - me.lo);
  }
  if (after) {
    const beyond = neighbours(after, spans).after;
    if (beyond) options.push(after.lo - (beyond.lo - after.hi) - size - me.lo);
  }
  const d = options.filter(v => Math.abs(v) <= threshold).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  return d == null ? null : d;
}

// The gaps from a box to what's nearest on each side -- another plate across
// from it, or else the canvas edge -- in cells: [{ axis, from, to, at, equal }]
// (from → to along the axis, drawn at `at` across it). equal: the same as
// another gap shown, or as the gap between the neighbour and the plate
// beyond it (to within `tolerance`).
export function measureGaps(box, others, area, tolerance = 0.01) {
  const bounds = boxBounds(box), all = others.map(boxBounds);
  const gaps = [];
  for (const axis of ['x', 'y']) {
    const me = spanOf(bounds, axis), spans = all.map(o => spanOf(o, axis));
    const { before, after } = neighbours(me, spans);
    const edge0 = axis === 'x' ? area.x : area.y, edge1 = axis === 'x' ? area.x + area.w : area.y + area.h;
    const at = (o) => (o ? (Math.max(me.a, o.a) + Math.min(me.z, o.z)) / 2 : (me.a + me.z) / 2);
    const chain = (o, dir) => {
      const n = o && neighbours(o, spans)[dir];
      return n ? (dir === 'before' ? o.lo - n.hi : n.lo - o.hi) : null;
    };
    const lo = before ? before.hi : edge0, hi = after ? after.lo : edge1;
    if (me.lo - lo > 1e-6) gaps.push({ axis, from: lo, to: me.lo, at: at(before), plate: !!before, beyond: chain(before, 'before') });
    if (hi - me.hi > 1e-6) gaps.push({ axis, from: me.hi, to: hi, at: at(after), plate: !!after, beyond: chain(after, 'after') });
  }
  const equal = gaps.map((g) => {
    const size = g.to - g.from;
    return (g.beyond != null && Math.abs(g.beyond - size) <= tolerance)
      || gaps.some(o => o !== g && o.axis === g.axis && o.plate && g.plate && Math.abs(o.to - o.from - size) <= tolerance);
  });
  return gaps.map(({ axis, from, to, at }, i) => ({ axis, from, to, at, equal: equal[i] }));
}

// Moving `box` by (dx, dy) cells. opts: { others, threshold, free (no snapping),
// straight (keep to one axis) }. Returns { cx, cy, guides: [{ x } | { y }] };
// grid: whether the offset should still snap to half cells (no edge snap on that axis).
export function snapMove(box, dx, dy, { others = [], threshold = 0.3, free = false, straight = false } = {}) {
  if (straight) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
  const moved = { ...box, cx: box.cx + dx, cy: box.cy + dy };
  const guides = [];
  const grid = { x: !free, y: !free };
  // Snapping to edges works in canvas cells, so only for plates whose offset is in them.
  if (!free && (box.upright || !box.baseRot)) {
    const { l, r, t, b } = boxBounds(moved);
    const lines = snapLines(box.area, others);
    const sx = straight && dx === 0 ? null : nearest([l, (l + r) / 2, r], lines.xs, threshold);
    const sy = straight && dy === 0 ? null : nearest([t, (t + b) / 2, b], lines.ys, threshold);
    if (sx) { moved.cx += sx.d; guides.push({ x: sx.line }); grid.x = false; }
    if (sy) { moved.cy += sy.d; guides.push({ y: sy.line }); grid.y = false; }
    // No edge to snap to: even spacing with the plates alongside.
    const others0 = others.map(boxBounds);
    if (!sx && !(straight && dx === 0)) {
      const d = equalShift(boxBounds(moved), others0, 'x', threshold);
      if (d != null) { moved.cx += d; grid.x = false; }
    }
    if (!sy && !(straight && dy === 0)) {
      const d = equalShift(boxBounds(moved), others0, 'y', threshold);
      if (d != null) { moved.cy += d; grid.y = false; }
    }
  }
  return { cx: moved.cx, cy: moved.cy, guides, grid, gaps: box.area ? measureGaps(moved, others, box.area) : [] };
}

// The plate's offset for a move result: edge-snapped axes as they are,
// the others snapped to half cells (unless free).
export function snappedOffset([ox, oy], grid) {
  return [grid.x ? half(ox) : ox, grid.y ? half(oy) : oy].map(v => Math.round(v * 1000) / 1000);
}

// Resizing a square-on box by dragging handle `key` to p (cells).
// opts: { others, threshold, free, keepRatio, min }. Returns { cx, cy, w, h, guides }.
export function resizeBox(box, key, [px, py], { others = [], threshold = 0.3, free = false, keepRatio = false, min = 0.5 } = {}) {
  let { l, r, t, b } = boxBounds(box);
  const guides = [];
  const lines = snapLines(box.area, others);
  const snap = (v, axis) => {
    if (free) return v;
    const s = nearest([v], axis === 'x' ? lines.xs : lines.ys, threshold);
    if (s) { guides.push(axis === 'x' ? { x: s.line } : { y: s.line }); return s.line; }
    return half(v);
  };
  if (key.includes('e')) r = Math.max(l + min, snap(px, 'x'));
  if (key.includes('w')) l = Math.min(r - min, snap(px, 'x'));
  if (key.includes('s')) b = Math.max(t + min, snap(py, 'y'));
  if (key.includes('n')) t = Math.min(b - min, snap(py, 'y'));
  if (keepRatio && key.length === 2) {
    // Corners: the larger change wins; the other side follows the ratio,
    // growing away from the fixed corner.
    const ratio = box.w / box.h;
    let w = r - l, h = b - t;
    if (w / box.w > h / box.h) h = w / ratio; else w = h * ratio;
    if (key.includes('e')) r = l + w; else l = r - w;
    if (key.includes('s')) b = t + h; else t = b - h;
    guides.length = 0;
  }
  const round = v => Math.round(v * 1000) / 1000;
  const out = { cx: round((l + r) / 2), cy: round((t + b) / 2), w: round(r - l), h: round(b - t), guides };
  return { ...out, gaps: box.area ? measureGaps({ ...box, ...out }, others, box.area) : [] };
}
