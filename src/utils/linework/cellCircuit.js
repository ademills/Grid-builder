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
// in Voronoi) are walls. Also as on the square grid:
//   - Over / under: a bundle may cross a cell another runs straight through,
//     running straight through it too; the lower one's strands are cut back
//     so a line gap shows either side of the upper one. (Triangles have no
//     straight way through, so they never cross.)
//   - Mirror symmetry: only the domain's cells are routed (the left and/or
//     top half). A bundle may end on a mirror axis — through a cell edge on
//     the axis, or at the axis line inside a cell the axis runs through —
//     and replicateBundles joins it to its mirror image there.
//   - Region masks: bundles route inside the mask first, then outside.
//   - Single-cell eyes: a lone cell gets concentric rings.
//   - Fill every cell (One circuit): fillCircuit, a route round a random
//     spanning tree of the cells.
//
// Returns { bundles: [{ index, single, axes, contours, centre, band }], k,
// whole } in the layer's local frame, like circuitLayer.

import {
  add, sub, mul, dot, cross, perp, len, unit, rngAt, shuffle, signedArea, polyContour, SYM_OPS, SYM_DOMAIN,
} from './geometry';
import { tilingCells, centroid } from './tilings';
import { strandOutlineOf, bandContours, discPoly } from './circuit';

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
    .map(({ P }) => ({ P, c: centroid(P), nb: [], border: [], joins: [], role: 'domain' }));
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

// Mirror symmetry: which cells are routed. Domain cells are; a cell the axis
// runs through ('axis') can only be run into and ended in; the rest are the
// mirror image's. A passage from a domain cell to its mirror image (an edge
// on the axis) becomes a join, where a bundle may end on the axis.
function markSymmetry(nodes, sym, T) {
  const mx = sym === 'mirror-x' || sym === 'mirror-both', my = sym === 'mirror-y' || sym === 'mirror-both';
  if (!mx && !my) return;
  const tol = T * 1e-3;
  const side = (v, on) => (on ? (Math.abs(v) < tol ? 'axis' : v < 0 ? 'in' : 'out') : 'in');
  for (const n of nodes) {
    const sx = side(n.c[0], mx), sy = side(n.c[1], my);
    if (sx === 'out' || sy === 'out' || (sx === 'axis' && sy === 'axis')) n.role = 'mirror';
    else if (sx === 'axis' || sy === 'axis') {
      n.role = 'axis';
      n.axis = sx === 'axis' ? 'x' : 'y';
      // Where a bundle ends inside it: the axis line through the cell, its
      // normal pointing back into the domain.
      const along = n.axis === 'x' ? [0, 1] : [1, 0], back = n.axis === 'x' ? [-1, 0] : [0, -1];
      n.axisEdge = { a: sub(n.c, mul(along, T)), b: add(n.c, mul(along, T)), m: n.c, n: back, len: 2 * T, axis: n.axis };
    }
  }
  const onAxis = (p, ax) => Math.abs(p[ax === 'x' ? 0 : 1]) < tol;
  for (const n of nodes) {
    if (n.role !== 'domain') continue;
    n.nb = n.nb.filter(e => {
      const to = nodes[e.to];
      if (to.role === 'domain' || to.role === 'axis') return true;
      for (const ax of [mx && 'x', my && 'y'].filter(Boolean)) {
        if (onAxis(e.a, ax) && onAxis(e.b, ax)) n.joins.push({ ...e, axis: ax, to: undefined });
      }
      return false;
    });
  }
}

// Unit normal of edge e pointing into the cell with centre c.
function normalInto(e, c) {
  if (e.n) return e.n;
  const t = unit(sub(e.b, e.a));
  const nn = perp(t);
  return dot(nn, sub(c, e.m)) > 0 ? nn : mul(nn, -1);
}

const straightThrough = (eIn, eOut, c) => dot(normalInto(eIn, c), mul(normalInto(eOut, c), -1)) > 0.85;

// The walker on the cell graph: the same rules as the square grid's. Keeps
// which cells are used, each cell's passage and the crossings it makes.
// router.allowed: the cells the current pass may use; router.start(s, b)
// walks a new bundle b both ways from the free cell s.
function cellRouter(nodes, cfg, r, one) {
  const used = new Uint8Array(nodes.length);
  nodes.forEach((n, i) => { if (n.role === 'mirror') used[i] = 1; });
  const passOf = new Map();       // cell → { b, inE, outE } once a bundle has left it
  const crossed = new Set();      // cells with a crossing
  const crossings = [];           // { cell, under, overB, over: [p0, p1] }
  const maxLen = (cfg.maxLen ?? 40) >= 200 ? Infinity : (cfg.maxLen ?? 40);
  const straight = cfg.straight ?? 0.6;
  const weave = cfg.weave ?? 'off';
  const router = { used, crossings, allowed: () => true };
  const free = i => !used[i] && router.allowed(i);
  const reach = (from, blocked) => {
    const seen = new Set([from]); const stack = [from];
    while (stack.length) {
      const i = stack.pop();
      for (const e of nodes[i].nb) if (e.to !== blocked && nodes[e.to].role === 'domain' && free(e.to) && !seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
    return seen.size;
  };
  const areaAfter = (i) => {
    let best = 0;
    for (const e of nodes[i].nb) if (nodes[e.to].role === 'domain' && free(e.to)) best = Math.max(best, reach(e.to, i));
    return best + 1;
  };
  // A crossing over (or under) the bundle already in cell j, entered by e:
  // both run straight through, by different edges, and the cell beyond is
  // free. Crossings never sit side by side (their cut-backs would meet).
  const crossing = (e) => {
    const j = e.to, o = passOf.get(j), cj = nodes[j].c;
    if (weave === 'off' || !o || !o.inE || !o.outE || crossed.has(j) || !straightThrough(o.inE, o.outE, cj)) return null;
    if (nodes[j].nb.some(x => crossed.has(x.to))) return null;
    const back = nodes[j].nb.find(x => keyOf(x.m) === keyOf(e.m));
    if (!back || keyOf(back.m) === keyOf(o.inE.m) || keyOf(back.m) === keyOf(o.outE.m)) return null;
    const taken = new Set([keyOf(o.inE.m), keyOf(o.outE.m), keyOf(back.m)]);
    const ahead = nodes[j].nb
      .filter(x => !taken.has(keyOf(x.m)) && straightThrough(back, x, cj))
      .sort((x, y) => dot(normalInto(x, cj), normalInto(back, cj)) - dot(normalInto(y, cj), normalInto(back, cj)))[0];
    if (!ahead || nodes[ahead.to].role !== 'domain' || !free(ahead.to)) return null;
    return { j, back, ahead, under: o };
  };
  // Exits from cell i (entered through `inEdge`, or null), straightest first
  // with probability `straight`, else shuffled.
  const exits = (i, inEdge) => {
    const n = nodes[i];
    const dirIn = inEdge ? unit(sub(n.c, inEdge.m)) : null;
    const opts = [];
    for (const e of n.nb) {
      if (inEdge && keyOf(e.m) === keyOf(inEdge.m)) continue;
      if (free(e.to)) opts.push({ e, kind: nodes[e.to].role === 'axis' ? 'half' : 'step' });
      else if (nodes[e.to].role === 'domain') { const x = crossing(e); if (x) opts.push({ e, kind: 'cross', x }); }
    }
    for (const e of n.joins) opts.push({ e, kind: 'open', axis: e.axis });
    if (r() < (cfg.edgeExit ?? 0)) for (const b of n.border) opts.push({ e: b, kind: 'open' });
    shuffle(opts, r);
    if (dirIn && r() < straight) {
      const turn = o => -dot(dirIn, unit(sub(o.e.m, n.c)));
      opts.sort((x, y) => turn(x) - turn(y));
    }
    if (one) {
      // Most reachable area first; ends (off an edge, onto an axis) only when stuck.
      const score = o => (o.kind === 'step' ? areaAfter(o.e.to) : o.kind === 'cross' ? areaAfter(o.x.ahead.to) - 0.5 : -1);
      const scored = opts.map(o => [o, score(o)]).sort((x, y) => y[1] - x[1]);
      const live = scored.filter(([, s]) => s > 0);
      return (live.length ? live : scored).map(([o]) => o);
    }
    return opts;
  };
  let crossN = 0;
  const walk = (start, b, forbid) => {
    const steps = []; // { cell, via } | { open: edge, axis? } | { half: cell, via, axis }
    let i = start, inEdge = null;
    for (let n = 0; n < maxLen; n++) {
      const opts = exits(i, inEdge).filter(o => o.e !== forbid);
      forbid = null;
      // Prefer weaving over a neighbour when a crossing is on offer.
      const pick = opts.find(o => o.kind === 'cross' && r() < (one ? 0.25 : 0.75)) || opts[0];
      if (!pick) break;
      passOf.set(i, { b, inE: inEdge, outE: pick.e }); // leaving cell i: its passage is final
      if (pick.kind === 'open') { steps.push({ open: pick.e, axis: pick.axis }); break; }
      if (pick.kind === 'half') {
        used[pick.e.to] = 1;
        steps.push({ half: pick.e.to, via: pick.e, axis: nodes[pick.e.to].axis });
        break;
      }
      if (pick.kind === 'cross') {
        const { j, back, ahead, under } = pick.x;
        const walkerTop = weave === 'random' ? r() < 0.5 : crossN++ % 2 === 0;
        crossings.push({
          cell: j,
          under: walkerTop ? under.b : b,
          overB: walkerTop ? b : under.b,
          over: walkerTop ? [back.m, ahead.m] : [under.inE.m, under.outE.m],
        });
        crossed.add(j);
        used[ahead.to] = 1;
        steps.push({ cell: j, via: pick.e }, { cell: ahead.to, via: ahead });
        i = ahead.to; inEdge = ahead;
        continue;
      }
      used[pick.e.to] = 1;
      steps.push({ cell: pick.e.to, via: pick.e });
      i = pick.e.to; inEdge = pick.e;
    }
    return steps;
  };

  // A lone cell is an eye when eyes are on, else left empty (null).
  router.start = (s, b) => {
    used[s] = 1;
    const fw = walk(s, b, null);
    const firstOut = fw[0] && (fw[0].via ?? fw[0].open);
    const bw = walk(s, b, firstOut);
    const path = assemble(nodes, s, fw, bw);
    if (path.length === 1 && !path[0].inE && !path[0].outE) {
      return cfg.eyes ? { index: b, path, eye: true, axes: new Set() } : null;
    }
    return { index: b, path, axes: new Set([...fw, ...bw].map(st => st.axis).filter(Boolean)) };
  };
  // Marks a route's bundles (as from pathsOf) taken, to grow one beside them.
  router.place = (bundles, crossingCells) => {
    for (const B of bundles) {
      for (const pc of B.path) {
        used[pc.cell] = 1;
        if (!passOf.has(pc.cell)) passOf.set(pc.cell, { b: B.index, inE: pc.inE, outE: pc.outE });
      }
    }
    for (const c of crossingCells) crossed.add(c);
  };
  router.free = free;
  return router;
}

// Walks a layer's bundles from the seed. passes: the cells each pass may
// use, in turn (a mask's inside, then its outside).
function routeCells(nodes, cfg, r, one, passes) {
  const router = cellRouter(nodes, cfg, r, one);
  const bundles = [];
  for (const pass of passes) {
    router.allowed = pass;
    const order = shuffle(nodes.map((_, i) => i).filter(i => nodes[i].role === 'domain'), r);
    if (one) order.sort((a, b) => nodes[a].nb.length - nodes[b].nb.length);
    for (const s of order) {
      if (one && bundles.length) break;
      if (!router.free(s)) continue;
      if (!one && r() > (cfg.density ?? 1)) { router.used[s] = 1; continue; }
      const B = router.start(s, bundles.length);
      if (B) bundles.push(B);
    }
  }
  return { bundles, crossings: router.crossings };
}

// A route as plain data (a hand-built layer keeps it in its settings):
//   { bundles: [{ index, cells, s, e, axes, eye? }],
//     crossings: [[cell, under, over, x0, y0, x1, y1], ...] }
// cells are node indices in order; s / e how the path starts and ends:
// null (a hairpin), 'x' (on the mirror axis inside its end cell), 'j<n>' /
// 'b<n>' (through the end cell's nth join or border edge). A crossing has
// the bundle under and over it and the upper bundle's line through the
// cell. Fill every cell is { bundles: [{ index: 0, fill: true }] }.
function endRef(node, e) {
  if (!e) return null;
  if (e === node.axisEdge) return 'x';
  const j = node.joins.indexOf(e);
  return j >= 0 ? `j${j}` : `b${node.border.indexOf(e)}`;
}
function endEdge(node, ref) {
  if (ref == null) return null;
  if (ref === 'x') return node.axisEdge;
  return (ref[0] === 'j' ? node.joins : node.border)[Number(ref.slice(1))] ?? null;
}
const bundleData = (nodes, B) => {
  const { path } = B, last = path[path.length - 1];
  const out = {
    index: B.index, cells: path.map(pc => pc.cell),
    s: endRef(nodes[path[0].cell], path[0].inE), e: endRef(nodes[last.cell], last.outE), axes: [...B.axes],
  };
  if (B.eye) out.eye = true;
  return out;
};
const crossingData = X => [X.cell, X.under, X.overB, ...X.over[0], ...X.over[1]];

// The data's bundles as paths again (each cell with the edges it's entered
// and left by), as assemble builds them.
function pathsOf(nodes, route) {
  return route.bundles.filter(b => !b.fill).map(b => {
    const path = b.cells.map(cell => ({ cell, inE: null, outE: null }));
    for (let n = 1; n < path.length; n++) {
      const e = nodes[path[n - 1].cell].nb.find(x => x.to === path[n].cell);
      path[n - 1].outE = e; path[n].inE = e;
    }
    path[0].inE = endEdge(nodes[path[0].cell], b.s) ?? path[0].inE;
    const last = path[path.length - 1];
    last.outE = endEdge(nodes[last.cell], b.e) ?? last.outE;
    return { index: b.index, path, eye: !!b.eye, axes: new Set(b.axes) };
  });
}

const withoutBundles = (route, gone) => ({
  bundles: route.bundles.filter(b => !gone.has(b.index)),
  crossings: route.crossings.filter(([, under, over]) => !gone.has(under) && !gone.has(over)),
});

// A hand edit, as editSquare's: edit.remove (bundle indices) or edit.at (a
// point in the layer's frame: the bundle in that cell is taken out, or a
// new one grown from it when it's empty).
function editCells(nodes, cfg, route, edit, one, sym) {
  if (edit.remove) {
    if (!route.bundles.some(b => edit.remove.has(b.index))) return null;
    return { op: 'remove', route: withoutBundles(route, edit.remove) };
  }
  let [x, y] = edit.at;
  if (sym === 'mirror-x' || sym === 'mirror-both') x = -Math.abs(x) - 1e-6;
  if (sym === 'mirror-y' || sym === 'mirror-both') y = -Math.abs(y) - 1e-6;
  let at = nodes.findIndex(n => n.role !== 'mirror' && insidePoly(n.P, [x, y]));
  if (at < 0) return null;
  const filled = route.bundles.find(b => b.fill);
  if (filled) return { op: 'remove', route: withoutBundles(route, new Set([filled.index])) };
  const owners = route.bundles.filter(b => b.cells.includes(at));
  if (owners.length) {
    // At a crossing, the bundle on top.
    const X = route.crossings.find(([cell]) => cell === at);
    const target = (X && owners.find(b => b.index === X[2])) || owners[0];
    return { op: 'remove', route: withoutBundles(route, new Set([target.index])) };
  }
  const router = cellRouter(nodes, cfg, edit.rng, one);
  router.place(pathsOf(nodes, route), route.crossings.map(([cell]) => cell));
  // Bundles only end in a cell on a mirror axis: start beside it instead.
  if (nodes[at].role === 'axis') at = nodes[at].nb.find(e => nodes[e.to].role === 'domain' && router.free(e.to))?.to ?? -1;
  if (at < 0 || !router.free(at)) return null;
  const index = route.bundles.reduce((m, b) => Math.max(m, b.index + 1), 0);
  const B = router.start(at, index);
  if (!B) return null;
  return {
    op: 'grow',
    route: { bundles: [...route.bundles, bundleData(nodes, B)], crossings: [...route.crossings, ...router.crossings.map(crossingData)] },
  };
}

// Path: the backward steps reversed, the start, the forward steps. Each cell
// keeps the edges it's entered and left by (null: a hairpin end).
function assemble(nodes, s, fw, bw) {
  const endOf = steps => {
    const last = steps[steps.length - 1];
    if (last?.open) return { edge: last.open };
    if (last?.half != null) return { half: last.half };
    return null;
  };
  const cellsOf = steps => steps.filter(st => st.cell != null).map(st => st.cell);
  const startEnd = endOf(bw), finish = endOf(fw);
  const cells = [...cellsOf(bw).reverse(), s, ...cellsOf(fw)];
  if (startEnd?.half != null) cells.unshift(startEnd.half);
  if (finish?.half != null) cells.push(finish.half);
  const path = cells.map(cell => ({ cell, inE: null, outE: null }));
  for (let n = 1; n < path.length; n++) {
    const e = nodes[path[n - 1].cell].nb.find(x => x.to === path[n].cell);
    path[n - 1].outE = e; path[n].inE = e;
  }
  // The axis line inside a half cell, and edges a bundle ends on.
  if (startEnd?.half != null) path[0].inE = nodes[startEnd.half].axisEdge;
  else if (startEnd?.edge) path[0].inE = startEnd.edge;
  if (finish?.half != null) path[path.length - 1].outE = nodes[finish.half].axisEdge;
  else if (finish?.edge) path[path.length - 1].outE = finish.edge;
  return path;
}

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
};

// A point on edge e at offset `off`, to the left of travel `dir`.
const onEdge = (e, dir, off) => {
  const t = unit(sub(e.b, e.a));
  const side = cross(dir, t) > 0 ? 1 : -1;
  return add(e.m, mul(t, side * off));
};

// A curve through a cell from point a (entering across edge eIn) to point d
// (leaving across eOut), leaving and arriving square to each edge.
function bend(a, eIn, d, eOut, c, push = 0) {
  const k = Math.max(len(sub(d, a)) * 0.4, push);
  const b = add(a, mul(normalInto(eIn, c), k)), cc = add(d, mul(normalInto(eOut, c), k));
  return Array.from({ length: SAMPLES + 1 }, (_, s) => cubic(a, b, cc, d, s / SAMPLES));
}

// Strands that end on a mirror axis run a hair past it, so they overlap
// their mirror image instead of leaving a seam.
const AXIS_OVERLAP = 0.75;
const onAxisEdge = e => !!(e && (e.n || e.axis));

// The strand at offset o through a path, as a polyline. Each passage edge is
// oriented across the direction of travel, so offsets keep their side. An
// axis edge's points are where the strand meets the axis, square on.
function strandPoints(path, nodes, o, half) {
  const pts = [];
  for (let n = 0; n < path.length; n++) {
    const { inE, outE } = path[n], c = nodes[path[n].cell].c;
    if (inE && outE) {
      const a = onEdge(inE, normalInto(inE, c), o), d = onEdge(outE, mul(normalInto(outE, c), -1), o);
      if (n === 0 && onAxisEdge(inE)) pts.push(sub(a, mul(normalInto(inE, c), AXIS_OVERLAP)));
      pts.push(...bend(a, inE, d, outE, c).slice(n === 0 ? 0 : 1));
      if (n === path.length - 1 && onAxisEdge(outE)) pts.push(sub(d, mul(normalInto(outE, c), AXIS_OVERLAP)));
    } else if (outE) {
      // Path start: from inside the cell out, deep enough for its hairpin.
      const nOut = normalInto(outE, c), d = onEdge(outE, mul(nOut, -1), o);
      pts.push(add(d, mul(nOut, endDepth(outE, c, half))), d);
    } else if (inE) {
      const nIn = normalInto(inE, c), a = onEdge(inE, nIn, o);
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

// A hairpin closing strand o into strand -o at a path end: a half-loop
// from p (offset o) to q (offset -o), bulging by `depth` along `dir`.
function hairpin(p, q, dir, depth) {
  const b = add(p, mul(dir, depth)), c = add(q, mul(dir, depth));
  const out = [];
  for (let s = 1; s <= SAMPLES; s++) out.push(cubic(p, b, c, q, s / SAMPLES));
  return out;
}

const toSegs = pts => {
  const segs = [];
  for (let i = 1; i < pts.length; i++) if (len(sub(pts[i], pts[i - 1])) > EPS) segs.push({ t: 'L', a: pts[i - 1], b: pts[i] });
  return segs;
};
const dedupe = pts => pts.filter((q, i) => i === 0 || len(sub(q, pts[i - 1])) > EPS);

const insidePoly = (P, [x, y]) => {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Cuts a strand polyline where it passes under another bundle: points within
// `half` of a cut's line, inside its cell, are removed, with the cut ends
// placed on the boundary. Only where the strand runs across the line: a
// passage along it is the upper bundle itself (a bundle may cross its own
// path). Returns the pieces ({ pts, closed, cut }).
function cutPoints(pts, closed, cuts) {
  if (!cuts.length) return [{ pts, closed, cut: false }];
  const dist = (q, cut) => cross(unit(sub(cut.line[1], cut.line[0])), sub(q, cut.line[0]));
  let ring = pts;
  const across = (i, cut) => {
    const a = ring[Math.max(0, i - 1)], b = ring[Math.min(ring.length - 1, i + 1)];
    return len(sub(b, a)) < EPS || Math.abs(dot(unit(sub(b, a)), unit(sub(cut.line[1], cut.line[0])))) < 0.7;
  };
  const hitAt = (q, i) => cuts.find(cut => Math.abs(dist(q, cut)) < cut.half && insidePoly(cut.cell, q) && across(i, cut));
  const hit = q => cuts.find(cut => Math.abs(dist(q, cut)) < cut.half && insidePoly(cut.cell, q));
  if (closed) {
    const k = pts.findIndex(q => !hit(q));
    if (k < 0) return [];
    ring = [...pts.slice(k), ...pts.slice(0, k), pts[k]];
  }
  if (!ring.some((q, i) => hitAt(q, i))) return [{ pts, closed, cut: false }];
  // Where segment a (inside the cut) → b (outside) leaves it.
  const leave = (a, b, cut) => {
    const da = Math.abs(dist(a, cut)), db = Math.abs(dist(b, cut));
    const t = db === da ? 0 : Math.min(1, Math.max(0, (cut.half - da) / (db - da)));
    return add(a, mul(sub(b, a), t));
  };
  const pieces = [];
  let cur = [];
  for (let i = 0; i < ring.length; i++) {
    const q = ring[i], h = hitAt(q, i);
    if (!h) {
      const prev = i > 0 && hitAt(ring[i - 1], i - 1);
      if (!cur.length && prev) cur.push(leave(ring[i - 1], q, prev));
      cur.push(q);
    } else if (cur.length) {
      cur.push(leave(q, ring[i - 1], h));
      pieces.push({ pts: cur, closed: false, cut: true });
      cur = [];
    }
  }
  if (cur.length > 1) pieces.push({ pts: cur, closed: false, cut: true });
  return pieces;
}

// A bundle's strand count, pitch and width for layer L.
function bundleSize(L, cfg) {
  const S = Math.max(1, cfg.bundle ?? 1) * L.C;
  const k = Math.max(1, Math.round(S / L.p));
  const p = S / k;
  return { k, p, width: k * p };
}

// Cell size: a regular cell's edge is a little wider than the bundle.
export function cellCircuitSize(L, cfg, tiling) {
  const { width } = bundleSize(L, cfg);
  return tiling === 'triangle' ? width * 1.3 : width * 1.15 * SQRT3;
}

// opts.band: a backing band per bundle, as circuitLayer's. opts.sym:
// 'none' | 'mirror-x' | 'mirror-y' | 'mirror-both'. opts.inside(x, y): a
// region mask, or null; opts.maskOutside: 'fill' (route outside it after)
// or 'empty'. opts.hand / opts.edit, and the `route` and `edited` returned:
// a hand-built route, as circuitLayer's (see bundleData).
export function cellCircuitLayer(L, cfg, seed, tiling, regularity, one, opts = {}) {
  const { k, p, width } = bundleSize(L, cfg);
  const w = p * L.ratio;
  const T = cellCircuitSize(L, cfg, tiling);
  const sym = opts.sym ?? 'none';
  const symOpts = sym === 'none' ? {} : { ops: SYM_OPS[sym], planes: SYM_DOMAIN[sym] };
  const cells = tilingCells(tiling, L.w, L.h, T, { seed, regularity, ...symOpts });
  // Fill every cell marks the graph as it goes, so it gets one of its own.
  const graph = () => {
    const g = cellGraph(cells, width * 1.02, L.w, L.h);
    markSymmetry(g, sym, T);
    return g;
  };
  const nodes = graph();
  const offsets = Array.from({ length: k }, (_, s) => (s + 0.5) * p - width / 2);
  const outline = (pts, closed, caps = ['butt', 'butt']) => strandOutlineOf({ segs: toSegs(pts), closed, caps }, w);
  const whole = sym === 'none';
  const bandHalf = opts.band == null ? null : (width - p + w) / 2 + opts.band;
  const fillNow = () => fillCircuit(graph(), cfg, rngAt(seed, 77), { k, p, outline, bandHalf, loop: !!cfg.loop });

  let route = opts.hand;
  let filled = null;
  if (!route) {
    const r = rngAt(seed, 77);
    if (one && cfg.fill) filled = fillCircuit(nodes, cfg, r, { k, p, outline, bandHalf, loop: !!cfg.loop });
    if (filled) {
      route = { bundles: [{ index: 0, fill: true }], crossings: [] };
    } else {
      const inside = opts.inside ? (i) => opts.inside(nodes[i].c[0], nodes[i].c[1]) : null;
      const passes = inside
        ? [inside, ...(opts.maskOutside === 'empty' ? [] : [i => !inside(i)])]
        : [() => true];
      const routed = routeCells(nodes, cfg, r, one, passes);
      route = { bundles: routed.bundles.map(B => bundleData(nodes, B)), crossings: routed.crossings.map(crossingData) };
    }
  }
  let edited = null;
  if (opts.edit) {
    edited = editCells(graph(), cfg, route, opts.edit, one, sym);
    if (edited) route = edited.route;
  }
  if (route.bundles.some(b => b.fill)) {
    filled ??= fillNow();
    if (filled) return { bundles: [filled], k, crossings: 0, whole, route, edited };
  }

  const paths = pathsOf(nodes, route);
  const present = new Set(paths.map(b => b.index));
  const crossings = route.crossings
    .filter(([, under, over]) => present.has(under) && present.has(over))
    .map(([cell, under, , x0, y0, x1, y1]) => ({ cell, under, over: [[x0, y0], [x1, y1]] }));

  // Cut-backs: the margin leaves a gap of one line gap between the cut ends
  // and the upper bundle's outer strands.
  const cutHalf = width / 2 + (p - w) / 2;
  const cutsFor = new Map();
  for (const X of crossings) {
    if (!cutsFor.has(X.under)) cutsFor.set(X.under, []);
    cutsFor.get(X.under).push({ line: X.over, half: cutHalf, cell: nodes[X.cell].P });
  }

  const out = [];
  paths.forEach(({ index, path, eye, axes }) => {
    if (eye) {
      const c = nodes[path[0].cell].c;
      const contours = eyeContours(c, offsets, w, nodes[path[0].cell].P, outline);
      if (!contours) return;
      const band = bandHalf == null ? null : [polyContour(discPoly(c, bandHalf))];
      out.push({ index, single: true, axes, contours, centre: c, band });
      return;
    }
    const first = path[0], last = path[path.length - 1];
    const capStart = !first.inE, capEnd = !last.outE;
    // Hairpins bulge on into the end cell (away from the edge it's reached by).
    const endDir = normalInto(last.inE ?? last.outE, nodes[last.cell].c);
    const startDir = normalInto(first.outE ?? first.inE, nodes[first.cell].c);
    const strand = o => strandPoints(path, nodes, o, width / 2);
    const lines = []; // { pts, closed, caps? }
    for (let s = 0; s < Math.floor(k / 2); s++) {
      const o = offsets[s], depth = Math.abs(o) * 1.33;
      const A = strand(o), B = strand(-o);              // both run start → end
      const Ar = A.slice().reverse(), Br = B.slice().reverse();
      if (capStart && capEnd) {
        const pts = [...A, ...hairpin(A[A.length - 1], Br[0], endDir, depth), ...Br.slice(1),
          ...hairpin(Br[Br.length - 1], A[0], startDir, depth).slice(0, -1)];
        lines.push({ pts: [...pts, pts[0]], closed: true });
      } else if (capEnd) {
        lines.push({ pts: [...A, ...hairpin(A[A.length - 1], Br[0], endDir, depth), ...Br.slice(1)], closed: false });
      } else if (capStart) {
        lines.push({ pts: [...Ar, ...hairpin(Ar[Ar.length - 1], B[0], startDir, depth), ...B.slice(1)], closed: false });
      } else {
        lines.push({ pts: A, closed: false }, { pts: B, closed: false });
      }
    }
    if (k % 2) lines.push({ pts: strand(0), closed: false, caps: [capStart ? 'round' : 'butt', capEnd ? 'round' : 'butt'] });
    const cuts = cutsFor.get(index) ?? [];
    const contours = [];
    for (const line of lines) {
      for (const piece of cutPoints(line.pts, line.closed, cuts)) {
        contours.push(...outline(piece.pts, piece.closed, piece.cut || !line.caps ? ['butt', 'butt'] : line.caps));
      }
    }
    if (!contours.length) return;
    // Backing band: the centreline as wide as the lines (plus padding).
    const band = bandHalf == null ? null : bandContours(toSegs(strand(0)), bandHalf, [capStart, capEnd], false);
    const cs = path.map(pc => nodes[pc.cell].c);
    out.push({ index, single: false, axes, contours, centre: mul(cs.reduce((t, c) => add(t, c), [0, 0]), 1 / cs.length), band });
  });
  return { bundles: out, k, crossings: crossings.length, whole, route, edited };
}

// An eye in a lone cell: each hairpinned pair of strands as a ring, and the
// centre strand as a dot. Null when the rings don't fit inside the cell.
function eyeContours(c, offsets, w, P, outline) {
  let inradius = Infinity;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    inradius = Math.min(inradius, Math.abs(cross(unit(sub(b, a)), sub(c, a))));
  }
  if (Math.abs(offsets[0]) + w / 2 > inradius) return null;
  const contours = [];
  for (let s = 0; s < Math.floor(offsets.length / 2); s++) {
    const rr = Math.abs(offsets[s]);
    const ring = Array.from({ length: 4 * SAMPLES + 1 }, (_, i) => {
      const a = (i / (4 * SAMPLES)) * Math.PI * 2;
      return [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)];
    });
    contours.push(...outline(ring, true));
  }
  if (offsets.length % 2) contours.push(polyContour(discPoly(c, w / 2)));
  return contours;
}

// ── Fill every cell ──────────────────────────────────────────────────────────
// One route through every routed cell: a random spanning tree of the cells
// (a depth-first maze, with Straightness), traced round so the route runs
// out along one side of each tree passage and back along the other. Each
// side is a lane of half the bundle's strands; a leaf cell is a U-turn.
// With mirror symmetry the route also runs into every cell on an axis, and
// across one passage on each axis that has them, meeting its mirror image
// there (bridges). Without bridges it's kept as a closed loop (cfg.loop), or
// cut at a leaf into a path whose strands end in hairpins.
function fillCircuit(nodes, cfg, r, { k, p, outline, bandHalf, loop }) {
  // The largest group of cells connected by passages (short Voronoi edges
  // are walls, which can cut cells off); the rest stay empty.
  let routed = [];
  const seen = new Uint8Array(nodes.length);
  for (let i0 = 0; i0 < nodes.length; i0++) {
    if (seen[i0] || nodes[i0].role !== 'domain') continue;
    const group = [i0], todo = [i0];
    seen[i0] = 1;
    while (todo.length) {
      for (const e of nodes[todo.pop()].nb) {
        if (!seen[e.to] && nodes[e.to].role === 'domain') { seen[e.to] = 1; group.push(e.to); todo.push(e.to); }
      }
    }
    if (group.length > routed.length) routed = group;
  }
  if (routed.length < 2) return null;
  const inGroup = new Set(routed);
  const straight = cfg.straight ?? 0.6;
  const inTree = new Uint8Array(nodes.length);
  const adj = new Map(routed.map(i => [i, []])); // cell → [{ e, to } | { e, bridge, half? }]
  const start = routed[Math.floor(r() * routed.length)];
  inTree[start] = 1;
  const stack = [[start, null]];
  while (stack.length) {
    const [i, inE] = stack[stack.length - 1];
    const c = nodes[i].c;
    const opts = shuffle(nodes[i].nb.filter(e => nodes[e.to].role === 'domain' && !inTree[e.to]), r);
    if (!opts.length) { stack.pop(); continue; }
    let e = opts[0];
    if (inE && r() < straight) e = opts.slice().sort((x, y) => dot(normalInto(x, c), normalInto(inE, c)) - dot(normalInto(y, c), normalInto(inE, c)))[0];
    const back = nodes[e.to].nb.find(x => x.to === i);
    inTree[e.to] = 1;
    adj.get(i).push({ e, to: e.to });
    adj.get(e.to).push({ e: back, to: i });
    stack.push([e.to, back]);
  }

  // Bridges: into every cell on an axis, and across one passage per axis.
  const axes = new Set();
  for (const i of routed) {
    for (const e of nodes[i].nb) {
      const to = nodes[e.to];
      if (!inGroup.has(i)) continue;
      if (to.role === 'axis' && !to.bridged) { to.bridged = true; adj.get(i).push({ e, bridge: true, half: e.to }); axes.add(to.axis); }
    }
  }
  for (const i of routed) {
    for (const j of nodes[i].joins) {
      if (axes.has(j.axis)) continue;
      adj.get(i).push({ e: j, bridge: true });
      axes.add(j.axis);
    }
  }
  // Around each cell, its passages in order of angle. The trace leaves by
  // the next one round (increasing angle, anticlockwise on screen) from the
  // one it arrived by, which keeps it on its lane's side of the tree.
  const angle = (i, e) => { const v = sub(e.m, nodes[i].c); return Math.atan2(v[1], v[0]); };
  for (const [i, list] of adj) list.sort((a, b) => angle(i, a.e) - angle(i, b.e));
  const nextAt = (i, arrivedBy) => {
    const list = adj.get(i);
    const at = list.findIndex(x => keyOf(x.e.m) === keyOf(arrivedBy.m));
    return list[(at + 1) % list.length];
  };
  // The trace: passes { cell, inE, outE, bridge?, half? }.
  const passes = [];
  const first = adj.get(start)[0];
  let i = start, arrived = first.e, guard = 0;
  const limit = 4 * nodes.length + 8;
  do {
    const nx = nextAt(i, arrived);
    passes.push({ cell: i, inE: arrived, outE: nx.e, bridge: nx.bridge, half: nx.half });
    if (nx.bridge) arrived = nx.e;   // out to the axis; the mirror image comes back in
    else { arrived = nodes[nx.to].nb.find(x => x.to === i); i = nx.to; }
  } while (!(i === start && keyOf(arrived.m) === keyOf(first.e.m)) && ++guard < limit);
  if (guard >= limit) return null;

  // Without bridges and loop off: cut the trace at a leaf's U-turn.
  const isTurn = ps => !ps.bridge && keyOf(ps.inE.m) === keyOf(ps.outE.m);
  let cutAt = -1;
  if (!axes.size && !loop) {
    const leaves = passes.map((ps, n) => (isTurn(ps) ? n : -1)).filter(n => n >= 0);
    cutAt = leaves[Math.floor(r() * leaves.length)] ?? -1;
  }
  const order = cutAt < 0 ? passes : [...passes.slice(cutAt + 1), ...passes.slice(0, cutAt)];

  // Lanes: half the strands each side of a passage's middle, on the right.
  const kl = Math.max(1, Math.floor(k / 2));
  const lane = Array.from({ length: kl }, (_, s) => -(kl * p) + (s + 0.5) * p);
  const across = (e, cell, out, o) => onEdge(e, mul(normalInto(e, nodes[cell].c), out ? -1 : 1), o);
  // One strand at lane offset o round the trace; null marks a break (where
  // the route meets its mirror image).
  const strandOf = (o) => {
    const pts = [];
    for (const ps of order) {
      const c = nodes[ps.cell].c;
      const a = across(ps.inE, ps.cell, false, o), d = across(ps.outE, ps.cell, true, o);
      if (onAxisEdge(ps.inE)) pts.push(sub(a, mul(normalInto(ps.inE, c), AXIS_OVERLAP)));
      pts.push(...bend(a, ps.inE, d, ps.outE, c, isTurn(ps) ? Math.abs(o) * 1.6 + p : 0));
      if (!ps.bridge) continue;
      if (ps.half != null) {
        // On into the cell on the axis, to the axis line and back out.
        const h = nodes[ps.half], ax = h.axisEdge;
        const x = onEdge(ax, mul(ax.n, -1), o), y = onEdge(ax, ax.n, o);
        pts.push(...bend(d, ps.outE, x, ax, h.c).slice(1), sub(x, mul(ax.n, AXIS_OVERLAP)), null);
        const back = nodes[ps.half].nb.find(e => keyOf(e.m) === keyOf(ps.outE.m)) ?? ps.outE;
        pts.push(add(y, mul(ax.n, -AXIS_OVERLAP)), ...bend(y, ax, across(back, ps.half, true, o), back, h.c));
      } else {
        pts.push(sub(d, mul(normalInto(ps.outE, c), AXIS_OVERLAP)), null);
      }
    }
    return pts;
  };
  const runsOf = (pts) => {
    const runs = [[]];
    for (const q of pts) { if (q === null) runs.push([]); else runs[runs.length - 1].push(q); }
    if (runs.length === 1) return [{ pts: dedupe(runs[0]), closed: cutAt < 0 }];
    // The trace is a loop: the last run carries on into the first.
    return [...runs.slice(1, -1), [...runs[runs.length - 1], ...runs[0]]].map(run => ({ pts: dedupe(run), closed: false }));
  };

  const contours = [];
  if (cutAt >= 0) {
    // A path: lane strand s ends in a hairpin into strand kl-1-s at both ends.
    const ps0 = passes[cutAt], leafC = nodes[ps0.cell].c, into = normalInto(ps0.inE, leafC);
    const S = lane.map(o => runsOf(strandOf(o))[0].pts);
    for (let s = 0; s < Math.floor(kl / 2); s++) {
      const A = S[s], B = S[kl - 1 - s], depth = Math.abs(lane[s] - lane[kl - 1 - s]) * 0.66;
      const pts = [...A, ...hairpin(A[A.length - 1], B[B.length - 1], into, depth), ...B.slice().reverse().slice(1),
        ...hairpin(B[0], A[0], into, depth).slice(0, -1)];
      contours.push(...outline([...pts, pts[0]], true));
    }
    if (kl % 2) contours.push(...outline(S[(kl - 1) / 2], false, ['round', 'round']));
  } else {
    for (const o of lane) {
      for (const run of runsOf(strandOf(o))) {
        if (run.pts.length > 1) contours.push(...outline(run.closed ? [...run.pts, run.pts[0]] : run.pts, run.closed));
      }
    }
  }
  if (!contours.length) return null;
  const mid = runsOf(strandOf(-(kl * p) / 2)).filter(run => run.pts.length > 1);
  const band = bandHalf == null ? null
    : mid.flatMap(run => bandContours(toSegs(run.closed ? [...run.pts, run.pts[0]] : run.pts), (kl * p) / 2 + (bandHalf - (k * p) / 2), [cutAt >= 0, cutAt >= 0], run.closed));
  const centre = mul(routed.reduce((t, n) => add(t, nodes[n].c), [0, 0]), 1 / routed.length);
  return { index: 0, single: false, axes, contours, centre, band };
}
