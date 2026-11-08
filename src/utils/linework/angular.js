// Linework style A — strict angular / nested geometric fills.
//
// A layer is tiled with square tiles (optionally subdivided as a quadtree,
// or merged into 2 × 1 and 2 × 2 blocks). Each tile gets one fill: a
// greek-key spiral, concentric rings, a split into 2 or 4 triangles (each
// spiralled or ringed), parallel hatching, a chevron, or (v1.12.1) a diamond
// or octagon with filled corners, nested corner Ls, a cross, a basketweave,
// twin or quad spirals, a pinwheel or a bowtie, or (v1.13) a zigzag, stepped
// ziggurat rings, nested Us, spinning squares, three hatched stripes, a
// herringbone, stairs, rays, bricks, corner steps, quad spin or spinning
// triangles -- or one of the experimental fills: broken rings, solid ink,
// nothing, crosshatch, moiré, dots, a checkerboard, twist rings, a tunnel
// or a corner fan. Which fill a tile takes: at
// random (cfg.fillWeights weighting it) or in a pattern (cfg.placement).
// Every band is monoline: line width w on a pitch p (= w + gap), identical
// in every tile whatever its size.
//
// A band whose centreline lies on a region's boundary is drawn half-width
// inside the region, so neighbouring regions add up to one full line.
//
// Shapes are { s: solid polygon, h: hole polygon | null } in the layer's
// local frame (origin at its centre, y down).

import {
  add, sub, mul, dot, len, lerp, xLines, edgesOf, inset, clipHalf, signedArea, rectPoly, rngAt, hash,
  perp, unit, halfPlanesOf, clipToPlanes,
} from './geometry';
import { tilingCells, centroid } from './tilings';

// Greek-key spiral: segment j lies on edge (j mod n) moved inward by
// p * floor((j+1)/n), so every ring steps in by exactly one pitch.
export function spiralBand(P, w, p, start, flip, minLen) {
  let Q = flip ? P.slice().reverse() : P.slice();
  const n = Q.length;
  start %= n;
  Q = Q.slice(start).concat(Q.slice(0, start));
  const E = edgesOf(Q);
  const off = j => p * Math.floor((j + 1) / n);
  const ln = (j, t) => { const e = E[((j % n) + n) % n]; return [add(e.a, mul(e.n, t)), e.d]; };
  const X = (A, B) => xLines(A[0], A[1], B[0], B[1]);
  const oO = j => Math.max(0, off(j) - w / 2), oI = j => off(j) + w / 2;
  const s0 = ln(-1, 0);
  const O = [X(s0, ln(0, oO(0)))], I = [X(s0, ln(0, oI(0)))];
  let j = 0;
  for (; j < 5000; j++) {
    const o = X(ln(j, oO(j)), ln(j + 1, oO(j + 1)));
    const i = X(ln(j, oI(j)), ln(j + 1, oI(j + 1)));
    const d = E[j % n].d;
    if (!o || !i || dot(sub(i, I[I.length - 1]), d) < minLen || dot(sub(o, O[O.length - 1]), d) < minLen) break;
    O.push(o); I.push(i);
  }
  if (j === 0) return null;
  // Close the last segment flush with the inner edge of the turn it can't make.
  O.pop(); I.pop();
  const endL = ln(j, oI(j));
  O.push(X(ln(j - 1, oO(j - 1)), endL));
  I.push(X(ln(j - 1, oI(j - 1)), endL));
  return { s: O.concat(I.reverse()), h: null };
}

// Concentric rings, the outermost half-width on the boundary.
export function ringBands(P, w, p, core) {
  const out = [];
  for (let k = 0; k < 2000; k++) {
    const outer = inset(P, Math.max(0, k * p - w / 2));
    if (!outer) break;
    const inner = inset(P, k * p + w / 2);
    if (!inner) { if (core) out.push({ s: outer, h: null }); break; }
    out.push({ s: outer, h: inner });
  }
  return out;
}

// Parallel bands at `angle` degrees, their lattice anchored on `origin`.
export function hatchBands(P, angle, w, p, origin = [0, 0]) {
  const th = angle * Math.PI / 180, nn = [-Math.sin(th), Math.cos(th)];
  const o = dot(nn, origin);
  let lo = Infinity, hi = -Infinity;
  for (const v of P) { const t = dot(nn, v); lo = Math.min(lo, t); hi = Math.max(hi, t); }
  const out = [];
  for (let k = Math.ceil((lo - w / 2 - o) / p); o + k * p - w / 2 < hi; k++) {
    const c = o + k * p;
    let q = clipHalf(P, nn, c - w / 2);
    if (q) q = clipHalf(q, mul(nn, -1), -(c + w / 2));
    if (q && Math.abs(signedArea(q)) > 1e-3) out.push({ s: q, h: null });
  }
  return out;
}

// Nested L bands in a tw × th tile at (x, y), round the given corner (0 TL,
// 1 TR, 2 BR, 3 BL): band k's centreline is k pitches in from the two far
// edges, the first half-width on them like a ring's.
export function cornerBands(x, y, tw, th, corner, w, p, core) {
  const at = ([X, Y]) => [corner === 1 || corner === 2 ? x + tw - X : x + X, corner >= 2 ? y + th - Y : y + Y];
  const out = [];
  for (let k = 0; k < 2000; k++) {
    const a1 = Math.min(tw, tw - k * p + w / 2), b1 = Math.min(th, th - k * p + w / 2);
    const a0 = tw - k * p - w / 2, b0 = th - k * p - w / 2;
    if (a1 <= 0 || b1 <= 0) break;
    if (a0 <= 0 || b0 <= 0) {
      if (core) out.push({ s: rectPoly(0, 0, a1, b1).map(at), h: null });
      break;
    }
    out.push({ s: [[a0, 0], [a1, 0], [a1, b1], [0, b1], [0, b0], [a0, b0]].map(at), h: null });
  }
  return out;
}

// Nested U bands in a tw × th tile at (x, y), open on one side (0 bottom,
// 1 top, 2 right, 3 left): band k's centreline is k pitches in from the
// three closed sides and runs out to the open one.
export function nestedUBands(x, y, tw, th, side, w, p, core) {
  // u runs along the open side (0..A), v from the closed side to it (0..B).
  const A = side < 2 ? tw : th, B = side < 2 ? th : tw;
  const at = ([u, v]) => [
    [x + u, y + v], [x + u, y + th - v], [x + v, y + u], [x + tw - v, y + u],
  ][side];
  const out = [];
  for (let k = 0; k < 2000; k++) {
    const u0 = Math.max(0, k * p - w / 2), u1 = Math.min(A, A - k * p + w / 2), v0 = Math.max(0, k * p - w / 2);
    if (u1 <= u0 || v0 >= B) break;
    const i0 = k * p + w / 2, i1 = A - k * p - w / 2, iv = k * p + w / 2;
    if (i1 <= i0 || iv >= B) {
      if (core) out.push({ s: [[u0, v0], [u1, v0], [u1, B], [u0, B]].map(at), h: null });
      break;
    }
    out.push({ s: [[u0, B], [u0, v0], [u1, v0], [u1, B], [i1, B], [i1, iv], [i0, iv], [i0, B]].map(at), h: null });
  }
  return out;
}

// A stepped diamond centred on c: the union of rects half a_i × b_i wide and
// high, a_i = R - i·g - d and b_i = (i + ½)·g - d -- a staircase of steps g
// with every edge moved in by d. Null once nothing is left.
function staircase(c, R, g, d) {
  const q = [];
  for (let i = 0; ; i++) {
    const a = R - i * g - d, b = (i + 0.5) * g - d;
    if (a <= 0) break;
    if (b > 0) q.push([a, b]);
  }
  if (!q.length) return null;
  // The quadrant's corners in order, then mirrored round the other three.
  const pts = [];
  q.forEach(([a, b], i) => { if (i) pts.push([a, q[i - 1][1]]); pts.push([a, b]); });
  const ring = [
    ...pts,
    ...pts.slice().reverse().map(([u, v]) => [-u, v]),
    ...pts.map(([u, v]) => [-u, -v]),
    ...pts.slice().reverse().map(([u, v]) => [u, -v]),
  ];
  return ring.map(([u, v]) => [c[0] + u, c[1] + v]);
}

// Ziggurat: stepped diamond rings round the tile's centre, steps a pitch
// high, rings a pitch apart, carried out past the tile's corners and cut
// to it.
export function zigguratBands(P, c, hx, hy, w, p, core) {
  const g = p;
  const R = hx + (Math.ceil(hy / g) + 1) * g;
  // How far in the staircase lasts: its largest inscribed square's half side.
  let top = 0;
  for (let i = 0; R - i * g > 0; i++) top = Math.max(top, Math.min(R - i * g, (i + 0.5) * g));
  const planes = halfPlanesOf(P);
  const area = Q => (Q ? Math.abs(signedArea(Q)) : 0);
  const out = [];
  for (let d = top - p / 2; d + w / 2 > 0; d -= p) {
    const s = clipToPlanes(staircase(c, R, g, Math.max(0, d - w / 2)), planes);
    if (!s) continue;
    const hole = staircase(c, R, g, d + w / 2);
    if (!hole) { if (core) out.push({ s, h: null }); continue; }
    const h = clipToPlanes(hole, planes);
    if (h && area(h) >= area(s) - 1e-3) break;
    out.push({ s, h });
  }
  return out;
}

// P moved out by t, every edge (a convex polygon's mitred outline).
function outset(P, t) {
  const E = edgesOf(P), n = E.length;
  return E.map((e1, i) => {
    const e0 = E[(i + n - 1) % n];
    return xLines(sub(e0.a, mul(e0.n, t)), e0.d, sub(e1.a, mul(e1.n, t)), e1.d) ?? e1.a;
  });
}

// Spinning squares (any convex polygon): each polygon's corners a share t
// of the way along the last one's edges, t picked so it sits about a pitch
// inside; a line on each, the first half-width on the tile's edge.
// flip turns the other way.
export function spinBands(P, w, p, flip) {
  const planes = halfPlanesOf(P);
  const area = Q => Math.abs(signedArea(Q));
  const step = (Q, t) => Q.map((a, i) => lerp(a, Q[(i + 1) % Q.length], t));
  let Q = flip ? P.slice().reverse() : P.slice();
  const out = [];
  for (let k = 0; k < 200; k++) {
    const h = inset(Q, w / 2);
    if (!h) break;
    const s = k ? clipToPlanes(outset(Q, w / 2), planes) : Q;
    if (s) out.push({ s, h });
    const inner = inset(Q, p);
    if (!inner) break;
    const want = area(inner);
    const mid = step(Q, 0.5), am = area(mid);
    if (am >= want) {
      // Even the midpoints sit too close (a small tile, or a hexagon): shrink
      // them about the centre as well, so the lines stay a pitch apart.
      const c = mid.reduce((s, v) => add(s, mul(v, 1 / mid.length)), [0, 0]);
      const f = Math.sqrt(want / am);
      Q = mid.map(v => add(c, mul(sub(v, c), f)));
      continue;
    }
    let lo = 0, hi = 0.5;
    for (let j = 0; j < 24; j++) { const t = (lo + hi) / 2; if (area(step(Q, t)) > want) lo = t; else hi = t; }
    Q = step(Q, (lo + hi) / 2);
  }
  return out;
}

// Rays a line wide from c, a pitch apart at the rim, like hatching: `base`
// rays (over `span` from angle a0) start at c itself, and each level that
// doubles them starts where the rays before it have spread a pitch apart.
export function rayBands(P, c, w, p, a0 = 0, span = 2 * Math.PI, base = 8) {
  const planes = halfPlanesOf(P);
  const R = Math.max(...P.map(v => len(sub(v, c)))) + p;
  const K = Math.max(0, Math.floor(Math.log2((R * span) / p / base)));
  const m = base * 2 ** K, full = span >= 2 * Math.PI - 1e-9, out = [];
  for (let i = 0; i < m + (full ? 0 : 1); i++) {
    let lv = 0;
    while (i % (m / (base * 2 ** lv)) !== 0) lv++;
    const r0 = lv ? p / (span / (base * 2 ** lv)) : 0;
    const th = a0 + (span * i) / m, u = [Math.cos(th), Math.sin(th)], nn = mul(perp(u), w / 2);
    const a = add(c, mul(u, r0)), b = add(c, mul(u, R));
    const q = clipToPlanes([add(a, nn), add(b, nn), sub(b, nn), sub(a, nn)], planes);
    if (q && Math.abs(signedArea(q)) > 1e-3) out.push({ s: q, h: null });
  }
  return out;
}

// Twist rings: each ring the last one turned a few degrees and shrunk to
// sit a pitch inside it -- spinning squares that never touch.
export function twistBands(P, w, p, flip, deg = 9) {
  const planes = halfPlanesOf(P);
  const c = P.reduce((s, v) => add(s, mul(v, 1 / P.length)), [0, 0]);
  const t = ((flip ? -1 : 1) * deg * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  const turn = Q => Q.map(v => { const d = sub(v, c); return add(c, [d[0] * cs - d[1] * sn, d[0] * sn + d[1] * cs]); });
  let Q = P.slice();
  const out = [];
  for (let k = 0; k < 200; k++) {
    const h = inset(Q, w / 2);
    if (!h) break;
    const s = k ? clipToPlanes(outset(Q, w / 2), planes) : Q;
    if (s) out.push({ s, h });
    const room = inset(Q, p);
    if (!room) break;
    const R = turn(Q), rp = halfPlanesOf(room);
    const fits = f => R.every(v => { const q = add(c, mul(sub(v, c), f)); return rp.every(({ n, c: cc }) => dot(n, q) >= cc - 1e-9); });
    let lo = 0, hi = 1;
    for (let j = 0; j < 24; j++) { const f = (lo + hi) / 2; if (fits(f)) lo = f; else hi = f; }
    if (lo < 1e-3) break;
    Q = R.map(v => add(c, mul(sub(v, c), lo)));
  }
  return out;
}

// Tunnel: nested rectangles stepping in a pitch on one corner's two sides
// (0 TL, 1 TR, 2 BR, 3 BL) and 2½ pitches on the other two.
export function tunnelBands(x, y, tw, th, corner, w, p, core) {
  const near = p, far = 2.5 * p;
  const leftNear = corner === 0 || corner === 3, topNear = corner <= 1;
  const sL = leftNear ? near : far, sR = leftNear ? far : near, sT = topNear ? near : far, sB = topNear ? far : near;
  const rect = (k, d) => [x + k * sL + d, y + k * sT + d, x + tw - k * sR - d, y + th - k * sB - d];
  const out = [];
  for (let k = 0; k < 500; k++) {
    const [a0, b0, a1, b1] = k ? rect(k, -w / 2) : [x, y, x + tw, y + th];
    const [i0, j0, i1, j1] = rect(k, w / 2);
    if (a1 <= a0 || b1 <= b0) break;
    if (i1 <= i0 || j1 <= j0) { if (core) out.push({ s: rectPoly(a0, b0, a1 - a0, b1 - b0), h: null }); break; }
    out.push({ s: rectPoly(a0, b0, a1 - a0, b1 - b0), h: rectPoly(i0, j0, i1 - i0, j1 - j0) });
  }
  return out;
}

// Brick: courses of bricks two long by one high over the box, every other
// course offset half a brick, each brick ringed (cut to P).
export function brickBands(P, [x, y, tw, th], w, p, core) {
  const rows = Math.max(2, Math.round(th / Math.max(3 * p, th / 6))), bh = th / rows, bw = 2 * bh;
  const planes = halfPlanesOf(P), out = [];
  for (let r = 0; r < rows; r++) {
    for (let bx = x - (r % 2 ? bw / 2 : 0); bx < x + tw - 1e-6; bx += bw) {
      const B = clipToPlanes(rectPoly(bx, y + r * bh, bw, bh), planes);
      if (B && Math.abs(signedArea(B)) > 1e-3) out.push(...ringBands(B, w, p, core));
    }
  }
  return out;
}

// Rects cut to the convex region P, kept where anything is left.
function rectsIn(P, rects) {
  const planes = halfPlanesOf(P), out = [];
  for (const R of rects) {
    const q = clipToPlanes(R, planes);
    if (q && Math.abs(signedArea(q)) > 1e-3) out.push({ s: q, h: null });
  }
  return out;
}
// Stairs: staircase lines (a pitch per step) running corner to corner of
// the box [x, y, tw, th], two pitches apart; flip runs them the other way.
export function stairBands(P, [x, y, tw, th], w, p, flip) {
  const K = Math.ceil(th / p) + 1, rects = [];
  const fx = flip ? (X => 2 * x + tw - X) : (X => X);
  const R = (x0, y0, x1, y1) => rectPoly(Math.min(fx(x0), fx(x1)), y0, Math.abs(fx(x1) - fx(x0)), y1 - y0);
  for (let m = -Math.ceil(K / 2) - 1; m * 2 * p < tw + p; m++) {
    for (let k = -1; k <= K; k++) {
      const X = x + m * 2 * p + k * p, Y = y + k * p;
      rects.push(R(X - w / 2, Y - w / 2, X + p + w / 2, Y + w / 2), R(X + p - w / 2, Y - w / 2, X + p + w / 2, Y + p + w / 2));
    }
  }
  return rectsIn(P, rects);
}
// Dots: square dots a line wide, one per pitch over the box.
function dotBands(P, [x, y, tw, th], w, p) {
  const nx = Math.max(1, Math.round(tw / p)), ny = Math.max(1, Math.round(th / p)), rects = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) rects.push(rectPoly(x + ((i + 0.5) * tw) / nx - w / 2, y + ((j + 0.5) * th) / ny - w / 2, w, w));
  }
  return rectsIn(P, rects);
}
// Checker: a checkerboard of pitch-sized squares over the box.
function checkerBands(P, [x, y, tw, th], p) {
  const nx = Math.max(2, Math.round(tw / p)), ny = Math.max(2, Math.round(th / p)), rects = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) if ((i + j) % 2 === 0) rects.push(rectPoly(x + (i * tw) / nx, y + (j * th) / ny, tw / nx, th / ny));
  }
  return rectsIn(P, rects);
}
const boxOf = (P) => {
  const xs = P.map(v => v[0]), ys = P.map(v => v[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
};

// A tile's border, half a line wide; null if the tile is too small to hold it.
const outlineBand = (P, w) => { const h = inset(P, w / 2); return h ? { s: P, h } : null; };
function longestEdge(P) {
  let best = 0, bl = -1;
  P.forEach((a, i) => { const l = len(sub(P[(i + 1) % P.length], a)); if (l > bl + 1e-6) { bl = l; best = i; } });
  return best;
}

const KIND_NAMES = {
  spiral: 'Key spiral', rings: 'Rings', triSpiral: 'Triangle spiral', triRings: 'Triangle rings',
  hatch: 'Hatch', chevron: 'Chevron', diamond: 'Diamond', octagon: 'Octagon', cornerL: 'Corner L',
  cross: 'Cross', weave: 'Weave', twin: 'Twin spiral', quad: 'Quad spiral', pinwheel: 'Pinwheel', bowtie: 'Bowtie',
  zigzag: 'Zigzag', ziggurat: 'Ziggurat', nestedU: 'Nested U', spin: 'Spinning squares', broken: 'Broken rings',
  stripes: 'Stripes', herring: 'Herringbone', solid: 'Solid', stairs: 'Stairs', sunburst: 'Sunburst',
  crosshatch: 'Crosshatch', moire: 'Moiré', dots: 'Dots', checker: 'Checker',
  brick: 'Brick', cornerSteps: 'Corner steps', quadSpin: 'Quad spin', spinTri: 'Spin triangles',
  twist: 'Twist rings', tunnel: 'Tunnel', fan: 'Corner fan',
};
const angleOf = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

// L: { w, h } layer size, C cell size, lineW, p pitch, snap.
// cfg: the layer's settings. dom: [x0, y0, x1, y1] — only tiles touching
// this box are built (the symmetry domain). insideMask(x, y): whether a tile
// centre is in the region mask, or null for no mask. sym: { ops, planes } of
// the layer's symmetry, for Voronoi seeds.
// cfg.tiling: 'square' (default, with quadtree subdivision) or 'hex',
// 'triangle', 'voronoi' (tilings.js), whose cells take the same fills;
// "split" fills fan each cell into triangles from its centre.
// hand: a hand-built layer's tiles, { [tile key]: 0 (removed, left empty)
// or [kind, seed, turn?, mirror?, skip?] (filled again with that fill, its
// own randomness -- `skip` draws thrown away first, so a tile can be kept
// exactly as the layer drew it -- turned `turn` steps (a quarter turn on a
// square tile, one side on a cell) and mirrored left to right first) }.
// more.locks: locked tiles, as hand's; they're kept whatever the seed --
// a square tile is subdivided (or not) so each locked tile is still there,
// and no merge takes one in. more.merges: square tiles merged by hand,
// [[i, j, w, h], ...] on the layer's tile grid (1 × 1: kept apart).
// Returns { regions: [{ key, kind, name, shapes }], outlines: shapes,
// tiles: [{ key, P, kinds, filled, kind, seed, skip, turn, mirror, locked,
// rect? }], grid } -- tiles are every tile or cell (before clipping to the
// domain), with the fills it may take and how it's filled; grid (square
// tiles) is the tile grid { x0, y0, Tw, Th, nx, ny, mergeable(i, j, w, h) }.
export function angularLayer(L, cfg, seed, dom, insideMask, sym = {}, hand = null, more = {}) {
  const locks = more.locks && Object.keys(more.locks).length ? more.locks : null;
  const handMerges = more.merges ?? [];
  const { C, lineW: w, p } = L;
  const regions = [];
  const outlines = [];
  const tiles = [];
  // Whole tiles that exactly fill the layer: the nearest count to the tile
  // size on each axis, stretched a touch if the layer isn't a multiple of it.
  const T = Math.max(1, cfg.tile) * C;
  const nx = Math.max(1, Math.round(L.w / T)), ny = Math.max(1, Math.round(L.h / T));
  const Tw = L.w / nx, Th = L.h / ny;
  const x0 = -L.w / 2, y0 = -L.h / 2;
  const uni = cfg.orient === 'uniform';
  const angles = cfg.angles?.length ? cfg.angles.map(Number) : [45];
  const minLen = Math.min(w, p - w) * 0.25;
  // Diagonal hatch snaps to the grid diagonal so stripes pass through grid nodes.
  const pitchFor = a => {
    if (a % 90 === 0) return p;
    const D = C * Math.SQRT1_2;
    return D / Math.max(1, Math.round(D / p));
  };
  const hatch = (P, a, origin) => hatchBands(P, a, Math.min(w, pitchFor(a) * 0.95), pitchFor(a), origin);

  // Which of its fills a tile takes. pos: { i, j, ring } -- the tile's column
  // and row at its own size, and its square ring out from the layer's centre.
  // Random placement weighs the fills by cfg.fillWeights (as before when
  // they're even); the patterns cycle through them.
  const placement = cfg.placement ?? 'random';
  // How many draws pick takes from a tile's randomness.
  const pickDraws = placement === 'random' && !uni ? 1 : 0;
  const pick = (kinds, r, uniHash, pos) => {
    if (placement !== 'random') {
      const k = placement === 'checker' ? pos.i + pos.j : placement === 'rows' ? pos.j : placement === 'cols' ? pos.i : pos.ring;
      return kinds[((k % kinds.length) + kinds.length) % kinds.length];
    }
    const wts = kinds.map(k => Math.max(0, cfg.fillWeights?.[k] ?? 1));
    if (wts.every(v => v === wts[0])) return uni ? kinds[uniHash % kinds.length] : kinds[Math.floor(r() * kinds.length)];
    let u = (uni ? (uniHash % 10007) / 10007 : r()) * wts.reduce((a, b) => a + b, 0);
    for (let i = 0; i < kinds.length; i++) if ((u -= wts[i]) < 0) return kinds[i];
    return kinds[kinds.length - 1];
  };
  const posOf = (cx, cy, tw, th) => ({
    i: Math.floor((cx - x0) / tw), j: Math.floor((cy - y0) / th),
    ring: Math.floor(Math.max(Math.abs(cx) / tw, Math.abs(cy) / th) + 0.5),
  });
  // Spiral turn (cfg.spiralTurn): 'random', 'cw', 'ccw' or 'alternate'
  // (checkerboard, so neighbours mirror). `parity` is the tile being built's.
  let parity = false;
  const turnOf = (r) => {
    switch (cfg.spiralTurn ?? 'random') {
      case 'cw': return false;
      case 'ccw': return true;
      case 'alternate': return parity;
      default: return uni ? false : r() < 0.5;
    }
  };

  // A tile is filled only where the mask (the cells kept) takes in its centre.
  const kindsFor = (x, y, w, h) => {
    if (insideMask && !insideMask(x + w / 2, y + h / 2)) return null;
    return cfg.fills?.length ? cfg.fills : ['spiral'];
  };

  // Tile gap: each tile drawn G in from its edges. Outlines are then no
  // longer shared, so each one is drawn full width.
  const G = Math.max(0, cfg.gap ?? 0) * C / 2;
  const outlineW = w * (cfg.outlineWeight ?? 1) * (G > 0 ? 2 : 1);
  const pushOutline = (P) => {
    if (!cfg.outline) return;
    const band = outlineBand(P, outlineW);
    if (band) outlines.push(band);
  };

  // Records a tile or cell about to be filled. Returns false when it's left
  // empty (removed by hand -- its outline stays -- or outside the cells a
  // mask keeps), { kind, r } when it's filled again by hand, else null.
  // rngOf(seed): the tile's randomness for a seed. The tile recorded is
  // left in curTile, for its fill to be noted on it.
  let curTile = null;
  const handTile = (key, P, kinds, rngOf) => {
    const t = { key, P, kinds: kinds ?? (cfg.fills?.length ? cfg.fills : ['spiral']), filled: false, locked: locks?.[key] !== undefined };
    tiles.push(t);
    curTile = t;
    const h = t.locked ? locks[key] : hand?.[key];
    if (h === 0) { pushOutline(P); return false; }
    if (h) {
      t.filled = true;
      const r = rngOf(h[1]);
      for (let s = 0; s < (h[4] ?? 0); s++) r();
      return { kind: h[0], r, seed: h[1], skip: h[4] ?? 0, turn: h[2] ?? 0, mirror: !!h[3] };
    }
    if (!kinds) return false;
    t.filled = true;
    return null;
  };
  // Notes how a tile is filled on it, so it can be kept just so (see hand).
  const noteFill = (t, kind, own, skip) => Object.assign(t, {
    kind, seed: own ? own.seed : seed, skip: own ? own.skip : skip, turn: own?.turn ?? 0, mirror: own?.mirror ?? false,
  });
  // A tile's regions (from index r0) turned and mirrored: about the tile's
  // centre c, with half sizes hx, hy (a square tile: quarter turns), or,
  // for a cell P, by turns of 2π / sides, then cut back to the cell.
  const turnRegions = (r0, c, { hx, hy, P, turn, mirror }) => {
    const n = P ? P.length : 4;
    const a = (2 * Math.PI * turn) / n, ca = Math.cos(a), sa = Math.sin(a);
    const planes = P ? halfPlanesOf(signedArea(P) > 0 ? P : P.slice().reverse()) : null;
    const map = (q) => {
      let u = (q[0] - c[0]) / (hx ?? 1), v = (q[1] - c[1]) / (hy ?? 1);
      if (mirror) u = -u;
      if (P) [u, v] = [u * ca - v * sa, u * sa + v * ca];
      else for (let k = 0; k < ((turn % 4) + 4) % 4; k++) [u, v] = [-v, u];
      return [c[0] + u * (hx ?? 1), c[1] + v * (hy ?? 1)];
    };
    const fit = (Q) => (Q && planes ? clipToPlanes(Q, planes) : Q);
    for (let i = r0; i < regions.length; i++) {
      regions[i].shapes = regions[i].shapes.map(sh => {
        const s = fit(sh.s.map(map));
        return s ? { ...sh, s, h: sh.h ? fit(sh.h.map(map)) : sh.h } : null;
      }).filter(Boolean);
    }
  };
  // Locked tiles' boxes [x, y, w] (from their keys), to subdivide down to them.
  const lockBoxes = locks ? Object.keys(locks).map(k => k.split(',').map(Number)).filter(b => b.length === 3 && b.every(Number.isFinite)) : [];
  const lockedWithin = (x, y, tw, th) => lockBoxes.some(([lx, ly, lw]) =>
    lw < tw - 0.5 && lx > x - 0.5 && ly > y - 0.5 && lx + lw < x + tw + 0.5 && ly + lw < y + th + 0.5);

  // opts: { start, flip } fix the spiral's start edge and turn; kind names it.
  function region(key, P, mode, r, startHint, tri, opts = {}) {
    let shapes;
    if (mode === 'spiral') {
      const start = opts.start ?? (uni ? (startHint ?? 0) : Math.floor(r() * P.length));
      const b = spiralBand(P, w, p, start, opts.flip ?? turnOf(r), minLen);
      shapes = b ? [b] : [];
      // A spiral can't always turn inside a small or awkward cell: rings fit.
      if (!b) { shapes = ringBands(P, w, p, cfg.core); mode = 'rings'; }
    } else {
      shapes = ringBands(P, w, p, cfg.core);
    }
    const kind = opts.kind ?? (tri ? (mode === 'spiral' ? 'triSpiral' : 'triRings') : mode);
    if (shapes.length) regions.push({ key, kind, shapes });
    pushOutline(P);
  }
  const triMode = r => (cfg.triFill === 'mix' ? (r() < 0.5 ? 'spiral' : 'rings') : (cfg.triFill || 'spiral'));

  // Fills that work in any convex tile or cell (centre c). Diamond and
  // octagon ring a polygon cut from the tile's edges (at their midpoints, or
  // so a square's octagon is regular), their corners filled as triangles;
  // pinwheel and bowtie fan the tile into triangles from its centre,
  // pinwheel hatching each along a spoke, bowtie filling every other one and
  // hatching the rest across. Returns whether it drew the kind.
  function convexFill(key, P, c, kind, r) {
    const n = P.length;
    if (kind === 'diamond' || kind === 'octagon') {
      const t = kind === 'diamond' ? 0.5 : 1 - Math.SQRT1_2;
      const cuts = P.map((a, i) => { const b = P[(i + 1) % n]; return [lerp(a, b, t), lerp(a, b, 1 - t)]; });
      const inner = kind === 'diamond' ? cuts.map(([m]) => m) : cuts.flat();
      const shapes = ringBands(inner, w, p, cfg.core);
      if (shapes.length) regions.push({ key, kind, shapes });
      P.forEach((a, i) => {
        const tri = [cuts[(i + n - 1) % n][1], a, cuts[i][0]];
        region(`${key}:${i}`, tri, triMode(r), r, longestEdge(tri), true);
      });
      pushOutline(P);
      return true;
    }
    if (kind === 'pinwheel' || kind === 'bowtie') {
      const flip = uni ? false : r() < 0.5;
      P.forEach((a, i) => {
        const b = P[(i + 1) % n], tri = [a, b, c];
        if (kind === 'bowtie' && (i % 2 === 0) !== flip) {
          region(`${key}:${i}`, tri, triMode(r), r, longestEdge(tri), true);
          return;
        }
        const e = sub(b, a);
        const ang = kind === 'bowtie' ? angleOf([-e[1], e[0]]) : angleOf(sub(c, flip ? b : a));
        regions.push({ key: `${key}:${i}`, kind, shapes: hatch(tri, ang, c) });
        pushOutline(tri);
      });
      return true;
    }
    if (kind === 'solid' || kind === 'blank') {
      if (kind === 'solid') regions.push({ key, kind, shapes: [{ s: P, h: null }] });
      pushOutline(P);
      return true;
    }
    if (kind === 'spinTri') {
      // The tile fanned into triangles from its centre, each spinning, turning in turn.
      const flip = turnOf(r);
      P.forEach((a, i) => {
        const tri = [a, P[(i + 1) % n], c];
        regions.push({ key: `${key}:${i}`, kind, shapes: spinBands(tri, w, p, (i % 2 === 0) !== flip) });
        pushOutline(tri);
      });
      return true;
    }
    if (kind === 'fan') {
      // Rays from one corner, across the angle between its two edges.
      const k = uni ? 0 : Math.floor(r() * n), v = P[k];
      const a1 = Math.atan2(...[1, 0].map(d => P[(k + 1) % n][d] - v[d]));
      const a2 = Math.atan2(...[1, 0].map(d => P[(k + n - 1) % n][d] - v[d]));
      let d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      regions.push({ key, kind, shapes: rayBands(P, v, w, p, d < 0 ? a1 + d : a1, Math.abs(d), 2) });
      pushOutline(P);
      return true;
    }
    if (kind === 'twist' || kind === 'brick') {
      regions.push({ key, kind, shapes: kind === 'twist' ? twistBands(P, w, p, turnOf(r)) : brickBands(P, boxOf(P), w, p, cfg.core) });
      if (kind === 'twist') pushOutline(P);
      return true;
    }
    if (kind === 'spin') {
      regions.push({ key, kind, shapes: spinBands(P, w, p, turnOf(r)) });
      pushOutline(P);
      return true;
    }
    if (kind === 'broken') {
      // Rings cut a pitch wide along the spokes from the centre to each
      // edge's midpoint: one piece of each ring per corner.
      const rings = ringBands(P, w, p, cfg.core);
      const shapes = [];
      P.forEach((v, i) => {
        const planes = [lerp(P[(i + n - 1) % n], v, 0.5), lerp(v, P[(i + 1) % n], 0.5)].map(m => {
          let nn = perp(unit(sub(m, c)));
          if (dot(nn, sub(v, c)) < 0) nn = mul(nn, -1);
          return { n: nn, c: dot(nn, c) + p / 2 };
        });
        for (const ring of rings) {
          const s = clipToPlanes(ring.s, planes);
          if (s) shapes.push({ s, h: ring.h ? clipToPlanes(ring.h, planes) : null });
        }
      });
      regions.push({ key, kind, shapes });
      pushOutline(P);
      return true;
    }
    if (kind === 'stripes') {
      // Three bars along the tile (a square either way, a cell along its
      // longest edge), hatched along, across and along. On a square the
      // bars are whole pitches wide and the hatching starts at its corner,
      // as Weave's does, so every line is a full line; only the tile gets
      // an outline.
      const e = longestEdge(P), sqr = n === 4 && Math.abs(P[1][1] - P[0][1]) < 1e-6;
      const a = sqr ? (uni || r() < 0.5 ? 0 : 90) : angleOf(sub(P[(e + 1) % n], P[e]));
      const th = a * Math.PI / 180, nn = [-Math.sin(th), Math.cos(th)];
      const ts = P.map(v => dot(nn, v));
      const lo = Math.min(...ts), hi = Math.max(...ts);
      const k = Math.round((hi - lo) / p), k0 = sqr && k >= 3 ? Math.round(k / 3) : 0;
      const cuts = k0 ? [lo, lo + k0 * p, hi - k0 * p, hi] : [0, 1, 2, 3].map(i => lo + (i * (hi - lo)) / 3);
      const origin = sqr ? P[0] : c;
      for (let i = 0; i < 3; i++) {
        let bar = clipHalf(P, nn, cuts[i]);
        if (bar) bar = clipHalf(bar, mul(nn, -1), -cuts[i + 1]);
        if (bar) regions.push({ key: `${key}:${i}`, kind, shapes: hatch(bar, i % 2 ? a + 90 : a, origin) });
      }
      pushOutline(P);
      return true;
    }
    // Rays, stairs and the experimental fills, any convex tile or cell.
    const more = {
      sunburst: () => rayBands(P, c, w, p),
      stairs: () => stairBands(P, boxOf(P), w, p, uni ? false : r() < 0.5),
      crosshatch: () => [...hatch(P, 45, c), ...hatch(P, 135, c)],
      moire: () => {
        const a = uni ? 0 : [0, 90][Math.floor(r() * 2)];
        return [...hatch(P, a, c), ...hatchBands(P, a + 7, w * 0.8, p, c)];
      },
      dots: () => dotBands(P, boxOf(P), w, p),
      checker: () => checkerBands(P, boxOf(P), p),
    }[kind];
    if (more) {
      regions.push({ key, kind, shapes: more() });
      pushOutline(P);
      return true;
    }
    return false;
  }

  // Zigzag and herringbone: strips side by side, hatched at 45° and 135° in
  // turn. A strip is a whole number of half the hatch's period wide, so the
  // lines meet at every join -- or, for herringbone, (twice as wide) every
  // other strip is shifted half a period along, so they meet out of step.
  function zigzag(x, y, tw, th, kind, r) {
    const across = uni ? true : r() < 0.5;
    const k = Math.max(1, Math.round((C * Math.SQRT1_2) / p));
    const half = C / (2 * k);
    const sw = half * Math.max(1, Math.round(k / 2)) * (kind === 'herring' ? 2 : 1);
    const [u0, u1] = across ? [x, x + tw] : [y, y + th];
    const cu = (u0 + u1) / 2;
    const shapes = [];
    for (let i = Math.floor((u0 - cu) / sw); cu + i * sw < u1; i++) {
      const a = Math.max(u0, cu + i * sw), b = Math.min(u1, cu + (i + 1) * sw);
      if (b - a < 1e-6) continue;
      const odd = Math.abs(i % 2) === 1;
      const shift = kind === 'herring' && odd ? half : 0;
      const P = across ? rectPoly(a, y, b - a, th) : rectPoly(x, a, tw, b - a);
      shapes.push(...hatch(P, odd ? 135 : 45, across ? [cu, y + shift] : [x + shift, cu]));
    }
    return shapes;
  }

  // A tile tw × th at (x, y); quadtree subdivision splits it into four.
  // (rect: a merged tile's [i, j, w, h] on the tile grid.)
  function tile(x, y, tw, th, depth, rect = null) {
    if (dom && (x >= dom[2] || y >= dom[3] || x + tw <= dom[0] || y + th <= dom[1])) return;
    let r = rngAt(seed, x, y, tw, 7);
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(tw)}`;
    // A locked tile stays whole; one with a locked tile inside is split down to it.
    const lockedHere = locks?.[key] !== undefined;
    const tries = !lockedHere && depth < 3 && Math.min(tw, th) / 2 >= (cfg.minTile ?? 1) * C - 1e-6;
    const within = !lockedHere && depth < 3 && lockBoxes.length > 0 && lockedWithin(x, y, tw, th);
    if (within || (tries && r() < (cfg.subdiv ?? 0))) {
      const hw = tw / 2, hh = th / 2;
      tile(x, y, hw, hh, depth + 1); tile(x + hw, y, hw, hh, depth + 1);
      tile(x, y + hh, hw, hh, depth + 1); tile(x + hw, y + hh, hw, hh, depth + 1);
      return;
    }
    const kinds = kindsFor(x, y, tw, th);
    const own = handTile(key, rectPoly(x, y, tw, th), kinds, (s) => rngAt(s, x, y, tw, 7));
    const t = curTile;
    if (rect) t.rect = rect;
    if (own === false) return;
    if (own) r = own.r;
    const pos = posOf(x + tw / 2, y + th / 2, tw, th);
    parity = (pos.i + pos.j) % 2 !== 0;
    const kind = own ? own.kind : pick(kinds, r, hash(seed, Math.round(tw)), pos);
    noteFill(t, kind, own, (tries ? 1 : 0) + pickDraws);
    const r0 = regions.length;
    squareFill(x, y, tw, th, key, kind, r);
    if (own && (own.turn || own.mirror)) turnRegions(r0, [x + tw / 2, y + th / 2], { hx: tw / 2, hy: th / 2, turn: own.turn, mirror: own.mirror });
  }
  // A square tile's fill.
  function squareFill(x, y, tw, th, key, kind, r) {
    if (G > 0) {
      if (Math.min(tw, th) <= 2 * G + w) return;
      x += G; y += G; tw -= 2 * G; th -= 2 * G;
    }
    const TL = [x, y], TR = [x + tw, y], BR = [x + tw, y + th], BL = [x, y + th];
    const sq = [TL, TR, BR, BL];
    if (convexFill(key, sq, [x + tw / 2, y + th / 2], kind, r)) return;
    switch (kind) {
      case 'spiral': region(key, sq, 'spiral', r, 0); break;
      case 'rings': region(key, sq, 'rings', r); break;
      case 'zigzag': case 'herring': {
        regions.push({ key, kind, shapes: zigzag(x, y, tw, th, kind, r) });
        pushOutline(sq);
        break;
      }
      case 'ziggurat': {
        regions.push({ key, kind, shapes: zigguratBands(sq, [x + tw / 2, y + th / 2], tw / 2, th / 2, w, p, cfg.core) });
        pushOutline(sq);
        break;
      }
      case 'cornerSteps': {
        // Ziggurat rings round a corner: stepped quarter rings.
        const k = uni ? 0 : Math.floor(r() * 4);
        regions.push({ key, kind, shapes: zigguratBands(sq, sq[k], tw, th, w, p, cfg.core) });
        pushOutline(sq);
        break;
      }
      case 'quadSpin': {
        // Spinning squares in each quarter, neighbours turning opposite ways.
        const hw = tw / 2, hh = th / 2, flip = turnOf(r);
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([i, j], k) => {
          const Q = rectPoly(x + i * hw, y + j * hh, hw, hh);
          regions.push({ key: `${key}:${k}`, kind, shapes: spinBands(Q, w, p, ((i + j) % 2 === 0) !== flip) });
          pushOutline(Q);
        });
        break;
      }
      case 'tunnel': {
        regions.push({ key, kind, shapes: tunnelBands(x, y, tw, th, uni ? 0 : Math.floor(r() * 4), w, p, cfg.core) });
        pushOutline(sq);
        break;
      }
      case 'nestedU': {
        regions.push({ key, kind, shapes: nestedUBands(x, y, tw, th, uni ? 0 : Math.floor(r() * 4), w, p, cfg.core) });
        pushOutline(sq);
        break;
      }
      case 'cornerL': {
        regions.push({ key, kind, shapes: cornerBands(x, y, tw, th, uni ? 0 : Math.floor(r() * 4), w, p, cfg.core) });
        pushOutline(sq);
        break;
      }
      case 'cross': {
        // A plus a third of the tile wide, ringed, with a ringed square in each corner.
        const a = tw / 3, b = th / 3;
        const plus = [
          [x + a, y], [x + 2 * a, y], [x + 2 * a, y + b], [x + tw, y + b], [x + tw, y + 2 * b], [x + 2 * a, y + 2 * b],
          [x + 2 * a, y + th], [x + a, y + th], [x + a, y + 2 * b], [x, y + 2 * b], [x, y + b], [x + a, y + b],
        ];
        const shapes = ringBands(plus, w, p, cfg.core);
        if (shapes.length) regions.push({ key, kind, shapes });
        [[0, 0], [2, 0], [2, 2], [0, 2]].forEach(([i, j], k) => region(`${key}:${k}`, rectPoly(x + i * a, y + j * b, a, b), 'rings', r));
        pushOutline(sq);
        break;
      }
      case 'weave': {
        // Quarters hatched across and down in turn, like a basketweave.
        const flip = uni ? false : r() < 0.5, hw = tw / 2, hh = th / 2;
        const shapes = [[0, 0], [1, 0], [0, 1], [1, 1]].flatMap(([i, j]) =>
          hatch(rectPoly(x + i * hw, y + j * hh, hw, hh), ((i + j) % 2 === 0) !== flip ? 0 : 90, [x, y]));
        regions.push({ key, kind, shapes });
        pushOutline(sq);
        break;
      }
      case 'twin': {
        // Two spirals in the tile's halves, the second the first turned half round.
        const across = tw > th + 1e-6 || (Math.abs(tw - th) <= 1e-6 && (uni || r() < 0.5));
        const halves = across
          ? [rectPoly(x, y, tw / 2, th), rectPoly(x + tw / 2, y, tw / 2, th)]
          : [rectPoly(x, y, tw, th / 2), rectPoly(x, y + th / 2, tw, th / 2)];
        const start = uni ? 0 : Math.floor(r() * 4), flip = turnOf(r);
        halves.forEach((h, i) => region(`${key}:${i}`, h, 'spiral', r, 0, false, { start: start + 2 * i, flip, kind }));
        break;
      }
      case 'quad': {
        // A spiral in each quarter, each starting a quarter turn on: a pinwheel.
        const hw = tw / 2, hh = th / 2, flip = turnOf(r);
        [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([i, j], k) =>
          region(`${key}:${k}`, rectPoly(x + i * hw, y + j * hh, hw, hh), 'spiral', r, 0, false, { start: k, flip, kind }));
        break;
      }
      case 'split2': {
        const d = uni ? 0 : (r() < 0.5 ? 0 : 1);
        const tris = d ? [[TL, TR, BL], [TR, BR, BL]] : [[TL, TR, BR], [TL, BR, BL]];
        tris.forEach((t, i) => region(`${key}:${i}`, t, triMode(r), r, longestEdge(t), true));
        break;
      }
      case 'split4': {
        const c = [x + tw / 2, y + th / 2];
        [[TL, TR, c], [TR, BR, c], [BR, BL, c], [BL, TL, c]].forEach((t, i) => region(`${key}:${i}`, t, triMode(r), r, 0, true));
        break;
      }
      case 'hatch': {
        const a = uni ? angles[0] : angles[Math.floor(r() * angles.length)];
        regions.push({ key, kind: 'hatch', shapes: hatch(sq, a) });
        pushOutline(sq);
        break;
      }
      case 'chevron': {
        const vertical = uni ? true : r() < 0.5, a = (uni ? false : r() < 0.5) ? 135 : 45;
        let shapes;
        if (vertical) {
          const xm = x + tw / 2, o = [xm, y];
          shapes = [...hatch(rectPoly(x, y, tw / 2, th), a, o), ...hatch(rectPoly(xm, y, tw / 2, th), 180 - a, o)];
        } else {
          const ym = y + th / 2, o = [x, ym];
          shapes = [...hatch(rectPoly(x, y, tw, th / 2), a, o), ...hatch(rectPoly(x, ym, tw, th / 2), -a, o)];
        }
        regions.push({ key, kind: 'chevron', shapes });
        pushOutline(sq);
        break;
      }
    }
  }
  // A convex cell of a hex / triangle / Voronoi tiling.
  function cell(cl) {
    const { key, P, box } = cl;
    const kinds = kindsFor(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    const c = centroid(P);
    const own = handTile(key, P, kinds, (s) => rngAt(s, c[0], c[1], 7));
    const t = curTile;
    if (own === false) return;
    const r = own ? own.r : rngAt(seed, c[0], c[1], 7);
    const pos = posOf(c[0], c[1], T, T);
    parity = (pos.i + pos.j) % 2 !== 0;
    const kind = own ? own.kind : pick(kinds, r, hash(seed, P.length), pos);
    noteFill(t, kind, own, pickDraws);
    const r0 = regions.length;
    const Pin = cellFill(P, key, kind, r, c);
    if (own && (own.turn || own.mirror) && Pin) turnRegions(r0, c, { P: Pin, turn: own.turn, mirror: own.mirror });
  }
  // A cell's fill; returns the cell as filled (inset by the tile gap), or null.
  function cellFill(P, key, kind, r, c) {
    if (G > 0 && !(P = inset(P, G))) return null;
    // Square-tile fills a cell takes its own way: a cross as a diamond, a
    // quad spin as one spin; corner Ls, nested Us, ziggurats, corner steps
    // and tunnels as rings; spirals in the fan's
    // triangles; a weave hatching them along and across in turn; zigzag and
    // herringbone as a chevron's single direction.
    if (convexFill(key, P, c, { cross: 'diamond', quadSpin: 'spin' }[kind] ?? kind, r)) return P;
    switch (kind) {
      case 'spiral': region(key, P, 'spiral', r, 0); break;
      case 'rings': case 'cornerL': case 'nestedU': case 'ziggurat': case 'cornerSteps': case 'tunnel':
        region(key, P, 'rings', r); break;
      case 'twin': case 'quad': {
        const flip = turnOf(r);
        P.forEach((a, i) => region(`${key}:${i}`, [a, P[(i + 1) % P.length], c], 'spiral', r, 0, true, { start: 0, flip, kind }));
        break;
      }
      case 'weave': {
        P.forEach((a, i) => {
          const T3 = [a, P[(i + 1) % P.length], c], e = sub(T3[1], a);
          regions.push({ key: `${key}:${i}`, kind, shapes: hatch(T3, angleOf(i % 2 ? [-e[1], e[0]] : e), c) });
          pushOutline(T3);
        });
        break;
      }
      case 'split2': case 'split4': {
        P.forEach((a, i) => region(`${key}:${i}`, [a, P[(i + 1) % P.length], c], triMode(r), r, 0, true));
        break;
      }
      default: {
        // Hatch, and chevron, zigzag and herringbone (one hatch direction per cell).
        const zig = kind === 'chevron' || kind === 'zigzag' || kind === 'herring';
        const a = zig ? (r() < 0.5 ? 45 : 135) : uni ? angles[0] : angles[Math.floor(r() * angles.length)];
        regions.push({ key, kind: 'hatch', shapes: hatch(P, a) });
        pushOutline(P);
      }
    }
    return P;
  }

  // The square tile grid, and whether a w × h block at (i, j) may merge:
  // inside the grid and never across a symmetry axis.
  const crosses = (a, b, bw, bh) => (sym.planes ?? []).some(({ n, c }) => {
    const xs = [x0 + a * Tw, x0 + (a + bw) * Tw], ys = [y0 + b * Th, y0 + (b + bh) * Th];
    const v = xs.flatMap(X => ys.map(Y => n[0] * X + n[1] * Y - c));
    return v.some(t => t > 1e-6) && v.some(t => t < -1e-6);
  });
  const mergeable = (a, b, bw, bh) => a >= 0 && b >= 0 && a + bw <= nx && b + bh <= ny && !crosses(a, b, bw, bh);
  // Merges by hand and locked tiles' merges, where they still fit; the
  // grid cells under locked tiles (no random merge takes those in).
  const lockMerges = more.lockMerges ?? [];
  const forced = new Map();
  const forcedCells = new Set();
  for (const [i, j, bw, bh] of [...lockMerges, ...handMerges]) {
    if (!mergeable(i, j, bw, bh)) continue;
    const cellsOf = [...Array(bw * bh)].map((_, k) => `${i + (k % bw)},${j + Math.floor(k / bw)}`);
    if (cellsOf.some(k => forcedCells.has(k))) continue;
    forced.set(`${i},${j}`, [bw, bh]);
    for (const k of cellsOf) forcedCells.add(k);
  }
  const lockCells = new Set(lockBoxes.map(([lx, ly]) => `${Math.floor((lx - x0) / Tw + 1e-3)},${Math.floor((ly - y0) / Th + 1e-3)}`));

  if (cfg.tiling && cfg.tiling !== 'square') {
    const cells = tilingCells(cfg.tiling, L.w, L.h, T, { seed, dom, ops: sym.ops, planes: sym.planes, regularity: cfg.regularity ?? 0.5 });
    for (const c of cells) cell(c);
  } else if (!(cfg.merge > 0) && !forced.size) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tile(x0 + i * Tw, y0 + j * Th, Tw, Th, 0);
  } else {
    // Merged tiles: a tile may take in its neighbours to the right and below
    // as a 2 × 1, 1 × 2 or 2 × 2 block (never across a symmetry axis, and
    // never subdivided). Merges made by hand come first, any size.
    const taken = new Set();
    const fits = (a, b, bw, bh) => a + bw <= nx && b + bh <= ny && !crosses(a, b, bw, bh)
      && [...Array(bw * bh)].every((_, k) => {
        const q = `${a + (k % bw)},${b + Math.floor(k / bw)}`;
        return !taken.has(q) && !forcedCells.has(q) && !lockCells.has(q);
      });
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const here = `${i},${j}`;
        if (taken.has(here)) continue;
        let [bw, bh] = [1, 1];
        if (forced.has(here)) [bw, bh] = forced.get(here);
        else if (!forcedCells.has(here)) {
          const rm = rngAt(seed, i, j, 13);
          if (!lockCells.has(here) && rm() < cfg.merge) {
            const ways = [[2, 2], [2, 1], [1, 2]].filter(([a, b]) => fits(i, j, a, b));
            if (ways.length) [bw, bh] = ways[Math.floor(rm() * ways.length)];
          }
        }
        for (let k = 0; k < bw * bh; k++) taken.add(`${i + (k % bw)},${j + Math.floor(k / bw)}`);
        tile(x0 + i * Tw, y0 + j * Th, bw * Tw, bh * Th, bw * bh > 1 ? 3 : 0, bw * bh > 1 ? [i, j, bw, bh] : null);
      }
    }
  }
  for (const reg of regions) reg.name = KIND_NAMES[reg.kind];
  const square = !cfg.tiling || cfg.tiling === 'square';
  return { regions, outlines, tiles, grid: square ? { x0, y0, Tw, Th, nx, ny, mergeable } : null };
}
