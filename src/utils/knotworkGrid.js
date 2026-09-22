// Classifies each grid cell into the knotwork "core" (tight-looping zone) or
// "meander" (outer randomized Kufic-style zone). Pure data — no rendering,
// no randomness — so the pathfinder and geometry compiler can be developed
// and tested against it independently.

export function computeKnotworkZones(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const { coreRadius = 3 } = settings;

  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;

  const zones = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dist = Math.hypot(c - cx, r - cy);
      zones.set(`${c},${r}`, dist <= coreRadius ? 'core' : 'meander');
    }
  }
  return zones;
}

export function knotworkZoneAt(zones, col, row) {
  return zones.get(`${col},${row}`) ?? 'meander';
}
