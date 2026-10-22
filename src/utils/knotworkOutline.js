// Compiles a meander strand's centreline into ONE closed, filled outline --
// both sides plus both end caps -- instead of a stroked centreline with
// separately drawn cap shapes. Works like Illustrator's live corners:
//
//   1. Build the strand's sharp-cornered outline polygon: each side is a
//      perpendicular offset of the centreline (miter intersections at
//      bends), and each open end gets two square cap corners protruding
//      half the strand width past the endpoint.
//   2. Tag every vertex with a corner kind -- 'cap' (end-cap corner),
//      'outer' (convex bend), 'inner' (concave bend) or 'butt' (a merged
//      end, never rounded) -- so each kind can take its own radius.
//   3. Round every vertex by its kind's radius.
//
// An earlier version of this file (reverted) rounded every vertex with
// one shared radius and could never make a semicircular cap. Two things
// caused that, and both are fixed here:
//   - The offset point where a cap's side edge meets the strand's side is
//     collinear, but it was left in the polygon, splitting that edge in
//     two. Collinear (and duplicate) vertices are now dropped first.
//   - Each corner's trim was capped at half of each adjacent edge, so a
//     cap corner could never take the full half-width a semicircle needs.
//     Now neighbouring corners share an edge: they are only scaled back
//     (proportionally) when their combined trim would overrun it.

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
function len(v) { return Math.hypot(v.x, v.y); }
function norm(v) { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; }
function cross(a, b) { return a.x * b.y - a.y * b.x; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function leftNormal(d) { return { x: -d.y, y: d.x }; }
function fmt(n) { return Math.round(n * 1000) / 1000; }

function lineIntersect(p1, d1, p2, d2) {
  const denom = cross(d1, d2);
  if (Math.abs(denom) < 1e-9) return p1;
  const t = cross(sub(p2, p1), d2) / denom;
  return add(p1, scale(d1, t));
}

// One offset side of the centreline, sharp: a plain perpendicular offset
// at the two open ends, a miter intersection at every interior vertex.
// `dist` > 0 = left side, < 0 = right side.
function offsetSide(points, dist) {
  const n = points.length;
  const dirs = [];
  for (let i = 0; i < n - 1; i++) dirs.push(norm(sub(points[i + 1], points[i])));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) out.push(add(points[0], scale(leftNormal(dirs[0]), dist)));
    else if (i === n - 1) out.push(add(points[n - 1], scale(leftNormal(dirs[n - 2]), dist)));
    else {
      const dIn = dirs[i - 1], dOut = dirs[i];
      out.push(lineIntersect(add(points[i], scale(leftNormal(dIn), dist)), dIn, add(points[i], scale(leftNormal(dOut), dist)), dOut));
    }
  }
  return out;
}

// Sharp outline as [{ x, y, kind }]. Bend vertices come out as 'bend' and
// are split into 'outer'/'inner' later, once the polygon's winding is known.
function buildSharpOutline(points, halfWidth, startMerge, endMerge) {
  const n = points.length;
  const left = offsetSide(points, halfWidth);
  const right = offsetSide(points, -halfWidth);
  const dirStart = norm(sub(points[0], points[1]));
  const dirEnd = norm(sub(points[n - 1], points[n - 2]));
  const v = (p, kind) => ({ x: p.x, y: p.y, kind });
  const endKind = (i, merged) => (i === 0 || i === n - 1) ? (merged ? 'butt' : 'cap') : 'bend';

  const poly = [];
  if (!startMerge) poly.push(v(add(left[0], scale(dirStart, halfWidth)), 'cap'));
  left.forEach((p, i) => poly.push(v(p, endKind(i, i === 0 ? startMerge : endMerge))));
  if (!endMerge) {
    poly.push(v(add(left[n - 1], scale(dirEnd, halfWidth)), 'cap'));
    poly.push(v(add(right[n - 1], scale(dirEnd, halfWidth)), 'cap'));
  }
  for (let i = n - 1; i >= 0; i--) poly.push(v(right[i], endKind(i, i === 0 ? startMerge : endMerge)));
  if (!startMerge) poly.push(v(add(right[0], scale(dirStart, halfWidth)), 'cap'));
  return poly;
}

// Drops duplicate and collinear vertices (repeating until stable, since
// removing one can make its neighbour collinear).
function simplify(poly) {
  let pts = poly;
  for (let changed = true; changed && pts.length > 3;) {
    changed = false;
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = out.length ? out[out.length - 1] : pts[(i - 1 + n) % n];
      const cur = pts[i], next = pts[(i + 1) % n];
      const a = sub(cur, prev), b = sub(next, cur);
      if (len(a) < 1e-6) { changed = true; continue; }
      if (len(b) > 1e-6 && Math.abs(cross(norm(a), norm(b))) < 1e-9 && dot(a, b) > 0) { changed = true; continue; }
      out.push(cur);
    }
    pts = out;
  }
  return pts;
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) a += cross(poly[i], poly[(i + 1) % poly.length]);
  return a / 2;
}

// Rounds every vertex of a closed polygon by radii[kind], letting
// neighbouring corners share each edge. Returns an SVG `d` string.
function roundPolygon(poly, radii) {
  const n = poly.length;
  const corners = poly.map((V, i) => {
    const A = poly[(i - 1 + n) % n], C = poly[(i + 1) % n];
    const dIn = norm(sub(V, A)), dOut = norm(sub(C, V));
    const theta = Math.atan2(cross(dIn, dOut), dot(dIn, dOut));
    const half = Math.abs(theta) / 2;
    // Near-reversals (a strand folded flat against itself) stay sharp.
    const r = Math.abs(theta) > Math.PI - 1e-3 ? 0 : Math.max(0, radii[V.kind] ?? 0);
    return { V, dIn, dOut, theta, tanHalf: Math.tan(half), t: r * Math.tan(half) };
  });

  const limit = corners.map(c => c.t);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const L = len(sub(poly[j], poly[i]));
    const want = corners[i].t + corners[j].t;
    if (want > L && want > 0) {
      const f = L / want;
      limit[i] = Math.min(limit[i], corners[i].t * f);
      limit[j] = Math.min(limit[j], corners[j].t * f);
    }
  }

  const parts = corners.map((c, i) => {
    const t = limit[i];
    if (t < 1e-6) return { start: c.V, end: c.V };
    return {
      start: sub(c.V, scale(c.dIn, t)),
      end: add(c.V, scale(c.dOut, t)),
      r: t / c.tanHalf,
      sweep: c.theta > 0 ? 1 : 0,
    };
  });

  const cmds = [`M ${fmt(parts[0].start.x)} ${fmt(parts[0].start.y)}`];
  for (let i = 0; i < n; i++) {
    const p = parts[i];
    if (p.r) cmds.push(`A ${fmt(p.r)} ${fmt(p.r)} 0 0 ${p.sweep} ${fmt(p.end.x)} ${fmt(p.end.y)}`);
    const next = parts[(i + 1) % n];
    if (i < n - 1 && len(sub(next.start, p.end)) > 1e-3) cmds.push(`L ${fmt(next.start.x)} ${fmt(next.start.y)}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

// A circle subpath wound against the outline, so under the nonzero fill
// rule it punches a hole (the "terminal dot") through the strand.
function holeD(c, r, outlineArea) {
  const sweep = outlineArea > 0 ? 0 : 1;
  return `M ${fmt(c.x + r)} ${fmt(c.y)} A ${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(c.x - r)} ${fmt(c.y)} A ${fmt(r)} ${fmt(r)} 0 1 ${sweep} ${fmt(c.x + r)} ${fmt(c.y)} Z`;
}

// points: centreline polyline (pixel space, consecutive, distinct).
// radii: { cap, outer, inner } in the same units as points. Merged ends
// (see findSelfMergeEnds in knotworkCompose.js) get no cap and are never
// rounded. holeRadius > 0 punches a terminal dot at each capped end.
export function compileKnotworkOutline(points, halfWidth, radii, { startMerge = false, endMerge = false, holeRadius = 0 } = {}) {
  if (points.length < 2) return '';
  const sharp = simplify(buildSharpOutline(points, halfWidth, startMerge, endMerge));
  if (sharp.length < 3) return '';
  const area = signedArea(sharp);
  for (let i = 0; i < sharp.length; i++) {
    const v = sharp[i];
    if (v.kind !== 'bend') continue;
    const A = sharp[(i - 1 + sharp.length) % sharp.length], C = sharp[(i + 1) % sharp.length];
    const turn = cross(sub(v, A), sub(C, v));
    v.kind = Math.sign(turn) === Math.sign(area) ? 'outer' : 'inner';
  }
  let d = roundPolygon(sharp, { cap: radii.cap, outer: radii.outer, inner: radii.inner, butt: 0 });
  if (holeRadius > 0) {
    if (!startMerge) d += ' ' + holeD(points[0], holeRadius, area);
    if (!endMerge) d += ' ' + holeD(points[points.length - 1], holeRadius, area);
  }
  return d;
}

// A single-cell dot: a square the strand's width, its corners rounded like
// end caps (so at full cap roundness it is a circle).
export function compileKnotworkDot(center, halfWidth, capRadius) {
  const { x, y } = center, h = halfWidth;
  const square = [
    { x: x - h, y: y - h, kind: 'cap' }, { x: x + h, y: y - h, kind: 'cap' },
    { x: x + h, y: y + h, kind: 'cap' }, { x: x - h, y: y + h, kind: 'cap' },
  ];
  return roundPolygon(square, { cap: capRadius });
}
