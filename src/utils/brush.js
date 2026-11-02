// Brush size for the Stamp and Eraser tools (3.3). One size sets both: the
// Stamp places its shape at that many times its size (a 1×1 shape at size 3
// covers 3×3 cells), and the Eraser clears a square or round patch that
// many cells across. Both are centred on the cell under the pointer.

export const BRUSH_MAX = 6;

export const clampBrush = n => Math.max(1, Math.min(BRUSH_MAX, Math.round(n) || 1));

// Top-left cell of a w×h footprint centred on (col, row), kept on the grid.
export function brushOrigin(col, row, w, h, cols, rows) {
  const c = col - Math.floor((w - 1) / 2);
  const r = row - Math.floor((h - 1) / 2);
  return {
    col: Math.max(0, Math.min(cols - w, c)),
    row: Math.max(0, Math.min(rows - h, r)),
  };
}

// The cells the Eraser covers at (col, row). Square: size×size. Round: the
// cells whose centres fall within a circle a little under size cells across
// (so a size-3 brush is a plus, not a square).
export function brushCells(col, row, size, shape, cols, rows) {
  const n = clampBrush(size);
  const lo = -Math.floor((n - 1) / 2);
  const centre = lo + (n - 1) / 2;
  const out = [];
  for (let dr = lo; dr < lo + n; dr++) {
    for (let dc = lo; dc < lo + n; dc++) {
      const c = col + dc, r = row + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      if (shape === 'round' && n > 2 && (dc - centre) ** 2 + (dr - centre) ** 2 > (n / 2 - 0.25) ** 2) continue;
      out.push({ col: c, row: r });
    }
  }
  return out;
}
