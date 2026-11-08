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

// ── Round corners (v1.16) ────────────────────────────────────────────────────

// pts with each corner i replaced by an arc of radius radiusAt(i, convex)
// (0 keeps it sharp), each arc no longer than half the edges beside it, so
// neighbouring arcs never overlap. convex: the corner turns the way the
// polygon winds (always true for an open line's corners, whose sign is
// meaningless). Open lines keep their two ends.
export function filletPoly(pts, closed, radiusAt) {
  const n = pts.length;
  if (n < 3) return pts;
  const wind = closed ? Math.sign(signedArea(pts)) || 1 : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const B = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push(B); continue; }
    const A = pts[(i - 1 + n) % n], C = pts[(i + 1) % n];
    const u = sub(A, B), v = sub(C, B);
    const lu = len(u), lv = len(v);
    const turn = cross(sub(B, A), sub(C, B));
    const convex = !closed || Math.sign(turn) === wind;
    const r = lu > 1e-9 && lv > 1e-9 ? radiusAt(i, convex) : 0;
    const cosT = Math.max(-1, Math.min(1, dot(u, v) / (lu * lv)));
    const theta = Math.acos(cosT); // the angle inside the corner
    if (!(r > 1e-9) || theta > Math.PI - 1e-3 || theta < 1e-3) { out.push(B); continue; }
    const tanH = Math.tan(theta / 2);
    const t = Math.min(r / tanH, lu / 2, lv / 2); // tangent length
    const R = t * tanH;
    const du = mul(u, 1 / lu), dv = mul(v, 1 / lv);
    const T1 = add(B, mul(du, t)), T2 = add(B, mul(dv, t));
    const bis = unit(add(du, dv));
    const O = add(B, mul(bis, R / Math.sin(theta / 2)));
    const a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]);
    let da = Math.atan2(T2[1] - O[1], T2[0] - O[0]) - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 16)));
    for (let s = 0; s <= steps; s++) {
      const a = a1 + (da * s) / steps;
      out.push(s === 0 ? T1 : s === steps ? T2 : [O[0] + R * Math.cos(a), O[1] + R * Math.sin(a)]);
    }
  }
  return out;
}

// A spatial index of seam edges (the outlines of tiles, cells and their
// parts): corners on a seam are left sharp, so lines still meet the
// neighbouring tile's lines edge to edge.
export function seamIndex(polys, size) {
  const buckets = new Map();
  const key = (i, j) => `${i},${j}`;
  for (const P of polys) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const i0 = Math.floor(Math.min(a[0], b[0]) / size), i1 = Math.floor(Math.max(a[0], b[0]) / size);
      const j0 = Math.floor(Math.min(a[1], b[1]) / size), j1 = Math.floor(Math.max(a[1], b[1]) / size);
      for (let x = i0; x <= i1; x++) for (let y = j0; y <= j1; y++) {
        const k = key(x, y);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push([a, b]);
      }
    }
  }
  return (q, eps) => {
    const list = buckets.get(key(Math.floor(q[0] / size), Math.floor(q[1] / size)));
    if (!list) return false;
    for (const [a, b] of list) {
      const d = sub(b, a), l2 = dot(d, d);
      const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(q, a), d) / l2)) : 0;
      if (len(sub(q, add(a, mul(d, t)))) < eps) return true;
    }
    return false;
  };
}

// A corner's angle inside (θ) and the longest arc it can take: tangents
// no longer than half of either edge beside it.
function cornerAt(P, i) {
  const m = P.length, A = P[(i - 1 + m) % m], B = P[i], C = P[(i + 1) % m];
  const u = sub(A, B), v = sub(C, B), lu = len(u), lv = len(v);
  if (lu < 1e-9 || lv < 1e-9) return { theta: Math.PI, rMax: 0, lu, lv };
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv))));
  return { theta, rMax: (Math.min(lu, lv) / 2) * Math.tan(theta / 2), lu, lv };
}

// A band shape { s, h } (angular.js) with its corners rounded: the line's
// centre turns on radius R, so its outside edge turns on R + w/2 and its
// inside edge on R − w/2 and the line keeps its width. A hole's corners
// are the band's inside ones. Corners on a seam stay sharp.
// Where a turn is too tight for R (short edges either side), the outside
// corner takes what fits and its inside partner -- the inside corner
// nearest it, across the line -- follows it, so the line never thins.
export function roundBandShape(sh, R, w, onSeam, eps) {
  const polys = sh.h ? [[sh.s, false], [sh.h, true]] : [[sh.s, false]];
  const plan = polys.map(([P, hole]) => {
    const wind = Math.sign(signedArea(P)) || 1;
    return P.map((B, i) => {
      const m = P.length;
      const turn = cross(sub(B, P[(i - 1 + m) % m]), sub(P[(i + 1) % m], B));
      const outside = (Math.sign(turn) === wind) !== hole;
      return { B, outside, seam: onSeam(B, eps), ...cornerAt(P, i) };
    });
  });
  // Outside corners first: the centre-line radius each one gets.
  const outs = [];
  for (const corners of plan) {
    for (const c of corners) {
      if (c.seam || !c.outside) continue;
      // A corner beside an edge about one line wide is a line's end: it
      // rounds by R alone, so ends go from square to round as R grows.
      const end = Math.min(c.lu, c.lv) < w * 1.05;
      c.r = end ? Math.min(R, w / 2, c.rMax) : Math.min(R + w / 2, c.rMax);
      if (!end) outs.push({ B: c.B, rc: c.r - w / 2 });
    }
  }
  // Inside corners: their partner's centre-line radius, less half a line.
  for (const corners of plan) {
    for (const c of corners) {
      if (c.seam || c.outside) continue;
      const reach = (w / Math.max(0.2, Math.sin(c.theta / 2))) * 1.25;
      let rc = R, best = reach;
      for (const o of outs) {
        const d = len(sub(o.B, c.B));
        if (d <= best) { best = d; rc = Math.min(R, o.rc); }
      }
      c.r = Math.max(0, rc - w / 2);
    }
  }
  const go = (P, k) => filletPoly(P, true, (i) => plan[k][i].r ?? 0);
  return { ...sh, s: go(sh.s, 0), h: sh.h ? go(sh.h, 1) : sh.h };
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
