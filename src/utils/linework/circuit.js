// Linework style B — circuit / labyrinth routing.
//
// Coarse cells of size S each carry one bundle of k parallel strands. A
// bundle's piece in a cell is a straight, a quarter turn (concentric arcs
// about the shared cell corner) or a hairpin end (strand i joins strand
// k-1-i with a semicircle). A bundle may cross a perpendicular straight run
// of another (over / under): the lower bundle's strands are cut back so an
// even gap shows either side of the upper one.
//
// Crossings only happen where the lower bundle runs straight on both sides
// of the crossing cell, and never in neighbouring cells, so every cut is
// square and every gap matches the line gap.
//
// Strands are returned as filled outlines (see strandOutline), one item per
// bundle, in the layer's local frame (origin at its centre, y down).

import {
  add, sub, mul, cross, perp, len, unit, rngAt, shuffle, mapContour, SYM_OPS, applyLinear,
} from './geometry';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const opp = h => (h + 2) % 4;
const EPS = 1e-6;

// L: { w, h } layer size, C cell size, p pitch, ratio (line / pitch).
// sym: 'none' | 'mirror-x' | 'mirror-y' | 'mirror-both'.
// insideCell(i, j): region mask over the bundle grid, or null.
export function circuitLayer(L, cfg, seed, sym, insideCell) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k, w = p * L.ratio;
  // Whole bundles only; any remainder becomes an even margin.
  const cols = Math.max(1, Math.floor(L.w / S + 1e-6)), rows = Math.max(1, Math.floor(L.h / S + 1e-6));
  const ox = -cols * S / 2, oy = -rows * S / 2;
  const flush = Math.abs(cols * S - L.w) < 1e-6 && Math.abs(rows * S - L.h) < 1e-6;
  const mx = sym === 'mirror-x' || sym === 'mirror-both';
  const my = sym === 'mirror-y' || sym === 'mirror-both';
  const axI = mx && cols % 2 ? (cols - 1) / 2 : -1, axJ = my && rows % 2 ? (rows - 1) / 2 : -1;
  const limI = mx ? Math.floor(cols / 2) : cols, limJ = my ? Math.floor(rows / 2) : rows;
  const occ = new Map();
  const key = (i, j) => i + ',' + j;
  const r = rngAt(seed, 99);
  const bundles = [], crossings = [], crossSet = new Set();
  const edgeExit = cfg.edgeExit ?? 0;
  const weave = cfg.weave ?? 'off';
  let phase = insideCell ? 'inside' : 'all';

  const outside = (i, j) => i < 0 || j < 0 || i >= cols || j >= rows || (i >= limI && i !== axI) || (j >= limJ && j !== axJ);

  // What stepping from (i, j) in heading h leads to. straightIn: the walker
  // reached (i, j) heading h, so its own cell there is a straight.
  function classify(i, j, h, bIdx, straightIn) {
    const ni = i + DIRS[h][0], nj = j + DIRS[h][1];
    if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) return flush && r() < edgeExit ? { t: 'open' } : null;
    const horiz = h % 2 === 0;
    if (ni >= limI && ni !== axI) return horiz ? { t: 'open', axis: 'x' } : null;   // across a mirror axis
    if (nj >= limJ && nj !== axJ) return !horiz ? { t: 'open', axis: 'y' } : null;
    const o = occ.get(key(ni, nj));
    if (ni === axI || nj === axJ) {
      if (o || (ni === axI && nj === axJ)) return null;
      if (phase === 'inside' && !insideCell(ni, nj)) return null;
      if (ni === axI && horiz) return { t: 'half', i: ni, j: nj, axis: 'x' };
      if (nj === axJ && !horiz) return { t: 'half', i: ni, j: nj, axis: 'y' };
      return null;
    }
    if (!o) {
      if (phase === 'inside' && !insideCell(ni, nj)) return null;
      return { t: 'free', i: ni, j: nj };
    }
    // Crossings never touch: their cut-backs would overlap.
    const besideCrossing = DIRS.some(([a, b]) => crossSet.has(key(ni + a, nj + b)));
    if (weave !== 'off' && !besideCrossing && (o.dir === 'H' || o.dir === 'V') && o.dir !== (horiz ? 'H' : 'V')) {
      // The lower bundle is cut back a little past the crossing cell, so it
      // must run straight on both sides there.
      const along = o.dir === 'H' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      const canTop = along.every(([a, b]) => {
        const q = occ.get(key(ni + a, nj + b));
        return q ? q.b === o.b && q.dir === o.dir : outside(ni + a, nj + b);
      });
      const canUnder = !!straightIn;
      const nxt = (canTop || canUnder) && classify(ni, nj, h, bIdx);
      if (nxt && nxt.t !== 'cross') return { t: 'cross', i: ni, j: nj, under: o, then: nxt, canTop, canUnder };
    }
    return null;
  }

  // Walks from a cell; returns the cells (not the start), headings, end type
  // and any mirror axis the walk ran onto.
  function walk(i, j, h, bIdx, forbid, axes) {
    const cells = [], heads = [];
    let ci = i, cj = j, end = 'cap', first = true, first0 = true, forceStraight = false, crossN = 0;
    for (let n = 0; n < (cfg.maxLen ?? 40); n++) {
      const turns = shuffle([(h + 1) % 4, (h + 3) % 4], r);
      // After passing under, carry on straight (or stop) so the cut-back only meets straight strands.
      const order = forceStraight ? [h] : r() < (cfg.straight ?? 0.6) ? [h, ...turns] : [...turns, h];
      forceStraight = false;
      const opts = [];
      for (const cand of order) {
        if (first && cand === forbid) continue;
        const c = classify(ci, cj, cand, bIdx, !first && cand === h);
        if (c) opts.push([c, cand]);
      }
      // Prefer weaving over a neighbour when a crossing is on offer.
      const pick = opts.find(o => o[0].t === 'cross' && r() < 0.75) || opts[0];
      first = false;
      if (!pick) break;
      const [res, hh] = pick;
      if (res.t === 'open') { heads.push(hh); end = 'open'; if (res.axis) axes.add(res.axis); break; }
      const steps = res.t === 'cross' ? [res, res.then] : [res];
      let stop = false;
      for (const st of steps) {
        // Finalise the cell being left so later steps (even this bundle's) can weave over it.
        const cur = occ.get(key(ci, cj));
        if (!first0 && cur && cur.b === bIdx && cur.dir === '?') cur.dir = h === hh ? (hh % 2 === 0 ? 'H' : 'V') : 'T';
        first0 = false;
        if (st.t === 'open') { heads.push(hh); end = 'open'; if (st.axis) axes.add(st.axis); stop = true; break; }
        if (st.t === 'cross') {
          const wantTop = weave === 'random' ? r() < 0.5 : crossN++ % 2 === 0;
          const walkerTop = st.canTop && (wantTop || !st.canUnder);
          if (!walkerTop) forceStraight = true;
          const walkerAxis = hh % 2 === 0 ? 'H' : 'V';
          crossings.push({
            i: st.i, j: st.j,
            under: walkerTop ? st.under.b : bIdx,
            axis: walkerTop ? st.under.dir : walkerAxis,
          });
          crossSet.add(key(st.i, st.j));
          st.under.dir = 'X';
        } else {
          occ.set(key(st.i, st.j), { b: bIdx, dir: '?' });
        }
        cells.push([st.i, st.j]); heads.push(hh);
        ci = st.i; cj = st.j; h = hh;
        if (st.t === 'half') { end = 'half'; axes.add(st.axis); stop = true; break; }
      }
      if (stop) break;
    }
    return { cells, heads, end };
  }

  const starts = [];
  for (let j = 0; j < Math.min(rows, limJ); j++) for (let i = 0; i < Math.min(cols, limI); i++) starts.push([i, j]);
  shuffle(starts, r);

  const runPass = (canStart) => {
    for (const [i, j] of starts) {
      if (occ.has(key(i, j)) || !canStart(i, j)) continue;
      if (r() > (cfg.density ?? 1)) { occ.set(key(i, j), { b: -1, dir: 'E' }); continue; }
      const bIdx = bundles.length;
      occ.set(key(i, j), { b: bIdx, dir: '?' });
      const axes = new Set();
      const h0 = Math.floor(r() * 4);
      const fw = walk(i, j, h0, bIdx, -1, axes);
      const bw = walk(i, j, opp(h0), bIdx, fw.heads.length ? fw.heads[0] : -1, axes);
      // Assemble: the backward walk reversed, the start, then the forward walk.
      const cells = [...bw.cells.slice().reverse(), [i, j], ...fw.cells];
      const hs = [...bw.heads.slice(0, bw.cells.length).reverse().map(opp), ...fw.heads.slice(0, fw.cells.length)];
      const startType = bw.end, endType = fw.end;
      const pcs = cells.map(([ci, cj], m) => ({
        i: ci, j: cj, c: [ox + (ci + 0.5) * S, oy + (cj + 0.5) * S],
        in: m > 0 ? hs[m - 1] : (startType === 'open' ? opp(bw.heads[bw.heads.length - 1]) : null),
        out: m < cells.length - 1 ? hs[m] : (endType === 'open' ? fw.heads[fw.heads.length - 1] : null),
      }));
      if (pcs.length === 1 && pcs[0].in == null && pcs[0].out == null && !cfg.eyes) {
        occ.set(key(i, j), { b: -1, dir: 'E' });
        continue;
      }
      for (const pc of pcs) {
        const o = occ.get(key(pc.i, pc.j));
        if (o && o.b === bIdx && o.dir === '?') o.dir = pc.in != null && pc.in === pc.out ? (pc.in % 2 === 0 ? 'H' : 'V') : 'T';
      }
      bundles.push({ pcs, startType, endType, axes, index: bIdx });
    }
  };
  if (insideCell) {
    runPass((i, j) => insideCell(i, j));
    phase = 'all';
    if (cfg.maskOutside !== 'empty') runPass(() => true);
  } else {
    runPass(() => true);
  }

  // ── Centrelines ────────────────────────────────────────────────────────────
  const half = S / 2;
  const offsets = [];
  for (let s = 0; s < k; s++) offsets.push((s + 0.5) * p - half);
  const entry = (pc, o) => (pc.in == null
    ? add(pc.c, mul(perp(DIRS[pc.out ?? pc.pseudo]), o))
    : add(sub(pc.c, mul(DIRS[pc.in], half)), mul(perp(DIRS[pc.in]), o)));
  // Appends one strand's segments through `pcs` at offset o.
  function trav(pcs, o, segs) {
    for (const pc of pcs) {
      if (pc.in == null && pc.out == null) continue;
      const a = entry(pc, o);
      const b = pc.out == null
        ? add(pc.c, mul(perp(DIRS[pc.in]), o))
        : add(add(pc.c, mul(DIRS[pc.out], half)), mul(perp(DIRS[pc.out]), o));
      if (pc.in != null && pc.out != null && pc.in !== pc.out) {
        const K = add(pc.c, mul(add(mul(DIRS[pc.in], -1), DIRS[pc.out]), half));
        segs.push({ t: 'A', a, b, K, sweep: cross(sub(a, K), sub(b, K)) > 0 ? 1 : 0 });
      } else if (len(sub(b, a)) > EPS) {
        segs.push({ t: 'L', a, b });
      }
    }
  }
  // Hairpin end: strand at offset o turns into the strand at -o.
  function capArc(pc, o, segs) {
    if (Math.abs(o) < EPS) return;
    const h = DIRS[pc.in ?? pc.pseudo], a = add(pc.c, mul(perp(h), o));
    segs.push({ t: 'A', a, b: sub(pc.c, mul(perp(h), o)), K: pc.c, sweep: cross(mul(perp(h), o), h) > 0 ? 1 : 0 });
  }
  const reversed = pcs => pcs.slice().reverse().map(pc => ({
    ...pc, in: pc.out == null ? null : opp(pc.out), out: pc.in == null ? null : opp(pc.in),
    pseudo: pc.pseudo == null ? null : opp(pc.pseudo),
  }));

  // Cut-backs where a bundle passes under another: the margin leaves a gap
  // of one line gap between the cut ends and the upper bundle's strands.
  const margin = (p - w) / 2;
  const cutsFor = new Map();
  for (const X of crossings) {
    if (!cutsFor.has(X.under)) cutsFor.set(X.under, []);
    const x0 = ox + X.i * S, y0 = oy + X.j * S;
    cutsFor.get(X.under).push(X.axis === 'H'
      ? { axis: 0, lo: x0 - margin, hi: x0 + S + margin, a: y0, b: y0 + S }
      : { axis: 1, lo: y0 - margin, hi: y0 + S + margin, a: x0, b: x0 + S });
  }

  const out = [];
  for (const B of bundles) {
    let pcs = B.pcs, sT = B.startType, eT = B.endType;
    if (sT === 'cap' && eT !== 'cap') { pcs = reversed(pcs); [sT, eT] = [eT, sT]; }
    const single = pcs.length === 1 && pcs[0].in == null && pcs[0].out == null;
    if (single) pcs = [{ ...pcs[0], pseudo: 0 }];
    const rev = reversed(pcs);
    const strands = [];
    for (let s = 0; s < Math.floor(k / 2); s++) {
      const o = offsets[s];
      if (eT === 'cap') {
        const segs = [];
        trav(pcs, o, segs); capArc(pcs[pcs.length - 1], o, segs); trav(rev, o, segs);
        const closed = sT === 'cap';
        if (closed) capArc(rev[rev.length - 1], o, segs);
        strands.push({ segs, closed, caps: ['butt', 'butt'] });
      } else {
        for (const oo of [o, -o]) { const segs = []; trav(pcs, oo, segs); strands.push({ segs, closed: false, caps: ['butt', 'butt'] }); }
      }
    }
    if (k % 2) {
      const segs = [];
      trav(pcs, 0, segs);
      const round = (t) => (t === 'cap' ? 'round' : 'butt');
      strands.push(single ? { dot: pcs[0].c } : { segs, closed: false, caps: [round(sT), round(eT)] });
    }
    const cuts = cutsFor.get(B.index) ?? [];
    const contours = [];
    for (const st of strands) {
      if (st.dot) { contours.push(dotContour(st.dot, w / 2)); continue; }
      for (const piece of cutStrand(st, cuts)) contours.push(...strandOutline(piece, w));
    }
    if (contours.length) out.push({ index: B.index, single, axes: B.axes, contours, centre: bundleCentre(B.pcs) });
  }
  return { bundles: out, k, cols, rows, crossings: crossings.length };
}

const bundleCentre = (pcs) => {
  let x = 0, y = 0;
  for (const pc of pcs) { x += pc.c[0]; y += pc.c[1]; }
  return [x / pcs.length, y / pcs.length];
};

// Splits a strand where it passes under another bundle. Cut ends are butt.
function cutStrand(strand, cuts) {
  if (!cuts.length) return [strand];
  const parts = [];
  for (const seg of strand.segs) {
    if (seg.t !== 'L') { parts.push(seg); continue; }
    let ps = [seg];
    for (const cut of cuts) ps = ps.flatMap(pt => (pt.cut ? [pt] : splitLine(pt, cut)));
    parts.push(...ps);
  }
  if (!parts.some(pt => pt.cut)) return [strand];
  // Runs of kept segments between cuts.
  const runs = [];
  let cur = null;
  parts.forEach((pt, i) => {
    if (pt.cut) {
      if (cur) { cur.cutEnd = true; runs.push(cur); cur = null; }
      return;
    }
    if (!cur) cur = { segs: [], cutStart: i > 0, cutEnd: false };
    cur.segs.push(pt);
  });
  if (cur) runs.push(cur);
  // A closed loop: the run that reaches the seam carries on into the first one.
  if (strand.closed && runs.length > 1 && !parts[0].cut && !parts[parts.length - 1].cut) {
    const last = runs.pop();
    runs[0] = { segs: [...last.segs, ...runs[0].segs], cutStart: last.cutStart, cutEnd: runs[0].cutEnd };
  }
  return runs.map(rn => ({
    segs: rn.segs, closed: false,
    caps: [rn.cutStart ? 'butt' : strand.caps[0], rn.cutEnd ? 'butt' : strand.caps[1]],
  }));
}

// Splits an axis-aligned line segment by a cut box; the removed part is
// returned flagged { cut: true }.
function splitLine(seg, cut) {
  const { a, b } = seg;
  const ax = cut.axis, ox = 1 - ax;
  // Only segments running along the cut's axis, inside its band.
  if (Math.abs(a[ox] - b[ox]) > EPS) return [seg];
  if (a[ox] <= cut.a || a[ox] >= cut.b) return [seg];
  const t0 = (cut.lo - a[ax]) / (b[ax] - a[ax]), t1 = (cut.hi - a[ax]) / (b[ax] - a[ax]);
  const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
  if (hi <= lo) return [seg];
  const pt = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const out = [];
  if (lo > EPS) out.push({ t: 'L', a, b: pt(lo) });
  out.push({ t: 'L', a: pt(lo), b: pt(hi), cut: true });
  if (hi < 1 - EPS) out.push({ t: 'L', a: pt(hi), b });
  return out;
}

// ── Outlines ─────────────────────────────────────────────────────────────────

// Unit tangent at a segment's start (at = 'a') or end ('b').
function tangent(seg, at) {
  if (seg.t === 'L') return unit(sub(seg.b, seg.a));
  const rv = sub(seg[at], seg.K);
  const t = unit(perp(rv));
  return seg.sweep ? t : mul(t, -1);
}

// The segment moved sideways by d (positive: to the left of travel).
function offsetSeg(seg, d) {
  const na = perp(tangent(seg, 'a')), nb = perp(tangent(seg, 'b'));
  const a = add(seg.a, mul(na, d)), b = add(seg.b, mul(nb, d));
  if (seg.t === 'L') return { t: 'L', a, b };
  const r = len(sub(a, seg.K));
  return r < EPS ? { t: 'L', a, b } : { t: 'A', a, b, r, sweep: seg.sweep };
}

const segCmd = (seg) => (seg.t === 'A' ? ['A', seg.r, seg.sweep, seg.b] : ['L', seg.b]);
const revCmd = (seg) => (seg.t === 'A' ? ['A', seg.r, 1 - seg.sweep, seg.a] : ['L', seg.a]);

// A strand of width w as filled contours: one for an open strand (butt or
// round caps), two (outer and inner, opposite windings) for a closed loop.
function strandOutline(strand, w) {
  const { segs } = strand;
  if (!segs.length) return [];
  const d = w / 2;
  const left = segs.map(s => offsetSeg(s, d));
  const right = segs.map(s => offsetSeg(s, -d));
  if (strand.closed) {
    return [
      [['M', left[0].a], ...left.map(segCmd), ['Z']],
      [['M', right[right.length - 1].b], ...right.slice().reverse().map(revCmd), ['Z']],
    ];
  }
  const c = [['M', left[0].a], ...left.map(segCmd)];
  const endR = right[right.length - 1].b;
  c.push(strand.caps[1] === 'round' ? ['A', d, 0, endR] : ['L', endR]);
  c.push(...right.slice().reverse().map(revCmd));
  c.push(strand.caps[0] === 'round' ? ['A', d, 0, left[0].a] : ['L', left[0].a]);
  c.push(['Z']);
  return [c];
}

function dotContour(c, r) {
  return [['M', [c[0] + r, c[1]]], ['A', r, 1, [c[0] - r, c[1]]], ['A', r, 1, [c[0] + r, c[1]]], ['Z']];
}

// ── Symmetry ─────────────────────────────────────────────────────────────────

const sameOp = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const compose = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
const AXIS_MIRROR = { x: [-1, 0, 0, 1], y: [1, 0, 0, -1] };

// Copies each bundle by the symmetry's maps. A bundle that runs onto a
// mirror axis continues as its own mirror image there, so those copies are
// joined into one item.
export function replicateBundles(bundles, sym) {
  const ops = SYM_OPS[sym] ?? SYM_OPS.none;
  const out = [];
  for (const b of bundles) {
    const parent = ops.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const axis of b.axes) {
      const m = AXIS_MIRROR[axis];
      ops.forEach((op, i) => {
        const j = ops.findIndex(o => sameOp(o, compose(op, m)));
        if (j >= 0) parent[find(i)] = find(j);
      });
    }
    const groups = new Map();
    ops.forEach((op, i) => {
      const g = find(i);
      if (!groups.has(g)) groups.set(g, { contours: [], centres: [], copy: g });
      const grp = groups.get(g);
      for (const c of b.contours) grp.contours.push(mapContour(c, op));
      grp.centres.push(applyLinear(op, b.centre));
    });
    for (const grp of groups.values()) {
      const centre = grp.centres.reduce((s, c) => add(s, c), [0, 0]).map(v => v / grp.centres.length);
      out.push({ key: `${b.index}#${grp.copy}`, single: b.single, contours: grp.contours, centre });
    }
  }
  return out;
}
