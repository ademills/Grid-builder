// Traces the outer boundary of a Set of active grid cells (as produced by
// computeKnotworkMeanderMask) into one or more closed polygons in grid-vertex
// space, then hands each loop to compileClosedKnotworkPath for arc-only
// corner filleting. This is what turns a raw cell mask into the "solid
// blocky negative space" silhouette — one continuous rounded-rectilinear
// outline per connected block, rather than individually stroked/filled
// squares with visible seams between adjacent active cells.
//
// Standard raster boundary trace: every active-cell edge that borders an
// inactive (or off-grid) neighbour becomes a directed edge, oriented so the
// filled region is always on the right of the direction of travel. At a
// diagonal "pinch" vertex (two active cells touching only at a corner) more
// than one outgoing edge can start at the same vertex; picking the most
// clockwise turn relative to the incoming edge is what keeps that case from
// merging into a single self-crossing loop.

import { compileClosedKnotworkPath } from './knotworkGeometry';

function vKey(col, row) { return `${col},${row}`; }

function collectDirectedEdges(activeCells) {
  const isActive = (c, r) => activeCells.has(vKey(c, r));
  const edges = []; // { from: {col,row}, to: {col,row} }
  for (const key of activeCells) {
    const [c, r] = key.split(',').map(Number);
    if (!isActive(c, r - 1)) edges.push({ from: { col: c, row: r }, to: { col: c + 1, row: r } });
    if (!isActive(c + 1, r)) edges.push({ from: { col: c + 1, row: r }, to: { col: c + 1, row: r + 1 } });
    if (!isActive(c, r + 1)) edges.push({ from: { col: c + 1, row: r + 1 }, to: { col: c, row: r + 1 } });
    if (!isActive(c - 1, r)) edges.push({ from: { col: c, row: r + 1 }, to: { col: c, row: r } });
  }
  return edges;
}

function angleOf(dc, dr) { return Math.atan2(dr, dc); }

// Traces closed loops from a set of directed boundary edges (see
// collectDirectedEdges). Returns an array of loops, each an array of
// {col, row} grid-vertex points (open — first point is not repeated at end).
export function traceMaskBoundary(activeCells) {
  const edges = collectDirectedEdges(activeCells);
  if (!edges.length) return [];

  const outgoingByVertex = new Map();
  for (const e of edges) {
    const key = vKey(e.from.col, e.from.row);
    if (!outgoingByVertex.has(key)) outgoingByVertex.set(key, []);
    outgoingByVertex.get(key).push(e);
  }

  const used = new Set();
  const edgeId = (e) => `${e.from.col},${e.from.row}->${e.to.col},${e.to.row}`;
  const loops = [];

  for (const startEdge of edges) {
    if (used.has(edgeId(startEdge))) continue;

    const loop = [startEdge.from];
    let current = startEdge;
    used.add(edgeId(current));

    while (true) {
      loop.push(current.to);
      const incomingAngle = angleOf(current.to.col - current.from.col, current.to.row - current.from.row);
      const candidates = (outgoingByVertex.get(vKey(current.to.col, current.to.row)) || [])
        .filter(e => !used.has(edgeId(e)));

      if (!candidates.length) break;

      let best = null, bestTurn = Infinity;
      for (const cand of candidates) {
        const outAngle = angleOf(cand.to.col - cand.from.col, cand.to.row - cand.from.row);
        // Clockwise turn amount from incoming direction, normalised to (0, 2*PI].
        let turn = incomingAngle - outAngle;
        turn = ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (turn === 0) turn = 2 * Math.PI;
        if (turn < bestTurn) { bestTurn = turn; best = cand; }
      }

      used.add(edgeId(best));
      current = best;
      if (current.to.col === loop[0].col && current.to.row === loop[0].row) break;
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

function loopToPixels(loop, gridComputed) {
  const { gridOriginX, gridOriginY, cellSize } = gridComputed;
  return loop.map(({ col, row }) => ({
    x: gridOriginX + col * cellSize,
    y: gridOriginY + row * cellSize,
  }));
}

// Returns an array of SVG path `d` strings (one per connected block/hole
// loop), each arc-filleted at `radius` px, ready to fill or stroke.
export function computeKnotworkBlockPaths(activeCells, gridComputed, radius) {
  const loops = traceMaskBoundary(activeCells);
  return loops
    .map(loop => loopToPixels(loop, gridComputed))
    .map(points => compileClosedKnotworkPath(points, radius))
    .filter(Boolean);
}
