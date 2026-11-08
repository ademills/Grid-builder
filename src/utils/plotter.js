// Export › Plotter (v1.16): an SVG for pen plotters. Every shape's outline
// is drawn once, as a hairline in its colour's pen:
//   - outlines are split into segments; a segment two shapes share (tiles
//     side by side, a fill and its outline) is kept once, and zero-length
//     ones go
//   - the segments are joined back into runs as long as possible, going
//     straight on where lines cross, and straight runs merged to two points
//   - the runs are ordered to keep pen-up travel short (nearest end next,
//     each run drawn whichever way round is nearer; loops start at their
//     nearest point)
// One group per pen (colour), in the order the colours first appear.
// The background and blurred shapes (shadows) are left out: a plotter
// can't draw a flat fill or a blur.

import { collectShapes } from './svgGeometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Segments → runs ──────────────────────────────────────────────────────────

// polys: [{ pts, closed }] for one pen → runs [{ pts, closed }].
export function joinRuns(polys, q) {
  const nodes = new Map(); // "ix,iy" → id
  const pos = [];
  const nodeAt = ([x, y]) => {
    const k = `${Math.round(x / q)},${Math.round(y / q)}`;
    let id = nodes.get(k);
    if (id == null) { id = pos.length; nodes.set(k, id); pos.push([x, y]); }
    return id;
  };
  const edges = []; // [a, b]
  const seen = new Set();
  for (const { pts, closed } of polys) {
    const ids = pts.map(nodeAt);
    if (closed) ids.push(ids[0]);
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1], b = ids[i];
      if (a === b) continue; // zero length (at the plotter's resolution)
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(k)) continue; // drawn already: a shared edge
      seen.add(k);
      edges.push([a, b]);
    }
  }
  const adj = pos.map(() => []);
  edges.forEach(([a, b], e) => { adj[a].push(e); adj[b].push(e); });
  const used = new Uint8Array(edges.length);
  const free = (n) => adj[n].some(e => !used[e]);

  // From node n, follow unused edges, going as straight on as possible.
  const walk = (n) => {
    const ids = [n];
    let prev = null;
    for (;;) {
      let best = -1, bestTurn = Infinity;
      for (const e of adj[n]) {
        if (used[e]) continue;
        const m = edges[e][0] === n ? edges[e][1] : edges[e][0];
        let turn = 0;
        if (prev != null) {
          const ax = pos[n][0] - pos[prev][0], ay = pos[n][1] - pos[prev][1];
          const bx = pos[m][0] - pos[n][0], by = pos[m][1] - pos[n][1];
          turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
        }
        if (turn < bestTurn) { bestTurn = turn; best = e; }
      }
      if (best < 0) break;
      used[best] = 1;
      prev = n;
      n = edges[best][0] === n ? edges[best][1] : edges[best][0];
      ids.push(n);
    }
    return ids;
  };

  const runs = [];
  // Odd nodes are where runs must start or end; walk from those first.
  const order = [...adj.keys()].sort((a, b) => (adj[b].length % 2) - (adj[a].length % 2));
  for (const n of order) {
    while (free(n)) {
      const ids = walk(n);
      if (ids.length < 2) break;
      const closed = ids.length > 2 && ids[0] === ids[ids.length - 1];
      if (closed) ids.pop();
      runs.push({ pts: straighten(ids.map(i => pos[i]), closed, q), closed });
    }
  }
  return runs;
}

// Drops points in the middle of straight runs.
function straighten(pts, closed, q) {
  if (pts.length < 3) return pts;
  const keep = (a, b, c) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], bcx = c[0] - b[0], bcy = c[1] - b[1];
    const cross = Math.abs(abx * bcy - aby * bcx);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    return cross > q * 0.5 * len || abx * bcx + aby * bcy < 0;
  };
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (keep(out[out.length - 1], pts[i], pts[i + 1])) out.push(pts[i]);
  out.push(pts[pts.length - 1]);
  if (closed && out.length > 3 && !keep(out[out.length - 1], out[0], out[1])) out.shift();
  return out;
}

// ── Ordering ─────────────────────────────────────────────────────────────────

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Pen-up distance to draw runs in order from `from`.
export function travel(runs, from = [0, 0]) {
  let d = 0, at = from;
  for (const r of runs) {
    d += dist(at, r.pts[0]);
    at = r.closed ? r.pts[0] : r.pts[r.pts.length - 1];
  }
  return d;
}

// Nearest-neighbour order over a bucket grid of the places a run can start
// (both ends of an open run, every point of a loop).
export function orderRuns(runs, from = [0, 0]) {
  if (runs.length < 2) return runs.map(r => ({ ...r }));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of runs) for (const [x, y] of r.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const size = Math.max(x1 - x0, y1 - y0, 1e-9) / Math.max(8, Math.min(256, Math.round(Math.sqrt(runs.length) * 2)));
  const cell = (x, y) => [Math.floor((x - x0) / size), Math.floor((y - y0) / size)];
  const buckets = new Map();
  const add = (x, y, entry) => {
    const [i, j] = cell(x, y);
    const k = `${i},${j}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(entry);
  };
  runs.forEach((r, ri) => {
    if (r.closed) r.pts.forEach((p, pi) => add(p[0], p[1], { ri, pi }));
    else { add(...r.pts[0], { ri, pi: 0 }); add(...r.pts[r.pts.length - 1], { ri, pi: r.pts.length - 1 }); }
  });
  const done = new Uint8Array(runs.length);
  const span = Math.ceil(Math.max(x1 - x0, y1 - y0) / size) + 2;
  const nearest = (p) => {
    const [ci, cj] = cell(p[0], p[1]);
    let best = null, bestD = Infinity;
    for (let ring = 0; ring <= span; ring++) {
      // Nothing nearer can be further out than this ring.
      if (best && (ring - 1) * size > bestD) break;
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
          const list = buckets.get(`${i},${j}`);
          if (!list) continue;
          for (let n = list.length - 1; n >= 0; n--) {
            const e = list[n];
            if (done[e.ri]) { list.splice(n, 1); continue; }
            const d = dist(p, runs[e.ri].pts[e.pi]);
            if (d < bestD) { bestD = d; best = e; }
          }
        }
      }
    }
    return best;
  };
  const out = [];
  let at = from;
  for (let n = 0; n < runs.length; n++) {
    const e = nearest(at);
    if (!e) break;
    done[e.ri] = 1;
    const r = runs[e.ri];
    let pts;
    if (r.closed) pts = [...r.pts.slice(e.pi), ...r.pts.slice(0, e.pi)];
    else pts = e.pi === 0 ? r.pts : [...r.pts].reverse();
    out.push({ pts, closed: r.closed });
    at = r.closed ? pts[0] : pts[pts.length - 1];
  }
  return out;
}

// ── The plotter SVG ──────────────────────────────────────────────────────────

const fmt = (v, precision) => {
  const f = 10 ** precision;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? '0' : String(r);
};
const runD = ({ pts, closed }, p) => `M${pts.map(([x, y]) => `${fmt(x, p)} ${fmt(y, p)}`).join('L')}${closed ? 'Z' : ''}`;

/**
 * svgEl — a tidied export (tidySvg); left unchanged.
 * options = { penWidth (user units), precision, colourName(hex) → name|null, title }
 * → { svg: a new <svg>, stats: { pens, runs, before, after } } (travel in user units)
 */
export function plotterSvg(svgEl, { penWidth = 1, precision = 2, colourName = () => null, title = null } = {}) {
  const doc = svgEl.ownerDocument;
  const vb = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const extent = vb.length === 4 ? Math.max(vb[2], vb[3]) : 1000;
  const q = Math.max(10 ** -precision, extent * 2e-5); // points this close are one
  const shapes = collectShapes(svgEl, { tol: extent * 2e-4 });

  const pens = new Map(); // hex → polys
  for (const s of shapes) {
    if (s.inBackground || s.filtered || s.opacity <= 0 || !s.polys.length) continue;
    const hex = s.stroke ?? s.fill;
    if (!hex) continue;
    if (!pens.has(hex)) pens.set(hex, []);
    pens.get(hex).push(...s.polys);
  }
  // Before: each pen's outlines as they were drawn, one pen after another.
  let before = 0, from = [0, 0];
  for (const polys of pens.values()) {
    before += travel(polys, from);
    const last = polys[polys.length - 1];
    if (!last) continue;
    from = last.closed ? last.pts[0] : last.pts[last.pts.length - 1];
  }

  const out = doc.createElementNS(SVG_NS, 'svg');
  out.setAttribute('xmlns', SVG_NS);
  for (const a of ['width', 'height', 'viewBox']) if (svgEl.getAttribute(a)) out.setAttribute(a, svgEl.getAttribute(a));
  if (title) {
    const t = doc.createElementNS(SVG_NS, 'title');
    t.textContent = title;
    out.appendChild(t);
  }
  let after = 0, count = 0, at = [0, 0];
  let n = 0;
  for (const [hex, polys] of pens) {
    const runs = orderRuns(joinRuns(polys, q), at);
    if (!runs.length) continue;
    after += travel(runs, at);
    const last = runs[runs.length - 1];
    at = last.closed ? last.pts[0] : last.pts[last.pts.length - 1];
    count += runs.length;
    const name = `Pen ${++n} ${colourName(hex) ? `${colourName(hex)} ` : ''}${hex}`;
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', `pen_${n}_${hex.slice(1)}`);
    g.setAttribute('data-name', name);
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', hex);
    g.setAttribute('stroke-width', fmt(penWidth, 4));
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    for (const r of runs) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', runD(r, precision));
      g.appendChild(path);
    }
    out.appendChild(g);
  }
  return { svg: out, stats: { pens: n, runs: count, before, after } };
}
