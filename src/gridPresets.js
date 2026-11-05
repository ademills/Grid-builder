export const PRESETS = [
  { key: 'a4-portrait',         label: 'A4 Portrait',          width: 595,  height: 842  },
  { key: 'a4-landscape',        label: 'A4 Landscape',         width: 842,  height: 595  },
  { key: 'us-letter',           label: 'US Letter',            width: 612,  height: 792  },
  { key: 'us-letter-landscape', label: 'US Letter (L)',        width: 792,  height: 612  },
  { key: 'square-1080',         label: '1080 × 1080',          width: 1080, height: 1080 },
  { key: 'hd-landscape',        label: '1920 × 1080',          width: 1920, height: 1080 },
  { key: 'hd-portrait',         label: '1080 × 1920 (Story)',  width: 1080, height: 1920 },
  { key: 'ig-portrait',         label: '1080 × 1350 (4:5)',    width: 1080, height: 1350 },
  { key: 'a3-portrait',         label: 'A3 Portrait',          width: 842,  height: 1191 },
  { key: '4k-landscape',        label: '3840 × 2160 (4K)',     width: 3840, height: 2160 },
  { key: 'phone-wallpaper',     label: '1170 × 2532 (Phone)',  width: 1170, height: 2532 },
  { key: 'fabric-repeat',       label: '3600 × 3600 (Fabric)', width: 3600, height: 3600 },
  { key: 'custom',              label: 'Custom…',              width: null, height: null },
];

/**
 * Returns the column counts (1–maxCols) that divide the inner area into
 * equal squares with whole rows: the gap left over is at most FIT of the
 * sheet. Measured against the sheet (not a cell), so multiples of a count
 * that fits fit too (3 → 6, 9, 12…: the same gap in pixels). A sheet with
 * almost no such counts gets a looser fit, step by step, until there are a
 * few. Returns null when none can be found (every count is then allowed).
 */
const FITS = [0.005, 0.01, 0.02, 0.04, 0.08];
export function getValidCols(workArea, borderPct, maxCols = 80) {
  const { width, height } = workArea;
  if (!width || !height) return null;

  const borderPx = Math.min(width, height) * Math.max(0, Math.min(borderPct, 49)) / 100;
  const innerW = width - 2 * borderPx;
  const innerH = height - 2 * borderPx;
  if (innerW <= 0 || innerH <= 0) return null;

  const enough = Math.max(3, Math.floor(maxCols / 10));
  let valid = [];
  for (const fit of FITS) {
    valid = [];
    for (let c = 1; c <= maxCols; c++) {
      const cell = innerW / c;
      const rows = Math.round(innerH / cell);
      if (rows >= 1 && Math.abs(innerH - rows * cell) <= fit * innerH) valid.push(c);
    }
    if (valid.length >= enough) break;
  }
  return valid.length > 1 ? valid : null;
}

// The column count to use after the artboard or border changes: the
// nearest count that fits it.
export function snapCols(validCols, cols) {
  if (!validCols || validCols.includes(cols)) return cols;
  return validCols.reduce((a, b) => (Math.abs(b - cols) < Math.abs(a - cols) ? b : a));
}

/**
 * Derives all layout measurements from work area + grid settings.
 * Used by the Grid renderer, the bin-packer, and drag-and-drop hit testing.
 */
export function computeGrid(workArea, gridSettings) {
  const { cols, borderPct } = gridSettings;
  const { width, height } = workArea;

  if (!cols || cols < 1 || !width || !height) return null;

  const borderPx = Math.min(width, height) * Math.max(0, Math.min(borderPct, 49)) / 100;
  const innerW = width - 2 * borderPx;
  const innerH = height - 2 * borderPx;

  if (innerW <= 0 || innerH <= 0) return null;

  // Equal squares: rows round to the nearest whole number, and if that
  // would run past the border the squares shrink to fit, so the grid always
  // sits inside it. A count that fits (getValidCols) leaves a gap too small
  // to see.
  const rows = Math.max(1, Math.round(innerH / (innerW / cols)));
  const cellSize = Math.min(innerW / cols, innerH / rows);

  const gridW = cols * cellSize;
  const gridH = rows * cellSize;

  // Centre the grid within the work area so any leftover is split evenly
  // between the two sides rather than accumulating at one.
  const gridOriginX = (width - gridW) / 2;
  const gridOriginY = (height - gridH) / 2;

  return {
    borderPx,
    cellSize,
    rows,
    cols,
    gridOriginX,
    gridOriginY,
    gridW,
    gridH,
    totalCells: cols * rows,
    innerW,
    innerH,
  };
}
