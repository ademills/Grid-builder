// Shape plates (v1.14): a plate cut to an SVG shape. The plate is laid out
// over the shape's bounding box as usual, then every piece is clipped to the
// shape itself (not to whole cells, as a region mask is), and an outline of
// its own width runs round the inside of the shape's edge.
//
// A shape is stored on the plate as cfg.shapeClip = { rings }: closed rings
// of [x, y] in the plate's own box, -0.5…0.5 across and down (so it
// stretches with the plate), already merged into solids wound one way and
// holes the other (nonzero). Boolean work is done with Clipper on integer
// coordinates, CELL (100) design units to 10 000.

import ClipperLib from 'clipper-lib';
import { polyContour } from './geometry';

const S = 100; // Clipper's integer units per design unit
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = ClipperLib;

const toPath = (ring) => ring.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
const fromPath = (path) => path.map(p => [p.X / S, p.Y / S]);

// An arc's points (after `from`), for a contour's ['A', r, sweep, to]: the
// small arc of radius r, as SVG draws it (large-arc 0, y down).
function arcPoints(from, r, sweep, to) {
  const hx = (from[0] - to[0]) / 2, hy = (from[1] - to[1]) / 2;
  const d2 = hx * hx + hy * hy;
  if (d2 < 1e-12 || !(r > 0)) return [to];
  const k = Math.sqrt(Math.max(0, (r * r - d2) / d2)) * (sweep ? 1 : -1);
  const cx = k * hy + (from[0] + to[0]) / 2, cy = -k * hx + (from[1] + to[1]) / 2;
  const R = Math.max(r, Math.sqrt(d2));
  const a0 = Math.atan2(from[1] - cy, from[0] - cx);
  let da = Math.atan2(to[1] - cy, to[0] - cx) - a0;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 24)));
  const out = [];
  for (let i = 1; i < n; i++) {
    const a = a0 + (da * i) / n;
    out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  out.push(to);
  return out;
}

// Contours (M / L / A / Z commands) as plain polygons.
export function contourRings(contours) {
  const rings = [];
  for (const contour of contours) {
    let ring = null;
    for (const c of contour) {
      if (c[0] === 'M') { if (ring?.length > 2) rings.push(ring); ring = [c[1]]; continue; }
      if (c[0] === 'Z' || !ring) continue;
      if (c[0] === 'A') ring.push(...arcPoints(ring[ring.length - 1], c[1], c[2], c[3]));
      else ring.push(c[c.length - 1]);
    }
    if (ring?.length > 2) rings.push(ring);
  }
  return rings;
}

function run(type, subj, clip, subjFill = PolyFillType.pftNonZero) {
  const c = new Clipper();
  c.AddPaths(subj, PolyType.ptSubject, true);
  if (clip) c.AddPaths(clip, PolyType.ptClip, true);
  const out = new ClipperLib.Paths();
  c.Execute(type, out, subjFill, PolyFillType.pftNonZero);
  return out;
}

// Rings merged by a fill rule ('nonzero' | 'evenodd') into clean solids and holes.
export function unionRings(rings, rule = 'nonzero') {
  return run(ClipType.ctUnion, rings.map(toPath), null, rule === 'evenodd' ? PolyFillType.pftEvenOdd : PolyFillType.pftNonZero)
    .map(fromPath);
}

// A shape (clean rings) shrunk inwards by d (grown for a negative d).
export function insetRings(rings, d) {
  const o = new ClipperOffset(2, 0.25 * S);
  o.AddPaths(rings.map(toPath), JoinType.jtMiter, EndType.etClosedPolygon);
  const out = new ClipperLib.Paths();
  o.Execute(out, -d * S);
  return out.map(fromPath);
}

// Rings with points closer than `dist` (or in a straight run) dropped.
export const cleanRings = (rings, dist) =>
  Clipper.CleanPolygons(rings.map(toPath), dist * S).filter(p => p.length > 2).map(fromPath);

// The area a set of clean rings covers (holes taken off).
export const ringsArea = (rings) => Math.abs(rings.reduce((a, r) => a + Clipper.Area(toPath(r)), 0)) / (S * S);

export const intersectRings =(a, b) => run(ClipType.ctIntersection, a.map(toPath), b.map(toPath)).map(fromPath);
export const subtractRings = (a, b) => run(ClipType.ctDifference, a.map(toPath), b.map(toPath)).map(fromPath);

// Clean rings back as contours, each wound solid or hole.
export const ringsContours = (rings) => rings.filter(r => r.length > 2)
  .map(r => polyContour(r, Clipper.Orientation(toPath(r))));

const boundsOf = (rings) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
};

// A cutter for one shape (clean rings in design units): cut(contours) is
// the part of those contours inside the shape, as contours, or null when
// none is. Pieces wholly inside come back untouched (arcs and all).
export function shapeCutter(shape) {
  const sb = boundsOf(shape);
  return (contours) => {
    const rings = contourRings(contours);
    const b = boundsOf(rings);
    if (!b || !sb || b[2] < sb[0] || b[0] > sb[2] || b[3] < sb[1] || b[1] > sb[3]) return null;
    if (!subtractRings(rings, shape).length) return ringsArea(unionRings(rings)) > 1e-6 ? contours : null;
    const out = ringsContours(intersectRings(rings, shape));
    return out.length ? out : null;
  };
}

// The other half: subtract(contours) is the part of those contours outside
// the shape, or null when none is; pieces wholly outside come back untouched.
export function shapeSubtracter(shape) {
  const sb = boundsOf(shape);
  return (contours) => {
    const rings = contourRings(contours);
    const b = boundsOf(rings);
    if (!b) return null;
    if (!sb || b[2] < sb[0] || b[0] > sb[2] || b[3] < sb[1] || b[1] > sb[3]) return contours;
    if (!intersectRings(rings, shape).length) return contours;
    const rest = subtractRings(rings, shape);
    return ringsArea(rest) > 1e-6 ? ringsContours(rest) : null;
  };
}

// The cells (of a cols × rows grid laid at ox, oy with cells cw × ch) a
// layer fills under an exact mask: those the shape touches (invert) or
// those it doesn't wholly cover (remove). A Set of "col,row".
export function cellsForShape(shape, { cols, rows, ox, oy, cw, ch, invert }) {
  const sb = boundsOf(shape);
  const out = new Set();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x0 = ox + i * cw, y0 = oy + j * ch, x1 = x0 + cw, y1 = y0 + ch;
    const away = !sb || x1 <= sb[0] || x0 >= sb[2] || y1 <= sb[1] || y0 >= sb[3];
    let keep;
    if (away) keep = !invert;
    else {
      const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      keep = invert ? ringsArea(intersectRings([rect], shape)) > 1e-6 : ringsArea(subtractRings([rect], shape)) > 1e-6;
    }
    if (keep) out.add(`${i},${j}`);
  }
  return out;
}

// The plate's shape, from its box (lw × lh, -0.5…0.5) into design units by `place`.
export const shapeInPlate = (shapeClip, lw, lh, place) =>
  (shapeClip?.rings ?? []).map(r => r.map(([x, y]) => place([x * lw, y * lh])));

// The shape as an image for a region mask (Mask mode): its rings drawn in
// black on transparent, filling the image, for the silhouette rasteriser
// to stretch over the plate.
export function shapeMaskSrc(shapeClip) {
  const d = (shapeClip?.rings ?? []).map(r => `M${r.map(([x, y]) => `${(x + 0.5).toFixed(4)} ${(y + 0.5).toFixed(4)}`).join('L')}Z`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path d="${d}" fill="#000"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Silhouette settings (utils/silhouetteMask.js) for a shape plate's Mask mode.
export const shapeMaskSettings = (shapeClip) => ({
  src: shapeMaskSrc(shapeClip), fit: 'stretch', padding: 0, threshold: 0.5, source: 'alpha',
  invert: false, offsetX: 0, offsetY: 0, scale: 1,
});

export const isShapePlate = (cfg) => !!cfg?.shapeClip?.rings?.length;

// Built-in plate shapes (v1.15.1): rings in the plate's own box, as an SVG
// shape plate's are, so they stretch to the plate's sides and are cut out
// exactly. Square and Diamond stay plain plates.
const BUILTIN = {
  circle: () => Array.from({ length: 96 }, (_, i) => { const a = (i / 96) * Math.PI * 2; return [0.5 * Math.cos(a), 0.5 * Math.sin(a)]; }),
  hexagon: () => [[-0.5, 0], [-0.25, -0.5], [0.25, -0.5], [0.5, 0], [0.25, 0.5], [-0.25, 0.5]],
  octagon: () => { const t = 0.5 * Math.tan(Math.PI / 8); return [[-t, -0.5], [t, -0.5], [0.5, -t], [0.5, t], [t, 0.5], [-t, 0.5], [-0.5, t], [-0.5, -t]]; },
  triangle: () => [[0, -0.5], [0.5, 0.5], [-0.5, 0.5]],
};
export const BUILTIN_SHAPES = Object.keys(BUILTIN);
const builtinCache = new Map();
// The points are kept exact (a union here would snap them to Clipper's
// grid, a hundredth of the plate), wound as unionRings winds a solid.
export function builtinShapeRings(shape) {
  if (!BUILTIN[shape]) return null;
  if (!builtinCache.has(shape)) {
    const ring = BUILTIN[shape]();
    const big = ring.map(([x, y]) => [x * 1000, y * 1000]);
    const solid = Clipper.Orientation(toPath(unionRings([big])[0]));
    builtinCache.set(shape, [Clipper.Orientation(toPath(big)) === solid ? ring : ring.slice().reverse()]);
  }
  return builtinCache.get(shape);
}
