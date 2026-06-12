import { mulberry32 } from './rng';

// Returns true/false for a cell at distance `dist` from a strip centreline,
// given the strip's half-width and an optional feathered fade zone.
function includeCell(dist, half, feather, rng) {
  if (dist <= half) return true;
  if (feather > 0 && dist <= half + feather) {
    const t = (dist - half) / feather; // 0 (band edge) → 1 (feather edge)
    return rng() > t;
  }
  return false;
}

// The range of centreline positions a strip can occupy along its axis, plus
// (for 'angle') the unit normal vector used to project cell centres.
function rangeForAxis(gridComputed, axis, angle) {
  const { cols, rows } = gridComputed;
  if (axis === 'h') return { min: 0, max: rows };
  if (axis === 'v') return { min: 0, max: cols };
  const rad = (angle * Math.PI) / 180;
  const nx = Math.sin(rad);
  const ny = Math.cos(rad);
  const corners = [[0, 0], [cols, 0], [0, rows], [cols, rows]];
  const projections = corners.map(([x, y]) => x * nx + y * ny);
  return { min: Math.min(...projections), max: Math.max(...projections), nx, ny };
}

// Marks all cells within `width` (+ feathered fade) of `center` along the axis.
function maskForCenter(gridComputed, axis, center, width, feather, rng, nx, ny) {
  const { cols, rows } = gridComputed;
  const half = width / 2;
  const activeCells = new Set();

  if (axis === 'h') {
    for (let r = 0; r < rows; r++) {
      const dist = Math.abs((r + 0.5) - center);
      if (includeCell(dist, half, feather, rng)) {
        for (let c = 0; c < cols; c++) activeCells.add(`${c},${r}`);
      }
    }
  } else if (axis === 'v') {
    for (let c = 0; c < cols; c++) {
      const dist = Math.abs((c + 0.5) - center);
      if (includeCell(dist, half, feather, rng)) {
        for (let r = 0; r < rows; r++) activeCells.add(`${c},${r}`);
      }
    }
  } else {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const proj = (c + 0.5) * nx + (r + 0.5) * ny;
        const dist = Math.abs(proj - center);
        if (includeCell(dist, half, feather, rng)) activeCells.add(`${c},${r}`);
      }
    }
  }
  return activeCells;
}

/**
 * Computes the set of "col,row" cells inside a configurable strip across the
 * grid — horizontal, vertical, or at a custom angle. Used by Strip Fill.
 */
export function computeStripMask(gridComputed, settings) {
  const {
    axis = 'h',
    angle = 0,
    position = 0.5,
    width = 4,
    feather = 0,
    seed = 0,
  } = settings;

  const rng = mulberry32(seed);
  const { min, max, nx, ny } = rangeForAxis(gridComputed, axis, angle);
  const center = min + position * (max - min);
  return maskForCenter(gridComputed, axis, center, width, feather, rng, nx, ny);
}

/**
 * Computes the union of `numStrips` parallel strips at a shared axis/angle —
 * used by Multi-Strip / Slash Fill. With `spacing: 'even'`, strip centres are
 * evenly distributed across the axis range; with `'manual'`, each strip's
 * position comes from `positions[i]` (0–1, falling back to even spacing if
 * not provided). `stagger` offsets every other strip by half its width.
 */
export function computeMultiStripMask(gridComputed, settings) {
  const {
    axis = 'angle',
    angle = 0,
    numStrips = 4,
    stripWidth = 3,
    spacing = 'even',
    positions = [],
    stagger = false,
    feather = 0,
    seed = 0,
  } = settings;

  const rng = mulberry32(seed);
  const { min, max, nx, ny } = rangeForAxis(gridComputed, axis, angle);
  const range = max - min;
  const activeCells = new Set();

  for (let i = 0; i < numStrips; i++) {
    const pos = (spacing === 'manual' && positions[i] != null) ? positions[i] : (i + 1) / (numStrips + 1);
    let center = min + pos * range;
    if (stagger && i % 2 === 1) center += stripWidth / 2;
    for (const cell of maskForCenter(gridComputed, axis, center, stripWidth, feather, rng, nx, ny)) {
      activeCells.add(cell);
    }
  }
  return activeCells;
}
