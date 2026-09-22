// Seeded 8-way continuous pathfinder. Walks the grid using the eight
// 45°-increment directions (orthogonal + diagonal), self-avoiding within a
// single call's shared `visited` set (one structural layer). Turn behaviour
// is weighted per cell zone: `core` cells favour tight, same-direction turn
// pairs (which the geometry compiler fuses into clean semicircle loopbacks,
// see knotworkGeometry.js), `meander` cells favour long straight/diagonal
// runs with occasional turns, Kufic-maze style.

import { mulberry32 } from './rng';
import { computeKnotworkZones, knotworkZoneAt } from './knotworkGrid';

// Eight directions in 45° steps, index order matters: adjacent indices are
// 45° turns, +/-2 are 90° turns, +/-4 is a full reversal.
const DIRECTIONS = [
  { dc: 1, dr: 0 }, { dc: 1, dr: 1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 1 },
  { dc: -1, dr: 0 }, { dc: -1, dr: -1 }, { dc: 0, dr: -1 }, { dc: 1, dr: -1 },
];

const TURN_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4];

function cellKey(col, row) { return `${col},${row}`; }

// Base turn-offset weights per zone; `turnBias` (0..1) blends toward the
// core profile even outside the core zone, for a global "how twisty" knob.
function weightFor(offset, zone, turnBias, lastTurnSign) {
  const absOffset = Math.abs(offset);
  const meanderWeights = [5, 3, 3, 1, 1, 0.3, 0.3, 0.05];
  const coreWeights = [1, 2, 2, 4, 4, 2, 2, 0.5];
  const base = zone === 'core' ? coreWeights[absOffset] : meanderWeights[absOffset];
  const blended = zone === 'core'
    ? base
    : base + (coreWeights[absOffset] - base) * turnBias;

  // Favour repeating the previous turn's rotational sign at a 90° offset —
  // this is what lets two consecutive fillets fuse into one loopback arc.
  if (lastTurnSign !== 0 && absOffset === 2 && Math.sign(offset) === lastTurnSign) {
    return blended * 2;
  }
  return blended;
}

function pickWeighted(candidates, rng) {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return candidates[candidates.length - 1];
}

function walkPath(start, startDir, gridComputed, zones, visited, rng, turnBias, maxSteps, blockedCells) {
  const { cols, rows } = gridComputed;
  const path = [start];
  visited.add(cellKey(start.col, start.row));

  let { col, row } = start;
  let dirIndex = startDir;
  let lastTurnSign = 0;

  for (let step = 0; step < maxSteps; step++) {
    const zone = knotworkZoneAt(zones, col, row);
    const candidates = [];

    for (const offset of TURN_OFFSETS) {
      const dir = DIRECTIONS[(dirIndex + offset + 8) % 8];
      const nc = col + dir.dc, nr = row + dir.dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (visited.has(cellKey(nc, nr))) continue;
      if (blockedCells && blockedCells.has(cellKey(nc, nr))) continue;
      candidates.push({ offset, nc, nr, weight: weightFor(offset, zone, turnBias, lastTurnSign) });
    }

    const pick = pickWeighted(candidates, rng);
    if (!pick) break;

    dirIndex = (dirIndex + pick.offset + 8) % 8;
    lastTurnSign = pick.offset === 0 ? lastTurnSign : Math.sign(pick.offset);
    col = pick.nc; row = pick.nr;
    visited.add(cellKey(col, row));
    path.push({ col, row });
  }

  return path;
}

// Returns an array of paths (each an array of {col,row}), self-avoiding as
// a group (they share one `visited` occupancy set — one structural layer).
export function generateKnotworkPaths(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    seed = 0,
    coreRadius = 3,
    turnBias = 0.5,
    numPaths = 1,
    minPathLength = 3,
    blockedCells = null,
  } = settings;

  const rng = mulberry32(seed);
  const zones = computeKnotworkZones(gridComputed, { coreRadius });
  const visited = new Set();
  const maxSteps = cols * rows;

  const paths = [];
  for (let p = 0; p < numPaths; p++) {
    let start = null;
    for (let tries = 0; tries < cols * rows && !start; tries++) {
      const c = Math.floor(rng() * cols);
      const r = Math.floor(rng() * rows);
      if (visited.has(cellKey(c, r))) continue;
      if (blockedCells && blockedCells.has(cellKey(c, r))) continue;
      start = { col: c, row: r };
    }
    if (!start) break;

    const startDir = Math.floor(rng() * 8);
    const path = walkPath(start, startDir, gridComputed, zones, visited, rng, turnBias, maxSteps, blockedCells);
    if (path.length >= minPathLength) paths.push(path);
  }

  return paths;
}
