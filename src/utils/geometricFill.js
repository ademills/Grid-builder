// Pure mathematical pattern masks — no image, no noise. Each pattern is a
// function `isActive(col, row, gridComputed, params) -> boolean`. A shared
// `phase` offset (in cells / degrees, depending on pattern) shifts the
// pattern across the grid.

function diagonalStripes(c, r, gridComputed, p) {
  const { angle = 45, stripeWidth = 2, gapWidth = 2, phase = 0 } = p;
  const rad = (angle * Math.PI) / 180;
  const proj = c * Math.cos(rad) + r * Math.sin(rad) + phase;
  const period = stripeWidth + gapWidth;
  if (period <= 0) return false;
  const m = ((proj % period) + period) % period;
  return m < stripeWidth;
}

function concentricRings(c, r, gridComputed, p) {
  const { cols, rows } = gridComputed;
  const { centerX = 0.5, centerY = 0.5, ringWidth = 2, gap = 2, innerRadius = 0, phase = 0 } = p;
  const cx = centerX * cols, cy = centerY * rows;
  const dist = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
  if (dist < innerRadius) return false;
  const period = ringWidth + gap;
  if (period <= 0) return false;
  const m = (((dist - innerRadius + phase) % period) + period) % period;
  return m < ringWidth;
}

function checkerboard(c, r, gridComputed, p) {
  const { tileSize = 2, offsetX = 0, offsetY = 0, phase = 0 } = p;
  const size = Math.max(1, tileSize);
  const tx = Math.floor((c + offsetX + phase) / size);
  const ty = Math.floor((r + offsetY) / size);
  return (tx + ty) % 2 === 0;
}

function sunburst(c, r, gridComputed, p) {
  const { cols, rows } = gridComputed;
  const { centerX = 0.5, centerY = 0.5, numSpokes = 8, spokeWidth = 15, innerRadius = 0, phase = 0 } = p;
  const cx = centerX * cols, cy = centerY * rows;
  const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < innerRadius) return false;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + phase;
  angle = ((angle % 360) + 360) % 360;
  const spokeAngle = 360 / Math.max(1, numSpokes);
  const m = angle % spokeAngle;
  return m < spokeWidth;
}

function dotGrid(c, r, gridComputed, p) {
  const { dotRadius = 1, spacingX = 3, spacingY = 3, offsetX = 0, offsetY = 0, phase = 0 } = p;
  const sx = Math.max(1, spacingX), sy = Math.max(1, spacingY);
  const cellX = (((c + offsetX + phase) % sx) + sx) % sx;
  const cellY = (((r + offsetY) % sy) + sy) % sy;
  const dist = Math.hypot(cellX - sx / 2, cellY - sy / 2);
  return dist <= dotRadius;
}

function hexGrid(c, r, gridComputed, p) {
  const { cellRadius = 2, rowOffset = 0.5, phase = 0 } = p;
  const radius = Math.max(1, cellRadius);
  const w = radius * 2;
  const rowIdx = Math.floor(r / radius);
  const xOff = rowIdx % 2 === 0 ? 0 : radius * rowOffset;
  const cellX = (((c + phase - xOff) % w) + w) % w;
  const cellY = ((r % radius) + radius) % radius;
  const dist = Math.hypot(cellX - radius, cellY - radius / 2);
  return dist <= radius * 0.6;
}

const PATTERNS = {
  stripes: diagonalStripes,
  rings: concentricRings,
  checkerboard,
  sunburst,
  dots: dotGrid,
  hex: hexGrid,
};

/**
 * Computes the set of "col,row" cells that fall inside the chosen geometric
 * pattern. Pure function — entirely synchronous geometry, no image or noise
 * dependency.
 */
export function computeGeometricMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const { patternType = 'stripes', ...params } = settings;
  const fn = PATTERNS[patternType] ?? diagonalStripes;

  const activeCells = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (fn(c, r, gridComputed, params)) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}
