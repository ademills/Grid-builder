import { mulberry32 } from './rng';

// Average ITU-R luminance (0-1) over a small grid of sample points within a cell.
function luminance(d, i) {
  return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
}

const SAMPLES_PER_AXIS = 3;

/**
 * Computes the set of "col,row" cells whose average brightness falls inside
 * (or, if `invert`, outside) the chosen tonal zone. Pure function — same
 * gridComputed + imagePixels + settings always produces the same set.
 */
export function computeBrightnessMask(gridComputed, imagePixels, settings) {
  const activeCells = new Set();
  if (!imagePixels) return activeCells;

  const { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed;
  const {
    targetZone = 'lights',
    lowPoint = 0.33,
    highPoint = 0.66,
    invert = false,
    softEdge = 0,
    seed = 0,
  } = settings;

  const { data, width, height, scaleX = 1, scaleY = 1 } = imagePixels;
  const rng = mulberry32(seed);

  let low = lowPoint, high = highPoint;
  if (targetZone === 'darks') { low = 0; high = lowPoint; }
  else if (targetZone === 'midtones') { low = lowPoint; high = highPoint; }
  else if (targetZone === 'lights') { low = highPoint; high = 1; }
  // 'custom' uses lowPoint/highPoint directly

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0, count = 0;
      for (let sy = 0; sy < SAMPLES_PER_AXIS; sy++) {
        for (let sx = 0; sx < SAMPLES_PER_AXIS; sx++) {
          const fx = (sx + 0.5) / SAMPLES_PER_AXIS;
          const fy = (sy + 0.5) / SAMPLES_PER_AXIS;
          const px = Math.round((gridOriginX + (c + fx) * cellSize) * scaleX);
          const py = Math.round((gridOriginY + (r + fy) * cellSize) * scaleY);
          const cx = Math.max(0, Math.min(px, width - 1));
          const cy = Math.max(0, Math.min(py, height - 1));
          sum += luminance(data, (cy * width + cx) * 4);
          count++;
        }
      }
      const brightness = sum / count;

      let active = brightness >= low && brightness <= high;
      if (invert) active = !active;

      if (!active && softEdge > 0) {
        const dist = Math.min(Math.abs(brightness - low), Math.abs(brightness - high));
        if (dist < softEdge) {
          const prob = 1 - dist / softEdge;
          if (rng() < prob) active = true;
        }
      }

      if (active) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}
