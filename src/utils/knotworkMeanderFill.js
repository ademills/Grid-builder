// Solid blocky "negative space" mask for the knotwork meander zone: square
// Kufic script reads as thick orthogonal blocks with long straight runs and
// occasional right-angle turns, not thin strokes. This walks orthogonal-only
// paths (no diagonals, unlike knotworkPath.js's 8-way strand walker) confined
// to the meander zone, biased to keep going straight, then marks every
// visited cell active — the same `Set<"col,row">` shape every other
// compute*Mask in this codebase returns, so it drops into the existing
// mask-and-fill pipeline unchanged.
//
// Symmetry is applied to the seed walk itself (via knotworkSymmetry.js)
// rather than to the finished mask, so replicated copies share the same
// blocky topology instead of just mirroring pixels.

import { mulberry32 } from './rng';
import { computeKnotworkZones, knotworkZoneAt } from './knotworkGrid';
import { applyKnotworkSymmetry } from './knotworkSymmetry';

const DIRECTIONS = [
  { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
];

function cellKey(col, row) { return `${col},${row}`; }

function walkBlock(start, cols, rows, zones, visited, rng, straightBias, maxSteps) {
  const cells = [start];
  visited.add(cellKey(start.col, start.row));
  let { col, row } = start;
  let lastDirIndex = -1;

  for (let step = 0; step < maxSteps; step++) {
    const candidates = [];
    for (let i = 0; i < DIRECTIONS.length; i++) {
      const dir = DIRECTIONS[i];
      const nc = col + dir.dc, nr = row + dir.dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (knotworkZoneAt(zones, nc, nr) !== 'meander') continue;
      if (visited.has(cellKey(nc, nr))) continue;
      const weight = i === lastDirIndex ? straightBias : 1;
      candidates.push({ i, nc, nr, weight });
    }
    if (!candidates.length) break;

    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = rng() * total;
    let pick = candidates[candidates.length - 1];
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) { pick = c; break; }
    }

    lastDirIndex = pick.i;
    col = pick.nc; row = pick.nr;
    visited.add(cellKey(col, row));
    cells.push({ col, row });
  }

  return cells;
}

export function computeKnotworkMeanderMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    seed = 0,
    coreRadius = 3,
    density = 0.35,
    straightBias = 6,
    minRun = 3,
    symmetryMode = 'none',
    kaleidoscopeFold = 4,
  } = settings;

  const rng = mulberry32(seed);
  const zones = computeKnotworkZones(gridComputed, { coreRadius });

  const meanderCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (knotworkZoneAt(zones, c, r) === 'meander') meanderCells.push({ col: c, row: r });
    }
  }

  // Seed walks confined to one wedge only when a replicating symmetry mode
  // is active; 'none' walks the whole meander zone directly.
  const seedRegion = symmetryMode === 'none'
    ? meanderCells
    : meanderCells.filter(({ col, row }) => col <= (cols - 1) / 2 && row <= (rows - 1) / 2);

  const visited = new Set();
  const targetCount = Math.round(seedRegion.length * density);
  const maxSteps = cols * rows;
  let guard = seedRegion.length * 4;

  while (visited.size < targetCount && guard-- > 0) {
    const candidateStarts = seedRegion.filter(
      ({ col, row }) => !visited.has(cellKey(col, row))
    );
    if (!candidateStarts.length) break;
    const start = candidateStarts[Math.floor(rng() * candidateStarts.length)];
    const cells = walkBlock(start, cols, rows, zones, visited, rng, straightBias, maxSteps);
    if (cells.length < minRun) {
      cells.forEach(({ col, row }) => visited.delete(cellKey(col, row)));
    }
  }

  if (symmetryMode === 'none') return visited;
  return applyKnotworkSymmetry(visited, gridComputed, { mode: symmetryMode, kaleidoscopeFold });
}
