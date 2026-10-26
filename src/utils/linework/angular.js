// Linework style A — strict angular / nested geometric fills.
//
// A layer is tiled with square tiles (optionally subdivided as a quadtree).
// Each tile gets one fill: a greek-key spiral, concentric rings, a split into
// 2 or 4 triangles (each spiralled or ringed), parallel hatching, or a
// chevron. Every band is monoline: line width w on a pitch p (= w + gap),
// identical in every tile whatever its size.
//
// A band whose centreline lies on a region's boundary is drawn half-width
// inside the region, so neighbouring regions add up to one full line.
//
// Shapes are { s: solid polygon, h: hole polygon | null } in the layer's
// local frame (origin at its centre, y down).

import {
  add, sub, mul, dot, len, xLines, edgesOf, inset, clipHalf, signedArea, rectPoly, rngAt, hash,
} from './geometry';

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

const outlineBand = (P, w) => ({ s: P, h: inset(P, w / 2) });
function longestEdge(P) {
  let best = 0, bl = -1;
  P.forEach((a, i) => { const l = len(sub(P[(i + 1) % P.length], a)); if (l > bl + 1e-6) { bl = l; best = i; } });
  return best;
}

const KIND_NAMES = {
  spiral: 'Key spiral', rings: 'Rings', triSpiral: 'Triangle spiral', triRings: 'Triangle rings',
  hatch: 'Hatch', chevron: 'Chevron',
};

// L: { w, h } layer size, C cell size, lineW, p pitch, snap.
// cfg: the layer's settings. dom: [x0, y0, x1, y1] — only tiles touching
// this box are built (the symmetry domain). insideMask(x, y): whether a tile
// centre is in the region mask, or null for no mask.
// Returns { regions: [{ key, kind, name, shapes }], outlines: shapes }.
export function angularLayer(L, cfg, seed, dom, insideMask) {
  const { C, lineW: w, p } = L;
  const regions = [];
  const outlines = [];
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

  const kindsFor = (x, y, w, h) => {
    if (insideMask?.(x + w / 2, y + h / 2)) {
      return cfg.maskFills?.length ? cfg.maskFills : null;
    }
    if (insideMask && cfg.maskOutside === 'empty') return null;
    return cfg.fills?.length ? cfg.fills : ['spiral'];
  };

  function region(key, P, mode, r, startHint, tri) {
    let shapes;
    if (mode === 'spiral') {
      const start = uni ? (startHint ?? 0) : Math.floor(r() * P.length);
      const b = spiralBand(P, w, p, start, uni ? false : r() < 0.5, minLen);
      shapes = b ? [b] : [];
    } else {
      shapes = ringBands(P, w, p, cfg.core);
    }
    const kind = tri ? (mode === 'spiral' ? 'triSpiral' : 'triRings') : mode;
    if (shapes.length) regions.push({ key, kind, shapes });
    if (cfg.outline) outlines.push(outlineBand(P, w));
  }
  const triMode = r => (cfg.triFill === 'mix' ? (r() < 0.5 ? 'spiral' : 'rings') : (cfg.triFill || 'spiral'));

  // A tile tw × th at (x, y); quadtree subdivision splits it into four.
  function tile(x, y, tw, th, depth) {
    if (dom && (x >= dom[2] || y >= dom[3] || x + tw <= dom[0] || y + th <= dom[1])) return;
    const r = rngAt(seed, x, y, tw, 7);
    if (depth < 3 && Math.min(tw, th) / 2 >= (cfg.minTile ?? 1) * C - 1e-6 && r() < (cfg.subdiv ?? 0)) {
      const hw = tw / 2, hh = th / 2;
      tile(x, y, hw, hh, depth + 1); tile(x + hw, y, hw, hh, depth + 1);
      tile(x, y + hh, hw, hh, depth + 1); tile(x + hw, y + hh, hw, hh, depth + 1);
      return;
    }
    const kinds = kindsFor(x, y, tw, th);
    if (!kinds) return;
    const kind = uni ? kinds[hash(seed, Math.round(tw)) % kinds.length] : kinds[Math.floor(r() * kinds.length)];
    const key = `${Math.round(x)},${Math.round(y)},${Math.round(tw)}`;
    const TL = [x, y], TR = [x + tw, y], BR = [x + tw, y + th], BL = [x, y + th];
    const sq = [TL, TR, BR, BL];
    switch (kind) {
      case 'spiral': region(key, sq, 'spiral', r, 0); break;
      case 'rings': region(key, sq, 'rings', r); break;
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
        if (cfg.outline) outlines.push(outlineBand(sq, w));
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
        if (cfg.outline) outlines.push(outlineBand(sq, w));
        break;
      }
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tile(x0 + i * Tw, y0 + j * Th, Tw, Th, 0);
  for (const reg of regions) reg.name = KIND_NAMES[reg.kind];
  return { regions, outlines };
}
