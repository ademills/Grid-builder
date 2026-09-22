// Compiles a stroked polyline into ONE solid filled shape instead of
// relying on native SVG stroke/stroke-linecap/stroke-linejoin rendering.
//
// Two-step construction, per the same principle the rest of this build
// already uses for the centreline (fillet a sharp path after the fact
// rather than baking curvature into its construction):
//   1. Build the strands full sharp-cornered outline polygon -- both
//      offset sides plus the two end caps as plain square corners, zero
//      rounding, one continuous vertex loop.
//   2. Round EVERY vertex of that polygon uniformly with the shared
//      radius, by hprebuilt fillet compiler (compileClosedKnotworkPath,
//      knotworkGeometry.js). That function is agnostic to convex vs
//      reflex vertices (it just fillets by signed turn angle, clamped by
//      adjacent edge length), so a turns outer sweep, a turns inner
//      pinch, and a caps corners all get literally the same treatment --
//      no separate per-corner-type formula to keep in sync, which is what
//      used to make different corners drift out of visual agreement with
//      each other. It also means there is no separate "cap" shape at all
//      any more: caps are just two more vertices on the same polygon.
//
// Building the sharp outline itself needs no radius math whatsoever --
// each offset side is a plain perpendicular offset at the open ends and a
// straight miter-line intersection at every interior vertex -- which is
// why this is far simpler (and far less failure-prone) than computing
// per-side concentric fillet arcs directly.

import { compileClosedKnotworkPath } from './knotworkGeometry';

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
function len(v) { return Math.hypot(v.x, v.y); }
function norm(v) { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; }
function leftNormal(d) { return { x: -d.y, y: d.x }; }

function lineIntersect(p1, d1, p2, d2) {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return p1;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return add(p1, scale(d1, t));
}

// One offset side of the centreline, sharp (unrounded): a plain
// perpendicular offset at the two open ends, a straight miter
// intersection at every interior vertex. `dist` > 0 = left side, < 0 =
// right side.
function offsetSide(points, dist) {
  const n = points.length;
  const dirs = [];
  for (let i = 0; i < n - 1; i++) dirs.push(norm(sub(points[i + 1], points[i])));

  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out.push(add(points[0], scale(leftNormal(dirs[0]), dist)));
    } else if (i === n - 1) {
      out.push(add(points[n - 1], scale(leftNormal(dirs[n - 2]), dist)));
    } else {
      const dIn = dirs[i - 1], dOut = dirs[i];
      const p1 = add(points[i], scale(leftNormal(dIn), dist));
      const p2 = add(points[i], scale(leftNormal(dOut), dist));
      out.push(lineIntersect(p1, dIn, p2, dOut));
    }
  }
  return out;
}

// Builds the full sharp-cornered outline polygon (vertex loop, no
// rounding applied yet). `startMerge`/`endMerge` (see
// knotworkCompose.js's self-merge rule) omit that ends cap corners
// entirely -- the two offset sides just connect directly, since a merged
// end has already been extended straight into a neighbouring pass of the
// same strand and has nothing to cap.
function buildSharpOutline(points, halfWidth, startMerge, endMerge) {
  const n = points.length;
  if (n < 2) return [];

  const left = offsetSide(points, halfWidth);
  const right = offsetSide(points, -halfWidth);
  const dirStart = norm(sub(points[0], points[1]));
  const dirEnd = norm(sub(points[n - 1], points[n - 2]));

  const polygon = [];
  if (!startMerge) polygon.push(add(left[0], scale(dirStart, halfWidth)));
  for (const p of left) polygon.push(p);
  if (!endMerge) {
    polygon.push(add(left[n - 1], scale(dirEnd, halfWidth)));
    polygon.push(add(right[n - 1], scale(dirEnd, halfWidth)));
  }
  for (let i = n - 1; i >= 0; i--) polygon.push(right[i]);
  if (!startMerge) polygon.push(add(right[0], scale(dirStart, halfWidth)));

  return polygon;
}

// Compiles an open centreline polyline into a SINGLE filled, rounded
// outline `d` string.
export function compileKnotworkOutline(points, halfWidth, radius, startMerge, endMerge) {
  const polygon = buildSharpOutline(points, halfWidth, startMerge, endMerge);
  if (polygon.length < 3) return '';
  return compileClosedKnotworkPath(polygon, radius);
}
