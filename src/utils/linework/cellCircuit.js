// Linework style B on non-square cells (hexagons, triangles, Voronoi): the
// circuit's bundles routed through a tiling's cells instead of a square
// grid. A bundle of k strands crosses from cell to cell through a shared
// edge — strand s at offset o_s along it — and inside each cell every strand
// bends smoothly from its entry point to its exit point, so the strands stay
// side by side. Ends are hairpins (strand at o joins strand at -o), or butt
// ends where a bundle runs off the layer's edge.
//
// The same walk rules as on the square grid: Straightness prefers the exit
// that carries straight on, Max length, Density, Run off edges, and One
// circuit (a single bundle, steered towards the most reachable free area).
// Cells are sized so a regular edge fits the bundle; shorter edges (common
// in Voronoi) are walls. No over / under crossings, symmetry or masks here.
//
// Returns { bundles: [{ index, single, axes, contours, centre }], k, whole }
// in the layer's local frame, like circuitLayer.

import { add, sub, mul, dot, cross, perp, len, unit, rngAt, shuffle, signedArea } from './geometry';
import { tilingCells, centroid } from './tilings';
import { strandOutlineOf, bandContours } from './circuit';

const EPS = 1e-6;
const SQRT3 = Math.sqrt(3);
const SAMPLES = 10; // points per curve

const keyOf = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;

// Cells and the passages between them (shared edges at least `need` long),
// plus each cell's edges on the layer's border. Slivers the layer edge cuts
// off (under half a typical cell) are left out: a bundle can't turn in them.
function cellGraph(cells, need, w, h) {
  const areas = cells.map(({ P }) => Math.abs(signedArea(P))).sort((a, b) => a - b);
  const typical = areas[Math.floor(areas.length / 2)] ?? 0;
  const nodes = cells.filter(({ P }) => Math.abs(signedArea(P)) >= typical * 0.5)
    .map(({ P }) => ({ P, c: centroid(P), nb: [], border: [] }));
  const byEdge = new Map();
  const onBorder = (a, b) => [[0, w / 2], [0, -w / 2], [1, h / 2], [1, -h / 2]].some(([ax, v]) => Math.abs(a[ax] - v) < 1e-3 && Math.abs(b[ax] - v) < 1e-3);
  nodes.forEach((n, i) => {
    n.P.forEach((a, e) => {
      const b = n.P[(e + 1) % n.P.length];
      const L = len(sub(b, a));
      if (L < need) return;
      if (onBorder(a, b)) { n.border.push({ a, b, m: mul(add(a, b), 0.5), len: L }); return; }
      const k = [keyOf(a), keyOf(b)].sort().join('|');
      const other = byEdge.get(k);
      if (other == null) { byEdge.set(k, { i, a, b, L }); return; }
      const m = mul(add(a, b), 0.5);
      nodes[other.i].nb.push({ to: i, a, b, m, len: L });
      n.nb.push({ to: other.i, a, b, m, len: L });
    });
  });
  return nodes;
}

// Walks: same rules as the square grid's, on the cell graph.
function route(nodes, cfg, r, one) {
  const used = new Uint8Array(nodes.length);
  const maxLen = (cfg.maxLen ?? 40) >= 200 ? Infinity : (cfg.maxLen ?? 40);
  const straight = cfg.straight ?? 0.6;
  const reach = (from, blocked) => {
    const seen = new Set([from]); const stack = [from];
    while (stack.length) {
      const i = stack.pop();
      for (const e of nodes[i].nb) if (e.to !== blocked && !used[e.to] && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
    return seen.size;
  };
  const areaAfter = (i) => {
    let best = 0;
    for (const e of nodes[i].nb) if (!used[e.to]) best = Math.max(best, reach(e.to, i));
    return best + 1;
  };
  // Exits from cell i (entered through `inEdge`, or null), straightest first
  // with probability `straight`, else shuffled.
  const exits = (i, inEdge) => {
    const n = nodes[i];
    const dirIn = inEdge ? unit(sub(n.c, inEdge.m)) : null;
    const opts = n.nb.filter(e => !used[e.to] && e !== inEdge).map(e => ({ e, open: false }));
    if (r() < (cfg.edgeExit ?? 0)) for (const b of n.border) opts.push({ e: b, open: true });
    shuffle(opts, r);
    if (dirIn && r() < straight) {
      const turn = o => -dot(dirIn, unit(sub(o.e.m, n.c)));
      opts.sort((x, y) => turn(x) - turn(y));
    }
    if (one) {
      const score = o => (o.open ? -1 : areaAfter(o.e.to));
      const scored = opts.map(o => [o, score(o)]).sort((x, y) => y[1] - x[1]);
      const live = scored.filter(([, s]) => s > 0);
      return (live.length ? live : scored).map(([o]) => o);
    }
    return opts;
  };
  const walk = (start, firstEdge, forbid) => {
    const steps = []; // { cell, via: edge into it } or { open: edge }
    let i = start, inEdge = firstEdge;
    for (let n = 0; n < maxLen; n++) {
      const opts = exits(i, inEdge).filter(o => o.e !== forbid);
      forbid = null;
      const pick = opts[0];
      if (!pick) break;
      if (pick.open) { steps.push({ open: pick.e }); break; }
      used[pick.e.to] = 1;
      steps.push({ cell: pick.e.to, via: pick.e });
      i = pick.e.to; inEdge = pick.e;
    }
    return steps;
  };

  const order = shuffle(nodes.map((_, i) => i), r);
  if (one) order.sort((a, b) => nodes[a].nb.length - nodes[b].nb.length);
  const bundles = [];
  for (const s of order) {
    if (one && bundles.length) break;
    if (used[s]) continue;
    if (!one && r() > (cfg.density ?? 1)) { used[s] = 1; continue; }
    used[s] = 1;
    const fw = walk(s, null, null);
    const firstOut = fw[0] && (fw[0].via ?? fw[0].open);
    const bw = walk(s, null, firstOut);
    // Path: backward steps reversed, the start, forward steps. Each cell
    // keeps the edges it's entered and left by (null: a hairpin end).
    const path = [];
    const back = bw.filter(st => st.cell != null).reverse();
    const backOpen = bw.find(st => st.open)?.open ?? null;
    back.forEach((st, n) => path.push({ cell: st.cell, inE: n === 0 ? backOpen : null }));
    path.push({ cell: s, inE: back.length ? null : backOpen });
    for (const st of fw) if (st.cell != null) path.push({ cell: st.cell, inE: null });
    const fwOpen = fw.find(st => st.open)?.open ?? null;
    // Edges between consecutive path cells.
    for (let n = 1; n < path.length; n++) {
      const e = nodes[path[n - 1].cell].nb.find(x => x.to === path[n].cell);
      path[n - 1].outE = e; path[n].inE = e;
    }
    path[path.length - 1].outE = fwOpen;
    if (path.length === 1 && !path[0].inE && !path[0].outE) continue; // a lone cell
    bundles.push(path);
  }
  return bundles;
}

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
};

// The strand at offset o through a path, as a polyline. Each passage edge is
// oriented across the direction of travel, so offsets keep their side.
function strandPoints(path, nodes, o, half) {
  const pts = [];
  // A point on an edge at offset o, to the left of travel `dir`.
  const onEdge = (e, dir, off) => {
    const t = unit(sub(e.b, e.a));
    const side = cross(dir, t) > 0 ? 1 : -1;
    return add(e.m, mul(t, side * off));
  };
  for (let n = 0; n < path.length; n++) {
    const { inE, outE } = path[n], c = nodes[path[n].cell].c;
    const dIn = inE ? unit(sub(c, inE.m)) : null;
    const dOut = outE ? unit(sub(outE.m, c)) : null;
    if (inE && outE) {
      const a = onEdge(inE, dIn, o), d = onEdge(outE, dOut, o);
      const k = len(sub(d, a)) * 0.4;
      const nIn = normalInto(inE, c), nOut = normalInto(outE, c);
      const b = add(a, mul(nIn, k)), cc = add(d, mul(nOut, k));
      for (let s = n === 0 ? 0 : 1; s <= SAMPLES; s++) pts.push(cubic(a, b, cc, d, s / SAMPLES));
    } else if (outE) {
      // Path start: from inside the cell out, deep enough for its hairpin.
      const d = onEdge(outE, dOut, o), nOut = normalInto(outE, c);
      pts.push(add(d, mul(nOut, endDepth(outE, c, half))), d);
    } else if (inE) {
      const a = onEdge(inE, dIn, o), nIn = normalInto(inE, c);
      if (n === 0) pts.push(a);
      pts.push(add(a, mul(nIn, endDepth(inE, c, half))));
    }
  }
  return pts;
}

// How far a path end reaches into its cell from edge e: up to the cell's
// centre, less the hairpin's own bulge (up to `half` × 1.33), so the
// hairpin stays inside the cell.
function endDepth(e, c, half) {
  const toCentre = dot(sub(c, e.m), normalInto(e, c));
  return Math.max(0, Math.min(half, toCentre - half * 1.33));
}

// Unit normal of edge e pointing into the cell with centre c.
function normalInto(e, c) {
  const t = unit(sub(e.b, e.a));
  const nn = perp(t);
  return dot(nn, sub(c, e.m)) > 0 ? nn : mul(nn, -1);
}

const toSegs = pts => {
  const segs = [];
  for (let i = 1; i < pts.length; i++) if (len(sub(pts[i], pts[i - 1])) > EPS) segs.push({ t: 'L', a: pts[i - 1], b: pts[i] });
  return segs;
};

// A hairpin closing strand o into strand -o at a path end: a half-loop
// from p (offset o) to q (offset -o), bulging by `depth` along `dir`.
function hairpin(p, q, dir, depth) {
  const b = add(p, mul(dir, depth)), c = add(q, mul(dir, depth));
  const out = [];
  for (let s = 1; s <= SAMPLES; s++) out.push(cubic(p, b, c, q, s / SAMPLES));
  return out;
}

// opts.band: a backing band per bundle, as circuitLayer's.
export function cellCircuitLayer(L, cfg, seed, tiling, regularity, one, opts = {}) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k, w = p * L.ratio;
  const width = k * p;
  // Cell size: a regular cell's edge is a little wider than the bundle.
  const T = tiling === 'triangle' ? width * 1.3 : width * 1.15 * SQRT3;
  const cells = tilingCells(tiling, L.w, L.h, T, { seed, regularity });
  const nodes = cellGraph(cells, width * 1.02, L.w, L.h);
  const r = rngAt(seed, 77);
  const paths = route(nodes, cfg, r, one);
  const offsets = Array.from({ length: k }, (_, s) => (s + 0.5) * p - width / 2);

  const out = [];
  paths.forEach((path, index) => {
    const first = path[0], last = path[path.length - 1];
    const capStart = !first.inE, capEnd = !last.outE;
    // Hairpins bulge on into the end cell (away from the edge it's reached by).
    const endDir = normalInto(last.inE ?? last.outE, nodes[last.cell].c);
    const startDir = normalInto(first.outE ?? first.inE, nodes[first.cell].c);
    const strand = o => strandPoints(path, nodes, o, width / 2);
    const outline = (pts, closed, caps = ['butt', 'butt']) => strandOutlineOf({ segs: toSegs(pts), closed, caps }, w);
    const contours = [];
    for (let s = 0; s < Math.floor(k / 2); s++) {
      const o = offsets[s], depth = Math.abs(o) * 1.33;
      const A = strand(o), B = strand(-o);              // both run start → end
      const Ar = A.slice().reverse(), Br = B.slice().reverse();
      if (capStart && capEnd) {
        const pts = [...A, ...hairpin(A[A.length - 1], Br[0], endDir, depth), ...Br.slice(1),
          ...hairpin(Br[Br.length - 1], A[0], startDir, depth).slice(0, -1)];
        contours.push(...outline([...pts, pts[0]], true));
      } else if (capEnd) {
        contours.push(...outline([...A, ...hairpin(A[A.length - 1], Br[0], endDir, depth), ...Br.slice(1)], false));
      } else if (capStart) {
        contours.push(...outline([...Ar, ...hairpin(Ar[Ar.length - 1], B[0], startDir, depth), ...B.slice(1)], false));
      } else {
        contours.push(...outline(A, false), ...outline(B, false));
      }
    }
    if (k % 2) contours.push(...outline(strand(0), false, [capStart ? 'round' : 'butt', capEnd ? 'round' : 'butt']));
    if (!contours.length) return;
    // Backing band: the centreline as wide as the lines (plus padding).
    const band = opts.band == null ? null
      : bandContours(toSegs(strand(0)), (width - p + w) / 2 + opts.band, [capStart, capEnd], false);
    const cs = path.map(pc => nodes[pc.cell].c);
    out.push({ index, single: false, axes: new Set(), contours, centre: mul(cs.reduce((t, c) => add(t, c), [0, 0]), 1 / cs.length), band });
  });
  return { bundles: out, k, crossings: 0, whole: true };
}
