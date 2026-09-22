// Coordinate-transform utilities for symmetric knotwork/kufic layouts:
// generate one seed region (a half, a quadrant, or one kaleidoscope wedge),
// then replicate it across the whole grid via mirroring, 180 deg/90 deg
// rotation, or N-fold radial repetition around the grid's center.
//
// Two things share this: the sparse "wall" break-points (knotworkPath.js's
// `blockedCells`, replicated as a cell Set via applyKnotworkSymmetry) and
// the actual meander strand paths themselves (knotworkMeanderStrand.js,
// which walks getSymmetrySeedRegionTest()'s region then replicates each
// finished path with getSymmetryTransforms()). Both read off the same
// per-mode definitions here so a strand and the walls it respects always
// agree on which region is "the seed".
//
// 90 deg-family rotation (rotate4, and kaleidoscope for fold counts that
// aren't 2) swaps width and height, so on a non-square grid some rotated
// cells land outside the canvas and get dropped by the bounds check below.
// mirror-x/-y/-both and rotate2 are dimension-preserving and tile any
// rectangle exactly.

function mirrorX(cell, cols) { return { col: cols - 1 - cell.col, row: cell.row }; }
function mirrorY(cell, rows) { return { col: cell.col, row: rows - 1 - cell.row }; }
function rotate180(cell, cols, rows) { return { col: cols - 1 - cell.col, row: rows - 1 - cell.row }; }

// Rotates a cell by `angleDeg` around the grid's center, snapping to the
// nearest integer cell — used for 90°-family rotation and kaleidoscope
// N-fold repetition.
function rotateAround(cell, cols, rows, angleDeg) {
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const rad = (angleDeg * Math.PI) / 180;
  const dx = cell.col - cx, dy = cell.row - cy;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  return {
    col: Math.round(cx + dx * cosA - dy * sinA),
    row: Math.round(cy + dx * sinA + dy * cosA),
  };
}

const half = (n) => Math.floor((n - 1) / 2);

// Returns the non-identity transform functions (each `(cell, cols, rows) =>
// cell`) that replicate a seed region for `mode`. 'none' has no replicas.
export function getSymmetryTransforms(mode, kaleidoscopeFold = 4) {
  switch (mode) {
    case 'mirror-x': return [(c, cols) => mirrorX(c, cols)];
    case 'mirror-y': return [(c, cols, rows) => mirrorY(c, rows)];
    case 'mirror-both': return [
      (c, cols) => mirrorX(c, cols),
      (c, cols, rows) => mirrorY(c, rows),
      (c, cols, rows) => rotate180(c, cols, rows),
    ];
    case 'rotate2': return [(c, cols, rows) => rotate180(c, cols, rows)];
    case 'rotate4': return [90, 180, 270].map(deg => (c, cols, rows) => rotateAround(c, cols, rows, deg));
    case 'kaleidoscope': {
      const fold = Math.max(2, kaleidoscopeFold);
      const step = 360 / fold;
      const out = [];
      for (let k = 1; k < fold; k++) out.push((c, cols, rows) => rotateAround(c, cols, rows, step * k));
      return out;
    }
    default: return [];
  }
}

// Returns a `(col, row, cols, rows) => boolean` predicate selecting the one
// seed region a strand/wall walk should be confined to for `mode`, sized so
// the region plus its getSymmetryTransforms() replicas tile the whole grid
// (give or take the 90°-family clipping noted above).
export function getSymmetrySeedRegionTest(mode, kaleidoscopeFold = 4) {
  switch (mode) {
    case 'mirror-x': return (col, row, cols) => col <= half(cols);
    case 'mirror-y': return (col, row, cols, rows) => row <= half(rows);
    case 'mirror-both': return (col, row, cols, rows) => col <= half(cols) && row <= half(rows);
    case 'rotate2': return (col, row, cols, rows) => row <= half(rows);
    case 'rotate4': return (col, row, cols, rows) => col <= half(cols) && row <= half(rows);
    case 'kaleidoscope': {
      const fold = Math.max(2, kaleidoscopeFold);
      const wedge = 360 / fold;
      return (col, row, cols, rows) => {
        const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
        const dx = col - cx, dy = row - cy;
        if (dx === 0 && dy === 0) return true;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        return angle < wedge;
      };
    }
    default: return () => true;
  }
}

// `cells`: an array of {col,row}, or a Set/iterable of "col,row" keys —
// the seed region. Returns a Set of "col,row" keys, clipped to the grid
// bounds. Used for the sparse wall cells, where a plain Set union of every
// replica (including any that collide with each other or the original) is
// exactly what's wanted.
export function applyKnotworkSymmetry(cells, gridComputed, settings = {}) {
  const { cols, rows } = gridComputed;
  const { mode = 'none', kaleidoscopeFold = 4 } = settings;

  const input = Array.isArray(cells)
    ? cells
    : [...cells].map(key => {
        const [c, r] = key.split(',').map(Number);
        return { col: c, row: r };
      });

  const transforms = getSymmetryTransforms(mode, kaleidoscopeFold);
  const out = new Set();
  const add = (cell) => {
    if (cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows) {
      out.add(`${cell.col},${cell.row}`);
    }
  };

  for (const cell of input) {
    add(cell);
    for (const transform of transforms) add(transform(cell, cols, rows));
  }

  return out;
}
