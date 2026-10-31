// Non-square tilings for Linework's angular style: hexagons, triangles and
// Voronoi cells, each a convex polygon the angular fills (key spiral, rings,
// triangles, hatch) can fill like a square tile.
//
// Cells are in the layer's local frame (origin at its centre, y down),
// clipped to the layer, sized from T (the tile size in design units). Hex
// and triangle lattices are centred on the origin, so they're symmetric
// about both axes; Voronoi seeds are copied by the layer's symmetry maps.
// Only cells whose bounds touch `dom` (the symmetry domain box) are returned.

import { sub, len, applyLinear, clipHalf, clipToPlanes, halfPlanesOf, rectPoly, signedArea, rngAt } from './geometry';

const SQRT3 = Math.sqrt(3);

export const TILINGS = ['square', 'hex', 'triangle', 'voronoi'];

function bounds(P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

// Drops repeated and collinear vertices (clipping leaves them), which would
// otherwise stop the fills' insets.
function tidy(P, eps) {
  let Q = P.filter((v, i) => len(sub(v, P[(i + 1) % P.length])) > eps);
  for (let changed = true; changed && Q.length > 3;) {
    changed = false;
    for (let i = 0; i < Q.length; i++) {
      const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (area < eps * len(sub(c, a))) { Q.splice(i, 1); changed = true; break; }
    }
  }
  return Q.length >= 3 ? Q : null;
}

export function centroid(P) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return P[0];
  return [cx / (3 * a), cy / (3 * a)];
}

function hexCells(w, h, T) {
  const r = T / SQRT3, dx = T, dy = 1.5 * r;
  const J = Math.ceil(h / 2 / dy) + 1, I = Math.ceil(w / 2 / dx) + 1;
  const corners = Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k + Math.PI / 6; return [r * Math.cos(a), r * Math.sin(a)]; });
  const out = [];
  for (let j = -J; j <= J; j++) {
    const off = Math.abs(j) % 2 ? dx / 2 : 0;
    for (let i = -I; i <= I; i++) {
      const cx = i * dx + off, cy = j * dy;
      out.push({ key: `h${i},${j}`, P: corners.map(([x, y]) => [cx + x, cy + y]) });
    }
  }
  return out;
}

function triangleCells(w, h, T) {
  const s = T, th = s * SQRT3 / 2;
  const J = Math.ceil(h / 2 / th) + 1, I = Math.ceil(w / 2 / s) + 2;
  const off = j => (Math.abs(j) % 2 ? s / 2 : 0);
  const out = [];
  for (let j = -J; j < J; j++) {
    const yt = j * th, yb = (j + 1) * th;
    for (let i = -I; i <= I; i++) {
      const xb = off(j + 1) + i * s, xt = off(j) + i * s;
      out.push({ key: `u${i},${j}`, P: [[xb, yb], [xb + s, yb], [xb + s / 2, yt]] });
      out.push({ key: `d${i},${j}`, P: [[xt, yt], [xt + s, yt], [xt + s / 2, yb]] });
    }
  }
  return out;
}

// Voronoi cell of seeds[i] within the layer rect: nearer seeds first, and
// stop once the rest are too far away to cut it.
function voronoiCell(seeds, i, rect) {
  const si = seeds[i];
  const others = seeds.map((q, j) => [j, len(sub(q, si))]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]);
  let P = rect;
  for (const [j, d] of others) {
    if (!P) return null;
    const reach = Math.max(...P.map(v => len(sub(v, si))));
    if (d > 2 * reach) break;
    const sj = seeds[j];
    const n = [si[0] - sj[0], si[1] - sj[1]];
    const mid = [(si[0] + sj[0]) / 2, (si[1] + sj[1]) / 2];
    P = clipHalf(P, n, n[0] * mid[0] + n[1] * mid[1]);
  }
  return P;
}

// Seeds for a w × h layer: about one per T × T, scattered in the symmetry
// domain and copied by `ops`, then relaxed `iterations` times (Lloyd).
function voronoiCells(w, h, T, seed, ops, planes, regularity) {
  const rect = rectPoly(-w / 2, -h / 2, w, h);
  const r = rngAt(seed, 31);
  const n = Math.max(2, Math.round((w * h) / (T * T) / ops.length));
  const inDomain = p => planes.every(q => q.n[0] * p[0] + q.n[1] * p[1] >= q.c - 1e-9);
  let base = [];
  for (let tries = 0; base.length < n && tries < n * 50; tries++) {
    const p = [(r() - 0.5) * w, (r() - 0.5) * h];
    if (inDomain(p)) base.push(p);
  }
  const expand = pts => {
    const all = [];
    for (const p of pts) for (const op of ops) {
      const q = applyLinear(op, p);
      if (!all.some(a => Math.abs(a[0] - q[0]) < 1e-6 && Math.abs(a[1] - q[1]) < 1e-6)) all.push(q);
    }
    return all;
  };
  const iterations = Math.round(Math.min(1, Math.max(0, regularity)) * 4);
  for (let it = 0; it < iterations; it++) {
    const all = expand(base);
    base = base.map(p => {
      const i = all.findIndex(a => Math.abs(a[0] - p[0]) < 1e-6 && Math.abs(a[1] - p[1]) < 1e-6);
      const P = voronoiCell(all, i, rect);
      const c = P ? centroid(P) : p;
      return inDomain(c) ? c : p;
    });
  }
  const all = expand(base);
  return all.map((p, i) => ({ key: `v${i}`, P: voronoiCell(all, i, rect) })).filter(c => c.P);
}

// kind: 'hex' | 'triangle' | 'voronoi'. sym: { ops, planes } of the layer's
// symmetry (Voronoi only). Returns [{ key, P, box }] clipped to the layer.
export function tilingCells(kind, w, h, T, { seed = 0, dom = null, ops = [[1, 0, 0, 1]], planes = [], regularity = 0.5 } = {}) {
  const layerPlanes = halfPlanesOf(rectPoly(-w / 2, -h / 2, w, h));
  const raw = kind === 'hex' ? hexCells(w, h, T)
    : kind === 'triangle' ? triangleCells(w, h, T)
    : voronoiCells(w, h, T, seed, ops, planes, regularity);
  const out = [];
  for (const c of raw) {
    const clipped = clipToPlanes(c.P, layerPlanes);
    const P = clipped && tidy(clipped, T * 1e-3);
    if (!P || Math.abs(signedArea(P)) < T * T * 1e-3) continue;
    const box = bounds(P);
    if (dom && (box[0] >= dom[2] || box[1] >= dom[3] || box[2] <= dom[0] || box[3] <= dom[1])) continue;
    out.push({ key: c.key, P, box });
  }
  return out;
}
