// Geometry shared by the Linework engine: 2D vectors, convex polygon
// insets and clipping, symmetry groups, and a small path model.
//
// Coordinates are y-down. A path is a list of contours; a contour is a
// list of commands: ['M', p], ['L', p], ['A', r, sweep, p] (circular arc,
// SVG sweep flag) and ['Z']. Points are [x, y].

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
export const perp = a => [-a[1], a[0]];
export const len = a => Math.hypot(a[0], a[1]);
export const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hash(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= Math.round(x * 64) | 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}
export const rngAt = (...xs) => mulberry32(hash(...xs));
export function shuffle(arr, r) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ── Polygons ─────────────────────────────────────────────────────────────────

export function signedArea(P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

// Edges with unit direction and inward normal (either winding).
export function edgesOf(P) {
  const s = Math.sign(signedArea(P)) || 1;
  return P.map((a, i) => { const d = unit(sub(P[(i + 1) % P.length], a)); return { a, d, n: mul(perp(d), s) }; });
}

export function xLines(p, d, q, e) {
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  return add(p, mul(d, cross(sub(q, p), e) / den));
}

// Convex inset by t (every edge moved inward by t); null once it collapses.
export function inset(P, t) {
  if (t <= 0) return P;
  const E = edgesOf(P), n = E.length, out = [];
  for (let i = 0; i < n; i++) {
    const e0 = E[(i + n - 1) % n], e1 = E[i];
    const v = xLines(add(e0.a, mul(e0.n, t)), e0.d, add(e1.a, mul(e1.n, t)), e1.d);
    if (!v) return null;
    out.push(v);
  }
  for (let i = 0; i < n; i++) if (dot(sub(out[(i + 1) % n], out[i]), E[i].d) <= 1e-6) return null;
  return out;
}

// The part of P where dot(n, x) >= c (one Sutherland–Hodgman pass).
export function clipHalf(P, n, c) {
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const A = P[i], B = P[(i + 1) % P.length];
    const da = dot(n, A) - c, db = dot(n, B) - c;
    if (da >= 0) out.push(A);
    if ((da >= 0) !== (db >= 0)) out.push(lerp(A, B, da / (da - db)));
  }
  return out.length >= 3 ? out : null;
}

// Half-planes { n, c } bounding a convex polygon (inside: dot(n, x) >= c).
export function halfPlanesOf(P) {
  return edgesOf(P).map(e => ({ n: e.n, c: dot(e.n, e.a) }));
}
export function clipToPlanes(P, planes) {
  for (const { n, c } of planes) { if (!P) return null; P = clipHalf(P, n, c); }
  return P;
}

export const rectPoly = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// A rectangle with corners rounded to radius r (clamped to fit), as a
// polygon: each corner a quarter arc of `seg` steps.
export function roundedRectPoly(x, y, w, h, r, seg = 8) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r < 1e-6) return rectPoly(x, y, w, h);
  const out = [];
  const corners = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
  for (const [cx, cy, a0] of corners) {
    for (let s = 0; s <= seg; s++) {
      const a = ((a0 + (90 * s) / seg) * Math.PI) / 180;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

// ── Symmetry ─────────────────────────────────────────────────────────────────
// Each mode is its group's linear maps [a, b, c, d] (x' = a x + b y,
// y' = c x + d y, about the layer centre) plus its fundamental domain as
// half-planes. Geometry is generated for the domain, clipped to it, then
// copied by every map, so mirror seams line up exactly.

const I = [1, 0, 0, 1], MX = [-1, 0, 0, 1], MY = [1, 0, 0, -1], R2 = [-1, 0, 0, -1];
export const SYM_OPS = {
  'none': [I],
  'mirror-x': [I, MX],
  'mirror-y': [I, MY],
  'mirror-both': [I, MX, MY, R2],
  'rotate2': [I, R2],
  'rotate4': [I, [0, -1, 1, 0], R2, [0, 1, -1, 0]],
  'mirror-diag': [I, MX, MY, R2, [0, 1, 1, 0], [0, -1, 1, 0], [0, 1, -1, 0], [0, -1, -1, 0]],
};
export const SYM_DOMAIN = {
  'none': [],
  'mirror-x': [{ n: [-1, 0], c: 0 }],
  'mirror-y': [{ n: [0, -1], c: 0 }],
  'mirror-both': [{ n: [-1, 0], c: 0 }, { n: [0, -1], c: 0 }],
  'rotate2': [{ n: [0, -1], c: 0 }],
  'rotate4': [{ n: [-1, 0], c: 0 }, { n: [0, -1], c: 0 }],
  'mirror-diag': [{ n: [-1, 0], c: 0 }, { n: [0, -1], c: 0 }, { n: [1, -1], c: 0 }],
};

// The modes a w × h layer can use exactly: quarter turns and diagonals need a square.
export function fitSymmetry(mode, w, h) {
  const square = Math.abs(w - h) < 1e-6;
  if (!SYM_OPS[mode]) return 'none';
  if (!square && mode === 'rotate4') return 'rotate2';
  if (!square && mode === 'mirror-diag') return 'mirror-both';
  return mode;
}

export const applyLinear = (m, v) => [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
export const det = m => m[0] * m[3] - m[1] * m[2];

// ── Paths ────────────────────────────────────────────────────────────────────

// A polygon as a contour, wound positive (solid) or negative (hole), so a
// path of solids and holes fills correctly with the nonzero rule.
export function polyContour(P, solid = true) {
  const Q = (signedArea(P) > 0) === solid ? P : P.slice().reverse();
  return [['M', Q[0]], ...Q.slice(1).map(p => ['L', p]), ['Z']];
}

// Affine map of a contour: linear part m (rotation / mirror only), then
// translation t. Mirrors flip arc sweeps.
export function mapContour(contour, m, t = [0, 0]) {
  const flip = det(m) < 0;
  return contour.map(c => {
    if (c[0] === 'Z') return c;
    const p = add(applyLinear(m, c[c.length - 1]), t);
    return c[0] === 'A' ? ['A', c[1], flip ? 1 - c[2] : c[2], p] : [c[0], p];
  });
}

const f2 = v => Math.round(v * 100) / 100;
export function pathD(contours) {
  let d = '';
  for (const contour of contours) {
    for (const c of contour) {
      if (c[0] === 'Z') { d += 'Z'; continue; }
      const p = c[c.length - 1];
      if (c[0] === 'A') d += `A${f2(c[1])} ${f2(c[1])} 0 0 ${c[2]} ${f2(p[0])} ${f2(p[1])}`;
      else d += `${c[0]}${f2(p[0])} ${f2(p[1])}`;
    }
  }
  return d;
}

// Bounding box of contours' end points (arcs bulge slightly beyond it; the
// box is used for centres and colour sampling, so that's fine).
export function contoursBounds(contours) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const contour of contours) for (const c of contour) {
    if (c[0] === 'Z') continue;
    const [x, y] = c[c.length - 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
