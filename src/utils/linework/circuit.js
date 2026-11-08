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
  add, sub, mul, dot, cross, perp, len, unit, rngAt, shuffle, mapContour, SYM_OPS, applyLinear, rectPoly, polyContour,
} from './geometry';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const opp = h => (h + 2) % 4;
const EPS = 1e-6;

// L: { w, h } layer size, C cell size, p pitch, ratio (line / pitch).
// sym: 'none' | 'mirror-x' | 'mirror-y' | 'mirror-both'.
// insideCell(i, j): region mask over the bundle grid, or null.
// cfg.route 'single': one bundle instead of many — the same walk and rules
// (straightness, over / under, running off edges, max length), steered to
// reach as many cells as it can; with cfg.fill, a route through every
// cell instead (singleCircuit, no crossings).
// opts.band (a padding, or null): also give each bundle a backing `band` —
// its centreline as one stroke as wide as its lines plus the padding each
// side, round at hairpin ends (a plate's Outline / Sticker / In-fill).
// opts.holes: also return the empty cells the bundles wall in, as `holes`
// (rectangles reaching the bands), so an Outline backing fills them.
//
// Routing and drawing are separate steps. The route (plain data, see
// bundleData) is what a hand-built layer keeps: opts.hand draws that route
// instead of walking one from the seed, and opts.edit changes it first
// (see editSquare). The route drawn is returned as `route`, and the edit
// made as `edited` ({ route, op }, or null when it changed nothing).
//
// Locked cells (v1.15.2, opts.locks { cells: ['i,j'], bundles, crossings }):
// the bundles through them are pinned -- laid down first whenever the
// route is walked afresh, the rest routed round them -- and no edit takes
// them out or cuts them. A cell edit (opts.edit.cells, see squareCellEdit)
// may also come back with `locks` (the layer's new lock store, null for
// none), `probed` (what's in the cells) or `refused` ('locked').
export function circuitLayer(L, cfg, seed, sym, insideCell, opts = {}) {
  const G = squareGrid(L, cfg, sym);
  let route = opts.hand ?? routeSquare(G, cfg, seed, L, sym, insideCell, opts, opts.locks);
  let edited = null;
  if (opts.edit) {
    edited = editSquare(G, cfg, route, opts.edit, opts.locks);
    if (edited?.route) route = edited.route;
  }
  return { ...drawSquare(G, L, cfg, seed, sym, route, opts), route, edited };
}

// The bundle grid: cells S across, k strands of width w at pitch p, cols ×
// rows whole cells centred on the layer (origin ox, oy). With mirror
// symmetry only cells i < limI (j < limJ) are routed, plus the axis column
// axI (row axJ) of an odd count, which bundles may only end in.
function squareGrid(L, cfg, sym) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k, w = p * L.ratio;
  // Whole bundles only; any remainder becomes an even margin.
  const cols = Math.max(1, Math.floor(L.w / S + 1e-6)), rows = Math.max(1, Math.floor(L.h / S + 1e-6));
  const mx = sym === 'mirror-x' || sym === 'mirror-both';
  const my = sym === 'mirror-y' || sym === 'mirror-both';
  return {
    S, k, p, w, cols, rows, ox: -cols * S / 2, oy: -rows * S / 2, mx, my,
    flush: Math.abs(cols * S - L.w) < 1e-6 && Math.abs(rows * S - L.h) < 1e-6,
    axI: mx && cols % 2 ? (cols - 1) / 2 : -1, axJ: my && rows % 2 ? (rows - 1) / 2 : -1,
    limI: mx ? Math.floor(cols / 2) : cols, limJ: my ? Math.floor(rows / 2) : rows,
  };
}

// The walker over the bundle grid, with its occupancy: each cell's bundle
// and how it runs there (H, V, T a turn or end, X a crossing, E left empty).
// start(i, j, b) walks a new bundle b both ways from the free cell (i, j).
function squareRouter(G, cfg, r, insideCell, one) {
  const { cols, rows, S, ox, oy, flush, axI, axJ, limI, limJ } = G;
  const occ = new Map();
  const key = (i, j) => i + ',' + j;
  const crossings = [], crossSet = new Set();
  const edgeExit = cfg.edgeExit ?? 0;
  const weave = cfg.weave ?? 'off';
  const router = { occ, key, crossings, phase: insideCell ? 'inside' : 'all' };

  const outside = (i, j) => i < 0 || j < 0 || i >= cols || j >= rows || (i >= limI && i !== axI) || (j >= limJ && j !== axJ);
  // One circuit looks ahead: the free area still reachable after stepping
  // into (i, j) — the largest region beside it, plus the cell. It prefers
  // moves that keep the most, so it sweeps the grid rather than walling off
  // pockets, and crossing over / under is how it escapes a corner.
  const isFree = (i, j) => !outside(i, j) && !occ.has(key(i, j));
  const reach = (i0, j0, blocked, seen) => {
    seen.add(key(i0, j0));
    const stack = [[i0, j0]];
    let n = 1;
    while (stack.length) {
      const [i, j] = stack.pop();
      for (const [a, b] of DIRS) {
        const k2 = key(i + a, j + b);
        if (k2 === blocked || seen.has(k2) || !isFree(i + a, j + b)) continue;
        seen.add(k2); stack.push([i + a, j + b]); n++;
      }
    }
    return n;
  };
  const areaAfter = (i, j) => {
    const seen = new Set();
    let best = 0;
    for (const [a, b] of DIRS) {
      const x = i + a, y = j + b;
      if (isFree(x, y) && !seen.has(key(x, y))) best = Math.max(best, reach(x, y, key(i, j), seen));
    }
    return best + 1;
  };
  // After passing under, the walker must carry straight on past the cell
  // beyond the crossing: is that cell free?
  const roomUnder = (c, h) => c.then.t === 'free' && isFree(c.then.i + DIRS[h][0], c.then.j + DIRS[h][1]);
  // Max length at the top of its range means no limit.
  const maxLen = (cfg.maxLen ?? 40) >= 200 ? Infinity : (cfg.maxLen ?? 40);

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
      if (router.phase === 'inside' && !insideCell(ni, nj)) return null;
      if (ni === axI && horiz) return { t: 'half', i: ni, j: nj, axis: 'x' };
      if (nj === axJ && !horiz) return { t: 'half', i: ni, j: nj, axis: 'y' };
      return null;
    }
    if (!o) {
      if (router.phase === 'inside' && !insideCell(ni, nj)) return null;
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
    for (let n = 0; n < maxLen; n++) {
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
      if (one && opts.length > 1) {
        // Most reachable area first; ties keep the walk's own (straightness)
        // order. Ends (off an edge, onto a mirror axis) only when stuck.
        const area = ([c, hh]) => (c.t === 'free' ? areaAfter(c.i, c.j)
          : c.t === 'cross' && c.then.t === 'free' && (c.canTop || roomUnder(c, hh)) ? areaAfter(c.then.i, c.then.j) - 0.5 : -1);
        const scored = opts.map(o => [o, area(o)]);
        scored.sort((a, b) => b[1] - a[1]);
        // Dead ends and ends drop out while anything else is open, so the
        // random crossing pick below can't take one either.
        const live = scored.filter(([, a]) => a > 0);
        opts.splice(0, opts.length, ...(live.length ? live : scored).map(([o]) => o));
      }
      // Prefer weaving over a neighbour when a crossing is on offer.
      // (One circuit: crossings mostly to reach space it couldn't otherwise.)
      const pick = opts.find(o => o[0].t === 'cross' && r() < (one ? 0.25 : 0.75)) || opts[0];
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
          // (One circuit goes over rather than under into a dead end.)
          const walkerTop = st.canTop && (wantTop || !st.canUnder || (one && !roomUnder(st, hh)));
          if (!walkerTop) forceStraight = true;
          const walkerAxis = hh % 2 === 0 ? 'H' : 'V';
          crossings.push({
            i: st.i, j: st.j,
            under: walkerTop ? st.under.b : bIdx,
            over: walkerTop ? bIdx : st.under.b,
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

  // A new bundle bIdx: a walk each way from (i, j). Null for a lone cell
  // when eyes are off (the cell is left empty).
  router.start = (i, j, bIdx) => {
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
      return null;
    }
    for (const pc of pcs) {
      const o = occ.get(key(pc.i, pc.j));
      if (o && o.b === bIdx && o.dir === '?') o.dir = pc.in != null && pc.in === pc.out ? (pc.in % 2 === 0 ? 'H' : 'V') : 'T';
    }
    return { pcs, startType, endType, axes, index: bIdx };
  };
  // Marks a route's cells and crossings taken, to grow a bundle beside it.
  router.place = (route) => {
    for (const B of route.bundles) {
      for (const [i, j, a, b] of B.cells ?? []) {
        const o = occ.get(key(i, j));
        if (o) { o.dir = 'X'; continue; }
        occ.set(key(i, j), { b: B.index, dir: a >= 0 && a === b ? (a % 2 === 0 ? 'H' : 'V') : 'T' });
      }
    }
    for (const [i, j] of route.crossings) crossSet.add(key(i, j));
  };
  router.outside = outside;
  return router;
}

// A route as plain data (a hand-built layer keeps it in its settings):
//   { bundles: [{ index, cells: [[i, j, in, out], ...], s, e, axes }],
//     crossings: [[i, j, under, over, axis], ...] }
// in / out are headings into DIRS (-1: none), s / e the start and end types
// ('cap', 'open' or 'half'), under / over bundle indices. One circuit
// filling the layer (singleCircuit) is { bundles: [{ index: 0, whole: true }] }.
const bundleData = (B) => ({
  index: B.index, cells: B.pcs.map(pc => [pc.i, pc.j, pc.in ?? -1, pc.out ?? -1]),
  s: B.startType, e: B.endType, axes: [...B.axes],
});
const crossingData = (X) => [X.i, X.j, X.under, X.over, X.axis];

// Walks the layer's route from the seed.
function routeSquare(G, cfg, seed, L, sym, insideCell, opts, locks = null) {
  const pins = locks && (locks.cells?.length || locks.bundles?.length) ? locks : null;
  if (!pins && cfg.route === 'single' && cfg.fill && singleCircuit(L, cfg, seed, sym, opts)) {
    return { bundles: [{ index: 0, whole: true }], crossings: [] };
  }
  const one = cfg.route === 'single';
  const { cols, rows, limI, limJ } = G;
  const r = rngAt(seed, 99);
  const router = squareRouter(G, cfg, r, insideCell, one);
  const { occ, key } = router;
  const bundles = [];
  // Pinned bundles go down first; new ones are numbered after them.
  let next = 0;
  if (pins) {
    router.place({ bundles: pins.bundles ?? [], crossings: pins.crossings ?? [] });
    blockLocked(router, pins.cells);
    next = (pins.bundles ?? []).reduce((m, b) => Math.max(m, b.index + 1), 0);
  }

  const starts = [];
  for (let j = 0; j < Math.min(rows, limJ); j++) for (let i = 0; i < Math.min(cols, limI); i++) starts.push([i, j]);
  shuffle(starts, r);
  // One circuit starts in a corner and sweeps from there.
  if (one) {
    const ways = ([i, j]) => DIRS.filter(([a, b]) => !router.outside(i + a, j + b)).length;
    starts.sort((a, b) => ways(a) - ways(b));
  }

  const runPass = (canStart) => {
    for (const [i, j] of starts) {
      if (one && bundles.length) return;
      if (occ.has(key(i, j)) || !canStart(i, j)) continue;
      if (!one && r() > (cfg.density ?? 1)) { occ.set(key(i, j), { b: -1, dir: 'E' }); continue; }
      const B = router.start(i, j, next + bundles.length);
      if (B) bundles.push(B);
    }
  };
  // A mask's cells are the only ones routed.
  runPass(insideCell ?? (() => true));
  const made = { bundles: bundles.map(bundleData), crossings: router.crossings.map(crossingData) };
  if (!pins) return made;
  return { bundles: [...(pins.bundles ?? []), ...made.bundles], crossings: [...(pins.crossings ?? []), ...made.crossings] };
}

// Locked cells, for a router: nothing grows into an empty one, and nothing
// crosses one that's taken.
function blockLocked(router, cells = []) {
  for (const k of cells) {
    const o = router.occ.get(k);
    if (o) o.dir = 'L';
    else router.occ.set(k, { b: -1, dir: 'E' });
  }
}

// The bundles a lock store pins: those through any of the locked cells,
// with the crossings between them. Null when no cell is locked.
function pinsFor(route, cells) {
  if (!cells.length) return null;
  const set = new Set(cells);
  const bundles = route.bundles.filter(b => !b.whole && b.cells.some(([i, j]) => set.has(`${i},${j}`)));
  const ids = new Set(bundles.map(b => b.index));
  return { cells: [...set], bundles, crossings: route.crossings.filter(([, , u, o]) => ids.has(u) && ids.has(o)) };
}

// A cell (i, j) of the routed part of the grid for a point in the layer's
// frame (folded into the routed half with mirror symmetry), with the cell
// and its mirror images as rectangles. Null off the grid.
function foldSquare(G, [x, y]) {
  const i0 = Math.floor((x - G.ox) / G.S), j0 = Math.floor((y - G.oy) / G.S);
  if (i0 < 0 || j0 < 0 || i0 >= G.cols || j0 >= G.rows) return null;
  const i = G.mx && i0 >= G.limI && i0 !== G.axI ? G.cols - 1 - i0 : i0;
  const j = G.my && j0 >= G.limJ && j0 !== G.axJ ? G.rows - 1 - j0 : j0;
  const is = G.mx ? [...new Set([i, G.cols - 1 - i])] : [i];
  const js = G.my ? [...new Set([j, G.rows - 1 - j])] : [j];
  const polys = is.flatMap(a => js.map(b => rectPoly(G.ox + a * G.S, G.oy + b * G.S, G.S, G.S)));
  return { i, j, key: `${i},${j}`, polys };
}

const headingDir = (h) => (h % 2 === 0 ? 'H' : 'V');
// How a bundle's piece runs through its cell: 'H', 'V', or null (a turn or end).
const pieceDir = ([, , a, b]) => (a >= 0 && a === b ? headingDir(a) : null);

// Cuts every bundle through cell (i, j) there: each side ends in a hairpin
// in the cell beside it (an end that would sit in a crossing's cell is cut
// back past it, and that crossing goes). A lone cell left over is an eye,
// or goes when eyes are off. Crossings keep to the piece they're on.
function cutSquare(cfg, route, i, j) {
  const at = ([a, b]) => a === i && b === j;
  if (!route.bundles.some(B => B.cells?.some(at))) return null;
  const xCells = new Set(route.crossings.filter(([a, b]) => !(a === i && b === j)).map(([a, b]) => `${a},${b}`));
  const dropX = new Set([`${i},${j}`]);
  let nextIdx = route.bundles.reduce((m, b) => Math.max(m, b.index + 1), 0);
  const split = new Map(); // old index -> its parts
  const bundles = [];
  for (const B of route.bundles) {
    if (!B.cells?.some(at)) { bundles.push(B); continue; }
    const runs = [];
    let cur = null;
    B.cells.forEach((c, m) => {
      if (at(c)) { if (cur) { cur.endCut = true; runs.push(cur); } cur = null; return; }
      if (!cur) cur = { cells: [], startCut: m > 0, endCut: false };
      cur.cells.push([...c]);
    });
    if (cur) runs.push(cur);
    const parts = [];
    for (const run of runs) {
      const k = (c) => `${c[0]},${c[1]}`;
      while (run.startCut && run.cells.length && xCells.has(k(run.cells[0]))) dropX.add(k(run.cells.shift()));
      while (run.endCut && run.cells.length && xCells.has(k(run.cells[run.cells.length - 1]))) dropX.add(k(run.cells.pop()));
      if (!run.cells.length) continue;
      if (run.startCut) run.cells[0][2] = -1;
      if (run.endCut) run.cells[run.cells.length - 1][3] = -1;
      const [, , a, b] = run.cells[0];
      if (run.cells.length === 1 && a < 0 && b < 0 && !cfg.eyes) continue;
      const keepsEnd = (!run.startCut && B.s !== 'cap') || (!run.endCut && B.e !== 'cap');
      parts.push({
        index: parts.length ? nextIdx++ : B.index, cells: run.cells,
        s: run.startCut ? 'cap' : B.s, e: run.endCut ? 'cap' : B.e, axes: keepsEnd ? [...B.axes] : [],
      });
    }
    split.set(B.index, parts);
    bundles.push(...parts);
  }
  // The part of a split bundle a crossing at (a, b) is on: the one with a
  // piece there running `dir` ('H' / 'V'), or not.
  const partAt = (index, a, b, dir, same) => {
    const parts = split.get(index);
    if (!parts) return index;
    const p = parts.find(P => P.cells.some(c => c[0] === a && c[1] === b && (pieceDir(c) === dir) === same));
    return p ? p.index : null;
  };
  const crossings = [];
  for (const [a, b, under, over, axis] of route.crossings) {
    if (dropX.has(`${a},${b}`)) continue;
    const u = partAt(under, a, b, axis, true), o = partAt(over, a, b, axis, false);
    if (u == null || o == null) continue;
    crossings.push([a, b, u, o, axis]);
  }
  return { bundles, crossings };
}

// Grows a new bundle from empty cell (i, j), as the Build tool does. Null
// when there's no room.
function growSquare(G, cfg, route, i, j, rng, lockedCells = []) {
  // Bundles only end in a mirror axis's cells: start beside it instead.
  if (i === G.axI) i -= 1;
  if (j === G.axJ) j -= 1;
  const router = squareRouter(G, cfg, rng, null, cfg.route === 'single');
  router.place(route);
  blockLocked(router, lockedCells);
  if (router.outside(i, j) || router.occ.has(router.key(i, j))) return null;
  const index = route.bundles.reduce((m, b) => Math.max(m, b.index + 1), 0);
  const B = router.start(i, j, index);
  if (!B) return null;
  return { bundles: [...route.bundles, bundleData(B)], crossings: [...route.crossings, ...router.crossings.map(crossingData)] };
}

// Whether the crossing X can be turned over: the bundle on top would go
// under, so it must run straight on both sides of the cell (as the router
// asks of a lower bundle), or off the grid / over a mirror axis.
function canFlipSquare(G, route, X) {
  const [i, j, , over, axis] = X;
  const dir = axis === 'H' ? 'V' : 'H';
  const B = route.bundles.find(b => b.index === over);
  if (!B?.cells) return false;
  const along = dir === 'H' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  return B.cells.some((c, m) => {
    if (c[0] !== i || c[1] !== j || pieceDir(c) !== dir) return false;
    return along.every(([a, b]) => {
      const ni = i + a, nj = j + b;
      const off = ni < 0 || nj < 0 || ni >= G.cols || nj >= G.rows || (G.mx && ni >= G.limI && ni !== G.axI) || (G.my && nj >= G.limJ && nj !== G.axJ);
      if (off) return true;
      return [B.cells[m - 1], B.cells[m + 1]].some((q, side) => {
        if (!q || q[0] !== ni || q[1] !== nj) return false;
        if (pieceDir(q) === dir) return true;
        // A bundle ending on a mirror axis runs straight on into its image.
        const end = side === 0 ? m - 1 === 0 && B.s === 'half' : m + 1 === B.cells.length - 1 && B.e === 'half';
        return end && (ni === G.axI || nj === G.axJ);
      });
    });
  });
}
const flipped = ([i, j, under, over, axis]) => [i, j, over, under, axis === 'H' ? 'V' : 'H'];

// Turns crossings over: one cell flips; a drag across several (in order)
// alternates the bundle that runs through them -- over at one, under the
// next -- flipping whichever crossings need it. Crossings that can't turn
// (see canFlipSquare) stay as they are.
function weaveSquare(G, route, keys) {
  const crossings = route.crossings.map(X => [...X]);
  const seq = [];
  for (const k of keys) {
    const n = crossings.findIndex(([a, b]) => `${a},${b}` === k);
    if (n >= 0 && !seq.includes(n)) seq.push(n);
  }
  if (!seq.length) return null;
  let changed = false;
  const flip = (n) => {
    if (!canFlipSquare(G, { ...route, crossings }, crossings[n])) return false;
    crossings[n] = flipped(crossings[n]);
    changed = true;
    return true;
  };
  const shares = (a, b) => [a[2], a[3]].find(x => x === b[2] || x === b[3]);
  let run = null, prevTop = null;
  seq.forEach((n, s) => {
    const X = crossings[n];
    if (s === 0 || run == null || (X[2] !== run && X[3] !== run)) {
      flip(n);
      run = seq[s + 1] != null ? shares(crossings[n], crossings[seq[s + 1]]) ?? null : null;
      prevTop = run == null ? null : crossings[n][3] === run;
      return;
    }
    const top = X[3] === run;
    if (top === prevTop) flip(n);
    prevTop = crossings[n][3] === run;
  });
  return changed ? { bundles: route.bundles, crossings } : null;
}

// Cell edits (Select's Cell mode, the Weave tool). edit: { cells: points
// in the layer's frame, op: 'probe' | 'rerun' | 'delete' | 'flip' |
// 'weave' | 'lock' | 'unlock', rng }. Returns as editSquare.
function squareCellEdit(G, cfg, route, edit, locks) {
  const whole = route.bundles.some(b => b.whole);
  const locked = new Set(locks?.cells ?? []);
  const pinned = new Set((locks?.bundles ?? []).map(b => b.index));
  const seen = new Set();
  const cells = [];
  for (const p of edit.cells) {
    const c = foldSquare(G, p);
    if (c && !seen.has(c.key)) { seen.add(c.key); cells.push(c); }
  }
  if (!cells.length) return null;
  const owners = (rt, c) => rt.bundles.filter(b => b.cells?.some(([a, b2]) => a === c.i && b2 === c.j));
  const crossingAt = (rt, c) => rt.crossings.find(([a, b]) => a === c.i && b === c.j);
  if (edit.op === 'probe') {
    return {
      probed: cells.map(c => {
        const X = crossingAt(route, c), own = owners(route, c);
        const isLocked = locked.has(c.key);
        const touchesPin = own.some(b => pinned.has(b.index));
        return {
          id: c.key, polys: c.polys, locked: isLocked, filled: whole || own.length > 0, crossing: !!X,
          can: {
            rerun: !whole && !isLocked && !touchesPin, delete: !whole && !isLocked && !touchesPin && own.length > 0,
            flip: !!X && canFlipSquare(G, route, X), lock: !whole, rotate: false, reflect: false, fill: false,
          },
        };
      }),
    };
  }
  if (edit.op === 'lock' || edit.op === 'unlock') {
    if (whole) return { refused: 'whole' };
    const next = new Set(locked);
    for (const c of cells) edit.op === 'lock' ? next.add(c.key) : next.delete(c.key);
    if (next.size === locked.size && [...next].every(k => locked.has(k))) return null;
    // The route stays as it is (kept by hand), so nothing moves.
    return { op: edit.op, route, locks: pinsFor(route, [...next]) };
  }
  if (edit.op === 'flip' || edit.op === 'weave') {
    const r2 = weaveSquare(G, route, cells.map(c => c.key));
    return r2 ? { op: 'flip', route: r2 } : null;
  }
  if (whole) return { refused: 'whole' };
  let rt = route, refused = null, changed = false;
  for (const c of cells) {
    if (locked.has(c.key) || owners(rt, c).some(b => pinned.has(b.index))) { refused = 'locked'; continue; }
    const cut = cutSquare(cfg, rt, c.i, c.j);
    if (cut) { rt = cut; changed = true; }
    if (edit.op === 'rerun') {
      const grown = growSquare(G, cfg, rt, c.i, c.j, edit.rng, [...locked]);
      if (grown) { rt = grown; changed = true; }
    }
  }
  if (!changed) return refused ? { refused } : null;
  return { op: edit.op, route: rt, locks: locks ? pinsFor(rt, [...locked]) : undefined };
}

const withoutBundles = (route, gone) => ({
  bundles: route.bundles.filter(b => !gone.has(b.index)),
  crossings: route.crossings.filter(([, , under, over]) => !gone.has(under) && !gone.has(over)),
});

// A hand edit to a route. edit.remove (a Set of bundle indices) takes those
// bundles out; edit.at (a point in the layer's frame) takes out the bundle
// there, or grows a new one from that empty cell with the same walk and
// rules, drawing from edit.rng. With mirror symmetry the point is folded
// into the routed half first. Returns { route, op: 'remove' | 'grow' }, or
// null when nothing changed.
function editSquare(G, cfg, route, edit, locks = null) {
  if (edit.cells) return squareCellEdit(G, cfg, route, edit, locks);
  const pinned = new Set((locks?.bundles ?? []).map(b => b.index));
  if (edit.remove) {
    if (!route.bundles.some(b => edit.remove.has(b.index))) return null;
    const gone = new Set([...edit.remove].filter(i => !pinned.has(i)));
    if (!gone.size || !route.bundles.some(b => gone.has(b.index))) return { refused: 'locked' };
    return { op: 'remove', route: withoutBundles(route, gone) };
  }
  let [x, y] = edit.at;
  // (A point on an axis goes just inside the routed half.)
  if (G.mx) x = -Math.abs(x) - 1e-6;
  if (G.my) y = -Math.abs(y) - 1e-6;
  let i = Math.floor((x - G.ox) / G.S), j = Math.floor((y - G.oy) / G.S);
  if (i < 0 || j < 0 || i >= G.cols || j >= G.rows) return null;
  // One circuit fills every cell: any click takes it out.
  const whole = route.bundles.find(b => b.whole);
  if (whole) return { op: 'remove', route: withoutBundles(route, new Set([whole.index])) };
  const owners = route.bundles.filter(b => b.cells.some(([ci, cj]) => ci === i && cj === j));
  if (owners.length) {
    // At a crossing, the bundle on top.
    const X = route.crossings.find(([ci, cj]) => ci === i && cj === j);
    const target = (X && owners.find(b => b.index === X[3])) || owners[0];
    if (pinned.has(target.index)) return { refused: 'locked' };
    return { op: 'remove', route: withoutBundles(route, new Set([target.index])) };
  }
  if ((locks?.cells ?? []).includes(`${i},${j}`)) return { refused: 'locked' };
  const grown = growSquare(G, cfg, route, i, j, edit.rng, locks?.cells);
  return grown ? { op: 'grow', route: grown } : null;
}

// Draws a route: each bundle's strands as filled outlines, cut back where
// it passes under another, with its band and the walled-in holes when asked.
function drawSquare(G, L, cfg, seed, sym, route, opts) {
  const { S, k, p, w, cols, rows, ox, oy, mx, my } = G;
  if (route.bundles.some(b => b.whole)) {
    const whole = singleCircuit(L, cfg, seed, sym, opts);
    if (whole) return whole;
  }
  const key = (i, j) => i + ',' + j;
  const bundles = route.bundles.filter(b => !b.whole).map(b => ({
    index: b.index, startType: b.s, endType: b.e, axes: new Set(b.axes),
    pcs: b.cells.map(([i, j, a, c]) => ({ i, j, c: [ox + (i + 0.5) * S, oy + (j + 0.5) * S], in: a < 0 ? null : a, out: c < 0 ? null : c })),
  }));
  const present = new Set(bundles.map(b => b.index));
  const crossings = route.crossings
    .filter(([, , under, over]) => present.has(under) && present.has(over))
    .map(([i, j, under, , axis]) => ({ i, j, under, axis }));
  const taken = new Set(bundles.flatMap(b => b.pcs.map(pc => key(pc.i, pc.j))));

  // ── Centrelines ────────────────────────────────────────────────────────────
  const half = S / 2;
  const offsets = strandOffsets(k, p, S);
  const trav = (pcs, o, segs) => traverse(pcs, o, half, segs);

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
    let band = null;
    if (opts.band != null) {
      const W = (k - 1) * p + w + 2 * opts.band;
      if (single) band = [polyContour(discPoly(pcs[0].c, W / 2))];
      else {
        const segs = [];
        trav(pcs, 0, segs);
        band = bandContours(segs, W / 2, [sT === 'cap', eT === 'cap'], false);
      }
    }
    if (contours.length) out.push({ index: B.index, single, axes: B.axes, contours, centre: bundleCentre(B.pcs), band });
  }

  // Empty cells with no way out to the layer's edge but through bundles.
  let holes = null;
  if (opts.holes) {
    const used = (i, j) => taken.has(key(mx ? Math.min(i, cols - 1 - i) : i, my ? Math.min(j, rows - 1 - j) : j));
    const open = new Set(), stack = [];
    for (let i = 0; i < cols; i++) for (const j of [0, rows - 1]) if (!used(i, j)) stack.push([i, j]);
    for (let j = 0; j < rows; j++) for (const i of [0, cols - 1]) if (!used(i, j)) stack.push([i, j]);
    while (stack.length) {
      const [i, j] = stack.pop();
      if (open.has(key(i, j))) continue;
      open.add(key(i, j));
      for (const [a, b] of DIRS) {
        const x = i + a, y = j + b;
        if (x >= 0 && y >= 0 && x < cols && y < rows && !used(x, y) && !open.has(key(x, y))) stack.push([x, y]);
      }
    }
    // Grown to meet the bands, which stop a line gap (less padding) short of a cell's edge.
    const grow = Math.max(0, (p - w) / 2 - (opts.band ?? 0)) + 0.5;
    holes = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (!used(i, j) && !open.has(key(i, j))) holes.push(rectPoly(ox + i * S - grow, oy + j * S - grow, S + 2 * grow, S + 2 * grow));
    }
    // Inside the outline everything is filled: a cell-sized square on every
    // grid point whose four cells are all inside (bundles or walled in)
    // closes the gaps between bands where turns meet. Points touching the
    // outside are left, so the edge still follows the outermost paths.
    const inside = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && !open.has(key(i, j));
    for (let vy = 1; vy < rows; vy++) for (let vx = 1; vx < cols; vx++) {
      if (inside(vx - 1, vy - 1) && inside(vx, vy - 1) && inside(vx - 1, vy) && inside(vx, vy)) {
        holes.push(rectPoly(ox + (vx - 0.5) * S, oy + (vy - 0.5) * S, S, S));
      }
    }
  }
  return { bundles: out, k, cols, rows, crossings: crossings.length, holes };
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

// Offsets of a bundle's k strands from its centreline, S wide at pitch p.
const strandOffsets = (k, p, S) => Array.from({ length: k }, (_, s) => (s + 0.5) * p - S / 2);

// Appends one strand's segments through the cells `pcs` (each { c, in, out }
// with headings into DIRS), at offset o from the centreline; cells are
// 2 × half wide. Turns are quarter arcs about the shared cell corner.
function traverse(pcs, o, half, segs) {
  const entry = (pc) => (pc.in == null
    ? add(pc.c, mul(perp(DIRS[pc.out ?? pc.pseudo]), o))
    : add(sub(pc.c, mul(DIRS[pc.in], half)), mul(perp(DIRS[pc.in]), o)));
  for (const pc of pcs) {
    if (pc.in == null && pc.out == null) continue;
    const a = entry(pc);
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

const bundleCentre = (pcs) => {
  let x = 0, y = 0;
  for (const pc of pcs) { x += pc.c[0]; y += pc.c[1]; }
  return [x / pcs.length, y / pcs.length];
};

// ── One circuit ──────────────────────────────────────────────────────────────
// The whole layer as a single bundle: the same cells, strands, turns and
// hairpin ends as Bundles, but one route that runs through every cell once
// without crossing itself. The route traces round a random maze (spanning
// tree) on a half-resolution grid, so it covers an even number of columns
// and rows: an odd leftover column or row becomes a margin, half a cell each
// side. (Taking it in instead needs a zigzag somewhere, which read as a
// wiggle along the edge.) Mirror symmetry builds half the maze and mirrors
// it, bridged by one edge across the axis, when the halves divide evenly. The route is cut into a path with
// two hairpin ends, or kept as a closed loop. Returns null when the layer
// is too small, to fall back to bundles.

const edgeKey = (x0, y0, x1, y1) => (x0 < x1 || y0 < y1 ? `${x0},${y0},${x1},${y1}` : `${x1},${y1},${x0},${y0}`);

// Depth-first maze on a w × h grid; `straight` is the chance of carrying on
// in the same direction when that's possible. Returns its edges.
function mazeTree(w, h, r, straight) {
  const edges = new Set();
  const seen = new Uint8Array(w * h);
  const sx = Math.floor(r() * w), sy = Math.floor(r() * h);
  const stack = [[sx, sy, -1]];
  seen[sy * w + sx] = 1;
  while (stack.length) {
    const [x, y, d] = stack[stack.length - 1];
    const free = [];
    for (let h0 = 0; h0 < 4; h0++) {
      const nx = x + DIRS[h0][0], ny = y + DIRS[h0][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]) free.push(h0);
    }
    if (!free.length) { stack.pop(); continue; }
    const h1 = d >= 0 && free.includes(d) && r() < straight ? d : free[Math.floor(r() * free.length)];
    const nx = x + DIRS[h1][0], ny = y + DIRS[h1][1];
    edges.add(edgeKey(x, y, nx, ny));
    seen[ny * w + nx] = 1;
    stack.push([nx, ny, h1]);
  }
  return edges;
}

// A closed route through every cell of an even cE × rE block, as the
// successor of each cell (id = y * W + x).
function mazeLoop(cE, rE, W, r, straight, mx, my) {
  const tw = cE / 2, th = rE / 2;
  const gw = mx ? tw / 2 : tw, gh = my ? th / 2 : th;
  const edges = mazeTree(gw, gh, r, straight);
  if (mx || my) {
    for (const e of [...edges]) {
      const [x0, y0, x1, y1] = e.split(',').map(Number);
      edges.add(mx ? edgeKey(tw - 1 - x0, y0, tw - 1 - x1, y1) : edgeKey(x0, th - 1 - y0, x1, th - 1 - y1));
    }
    if (mx) { const y = Math.floor(r() * th); edges.add(edgeKey(gw - 1, y, gw, y)); }
    else { const x = Math.floor(r() * tw); edges.add(edgeKey(x, gh - 1, x, gh)); }
  }
  const linked = (bx, by, h) => edges.has(edgeKey(bx, by, bx + DIRS[h][0], by + DIRS[h][1]));
  // Each maze node is 2 × 2 route cells, joined across a maze edge and split
  // along it, so every cell has exactly two neighbours.
  const open = (x, y, h) => {
    const nx = x + DIRS[h][0], ny = y + DIRS[h][1];
    if (nx < 0 || ny < 0 || nx >= cE || ny >= rE) return false;
    const bx = x >> 1, by = y >> 1;
    if ((nx >> 1) !== bx || (ny >> 1) !== by) return linked(bx, by, h);
    // Within a node: the top pair is split by an edge up, the bottom pair by
    // one down, the left pair by one left, the right pair by one right.
    if (h % 2 === 0) return !linked(bx, by, (y & 1) ? 1 : 3);
    return !linked(bx, by, (x & 1) ? 0 : 2);
  };
  const succ = new Map();
  let x = 0, y = 0, from = -1;
  for (let n = 0; n < cE * rE; n++) {
    const h = [0, 1, 2, 3].find(d => d !== from && open(x, y, d));
    if (h == null) return null;
    const nx = x + DIRS[h][0], ny = y + DIRS[h][1];
    succ.set(y * W + x, ny * W + nx);
    x = nx; y = ny; from = opp(h);
  }
  return x === 0 && y === 0 ? succ : null;
}

function singleCircuit(L, cfg, seed, sym, opts = {}) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k, w = p * L.ratio;
  let cols = Math.floor(L.w / S + 1e-6), rows = Math.floor(L.h / S + 1e-6);
  const even = n => n - (n % 2);
  if (even(cols) < 2 || even(rows) < 2) return null;
  const r = rngAt(seed, 123);
  const straight = cfg.straight ?? 0.6;

  // Mirror symmetry when the halves divide evenly; then the grid is kept even.
  const wantX = sym === 'mirror-x' || sym === 'mirror-both', wantY = sym === 'mirror-y' || sym === 'mirror-both';
  const mx = wantX && (even(cols) / 2) % 2 === 0;
  const my = !mx && wantY && (even(rows) / 2) % 2 === 0;
  cols = even(cols); rows = even(rows);
  const W = cols;
  const succ = mazeLoop(cols, rows, W, r, straight, mx, my);
  if (!succ) return null;

  // Order the cells, then cut the loop into a path (or keep it closed).
  const loop = !!cfg.loop;
  let first = 0;
  if (!loop) {
    let skip = Math.floor(r() * succ.size);
    for (first = 0; skip-- > 0;) first = succ.get(first);
  }
  const order = [first];
  for (let c = succ.get(first); c !== first; c = succ.get(c)) order.push(c);

  const ox = -cols * S / 2, oy = -rows * S / 2;
  const cells = order.map(c => [c % W, Math.floor(c / W)]);
  const headTo = (a, b) => DIRS.findIndex(([dx, dy]) => dx === b[0] - a[0] && dy === b[1] - a[1]);
  const m = cells.length;
  const pcs = cells.map((c, n) => ({
    c: [ox + (c[0] + 0.5) * S, oy + (c[1] + 0.5) * S],
    in: n > 0 ? headTo(cells[n - 1], c) : loop ? headTo(cells[m - 1], c) : null,
    out: n < m - 1 ? headTo(c, cells[n + 1]) : loop ? headTo(c, cells[0]) : null,
  }));

  // Strands as in a bundle: a hairpinned pair per offset, plus the centre
  // strand (round ends) when the count is odd; a loop is concentric rings.
  const half = S / 2, offsets = strandOffsets(k, p, S);
  const strands = [];
  if (loop) {
    for (const o of offsets) { const segs = []; traverse(pcs, o, half, segs); strands.push({ segs, closed: true }); }
  } else {
    const rev = reversed(pcs);
    for (let s2 = 0; s2 < Math.floor(k / 2); s2++) {
      const o = offsets[s2], segs = [];
      traverse(pcs, o, half, segs); capArc(pcs[m - 1], o, segs); traverse(rev, o, half, segs); capArc(rev[m - 1], o, segs);
      strands.push({ segs, closed: true });
    }
    if (k % 2) { const segs = []; traverse(pcs, 0, half, segs); strands.push({ segs, closed: false, caps: ['round', 'round'] }); }
  }
  const contours = strands.flatMap(st => strandOutline(st, w));
  let band = null;
  if (opts.band != null) {
    const segs = [];
    traverse(pcs, 0, half, segs);
    band = bandContours(segs, ((k - 1) * p + w) / 2 + opts.band, [true, true], loop);
  }
  return { bundles: [{ index: 0, single: false, axes: new Set(), contours, centre: [0, 0], band }], k, cols, rows, crossings: 0, whole: true };
}

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
export { strandOutline as strandOutlineOf };

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

// ── Backing bands ────────────────────────────────────────────────────────────
// A bundle's backing (a plate's Outline / Sticker / In-fill): its centreline
// widened by hw each side. Built as separate solid pieces — a rectangle per
// straight, a pie slice or ring segment per turn, a disc per round end and
// per corner — all wound the same way, so pieces and neighbouring bands
// merge under the nonzero rule. (Offsetting the centreline as one outline
// folds inside-out wherever a turn is tighter than hw, and those folds
// would cut holes where bands overlap.)

const STEPS = 12; // points per quarter turn

export function discPoly(c, r) {
  return Array.from({ length: STEPS * 4 }, (_, i) => {
    const a = (i / (STEPS * 4)) * Math.PI * 2;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
}

// segs: { t: 'L', a, b } and { t: 'A', a, b, K, sweep } (SVG sweep, y down).
// ends: [round start, round end]. Returns contours.
export function bandContours(segs, hw, ends, closed) {
  const polys = [];
  const angle = (p, K) => Math.atan2(p[1] - K[1], p[0] - K[0]);
  for (const s of segs) {
    if (s.t === 'L') {
      const n = mul(perp(unit(sub(s.b, s.a))), hw);
      polys.push([add(s.a, n), add(s.b, n), sub(s.b, n), sub(s.a, n)]);
      continue;
    }
    const r0 = len(sub(s.a, s.K));
    const a0 = angle(s.a, s.K);
    let da = angle(s.b, s.K) - a0;
    if (s.sweep) { while (da <= 0) da += Math.PI * 2; } else { while (da >= 0) da -= Math.PI * 2; }
    const n = Math.max(2, Math.ceil((Math.abs(da) / (Math.PI / 2)) * STEPS));
    const at = (r, i) => { const t = a0 + (da * i) / n; return [s.K[0] + r * Math.cos(t), s.K[1] + r * Math.sin(t)]; };
    const outer = Array.from({ length: n + 1 }, (_, i) => at(r0 + hw, i));
    const ri = r0 - hw;
    const inner = ri > 1e-6 ? Array.from({ length: n + 1 }, (_, i) => at(ri, n - i)) : [s.K];
    polys.push([...outer, ...inner]);
  }
  // Round the corners between pieces that meet at an angle, and the ends.
  const tangentAt = (s, end) => (s.t === 'L' ? unit(sub(s.b, s.a)) : (() => {
    const rv = sub(end === 'a' ? s.a : s.b, s.K);
    const t = unit(perp(rv));
    return s.sweep ? t : mul(t, -1);
  })());
  for (let i = 0; i < segs.length; i++) {
    const next = segs[i + 1] ?? (closed ? segs[0] : null);
    if (next && dot(tangentAt(segs[i], 'b'), tangentAt(next, 'a')) < 0.9995) polys.push(discPoly(segs[i].b, hw));
  }
  if (!closed && segs.length) {
    if (ends[0]) polys.push(discPoly(segs[0].a, hw));
    if (ends[1]) polys.push(discPoly(segs[segs.length - 1].b, hw));
  }
  return polys.map(P => polyContour(P, true));
}

function dotContour(c, r) {
  return [['M', [c[0] + r, c[1]]], ['A', r, 1, [c[0] - r, c[1]]], ['A', r, 1, [c[0] + r, c[1]]], ['Z']];
}

// ── Symmetry ─────────────────────────────────────────────────────────────────

const solid = (contour) => polyContour(contour.filter(c => c[0] !== 'Z').map(c => c[c.length - 1]), true);

const sameOp = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const compose = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3]];
const AXIS_MIRROR = { x: [-1, 0, 0, 1], y: [1, 0, 0, -1] };

// Copies each bundle by the symmetry's maps. A bundle that runs onto a
// mirror axis continues as its own mirror image there, so those copies are
// joined into one item.
// A contour traced the other way round (arcs flip their sweep).
function reverseContour(contour) {
  const closed = contour[contour.length - 1][0] === 'Z';
  const steps = contour.filter(c => c[0] !== 'Z');
  const pts = steps.map(c => c[c.length - 1]);
  const out = [['M', pts[pts.length - 1]]];
  for (let i = steps.length - 1; i >= 1; i--) out.push(steps[i][0] === 'A' ? ['A', steps[i][1], 1 - steps[i][2], pts[i - 1]] : ['L', pts[i - 1]]);
  if (closed) out.push(['Z']);
  return out;
}

// keepWinding: mirrored copies are traced the other way round too, so they
// wind like the original. Where a strand overlaps its mirror image across an
// axis, the nonzero fill then fills the overlap instead of cancelling it.
export function replicateBundles(bundles, sym, { keepWinding = false } = {}) {
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
      if (!groups.has(g)) groups.set(g, { contours: [], centres: [], bands: [], copy: g });
      const grp = groups.get(g);
      const flip = keepWinding && op[0] * op[3] - op[1] * op[2] < 0;
      for (const c of b.contours) grp.contours.push(flip ? reverseContour(mapContour(c, op)) : mapContour(c, op));
      // Band pieces are polygons: rewound solid, since a mirror reverses them.
      if (b.band) grp.bands.push(b.band.map(c => solid(mapContour(c, op))));
      grp.centres.push(applyLinear(op, b.centre));
    });
    for (const grp of groups.values()) {
      const centre = grp.centres.reduce((s, c) => add(s, c), [0, 0]).map(v => v / grp.centres.length);
      out.push({ key: `${b.index}#${grp.copy}`, single: b.single, contours: grp.contours, centre, bands: grp.bands });
    }
  }
  return out;
}
