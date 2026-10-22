// Live symmetry for the painting tools (Stamp, Eraser, Paint Bucket): each
// action is repeated at the mirrored / rotated positions across the grid.
//
// Positions are in grid units: x across columns (0..cols), y down rows
// (0..rows). Rotational modes turn about the grid centre.

export const SYMMETRY_OPTIONS = [
  { key: 'off', label: 'Off', title: 'No symmetry' },
  { key: 'x', label: '↔', title: 'Mirror left and right' },
  { key: 'y', label: '↕', title: 'Mirror top and bottom' },
  { key: 'xy', label: '✣', title: 'Mirror both ways (4 copies)' },
  { key: 'radial', label: '⟳', title: 'Rotate about the centre (4 copies on a square grid, 2 otherwise)' },
];

// The copies a mode makes, not counting the original. Each copy is a turn
// (0/90/180/270, clockwise) and/or a mirror.
function copiesFor(mode, cols, rows) {
  switch (mode) {
    case 'x': return [{ mirrorX: true }];
    case 'y': return [{ mirrorY: true }];
    case 'xy': return [{ mirrorX: true }, { mirrorY: true }, { mirrorX: true, mirrorY: true }];
    case 'radial': return cols === rows ? [{ turn: 90 }, { turn: 180 }, { turn: 270 }] : [{ turn: 180 }];
    default: return [];
  }
}

// A point (x, y) under one copy's transform.
function mapPoint(t, x, y, cols, rows) {
  if (t.turn === 90) return [cols - y, x];
  if (t.turn === 180) return [cols - x, rows - y];
  if (t.turn === 270) return [y, rows - x];
  return [t.mirrorX ? cols - x : x, t.mirrorY ? rows - y : y];
}

// Where a point lands for every copy.
export function symmetricPoints(mode, x, y, cols, rows) {
  return copiesFor(mode, cols, rows).map(t => mapPoint(t, x, y, cols, rows));
}

// A block's footprint and orientation for every copy — the block drawn as
// it would look mirrored or turned with the whole grid. Quarter turns of
// non-square shapes are skipped (the renderer only turns those by 180°).
// Returns partial blocks: { gridCol, gridRow, cols, rows, rotation, flipX, flipY }.
export function symmetricPlacements(mode, block, cols, rows) {
  const out = [];
  for (const t of copiesFor(mode, cols, rows)) {
    const quarter = t.turn === 90 || t.turn === 270;
    if (quarter && block.cols !== block.rows) continue;
    const [ax, ay] = mapPoint(t, block.gridCol, block.gridRow, cols, rows);
    const [bx, by] = mapPoint(t, block.gridCol + block.cols, block.gridRow + block.rows, cols, rows);
    const flipX = !!block.flipX !== !!t.mirrorX;
    const flipY = !!block.flipY !== !!t.mirrorY;
    // Turning a mirrored shape: the mirror reverses the direction of turn.
    const mirrored = !!block.flipX !== !!block.flipY;
    const turn = t.turn ? (mirrored ? -t.turn : t.turn) : 0;
    out.push({
      gridCol: Math.min(ax, bx), gridRow: Math.min(ay, by),
      cols: Math.abs(bx - ax), rows: Math.abs(by - ay),
      rotation: ((((block.rotation ?? 0) + turn) % 360) + 360) % 360,
      flipX, flipY,
    });
  }
  return out;
}
