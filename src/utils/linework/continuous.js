// Linework style C — continuous lines.
//
// The layer is a grid of square cells S across, each crossed by lines one
// pitch apart (k = S / pitch gaps) from one edge to another, edge to edge:
// a line on each of its two sides and k - 1 between, so the cells read as
// squares and neighbours share their boundary lines. With Merge cells
// (cfg.mergeCells), some n × n squares of cells (n up to cfg.mergeMax,
// chance cfg.merge) join into one bigger cell, n·k gaps across; its edge
// points are the same points as the single cells' beside it. A route
// visits every kept cell (or merged cell) once; where it goes straight
// across one the lines run Straight, where it turns they take a Diagonal
// (straight across the corner) or a Corner (a 90° L), both nested about the
// corner the two edges share, so nothing crosses. Every line meets a cell
// edge at one of its points s·pitch along it (both corners included),
// worked out from grid coordinates, so the next cell picks it up at exactly
// the same point. A boundary two cells would both draw is drawn once.
//
// With cfg.route 'bundles' the route is cut into paths of up to cfg.maxLen
// cells; 'single' keeps it whole. A path's end cells carry their lines out
// through a free side, preferring the artboard border. Wherever lines stop
// on a cell edge with nothing to join and no line along it, that edge is
// drawn, so they end on it (T junctions); never past it into the next cell.
// The artboard's own edge is left to the Frame.
//
// A Diagonal cell leaves half of itself empty; cfg.gapLines fills it with
// lines from that half's edge points ('vertical' | 'horizontal' |
// 'diagonal' (square on to the diagonal) | 'random' per cell, or 'off')
// that stop where they meet the diagonal.
//
// Lines are returned as filled outlines (round joins, butt ends), grouped
// for the layers list: one group per path and one per cell of gap lines.
// Everything is in the layer's local frame (origin at its centre, y down).
//
// Hand edits (the Build tool): opts.hand { rules: { [cell]: 'diag' |
// 'corner' } } pins turn cells' rules (a merged cell by its top-left cell);
// opts.edit { at } switches the turn cell there between the two. The edit
// made comes back as `edited`.

import { mulberry32, hash, shuffle, polyContour, contoursBounds, rectPoly } from './geometry';
import { shapeCutter } from './shapeClip';

const keyOf = p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
const rand01 = (seed, n) => mulberry32(hash(seed, n, 977))();

// ── Cells and merged cells ──────────────────────────────────────────────────
// The kept cells as blocks: single cells, and with Merge cells some n × n
// squares of them. Each block: { id (its top-left cell), x, y, n }, in
// reading order of their top-left cells. owner[cell] is the block it's in
// (-1 for a masked cell).
function makeBlocks(cols, rows, kept, cfg, seed) {
  const N = cols * rows;
  const merged = new Int32Array(N).fill(-1); // index into `big`, while merging
  const big = [];
  const share = cfg.mergeCells ? Math.max(0, Math.min(1, cfg.merge ?? 0.3)) : 0;
  const maxN = Math.max(2, Math.min(8, Math.round(cfg.mergeMax ?? 3)));
  if (share > 0) {
    const r = mulberry32(hash(seed, 913));
    const free = (x, y, n) => {
      if (x + n > cols || y + n > rows) return false;
      for (let j = y; j < y + n; j++) for (let i = x; i < x + n; i++) if (!kept[j * cols + i] || merged[j * cols + i] >= 0) return false;
      return true;
    };
    for (const id of shuffle(Array.from({ length: N }, (_, i) => i), r)) {
      if (merged[id] >= 0 || !kept[id] || r() >= share) continue;
      const x = id % cols, y = Math.floor(id / cols);
      let n = 2 + Math.floor(r() * (maxN - 1));
      while (n >= 2 && !free(x, y, n)) n--;
      if (n < 2) continue;
      for (let j = y; j < y + n; j++) for (let i = x; i < x + n; i++) merged[j * cols + i] = big.length;
      big.push({ x, y, n });
    }
  }
  const owner = new Int32Array(N).fill(-1);
  const blocks = [];
  for (let id = 0; id < N; id++) {
    if (!kept[id] || owner[id] >= 0) continue;
    const m = merged[id] >= 0 ? big[merged[id]] : { x: id % cols, y: Math.floor(id / cols), n: 1 };
    for (let j = m.y; j < m.y + m.n; j++) for (let i = m.x; i < m.x + m.n; i++) owner[j * cols + i] = blocks.length;
    blocks.push({ id, ...m });
  }
  return { blocks, owner };
}

// The blocks as a graph: each one's neighbours (by side, in side order) and
// which side of a block another lies on.
function blockGraph(blocks, owner, cols, rows) {
  const NB = blocks.map((b, bi) => {
    const out = [];
    const add = (i, j) => {
      if (i < 0 || j < 0 || i >= cols || j >= rows) return;
      const o = owner[j * cols + i];
      if (o >= 0 && o !== bi && !out.includes(o)) out.push(o);
    };
    for (let t = 0; t < b.n; t++) add(b.x + b.n, b.y + t);
    for (let t = 0; t < b.n; t++) add(b.x + t, b.y + b.n);
    for (let t = 0; t < b.n; t++) add(b.x - 1, b.y + t);
    for (let t = 0; t < b.n; t++) add(b.x + t, b.y - 1);
    return out;
  });
  const sideOf = (a, b) => {
    const A = blocks[a], B = blocks[b];
    if (B.x >= A.x + A.n) return 0;
    if (B.y >= A.y + A.n) return 1;
    if (B.x + B.n <= A.x) return 2;
    return 3;
  };
  const atBorder = (a, s) => {
    const A = blocks[a];
    return s === 0 ? A.x + A.n === cols : s === 1 ? A.y + A.n === rows : s === 2 ? A.x === 0 : A.y === 0;
  };
  return { n: blocks.length, NB, sideOf, atBorder };
}

// ── Route ────────────────────────────────────────────────────────────────────
// One path through the blocks: grown from a random one by backbite moves
// (step onto a free neighbour, or onto one already on the path and reverse
// the part after it), then mixed the same way. Turns are weighted by
// straightness; with edgeEnds, so is each end not facing the border straight
// on. If growth stalls the path can start from a snake through the cells
// instead (snake: that order, when every cell is its own block); otherwise
// a few seeds are tried and the longest path kept.
export function routeGraph(G, seed, straight, edgeEnds, snake = null) {
  const K = G.n;
  if (!K) return [];
  let best = [];
  for (let a = 0; a < 6; a++) {
    const p = routeAttempt(G, seed + a * 7919, straight, edgeEnds, null);
    if (p.length > best.length) best = p;
    if (best.length === K) return best;
  }
  return snake ? routeAttempt(G, seed, straight, edgeEnds, snake) : best;
}

function routeAttempt(G, seed, straight, edgeEnds, snake) {
  const K = G.n, NB = G.NB;
  const r = mulberry32(hash(seed, 31));
  const idx = new Int32Array(K).fill(-1);
  const path = snake ? snake.slice() : [Math.floor(r() * K)];
  path.forEach((id, t) => { idx[id] = t; });
  const beta = (straight - 0.5) * 8, gamma = edgeEnds ? 4 : 0;
  const turn = t => (t <= 0 || t >= path.length - 1 ? 0
    : ((G.sideOf(path[t], path[t - 1]) + 2) % 4 !== G.sideOf(path[t], path[t + 1]) ? 1 : 0));
  const reverse = (i, j) => {
    for (; i < j; i++, j--) {
      const a = path[i]; path[i] = path[j]; path[j] = a;
      idx[path[i]] = i; idx[path[j]] = j;
    }
  };
  // 1 when the end e (reached from p) doesn't face the border straight on.
  const offEdge = (e, p) => (G.atBorder(e, (G.sideOf(e, p) + 2) % 4) ? 0 : 1);
  const endPen = () => (path.length < 2 ? 0 : offEdge(path[path.length - 1], path[path.length - 2]) + offEdge(path[0], path[1]));
  const accept = (dT, dE) => { const e = -beta * dT - gamma * dE; return e >= 0 || r() < Math.exp(e); };
  // Mixing is capped by work (each move reverses up to the whole path).
  const growCap = 600 * K + 5000;
  const mix = Math.max(4000, Math.min(Math.round(60 * K * Math.sqrt(K)), Math.round((snake ? 3e8 : 4e7) / K)));
  let it = 0, mixed = 0;
  while (true) {
    const full = path.length === K;
    if (full ? mixed++ >= mix && (!gamma || endPen() === 0 || mixed >= 3 * mix) : it++ > growCap) break;
    const L = path.length;
    if (L === 1) {
      const ns = NB[path[0]];
      if (!ns.length) break;
      const nb = ns[Math.floor(r() * ns.length)];
      path.push(nb); idx[nb] = 1; continue;
    }
    const atEnd = r() < 0.5;
    const ns = NB[atEnd ? path[L - 1] : path[0]];
    if (!ns.length) continue;
    const nb = ns[Math.floor(r() * ns.length)];
    if (idx[nb] < 0) {
      if (atEnd) { path.push(nb); idx[nb] = L; } else { path.unshift(nb); for (let t = 0; t < path.length; t++) idx[path[t]] = t; }
      continue;
    }
    const i = idx[nb];
    if (atEnd) {
      if (i === L - 2) continue;
      const before = turn(i) + turn(i + 1), pen = gamma ? endPen() : 0;
      reverse(i + 1, L - 1);
      if (!accept(turn(i) + turn(i + 1) - before, gamma ? endPen() - pen : 0)) reverse(i + 1, L - 1);
    } else {
      if (i === 1) continue;
      const before = turn(i - 1) + turn(i), pen = gamma ? endPen() : 0;
      reverse(0, i - 1);
      if (!accept(turn(i - 1) + turn(i) - before, gamma ? endPen() - pen : 0)) reverse(0, i - 1);
    }
  }
  return path;
}

// Multiple paths: the route cut into paths of 1…max blocks, then any blocks
// it missed (a mask can make a single route impossible) picked up by short
// walks of their own.
function splitRoute(route, G, max, straight, r, skip = null) {
  const paths = [];
  for (let i = 0; i < route.length;) {
    let n = 1 + Math.floor(r() * max);
    if (route.length - (i + n) < 1) n = route.length - i;
    paths.push(route.slice(i, i + n));
    i += n;
  }
  const used = new Set([...route, ...(skip ?? [])]);
  const free = id => !used.has(id);
  for (let id = 0; id < G.n; id++) {
    if (!free(id)) continue;
    const walk = [id];
    used.add(id);
    for (let grow = 0; grow < 2; grow++) {
      while (walk.length < max) {
        const end = walk[walk.length - 1], prev = walk[walk.length - 2];
        const opts = G.NB[end].filter(free);
        if (!opts.length) break;
        const ahead = prev != null ? opts.find(o => G.sideOf(end, o) === (G.sideOf(end, prev) + 2) % 4) : undefined;
        const next = ahead !== undefined && r() < straight ? ahead : opts[Math.floor(r() * opts.length)];
        walk.push(next); used.add(next);
      }
      walk.reverse();
    }
    paths.push(walk);
  }
  return paths;
}

// ── Cells ────────────────────────────────────────────────────────────────────
// A canonical cell [0,S]², k gaps across: lines at d_s = s·S/k for s = 0…k,
// entering through the top edge, line s at x = d_s. A turn leaves by the left
// edge (mirrored for the right), line s at y = d_s, nested about the
// top-left corner: line 0 is that corner itself (nothing to draw; the lines
// on the two edges meet there), and line k runs along the far edges.
function cellLines(kind, k, S) {
  const ds = Array.from({ length: k + 1 }, (_, s) => (s * S) / k);
  if (kind === 'straight') return ds.map(d => [[d, 0], [d, S]]);
  if (kind === 'diag') return ds.filter(d => d > 0).map(d => [[d, 0], [0, d]]);
  return ds.filter(d => d > 0).map(d => [[d, 0], [d, d], [0, d]]); // corner: a 90° L
}

// Canonical → grid for a block of size n: mirror x, then q clockwise
// quarter turns (top → side q - 1).
function placer(b, S, q, mirror) {
  const size = b.n * S, cx = b.x * S + size / 2, cy = b.y * S + size / 2;
  return ([x, y]) => {
    let u = (mirror ? size - x : x) - size / 2, v = y - size / 2;
    for (let i = 0; i < q; i++) [u, v] = [-v, u];
    return [cx + u, cy + v];
  };
}

// A free side for an open path end: a border side if there is one, else
// straight on (by straightness) or a turn. `not`: the side taken, or -1.
function freeSide(G, bi, id, not, straight, seed) {
  const r = mulberry32(hash(seed, id, not + 11, 7919));
  const opp = not >= 0 ? (not + 2) % 4 : -1;
  const sides = [0, 1, 2, 3].filter(s => s !== not);
  const border = sides.filter(s => G.atBorder(bi, s));
  if (border.length) return border.includes(opp) && r() < straight ? opp : border[Math.floor(r() * border.length)];
  if (opp >= 0 && r() < straight) return opp;
  const turns = sides.filter(s => s !== opp);
  return turns[Math.floor(r() * turns.length)];
}

// A turn's rule: pinned by hand, else from Corners (cfg.cornerShare) and
// Placement ('random' | 'checker' | 'alternate' along the line).
function turnRule(cfg, rules, seed, b, nTurn) {
  if (rules?.[b.id]) return rules[b.id];
  const share = cfg.cornerShare ?? 0.4;
  if (share <= 0) return 'diag';
  if (share >= 1) return 'corner';
  if (cfg.placement === 'checker') return (b.x + b.y) % 2 ? 'corner' : 'diag';
  if (cfg.placement === 'alternate') return nTurn % 2 ? 'corner' : 'diag';
  return rand01(seed, b.id) < share ? 'corner' : 'diag';
}

// ── Gap lines ────────────────────────────────────────────────────────────────
// In each Diagonal cell's empty half (canonical: the bottom and right edges,
// beyond the outermost diagonal x + y = S), lines from the edge points
// running one way until they meet the diagonal. The ones on the cell's own
// edges run its full length, so the lines stay evenly spaced to the edge.
function gapLines(cfg, seed, blocks, kinds, k, S) {
  const mode = cfg.gapLines ?? 'random';
  if (mode === 'off') return [];
  const r2 = Math.SQRT1_2, DIRN = ['vertical', 'horizontal', 'diagonal'];
  const out = [];
  blocks.forEach((b, bi) => {
    const c = kinds[bi];
    if (!c || c.kind !== 'diag') return;
    const kk = k * b.n, size = S * b.n, p = size / kk;
    const ds = Array.from({ length: kk + 1 }, (_, s) => s * p), D = size;
    let dir = mode === 'random' ? DIRN[Math.floor(rand01(seed + 77, b.id) * 3)] : mode;
    // Grid vertical is canonical vertical in an upright cell, horizontal in a turned one.
    if (dir !== 'diagonal' && c.q % 2) dir = dir === 'vertical' ? 'horizontal' : 'vertical';
    const place = placer(b, S, c.q, c.mirror);
    const starts = [];
    if (dir !== 'horizontal') for (const d of ds) starts.push([[d, size], dir === 'vertical' ? [0, -1] : [-r2, -r2]]);
    // (At 45° the far corner starts from both edges: once is enough.)
    if (dir !== 'vertical') for (const d of ds) if (!(dir === 'diagonal' && d === size)) starts.push([[size, d], dir === 'horizontal' ? [-1, 0] : [-r2, -r2]]);
    for (const [P, u] of starts) {
      const t = (D - P[0] - P[1]) / (u[0] + u[1]);
      const E = [P[0] + t * u[0], P[1] + t * u[1]];
      if (t < p * 0.3 || E[0] < -1e-6 || E[1] < -1e-6) continue;
      out.push({ cell: b.id, pts: [place(P), place(E)] });
    }
  });
  return out;
}

// ── Joining up ───────────────────────────────────────────────────────────────
// Pieces that share an end point are one line. Where more than two meet,
// ends running straight through join first, then the most nearly opposite
// of the rest, two by two; an odd one out stops there (a T).
function stitch(pieces) {
  const ends = new Map();
  pieces.forEach((pc, i) => {
    for (const e of [0, 1]) {
      const kk = keyOf(e ? pc.pts[pc.pts.length - 1] : pc.pts[0]);
      if (!ends.has(kk)) ends.set(kk, []);
      ends.get(kk).push([i, e]);
    }
  });
  const out = ([i, e]) => {
    const P = pieces[i].pts, a = e === 0 ? P[0] : P[P.length - 1], b = e === 0 ? P[1] : P[P.length - 2];
    const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / l, d[1] / l];
  };
  const mate = new Map();
  const id = ([i, e]) => i * 2 + e;
  const pair = (x, y) => { mate.set(id(x), y); mate.set(id(y), x); };
  for (const list of ends.values()) {
    if (list.length === 2) { pair(list[0], list[1]); continue; }
    if (list.length < 2) continue;
    const left = list.slice();
    for (let a = 0; a < left.length; a++) {
      for (let b = a + 1; b < left.length; b++) {
        const da = out(left[a]), db = out(left[b]);
        if (da[0] * db[0] + da[1] * db[1] < -0.999) { pair(left[a], left[b]); left.splice(b, 1); left.splice(a, 1); a = -1; break; }
      }
    }
    // Then the most nearly opposite of those left, until one at most is left.
    while (left.length >= 2) {
      let best = null;
      for (let x = 0; x < left.length; x++) for (let y = x + 1; y < left.length; y++) {
        const dx = out(left[x]), dy = out(left[y]), dot = dx[0] * dy[0] + dx[1] * dy[1];
        if (!best || dot < best[2]) best = [x, y, dot];
      }
      pair(left[best[0]], left[best[1]]);
      left.splice(best[1], 1); left.splice(best[0], 1);
    }
  }
  const used = new Uint8Array(pieces.length);
  const lines = [];
  const walk = (i, fe) => {
    const pts = [];
    let cur = i, from = fe;
    const first = pieces[i];
    // A line made of a path's lines and gap lines belongs to the path.
    let group = first.group;
    while (!used[cur]) {
      used[cur] = 1;
      if (String(group).startsWith('g') && !String(pieces[cur].group).startsWith('g')) group = pieces[cur].group;
      const seg = from === 0 ? pieces[cur].pts : pieces[cur].pts.slice().reverse();
      pts.push(...(pts.length ? seg.slice(1) : seg));
      const next = mate.get(cur * 2 + (1 - from));
      if (!next) break;
      [cur, from] = next;
    }
    const closed = pts.length > 2 && keyOf(pts[0]) === keyOf(pts[pts.length - 1]);
    lines.push({ pts: closed ? pts.slice(0, -1) : pts, closed, group, cell: first.cell });
  };
  // Lines with an end first, then closed loops.
  for (let i = 0; i < pieces.length; i++) for (const e of [0, 1]) if (!used[i] && !mate.has(i * 2 + e)) walk(i, e);
  for (let i = 0; i < pieces.length; i++) if (!used[i]) walk(i, 0);
  return lines;
}

const segTouch = (P, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * vx + (P[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(P[0] - a[0] - t * vx, P[1] - a[1] - t * vy) < 1e-6;
};

// Unit cell edges a segment lies along (it runs on a grid line), keyed
// 'v<i>,<j>' (x = i·S, y from j·S) or 'h<i>,<j>', in order from a to b; null
// for a segment off the grid lines.
function edgeUnits(a, b, S) {
  const on = v => Math.abs(v / S - Math.round(v / S)) < 1e-6;
  const vertical = Math.abs(a[0] - b[0]) < 1e-6 && on(a[0]);
  const horizontal = Math.abs(a[1] - b[1]) < 1e-6 && on(a[1]);
  if (!vertical && !horizontal) return null;
  const ax = vertical ? 1 : 0, at = vertical ? a[0] : a[1];
  const from = a[ax], to = b[ax], dir = Math.sign(to - from);
  const cuts = [from];
  for (let g = Math.floor(Math.min(from, to) / S + 1e-6) + 1; g * S < Math.max(from, to) - 1e-6; g++) cuts.push(g * S);
  cuts.push(to);
  if (dir < 0) cuts.splice(1, cuts.length - 2, ...cuts.slice(1, -1).reverse());
  const pt = v => (vertical ? [at, v] : [v, at]);
  const units = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const lo = Math.min(cuts[i], cuts[i + 1]);
    units.push({ key: `${vertical ? 'v' : 'h'}${Math.round(at / S)},${Math.floor(lo / S + 1e-6)}`, to: pt(cuts[i + 1]) });
  }
  return units;
}

// A boundary two cells would both draw is drawn once (by the first): its
// later copies are cut out of their lines. So is any other segment drawn
// twice.
function dedupeEdges(pieces, S, claimed) {
  const out = [];
  for (const pc of pieces) {
    let cur = [pc.pts[0]];
    const flush = () => { if (cur.length > 1) out.push({ ...pc, pts: cur }); };
    for (let i = 0; i + 1 < pc.pts.length; i++) {
      const units = edgeUnits(pc.pts[i], pc.pts[i + 1], S);
      if (!units) {
        const key = [keyOf(pc.pts[i]), keyOf(pc.pts[i + 1])].sort().join('|');
        if (claimed.has(key)) { flush(); cur = [pc.pts[i + 1]]; } else { claimed.add(key); cur.push(pc.pts[i + 1]); }
        continue;
      }
      for (const u of units) {
        if (claimed.has(u.key)) { flush(); cur = [u.to]; } else { claimed.add(u.key); cur.push(u.to); }
      }
    }
    flush();
  }
  return out;
}

// Lines that stop on a cell edge with nothing to join and no line along it:
// that edge (the unit cell edge each one ends on) is drawn, in the line's
// group, so they end on it. Not the artboard's own edge.
function capEdges(pieces, S, W, H, claimed) {
  const on = v => Math.abs(v / S - Math.round(v / S)) < 1e-6;
  const B = new Map(), bk = (i, j) => `${i},${j}`;
  pieces.forEach((pc, pi) => {
    for (let i = 0; i + 1 < pc.pts.length; i++) {
      const a = pc.pts[i], b = pc.pts[i + 1];
      for (let x = Math.floor(Math.min(a[0], b[0]) / S - 1e-6); x <= Math.floor(Math.max(a[0], b[0]) / S + 1e-6); x++) {
        for (let y = Math.floor(Math.min(a[1], b[1]) / S - 1e-6); y <= Math.floor(Math.max(a[1], b[1]) / S + 1e-6); y++) {
          if (!B.has(bk(x, y))) B.set(bk(x, y), []);
          B.get(bk(x, y)).push({ a, b, pi, i });
        }
      }
    }
  });
  const ends = new Map();
  pieces.forEach(pc => { for (const P of [pc.pts[0], pc.pts[pc.pts.length - 1]]) ends.set(keyOf(P), (ends.get(keyOf(P)) ?? 0) + 1); });
  const caps = [];
  pieces.forEach((pc, pi) => {
    for (const end of [0, 1]) {
      const n = pc.pts.length, P = end ? pc.pts[n - 1] : pc.pts[0], own = end ? n - 2 : 0;
      if (ends.get(keyOf(P)) > 1) continue; // joined, or meeting another end
      const onV = on(P[0]), onH = on(P[1]);
      if (onV === onH) continue; // off the grid lines, or on a grid corner
      if ((onV && (Math.abs(P[0]) < 1e-6 || Math.abs(P[0] - W) < 1e-6)) || (onH && (Math.abs(P[1]) < 1e-6 || Math.abs(P[1] - H) < 1e-6))) continue;
      const near = B.get(bk(Math.floor(P[0] / S), Math.floor(P[1] / S))) ?? [];
      const nearL = B.get(bk(Math.floor(P[0] / S - 1e-6), Math.floor(P[1] / S - 1e-6))) ?? [];
      if ([...near, ...nearL].some(sg => !(sg.pi === pi && sg.i === own) && segTouch(P, sg.a, sg.b))) continue;
      const i = Math.round((onV ? P[0] : P[1]) / S), j = Math.floor((onV ? P[1] : P[0]) / S);
      const key = `${onV ? 'v' : 'h'}${i},${j}`;
      if (claimed.has(key)) continue;
      claimed.add(key);
      const a = onV ? [i * S, j * S] : [j * S, i * S], b = onV ? [i * S, (j + 1) * S] : [(j + 1) * S, i * S];
      caps.push({ cell: pc.cell, group: pc.group, pts: [a, b] });
    }
  });
  return caps;
}

// ── Outlines ─────────────────────────────────────────────────────────────────
// A centreline as a filled outline hw either side: round joins on the
// outside of each bend, mitred on the inside, butt ends. Closed lines give
// two rings (the inner one a hole).
const ARC_STEP = Math.PI / 10;
function side(P, closed, hw, s) {
  const n = P.length;
  const dir = i => { const a = P[i], b = P[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const nrm = d => [-d[1] * s, d[0] * s];
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = P[i];
    if (!closed && i === 0) { const m = nrm(dir(0)); out.push([p[0] + m[0] * hw, p[1] + m[1] * hw]); continue; }
    if (!closed && i === n - 1) { const m = nrm(dir(n - 2)); out.push([p[0] + m[0] * hw, p[1] + m[1] * hw]); continue; }
    const din = dir((i - 1 + n) % n), dout = dir(i);
    const n0 = nrm(din), n1 = nrm(dout);
    const cr = (din[0] * dout[1] - din[1] * dout[0]) * s, dt = din[0] * dout[0] + din[1] * dout[1];
    if (Math.abs(cr) < 1e-9 && dt > 0) { out.push([p[0] + n0[0] * hw, p[1] + n0[1] * hw]); continue; }
    if (cr > 0 && 1 + dt > 1e-6) {
      // Inside of the bend: where the two offset lines cross.
      const k = hw / (1 + n0[0] * n1[0] + n0[1] * n1[1]);
      out.push([p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k]);
      continue;
    }
    // Outside: an arc round the point.
    const a0 = Math.atan2(n0[1], n0[0]);
    let da = Math.atan2(n1[1], n1[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil(Math.abs(da) / ARC_STEP));
    for (let j = 0; j <= steps; j++) { const a = a0 + (da * j) / steps; out.push([p[0] + Math.cos(a) * hw, p[1] + Math.sin(a) * hw]); }
  }
  return out;
}
export function lineOutline(pts, hw, closed = false) {
  const P = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-9);
  if (P.length < 2) return [];
  const left = side(P, closed, hw, 1), right = side(P, closed, hw, -1);
  if (!closed) return [polyContour([...left, ...right.reverse()], true)];
  const area = R => R.reduce((s, a, i) => { const b = R[(i + 1) % R.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
  const [outer, inner] = Math.abs(area(left)) >= Math.abs(area(right)) ? [left, right] : [right, left];
  return [polyContour(outer, true), polyContour(inner, false)];
}

// ── The layer ────────────────────────────────────────────────────────────────
// L: { w, h, C, p, lineW }. insideCell(i, j): the region mask over the cell
// grid, or null. Returns { groups: [{ key, name, contours, centre, lines }],
// cols, rows, S, k, cells (by cell: { kind, q, mirror, path, block }),
// blocks, edited }.
export function continuousLayer(L, cfg, seed, insideCell, opts = {}) {
  const S = L.C;
  // k gaps a cell, one pitch each: k + 1 lines, edge to edge.
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k;
  const cols = Math.max(1, Math.floor(L.w / S + 1e-6)), rows = Math.max(1, Math.floor(L.h / S + 1e-6));
  const W = cols * S, H = rows * S, ox = -W / 2, oy = -H / 2;
  const N = cols * rows;
  const kept = Array.from({ length: N }, (_, id) => (insideCell ? insideCell(id % cols, Math.floor(id / cols)) : true));
  const { blocks, owner } = makeBlocks(cols, rows, kept, cfg, seed);
  const G = blockGraph(blocks, owner, cols, rows);
  const single = cfg.route === 'single';
  const straight = cfg.straight ?? 0.6;
  // A snake through the cells to fall back on, when every cell is its own block.
  let snake = null;
  if (blocks.length === N) {
    snake = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) snake.push(y * cols + (y % 2 ? cols - 1 - x : x));
  }
  const route = routeGraph(G, seed, straight, single, snake);

  // A hand edit: switch the turn cell under the point (worked out from the
  // layout as drawn, so it's the cell the person sees).
  let rules = opts.hand?.rules ?? null;
  let edited = null;
  const build = (rulesNow) => layout(cfg, seed, route, rulesNow, { G, blocks, cols, k, S, single, straight });
  let lay = build(rules);
  if (opts.edit?.at) {
    const gx = opts.edit.at[0] - ox, gy = opts.edit.at[1] - oy;
    const i = Math.floor(gx / S), j = Math.floor(gy / S);
    const c = i >= 0 && j >= 0 && i < cols && j < rows ? lay.cells.get(j * cols + i) : null;
    if (c && (c.kind === 'diag' || c.kind === 'corner')) {
      rules = { ...(rules ?? {}), [c.block]: c.kind === 'diag' ? 'corner' : 'diag' };
      edited = { op: 'turn', rules };
      lay = build(rules);
    }
  }

  const { pieces, cells, kinds } = lay;
  // Paths' lines first, so a shared boundary belongs to a path; then gap
  // lines; then the edges lines end on. All joined end to end into lines
  // and outlined one by one, so every bend joins cleanly.
  const claimed = new Set();
  const drawn = [
    ...dedupeEdges(pieces, S, claimed),
    ...dedupeEdges(gapLines(cfg, seed, blocks, kinds, k, S).map(g => ({ ...g, group: `g${g.cell}` })), S, claimed),
  ];
  drawn.push(...capEdges(drawn, S, W, H, claimed));
  const joined = stitch(drawn);

  // Group into items: each path, and each cell's gap lines.
  const hw = (L.lineW ?? p * (L.ratio ?? 0.5)) / 2;
  const groups = new Map();
  for (const l of joined) {
    const g = groups.get(l.group) ?? { key: l.group, name: String(l.group).startsWith('g') ? 'Gap lines' : 'Path', contours: [], lines: [] };
    const pts = l.pts.map(([x, y]) => [x + ox, y + oy]);
    g.lines.push({ pts, closed: l.closed });
    g.contours.push(...lineOutline(pts, hw, l.closed));
    groups.set(l.group, g);
  }
  // A line ending on the grid's edge at an angle would poke past it by its
  // half width: anything reaching past the grid is cut back to it.
  const cut = shapeCutter([rectPoly(ox, oy, W, H)]);
  const out = [...groups.values()].map(g => {
    const b = contoursBounds(g.contours);
    if (b && (b.x < ox - 1e-6 || b.y < oy - 1e-6 || b.x + b.w > ox + W + 1e-6 || b.y + b.h > oy + H + 1e-6)) g.contours = cut(g.contours) ?? [];
    return g;
  }).filter(g => g.contours.length).map(g => {
    const b = contoursBounds(g.contours);
    return { ...g, centre: b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0] };
  });
  return { groups: out, cols, rows, S, k, cells, blocks, edited };
}

// Every path's pieces, block by block, and what each block is.
function layout(cfg, seed, route, rules, { G, blocks, cols, k, S, single, straight }) {
  const maxLen = (cfg.maxLen ?? 40) >= 200 ? Infinity : Math.max(1, cfg.maxLen ?? 40);
  const whole = single || !Number.isFinite(maxLen);
  const paths = whole ? (route.length ? [route] : []) : splitRoute(route, G, maxLen, straight, mulberry32(hash(seed, 5)));
  // Blocks a single route couldn't reach get paths of their own.
  if (whole) paths.push(...splitRoute([], G, Number.isFinite(maxLen) ? maxLen : 8, straight, mulberry32(hash(seed, 6)), route));
  const pieces = [], kinds = [], cells = new Map();
  let nTurn = 0;
  paths.forEach((path, pi) => {
    const L = path.length;
    path.forEach((bi, n) => {
      const b = blocks[bi];
      let entry = n > 0 ? G.sideOf(bi, path[n - 1]) : null;
      let exit = n < L - 1 ? G.sideOf(bi, path[n + 1]) : null;
      if (entry == null && exit == null) { entry = freeSide(G, bi, b.id, -1, straight, seed); exit = freeSide(G, bi, b.id, entry, straight, seed); }
      else if (entry == null) entry = freeSide(G, bi, b.id, exit, straight, seed);
      else if (exit == null) exit = freeSide(G, bi, b.id, entry, straight, seed);
      const kind = (entry + 2) % 4 === exit ? 'straight' : turnRule(cfg, rules, seed, b, nTurn++);
      const q = (entry + 1) % 4; // quarter turns taking top (3) to `entry`
      const mirror = kind !== 'straight' && (2 + q) % 4 !== exit;
      const place = placer(b, S, q, mirror);
      kinds[bi] = { kind, q, mirror, path: pi };
      for (let j = b.y; j < b.y + b.n; j++) for (let i = b.x; i < b.x + b.n; i++) cells.set(j * cols + i, { kind, q, mirror, path: pi, block: b.id });
      for (const P of cellLines(kind, k * b.n, S * b.n)) pieces.push({ cell: b.id, group: pi, pts: P.map(place) });
    });
  });
  return { pieces, cells, kinds };
}
