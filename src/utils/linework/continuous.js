// Linework style C — continuous lines.
//
// The layer is a grid of square cells S across (Bundle size × the cell),
// each carrying k = S / pitch lines from one edge to another. A route
// visits every kept cell once; where it goes straight across a cell the
// lines run Straight, where it turns they take a Diagonal (straight across
// the corner) or a Corner (a 90° L), both nested about the corner the two
// edges share, so nothing crosses. Every line meets a cell edge at one of k
// points (s + ½)·S/k along it, worked out from grid coordinates, so the
// next cell picks it up at exactly the same point.
//
// With cfg.route 'bundles' the route is cut into paths of up to cfg.maxLen
// cells; 'single' keeps it whole. A path's end cells carry their lines out
// through a free side, preferring the artboard border. Wherever a line stops
// on a cell edge with nothing to join, it runs on straight until it meets
// the first line beyond (a T junction), or the border.
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
// 'corner' } } pins turn cells' rules; opts.edit { at } switches the turn
// cell there between the two. The edit made comes back as `edited`.

import { mulberry32, hash, polyContour, contoursBounds } from './geometry';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // right, down, left, up
const keyOf = p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
const rand01 = (seed, n) => mulberry32(hash(seed, n, 977))();

// ── Route ────────────────────────────────────────────────────────────────────
// One path through the kept cells: grown from a random cell by backbite
// moves (step onto a free neighbour, or onto one already on the path and
// reverse the part after it), then mixed the same way. Turns are weighted
// by straightness; with edgeEnds, so is each end not facing the border
// straight on. If growth stalls on a full grid the path starts from a snake
// instead; with holes, a few seeds are tried and the longest path kept.
export function routeCells(cols, rows, kept, seed, straight, edgeEnds) {
  const N = cols * rows;
  let K = 0;
  for (let id = 0; id < N; id++) if (kept[id]) K++;
  if (!K) return [];
  let best = [];
  for (let a = 0; a < 6; a++) {
    const p = routeAttempt(cols, rows, kept, K, seed + a * 7919, straight, edgeEnds, false);
    if (p.length > best.length) best = p;
    if (best.length === K) return best;
  }
  return K === N ? routeAttempt(cols, rows, kept, K, seed, straight, edgeEnds, true) : best;
}

function routeAttempt(cols, rows, kept, K, seed, straight, edgeEnds, snake) {
  const N = cols * rows;
  const NB = Array.from({ length: N }, (_, id) => {
    if (!kept[id]) return [];
    const x = id % cols, y = (id / cols) | 0, out = [];
    for (const [dx, dy] of DIRS) {
      const a = x + dx, b = y + dy;
      if (a >= 0 && b >= 0 && a < cols && b < rows && kept[b * cols + a]) out.push(b * cols + a);
    }
    return out;
  });
  const r = mulberry32(hash(seed, 31));
  const idx = new Int32Array(N).fill(-1);
  let path;
  if (snake) {
    path = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) path.push(y * cols + (y % 2 ? cols - 1 - x : x));
  } else {
    let start;
    do start = Math.floor(r() * N); while (!kept[start]);
    path = [start];
  }
  path.forEach((id, t) => { idx[id] = t; });
  const beta = (straight - 0.5) * 8, gamma = edgeEnds ? 4 : 0;
  const turn = t => (t <= 0 || t >= path.length - 1 ? 0 : (path[t - 1] + path[t + 1] !== 2 * path[t] ? 1 : 0));
  const reverse = (i, j) => {
    for (; i < j; i++, j--) {
      const a = path[i]; path[i] = path[j]; path[j] = a;
      idx[path[i]] = i; idx[path[j]] = j;
    }
  };
  // 1 when the end cell e (reached from p) doesn't face the border straight on.
  const offEdge = (e, p) => {
    const nx = 2 * (e % cols) - (p % cols), ny = 2 * ((e / cols) | 0) - ((p / cols) | 0);
    return nx < 0 || ny < 0 || nx >= cols || ny >= rows ? 0 : 1;
  };
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

// Multiple paths: the route cut into paths of 1…max cells, then any kept
// cells it missed (holes can make a single route impossible) picked up by
// short walks of their own.
function splitRoute(route, cols, rows, kept, max, straight, r) {
  const paths = [];
  for (let i = 0; i < route.length;) {
    let n = 1 + Math.floor(r() * max);
    if (route.length - (i + n) < 1) n = route.length - i;
    paths.push(route.slice(i, i + n));
    i += n;
  }
  const used = new Set(route);
  const free = id => kept[id] && !used.has(id);
  const nbs = id => {
    const x = id % cols, y = Math.floor(id / cols);
    return DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows).map(([a, b]) => b * cols + a);
  };
  for (let id = 0; id < cols * rows; id++) {
    if (!free(id)) continue;
    const walk = [id];
    used.add(id);
    for (let grow = 0; grow < 2; grow++) {
      while (walk.length < max) {
        const end = walk[walk.length - 1], prev = walk[walk.length - 2];
        const opts = nbs(end).filter(free);
        if (!opts.length) break;
        const ahead = prev != null ? opts.find(o => o - end === end - prev) : undefined;
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
// A canonical cell [0,S]², the lines entering through the top edge, line s
// at x = d_s. A turn leaves by the left edge (mirrored for the right), line
// s at y = d_s.
function cellLines(kind, k, S) {
  const ds = Array.from({ length: k }, (_, s) => (s + 0.5) * S / k);
  if (kind === 'straight') return ds.map(d => [[d, 0], [d, S]]);
  if (kind === 'diag') return ds.map(d => [[d, 0], [0, d]]);
  return ds.map(d => [[d, 0], [d, d], [0, d]]); // corner: a 90° L
}

const sideTo = (cols, a, b) => {
  const dx = (b % cols) - (a % cols), dy = Math.floor(b / cols) - Math.floor(a / cols);
  return DIRS.findIndex(([x, y]) => x === dx && y === dy);
};
// Canonical → grid: mirror x, then q clockwise quarter turns (top → side q - 1).
function placer(cols, S, id, q, mirror) {
  const cx = (id % cols) * S + S / 2, cy = Math.floor(id / cols) * S + S / 2;
  return ([x, y]) => {
    let u = (mirror ? S - x : x) - S / 2, v = y - S / 2;
    for (let i = 0; i < q; i++) [u, v] = [-v, u];
    return [cx + u, cy + v];
  };
}

// A free side for an open path end: a border side if there is one, else
// straight on (by straightness) or a turn. `not`: the side taken, or -1.
function freeSide(cols, rows, id, not, straight, seed) {
  const x = id % cols, y = Math.floor(id / cols);
  const r = mulberry32(hash(seed, id, not + 11, 7919));
  const opp = not >= 0 ? (not + 2) % 4 : -1;
  const sides = [0, 1, 2, 3].filter(s => s !== not);
  const border = sides.filter(s => {
    const nx = x + DIRS[s][0], ny = y + DIRS[s][1];
    return nx < 0 || ny < 0 || nx >= cols || ny >= rows;
  });
  if (border.length) return border.includes(opp) && r() < straight ? opp : border[Math.floor(r() * border.length)];
  if (opp >= 0 && r() < straight) return opp;
  const turns = sides.filter(s => s !== opp);
  return turns[Math.floor(r() * turns.length)];
}

// A turn cell's rule: pinned by hand, else from Corners (cfg.cornerShare)
// and Placement ('random' | 'checker' | 'alternate' along the line).
function turnRule(cfg, rules, seed, cols, id, nTurn) {
  if (rules?.[id]) return rules[id];
  const share = cfg.cornerShare ?? 0.4;
  if (share <= 0) return 'diag';
  if (share >= 1) return 'corner';
  if (cfg.placement === 'checker') return ((id % cols) + Math.floor(id / cols)) % 2 ? 'corner' : 'diag';
  if (cfg.placement === 'alternate') return nTurn % 2 ? 'corner' : 'diag';
  return rand01(seed, id) < share ? 'corner' : 'diag';
}

// ── Gap lines ────────────────────────────────────────────────────────────────
// In each Diagonal cell's empty half (canonical: the bottom and right edges,
// beyond the outermost diagonal x + y = D), lines from the edge points
// running one way until they meet the diagonal. The outermost ones end on
// its last point, so the lines stay evenly spaced up to the cell edge.
function gapLines(cfg, seed, cells, k, S, cols) {
  const mode = cfg.gapLines ?? 'random';
  if (mode === 'off') return [];
  const p = S / k, ds = Array.from({ length: k }, (_, s) => (s + 0.5) * p), D = ds[k - 1];
  const r2 = Math.SQRT1_2, DIRN = ['vertical', 'horizontal', 'diagonal'];
  const out = [];
  for (const [id, c] of cells) {
    if (c.kind !== 'diag') continue;
    let dir = mode === 'random' ? DIRN[Math.floor(rand01(seed + 77, id) * 3)] : mode;
    // Grid vertical is canonical vertical in an upright cell, horizontal in a turned one.
    if (dir !== 'diagonal' && c.q % 2) dir = dir === 'vertical' ? 'horizontal' : 'vertical';
    const place = placer(cols, S, id, c.q, c.mirror);
    const starts = [];
    if (dir !== 'horizontal') for (const d of ds) starts.push([[d, S], dir === 'vertical' ? [0, -1] : [-r2, -r2]]);
    if (dir !== 'vertical') for (const d of ds) starts.push([[S, d], dir === 'horizontal' ? [-1, 0] : [-r2, -r2]]);
    for (const [P, u] of starts) {
      const t = (D - P[0] - P[1]) / (u[0] + u[1]);
      const E = [P[0] + t * u[0], P[1] + t * u[1]];
      if (t < p * 0.3 || E[0] < -1e-6 || E[1] < -1e-6) continue;
      out.push({ cell: id, pts: [place(P), place(E)] });
    }
  }
  return out;
}

// ── Joining up ───────────────────────────────────────────────────────────────
// Pieces that share an end point are one line.
function stitch(pieces) {
  const ends = new Map();
  pieces.forEach((pc, i) => {
    for (const e of [0, 1]) {
      const kk = keyOf(e ? pc.pts[pc.pts.length - 1] : pc.pts[0]);
      if (!ends.has(kk)) ends.set(kk, []);
      ends.get(kk).push([i, e]);
    }
  });
  const used = new Uint8Array(pieces.length);
  const lines = [];
  const walk = (i, fe) => {
    const pts = [];
    let cur = i, from = fe;
    const first = pieces[i];
    while (true) {
      used[cur] = 1;
      const seg = from === 0 ? pieces[cur].pts : pieces[cur].pts.slice().reverse();
      pts.push(...(pts.length ? seg.slice(1) : seg));
      const nxt = (ends.get(keyOf(seg[seg.length - 1])) || []).find(([j]) => !used[j]);
      if (!nxt) break;
      [cur, from] = nxt;
    }
    const closed = pts.length > 2 && keyOf(pts[0]) === keyOf(pts[pts.length - 1]);
    lines.push({ pts: closed ? pts.slice(0, -1) : pts, closed, group: first.group, cell: first.cell });
  };
  for (const v of ends.values()) if (v.length === 1 && !used[v[0][0]]) walk(v[0][0], v[0][1]);
  for (let i = 0; i < pieces.length; i++) if (!used[i]) walk(i, 0);
  return lines;
}

const segTouch = (P, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
  const t = l2 ? Math.max(0, Math.min(1, ((P[0] - a[0]) * vx + (P[1] - a[1]) * vy) / l2)) : 0;
  return Math.hypot(P[0] - a[0] - t * vx, P[1] - a[1] - t * vy) < 1e-6;
};

// A line that stops on a cell edge carries straight on into the next cell
// until it meets the first line there (a T junction), an earlier run-on or
// the border, at most two gaps on. A main line whose only company at its end
// is a gap line folding back from it still runs on (so the diagonal isn't
// left a step short); gap lines never run on past a main line.
function meetLines(lines, mainCount, W, H, S, p) {
  const maxT = p * 2;
  const onGrid = v => Math.abs(v / S - Math.round(v / S)) < 1e-6;
  const border = ([x, y]) => Math.abs(x) < 1e-6 || Math.abs(y) < 1e-6 || Math.abs(x - W) < 1e-6 || Math.abs(y - H) < 1e-6;
  const segs = [];
  lines.forEach((l, li) => { for (let i = 0; i + 1 < l.pts.length; i++) segs.push({ a: l.pts[i], b: l.pts[i + 1], li, i }); });
  const B = new Map(), bk = (i, j) => `${i},${j}`;
  for (const sg of segs) {
    const x0 = Math.min(sg.a[0], sg.b[0]), x1 = Math.max(sg.a[0], sg.b[0]), y0 = Math.min(sg.a[1], sg.b[1]), y1 = Math.max(sg.a[1], sg.b[1]);
    for (let i = Math.floor(x0 / S - 1e-9); i <= Math.floor(x1 / S + 1e-9); i++) {
      for (let j = Math.floor(y0 / S - 1e-9); j <= Math.floor(y1 / S + 1e-9); j++) {
        if (!B.has(bk(i, j))) B.set(bk(i, j), []);
        B.get(bk(i, j)).push(sg);
      }
    }
  }
  const near = ([x, y]) => {
    const out = new Set();
    for (let i = Math.floor(x / S) - 1; i <= Math.floor(x / S) + 1; i++) for (let j = Math.floor(y / S) - 1; j <= Math.floor(y / S) + 1; j++) for (const sg of B.get(bk(i, j)) || []) out.add(sg);
    return out;
  };
  const edges = [[[0, 0], [W, 0]], [[W, 0], [W, H]], [[W, H], [0, H]], [[0, H], [0, 0]]].map(([a, b]) => ({ a, b, li: -2, i: -1 }));
  const ext = [];
  lines.forEach((l, li) => {
    if (l.closed || l.pts.length < 2) return;
    for (const end of [0, 1]) {
      const n = l.pts.length;
      const P = end ? l.pts[n - 1] : l.pts[0], Q = end ? l.pts[n - 2] : l.pts[1];
      if (border(P) || !(onGrid(P[0]) || onGrid(P[1]))) continue;
      const own = end ? n - 2 : 0;
      const cand = near(P);
      const isMain = li < mainCount;
      const v0 = [P[0] - Q[0], P[1] - Q[1]];
      const endOf = sg => (sg.i === 0 && Math.hypot(sg.a[0] - P[0], sg.a[1] - P[1]) < 1e-6)
        || (sg.i === lines[sg.li].pts.length - 2 && Math.hypot(sg.b[0] - P[0], sg.b[1] - P[1]) < 1e-6);
      const foldsBack = sg => {
        const far = Math.hypot(sg.a[0] - P[0], sg.a[1] - P[1]) < 1e-6 ? sg.b : sg.a;
        return v0[0] * (far[0] - P[0]) + v0[1] * (far[1] - P[1]) < -1e-9;
      };
      let touching = false;
      for (const sg of cand) {
        if ((sg.li === li && sg.i === own) || !segTouch(P, sg.a, sg.b)) continue;
        if (isMain && sg.li >= mainCount && endOf(sg) && foldsBack(sg)) continue;
        touching = true;
        break;
      }
      if (touching) continue;
      const lv = Math.hypot(v0[0], v0[1]), dir = [v0[0] / lv, v0[1] / lv];
      let best = Infinity;
      for (const sg of [...cand, ...ext.map(([a, b]) => ({ a, b, li: -1, i: -1 })), ...edges]) {
        if (sg.li === li && sg.i === own) continue;
        const e = [sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]];
        const den = dir[0] * e[1] - dir[1] * e[0];
        if (Math.abs(den) < 1e-9) continue;
        const w = [sg.a[0] - P[0], sg.a[1] - P[1]];
        const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den;
        if (t > 1e-6 && t <= maxT && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t);
      }
      if (best < Infinity) {
        const to = [P[0] + dir[0] * best, P[1] + dir[1] * best];
        if (end) l.pts[n - 1] = to; else l.pts[0] = to;
        ext.push([P, to]);
      }
    }
  });
  return ext;
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
// grid, or null. Returns { groups: [{ key, name, contours, centre }],
// cols, rows, S, lines (centrelines, for tests), cells, edited }.
export function continuousLayer(L, cfg, seed, insideCell, opts = {}) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k;
  const cols = Math.max(1, Math.floor(L.w / S + 1e-6)), rows = Math.max(1, Math.floor(L.h / S + 1e-6));
  const W = cols * S, H = rows * S, ox = -W / 2, oy = -H / 2;
  const N = cols * rows;
  const kept = Array.from({ length: N }, (_, id) => (insideCell ? insideCell(id % cols, Math.floor(id / cols)) : true));
  const single = cfg.route === 'single';
  const straight = cfg.straight ?? 0.6;
  const route = routeCells(cols, rows, kept, seed, straight, single);

  // A hand edit: switch the turn cell under the point (worked out from the
  // layout as drawn, so it's the cell the person sees).
  let rules = opts.hand?.rules ?? null;
  let edited = null;
  const build = (rulesNow) => layout(cfg, seed, route, rulesNow, { cols, rows, kept, k, S, single, straight });
  let lay = build(rules);
  if (opts.edit?.at) {
    const gx = opts.edit.at[0] - ox, gy = opts.edit.at[1] - oy;
    const i = Math.floor(gx / S), j = Math.floor(gy / S);
    const c = i >= 0 && j >= 0 && i < cols && j < rows ? lay.cells.get(j * cols + i) : null;
    if (c && (c.kind === 'diag' || c.kind === 'corner')) {
      rules = { ...(rules ?? {}), [j * cols + i]: c.kind === 'diag' ? 'corner' : 'diag' };
      edited = { op: 'turn', rules };
      lay = build(rules);
    }
  }

  const { pieces, cells } = lay;
  const main = stitch(pieces);
  const gaps = stitch(gapLines(cfg, seed, cells, k, S, cols).map(g => ({ ...g, group: `g${g.cell}` })));
  meetLines([...main, ...gaps], main.length, W, H, S, p);

  // Group into items: each path, and each cell's gap lines.
  const hw = (L.lineW ?? p * (L.ratio ?? 0.5)) / 2;
  const groups = new Map();
  for (const l of [...main, ...gaps]) {
    const g = groups.get(l.group) ?? { key: l.group, name: String(l.group).startsWith('g') ? 'Gap lines' : 'Path', contours: [], lines: [] };
    const pts = l.pts.map(([x, y]) => [x + ox, y + oy]);
    g.lines.push({ pts, closed: l.closed });
    g.contours.push(...lineOutline(pts, hw, l.closed));
    groups.set(l.group, g);
  }
  const out = [...groups.values()].filter(g => g.contours.length).map(g => {
    const b = contoursBounds(g.contours);
    return { ...g, centre: b ? [b.x + b.w / 2, b.y + b.h / 2] : [0, 0] };
  });
  return { groups: out, cols, rows, S, k, cells, edited };
}

// Every path's pieces, cell by cell, and what each cell is.
function layout(cfg, seed, route, rules, { cols, rows, kept, k, S, single, straight }) {
  const maxLen = (cfg.maxLen ?? 40) >= 200 ? Infinity : Math.max(1, cfg.maxLen ?? 40);
  const paths = single || !Number.isFinite(maxLen)
    ? (route.length ? [route] : [])
    : splitRoute(route, cols, rows, kept, maxLen, straight, mulberry32(hash(seed, 5)));
  // Cells a single route couldn't reach (holes) get paths of their own.
  if (single || !Number.isFinite(maxLen)) {
    const onRoute = new Set(route);
    const extra = splitRoute([], cols, rows, kept.map((v, id) => v && !onRoute.has(id)), Number.isFinite(maxLen) ? maxLen : 8, straight, mulberry32(hash(seed, 6)));
    paths.push(...extra);
  }
  const pieces = [], cells = new Map();
  let nTurn = 0;
  paths.forEach((path, pi) => {
    const L = path.length;
    path.forEach((id, n) => {
      let entry = n > 0 ? sideTo(cols, id, path[n - 1]) : null;
      let exit = n < L - 1 ? sideTo(cols, id, path[n + 1]) : null;
      if (entry == null && exit == null) { entry = freeSide(cols, rows, id, -1, straight, seed); exit = freeSide(cols, rows, id, entry, straight, seed); }
      else if (entry == null) entry = freeSide(cols, rows, id, exit, straight, seed);
      else if (exit == null) exit = freeSide(cols, rows, id, entry, straight, seed);
      const kind = (entry + 2) % 4 === exit ? 'straight' : turnRule(cfg, rules, seed, cols, id, nTurn++);
      const q = (entry + 1) % 4; // quarter turns taking top (3) to `entry`
      const mirror = kind !== 'straight' && (2 + q) % 4 !== exit;
      const place = placer(cols, S, id, q, mirror);
      cells.set(id, { kind, q, mirror, path: pi });
      for (const P of cellLines(kind, k, S)) pieces.push({ cell: id, group: pi, pts: P.map(place) });
    });
  });
  return { pieces, cells };
}
