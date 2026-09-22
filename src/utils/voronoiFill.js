import { mulberry32 } from './rng';

export function computeVoronoiMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    numPoints = 12,
    fillRatio = 0.5,
    borderOnly = false,
    borderWidth = 1,
    seed = 0,
  } = settings;

  const activeCells = new Set();
  const rng = mulberry32(seed);

  const points = [];
  for (let i = 0; i < Math.max(2, numPoints); i++) {
    points.push({ x: rng() * cols, y: rng() * rows });
  }

  const regionForCell = (c, r) => {
    let minDist = Infinity, closest = 0;
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(c + 0.5 - points[i].x, r + 0.5 - points[i].y);
      if (d < minDist) { minDist = d; closest = i; }
    }
    return closest;
  };

  const regionMap = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => regionForCell(c, r))
  );

  if (borderOnly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const region = regionMap[r][c];
        let isBorder = false;
        for (let dr = -borderWidth; dr <= borderWidth && !isBorder; dr++) {
          for (let dc = -borderWidth; dc <= borderWidth && !isBorder; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) { isBorder = true; break; }
            if (regionMap[nr][nc] !== region) isBorder = true;
          }
        }
        if (isBorder) activeCells.add(`${c},${r}`);
      }
    }
  } else {
    const activeRegions = new Set();
    const numActive = Math.max(1, Math.round(points.length * fillRatio));
    const indices = Array.from({ length: points.length }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let i = 0; i < numActive; i++) activeRegions.add(indices[i]);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (activeRegions.has(regionMap[r][c])) activeCells.add(`${c},${r}`);
      }
    }
  }

  return activeCells;
}
