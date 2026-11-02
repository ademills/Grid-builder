// Linework style A — strict angular / nested geometric fills.
//
// A layer is tiled with square tiles (optionally subdivided as a quadtree).
// Each tile gets one fill: a greek-key spiral, concentric rings, a split into
// 2 or 4 triangles (each spiralled or ringed), parallel hatching, a chevron,
// or (v1.12.1) a diamond or octagon with filled corners, nested corner Ls, a
// cross, a basketweave, twin or quad spirals, a pinwheel or a bowtie. Which
// fill a tile takes: at random (cfg.fillWeights weighting it) or in a
// pattern (cfg.placement). Every band is monoline: line width w on a pitch p (= w + gap),
// identical in every tile whatever its size.
//
// A band whose centreline lies on a region's boundary is drawn half-width
// inside the region, so neighbouring regions add up to one full line.
//
// Shapes are { s: solid polygon, h: hole polygon | null } in the layer's
// local frame (origin at its centre, y down).

import {
  add, sub, mul, dot, len, lerp, xLines, edgesOf, inset, clipHalf, signedArea, rectPoly, rngAt, hash,
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
// or [kind, seed] (filled again with that fill, its own randomness) }.
// Returns { regions: [{ key, kind, name, shapes }], outlines: shapes,
// tiles: [{ key, P, kinds, filled }] } -- tiles are every tile or cell
// (before clipping to the domain), with the fills it may take.
export function angularLayer(L, cfg, seed, dom, insideMask, sym = {}, hand = null) {
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

  const kindsFor = (x, y, w, h) => {
    if (insideMask?.(x + w / 2, y + h / 2)) {
      return cfg.maskFills?.length ? cfg.maskFills : null;
    }
    if (insideMask && cfg.maskOutside === 'empty') return null;
    return cfg.fills?.length ? cfg.fills : ['spiral'];
  };

  const pushOutline = (P) => {
    if (!cfg.outline) return;
    const band = outlineBand(P, w);
    if (band) outlines.push(band);
  };

  // Records a tile or cell about to be filled. Returns false when it's left
  // empty (removed by hand -- its outline stays -- or outside a mask that's
  // left empty), { kind, r } when it's filled again by hand, else null.
  const handTile = (key, P, kinds, rngOf) => {
    const t = { key, P, kinds: kinds ?? (cfg.fills?.length ? cfg.fills : ['spiral']), filled: false };
    tiles.push(t);
    const h = hand?.[key];
    if (h === 0) { pushOutline(P); return false; }
    if (h) { t.filled = true; return { kind: h[0], r: rngOf() }; }
    if (!kinds) return false;
    t.filled = true;
    return null;
  };

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
    return false;
  }

  // A tile tw × th at (x, y); quadtree subdivision splits it into four.
  function tile(x, y, tw, th, depth) {
    if (dom && (x >= dom[2] || y >= dom[3] || x + tw <= dom[0] || y + th <= dom[1])) return;
    let r = rngAt(seed, x, y, tw, 7);
    if (depth < 3 && Math.min(tw, th) / 2 >= (cfg.minTile ?? 1) * C - 1e-6 && r() < (cfg.subdiv ?? 0)) {
      const hw = tw / 2, hh = th / 2;
      tile(x, y, hw, hh, depth + 1); tile(x + hw, y, hw, hh, depth + 1);
      tile(x, y + hh, hw, hh, depth + 1); tile(x + hw, y + hh, hw, hh, depth + 1);
      return;
    }
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(tw)}`;
    const TL = [x, y], TR = [x + tw, y], BR = [x + tw, y + th], BL = [x, y + th];
    const sq = [TL, TR, BR, BL];
    const kinds = kindsFor(x, y, tw, th);
    const own = handTile(key, sq, kinds, () => rngAt(hand[key][1], x, y, tw, 7));
    if (own === false) return;
    if (own) r = own.r;
    const pos = posOf(x + tw / 2, y + th / 2, tw, th);
    parity = (pos.i + pos.j) % 2 !== 0;
    const kind = own ? own.kind : pick(kinds, r, hash(seed, Math.round(tw)), pos);
    if (convexFill(key, sq, [x + tw / 2, y + th / 2], kind, r)) return;
    switch (kind) {
      case 'spiral': region(key, sq, 'spiral', r, 0); break;
      case 'rings': region(key, sq, 'rings', r); break;
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
  function cell({ key, P, box }) {
    const kinds = kindsFor(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    const c = centroid(P);
    const own = handTile(key, P, kinds, () => rngAt(hand[key][1], c[0], c[1], 7));
    if (own === false) return;
    const r = own ? own.r : rngAt(seed, c[0], c[1], 7);
    const pos = posOf(c[0], c[1], T, T);
    parity = (pos.i + pos.j) % 2 !== 0;
    const kind = own ? own.kind : pick(kinds, r, hash(seed, P.length), pos);
    // Square-tile fills a cell takes its own way: a cross as a diamond,
    // corner Ls as rings, spirals in the fan's triangles, a weave hatching
    // them along and across in turn.
    if (convexFill(key, P, c, kind === 'cross' ? 'diamond' : kind, r)) return;
    switch (kind) {
      case 'spiral': region(key, P, 'spiral', r, 0); break;
      case 'rings': case 'cornerL': region(key, P, 'rings', r); break;
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
        // Hatch, and chevron (one hatch direction per cell).
        const a = kind === 'chevron' ? (r() < 0.5 ? 45 : 135) : uni ? angles[0] : angles[Math.floor(r() * angles.length)];
        regions.push({ key, kind: 'hatch', shapes: hatch(P, a) });
        pushOutline(P);
      }
    }
  }

  if (cfg.tiling && cfg.tiling !== 'square') {
    const cells = tilingCells(cfg.tiling, L.w, L.h, T, { seed, dom, ops: sym.ops, planes: sym.planes, regularity: cfg.regularity ?? 0.5 });
    for (const c of cells) cell(c);
  } else {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tile(x0 + i * Tw, y0 + j * Th, Tw, Th, 0);
  }
  for (const reg of regions) reg.name = KIND_NAMES[reg.kind];
  return { regions, outlines, tiles };
}
