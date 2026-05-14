export const PRESETS = [
  { key: 'a4-portrait',         label: 'A4 Portrait',          width: 595,  height: 842  },
  { key: 'a4-landscape',        label: 'A4 Landscape',         width: 842,  height: 595  },
  { key: 'us-letter',           label: 'US Letter',            width: 612,  height: 792  },
  { key: 'us-letter-landscape', label: 'US Letter (L)',        width: 792,  height: 612  },
  { key: 'square-1080',         label: '1080 × 1080',          width: 1080, height: 1080 },
  { key: 'hd-landscape',        label: '1920 × 1080',          width: 1920, height: 1080 },
  { key: 'hd-portrait',         label: '1080 × 1920 (Story)',  width: 1080, height: 1920 },
  { key: 'custom',              label: 'Custom…',              width: null, height: null },
];

/**
 * Returns column counts (1–maxCols) where the fractional leftover row is within
 * 10% of a cell — i.e. the grid tiles the inner area without a visible gap.
 * Returns null when no constraint can be determined (all values treated as valid).
 */
export function getValidCols(workArea, borderPct, maxCols = 80) {
  const { width, height } = workArea;
  if (!width || !height) return null;

  const borderPx = Math.min(width, height) * Math.max(0, Math.min(borderPct, 49)) / 100;
  const innerW = width - 2 * borderPx;
  const innerH = height - 2 * borderPx;
  if (innerW <= 0 || innerH <= 0) return null;

  const EPSILON = 0.1; // allow up to 10% leftover at the edge
  const valid = [];
  for (let c = 1; c <= maxCols; c++) {
    const rowsExact = (innerH * c) / innerW;
    const frac = rowsExact - Math.floor(rowsExact);
    if (frac < EPSILON || frac > 1 - EPSILON) {
      valid.push(c);
    }
  }
  return valid.length > 1 ? valid : null;
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

  const cellSize = innerW / cols;
  const rows = Math.floor(innerH / cellSize);

  if (rows < 1) return null;

  const gridW = cols * cellSize;
  const gridH = rows * cellSize;

  // Center the grid within the work area so any leftover from floor() is
  // split evenly between top/bottom rather than accumulating at the bottom.
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
