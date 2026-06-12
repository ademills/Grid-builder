import { simplex2 } from './noise';
import { mulberry32 } from './rng';

/**
 * Computes the set of "col,row" cells whose (fractal) Simplex noise value
 * falls in the top `threshold` fraction of the grid's noise range (the
 * "peaks"), or the bottom fraction (the "valleys") if `invert` is set.
 * Image-independent — entirely generative. Pure function.
 */
export function computeNoiseMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    scale = 0.2,
    threshold = 0.5,
    octaves = 1,
    seed = 0,
    invert = false,
  } = settings;

  const activeCells = new Set();
  if (threshold <= 0) return activeCells;

  const rng = mulberry32(seed);
  const offsetX = rng() * 1000;
  const offsetY = rng() * 1000;

  const values = new Array(rows);
  let min = Infinity, max = -Infinity;
  for (let r = 0; r < rows; r++) {
    values[r] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      let v = 0, amp = 1, freq = 1, ampSum = 0;
      for (let o = 0; o < octaves; o++) {
        v += simplex2((c * scale + offsetX) * freq, (r * scale + offsetY) * freq) * amp;
        ampSum += amp;
        amp *= 0.5;
        freq *= 2;
      }
      const n = v / ampSum;
      values[r][c] = n;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }

  const range = max - min || 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const norm = (values[r][c] - min) / range; // 0..1
      const active = invert ? norm <= threshold : norm >= 1 - threshold;
      if (active) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}
