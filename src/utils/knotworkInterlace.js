// Detects every point where two knotwork strands cross and assigns an
// over/under render order. Two crossing types:
//  - vertex: two different strands occupy the same grid cell.
//  - diagonal-center: two strands' diagonal segments cross at a unit cell's
//    center (one running NW->SE, the other NE->SW through the same cell)
//    without ever sharing a grid-cell coordinate — the "diagonals crossing
//    dead center" edge case.
//
// Resolution defaults to the classic Celtic-knot checkerboard rule: parity
// of (col + row) decides which strand renders on top. That alternates
// automatically along any strand's length without tracking per-strand
// crossing history, and stays well-defined even where three+ strands meet
// at one point. `crossingRule` can override this for diagonal-center cases,
// flagging them for the renderer to reroute or knot instead of weaving —
// this module only classifies and decides; executing a reroute means
// re-deriving that stretch of path, which is the renderer's job.

function cellKey(col, row) { return `${col},${row}`; }

function segmentsOf(path) {
  const segs = [];
  for (let i = 0; i < path.length - 1; i++) segs.push({ a: path[i], b: path[i + 1], index: i });
  return segs;
}

function isDiagonal(seg) {
  return Math.abs(seg.b.col - seg.a.col) === 1 && Math.abs(seg.b.row - seg.a.row) === 1;
}

function diagonalCell(seg) {
  return { col: Math.min(seg.a.col, seg.b.col), row: Math.min(seg.a.row, seg.b.row) };
}

function diagonalOrientation(seg) {
  const dCol = seg.b.col - seg.a.col, dRow = seg.b.row - seg.a.row;
  return Math.sign(dCol) === Math.sign(dRow) ? 'NW-SE' : 'NE-SW';
}

export function detectKnotworkCrossings(layers) {
  const vertexOwners = new Map();
  const diagonalOwners = new Map();

  layers.forEach(layer => {
    layer.paths.forEach((path, pathIndex) => {
      path.forEach((pt, pointIndex) => {
        const key = cellKey(pt.col, pt.row);
        if (!vertexOwners.has(key)) vertexOwners.set(key, []);
        vertexOwners.get(key).push({ layerId: layer.id, pathIndex, pointIndex });
      });
      segmentsOf(path).forEach((seg, segIndex) => {
        if (!isDiagonal(seg)) return;
        const cell = diagonalCell(seg);
        const key = cellKey(cell.col, cell.row);
        if (!diagonalOwners.has(key)) diagonalOwners.set(key, []);
        diagonalOwners.get(key).push({
          layerId: layer.id, pathIndex, segIndex, orientation: diagonalOrientation(seg),
        });
      });
    });
  });

  const crossings = [];

  for (const [key, owners] of vertexOwners) {
    if (new Set(owners.map(o => o.layerId)).size < 2) continue;
    const [col, row] = key.split(',').map(Number);
    crossings.push({ type: 'vertex', col, row, owners });
  }

  for (const [key, owners] of diagonalOwners) {
    const opposing = owners.filter((o, i) =>
      owners.some((other, j) => j !== i && other.orientation !== o.orientation)
    );
    if (opposing.length < 2) continue;
    const [col, row] = key.split(',').map(Number);
    crossings.push({ type: 'diagonal-center', col, row, owners: opposing });
  }

  return crossings;
}

export function resolveKnotworkCrossings(crossings, settings = {}) {
  const { crossingRule = 'auto', layerPriority = [] } = settings;

  return crossings.map(crossing => {
    if (crossing.type === 'diagonal-center' && crossingRule === 'prefer-reroute') {
      return { ...crossing, action: 'reroute' };
    }
    if (crossing.type === 'diagonal-center' && crossingRule === 'knot') {
      return { ...crossing, action: 'knot' };
    }

    if (crossingRule === 'always-over-under' && layerPriority.length >= 2) {
      const present = crossing.owners.map(o => o.layerId);
      const topLayerId = layerPriority.find(id => present.includes(id)) ?? crossing.owners[0].layerId;
      return { ...crossing, action: 'over-under', topLayerId };
    }

    const topsEven = (crossing.col + crossing.row) % 2 === 0;
    const ordered = [...crossing.owners].sort((a, b) => String(a.layerId).localeCompare(String(b.layerId)));
    const topLayerId = topsEven ? ordered[0].layerId : ordered[ordered.length - 1].layerId;
    return { ...crossing, action: 'over-under', topLayerId };
  });
}
