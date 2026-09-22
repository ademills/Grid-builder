export function computeHalftoneMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    dotSpacing = 4,
    maxRadius = 2,
    angle = 45,
    centerX = 0.5,
    centerY = 0.5,
    invert = false,
  } = settings;

  const activeCells = new Set();
  const rad = (angle * Math.PI) / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);
  const cx = centerX * cols, cy = centerY * rows;
  const spacing = Math.max(2, dotSpacing);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
      const rx = dx * cosA + dy * sinA;
      const ry = -dx * sinA + dy * cosA;

      const nearestX = Math.round(rx / spacing) * spacing;
      const nearestY = Math.round(ry / spacing) * spacing;
      const dist = Math.hypot(rx - nearestX, ry - nearestY);

      const distFromCenter = Math.hypot(dx, dy);
      const maxDist = Math.hypot(cols, rows) * 0.5;
      const normDist = Math.min(1, distFromCenter / maxDist);
      const radius = maxRadius * (invert ? normDist : 1 - normDist);

      if (dist <= radius) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}
