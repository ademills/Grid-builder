// Symmetry shared by every mode: one list of modes and their names, used by
// the painting tools' live symmetry (Stamp, Eraser, Paint Bucket), the
// Meander walker and the Linework generator. Each consumer offers the subset
// it supports (see symmetryOptions).
//
// Positions for the painting tools are in grid units: x across columns
// (0..cols), y down rows (0..rows). Rotational modes turn about the grid
// centre; the 90°-family needs a square grid and falls back otherwise.

export const SYMMETRY_MODES = [
  { key: 'none', label: 'None', icon: 'Off', title: 'No symmetry' },
  { key: 'mirror-x', label: 'Mirror X', icon: '↔', title: 'Mirror left and right' },
  { key: 'mirror-y', label: 'Mirror Y', icon: '↕', title: 'Mirror top and bottom' },
  { key: 'mirror-both', label: 'Mirror both', icon: '✣', title: 'Mirror both ways (4 copies)' },
  { key: 'mirror-diag', label: 'Mirror ×8', icon: '✳', title: 'Mirror both ways and across the diagonals (8 copies; square grids)' },
  { key: 'rotate2', label: 'Rotate ×2', icon: '◐', title: 'Half turn about the centre (2 copies)' },
  { key: 'rotate4', label: 'Rotate ×4', icon: '⟳', title: 'Quarter turns about the centre (4 copies on a square grid, 2 otherwise)' },
  { key: 'kaleidoscope', label: 'Kaleidoscope', icon: '❋', title: 'Repeat a wedge around the centre' },
];

const BY_KEY = Object.fromEntries(SYMMETRY_MODES.map(m => [m.key, m]));

// What each consumer supports, in display order.
export const TOOL_SYMMETRY = ['none', 'mirror-x', 'mirror-y', 'mirror-both', 'mirror-diag', 'rotate2', 'rotate4'];
export const MEANDER_SYMMETRY = ['none', 'mirror-x', 'mirror-y', 'mirror-both', 'mirror-diag', 'rotate2', 'rotate4', 'kaleidoscope'];
export const LINEWORK_SYMMETRY = ['none', 'mirror-x', 'mirror-y', 'mirror-both', 'mirror-diag', 'rotate2', 'rotate4'];
export const ORGANIC_SYMMETRY = ['none', 'mirror-x', 'mirror-y', 'mirror-both', 'mirror-diag'];

export const symmetryOptions = (keys) => keys.map(k => BY_KEY[k]).filter(Boolean);

// Older names: the tools' off/x/y/xy/radial.
const LEGACY = { off: 'none', x: 'mirror-x', y: 'mirror-y', xy: 'mirror-both', radial: 'rotate4' };
export const normaliseSymmetry = (key) => LEGACY[key] ?? (BY_KEY[key] ? key : 'none');

// The copies a mode makes for the painting tools, not counting the
// original. Each copy turns (0/90/180/270, clockwise) then mirrors.
function copiesFor(mode, cols, rows) {
  const square = cols === rows;
  const both = [{ mirrorX: true }, { mirrorY: true }, { mirrorX: true, mirrorY: true }];
  switch (normaliseSymmetry(mode)) {
    case 'mirror-x': return [{ mirrorX: true }];
    case 'mirror-y': return [{ mirrorY: true }];
    case 'mirror-both': return both;
    case 'mirror-diag': return square
      ? [...both, { turn: 90 }, { turn: 270 }, { turn: 90, mirrorX: true }, { turn: 90, mirrorY: true }]
      : both;
    case 'rotate2': return [{ turn: 180 }];
    case 'rotate4': return square ? [{ turn: 90 }, { turn: 180 }, { turn: 270 }] : [{ turn: 180 }];
    default: return [];
  }
}

// A point (x, y) under one copy's transform: the turn, then the mirrors.
function mapPoint(t, x, y, cols, rows) {
  if (t.turn === 90) [x, y] = [cols - y, x];
  else if (t.turn === 180) [x, y] = [cols - x, rows - y];
  else if (t.turn === 270) [x, y] = [y, rows - x];
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
