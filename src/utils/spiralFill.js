export function computeSpiralMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    arms = 1,
    width = 2,
    tightness = 0.15,
    centerX = 0.5,
    centerY = 0.5,
    direction = 1,
  } = settings;

  const activeCells = new Set();
  const cx = centerX * cols, cy = centerY * rows;
  const maxDist = Math.hypot(cols, rows) * 0.5;
  const numArms = Math.max(1, arms);
  const armAngle = (2 * Math.PI) / numArms;
  const t = Math.max(0.02, tightness);
  const halfWidth = Math.max(0.5, width) * 0.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c + 0.5 - cx, dy = r + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) { activeCells.add(`${c},${r}`); continue; }

      const angle = Math.atan2(dy * direction, dx);
      const spiralAngle = dist * t;

      let minGap = Infinity;
      for (let a = 0; a < numArms; a++) {
        const armStart = a * armAngle;
        let diff = angle - spiralAngle - armStart;
        diff = ((diff % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
        const gap = Math.abs(diff) * dist;
        if (gap < minGap) minGap = gap;
      }

      if (minGap <= halfWidth) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}
