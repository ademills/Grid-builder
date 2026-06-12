import { mulberry32 } from './rng';

// Splits [0, total) into `count` contiguous bands. With variance = 0 every
// band is the same size; higher variance draws random weights so some bands
// are thin scan-lines and others are wide torn chunks.
function generateBands(total, count, variance, rng) {
  if (count <= 0 || total <= 0) return [];
  if (variance <= 0) {
    const bands = [];
    for (let i = 0; i < count; i++) {
      bands.push({
        start: Math.round((i / count) * total),
        end: Math.round(((i + 1) / count) * total),
      });
    }
    return bands;
  }
  const weights = Array.from({ length: count }, () => 0.2 + rng());
  const sum = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const bands = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round((acc / sum) * total);
    acc += weights[i];
    const end = i === count - 1 ? total : Math.round((acc / sum) * total);
    bands.push({ start, end: Math.max(end, start + 1) });
  }
  return bands;
}

/**
 * Computes the set of "col,row" cells that should be populated by Glitch Fill.
 * Pure function — same gridComputed + settings always produces the same set.
 */
export function computeGlitchMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    hBars = 12,
    vBars = 0,
    force = 0.35,
    activeRatio = 0.4,
    barSizeVariance = 0.5,
    direction = 'h',
    bidirectional = true,
    seed = 0,
    minDisplacement = 1,
  } = settings;

  const rng = mulberry32(seed);
  const activeCells = new Set();

  if ((direction === 'h' || direction === 'both') && hBars > 0) {
    const bands = generateBands(rows, hBars, barSizeVariance, rng);
    for (const band of bands) {
      if (rng() > activeRatio) continue;
      const maxShift = Math.max(minDisplacement, Math.floor(cols * force));
      let shift = minDisplacement + Math.floor(rng() * (maxShift - minDisplacement + 1));
      if (bidirectional && rng() > 0.5) shift = -shift;
      for (let r = Math.max(0, band.start); r < Math.min(rows, band.end); r++) {
        for (let c = 0; c < cols; c++) {
          const destCol = c + shift;
          if (destCol >= 0 && destCol < cols) activeCells.add(`${destCol},${r}`);
        }
      }
    }
  }

  if ((direction === 'v' || direction === 'both') && vBars > 0) {
    const bands = generateBands(cols, vBars, barSizeVariance, rng);
    for (const band of bands) {
      if (rng() > activeRatio) continue;
      const maxShift = Math.max(minDisplacement, Math.floor(rows * force));
      let shift = minDisplacement + Math.floor(rng() * (maxShift - minDisplacement + 1));
      if (bidirectional && rng() > 0.5) shift = -shift;
      for (let c = Math.max(0, band.start); c < Math.min(cols, band.end); c++) {
        for (let r = 0; r < rows; r++) {
          const destRow = r + shift;
          if (destRow >= 0 && destRow < rows) activeCells.add(`${c},${destRow}`);
        }
      }
    }
  }

  return activeCells;
}
