import { simplex2 } from './noise';
import { mulberry32 } from './rng';

export function computeFlowFieldMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    scale = 0.08,
    numLines = 30,
    lineLength = 40,
    lineWidth = 1,
    seed = 0,
  } = settings;

  const activeCells = new Set();
  const rng = mulberry32(seed);
  const offsetX = rng() * 1000;
  const offsetY = rng() * 1000;
  const w = Math.max(0.5, lineWidth);

  for (let i = 0; i < Math.max(1, numLines); i++) {
    let x = rng() * cols;
    let y = rng() * rows;

    for (let step = 0; step < Math.max(1, lineLength); step++) {
      const angle = simplex2(
        (x * scale) + offsetX,
        (y * scale) + offsetY
      ) * Math.PI * 2;

      const cx = Math.floor(x), cy = Math.floor(y);
      for (let dr = -Math.ceil(w); dr <= Math.ceil(w); dr++) {
        for (let dc = -Math.ceil(w); dc <= Math.ceil(w); dc++) {
          const nr = cy + dr, nc = cx + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (Math.hypot(dc, dr) <= w) activeCells.add(`${nc},${nr}`);
          }
        }
      }

      x += Math.cos(angle) * 0.8;
      y += Math.sin(angle) * 0.8;

      if (x < 0 || x >= cols || y < 0 || y >= rows) break;
    }
  }

  return activeCells;
}
