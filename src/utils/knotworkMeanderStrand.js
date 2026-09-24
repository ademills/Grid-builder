// Renders the meander zone as thick, rounded-cap strands winding through the
// grid. This is not a literal reproduction of either Celtic knotwork or
// square Kufic script -- it takes its basis from both but is its own style:
// every meander cell gets covered (no bare background gaps), strand length
// is unconstrained (a run can be as short as two cells or wind across most
// of the zone), no strand ever overlaps another (or itself), and any
// leftover single cell that cannot extend into a real run becomes a
// single-cell dot accent rather than being left uncovered.
//
// Orthogonal-only moves (no diagonals) keep the right-angle character; at
// radius = cellSize/2 the arc compiler (knotworkGeometry.js) turns every
// corner into a clean quarter-circle fillet, and two same-turn corners one
// cell apart fuse into a full semicircle loopback automatically.
//
// Structure/symmetry comes from optional "wall" cells the walker cannot
// cross -- seeded in one region and replicated via knotworkSymmetry.js --
// plus, when a symmetry mode is active, the strands themselves: a first
// pass walks ONLY inside the seed region, treating everything outside it
// as an extra wall, then each finished path/dot is geometrically
// replicated the same way the walls are. Whatever that pass still leaves
// bare -- seed-side dead ends, or 90-degree-family replicas clipped off a
// non-square canvas -- gets mopped up by a final unrestricted pass
// identical to the plain none algorithm, so coverage is always complete
// even where the symmetry is not perfectly exact.
//
// An optional textMaskCells set (knotworkTextMask.js, "weave as letters")
// adds a third pass ahead of both of the above: confined to the mask the
// same way the symmetry pass is confined to its seed region, so a word's
// letterforms get claimed first and read clearly, with the symmetry pass
// and mop-up filling in whatever is left exactly as they already do.
// Core-zone cells are always walled off too, since the ring+cross template
// (knotworkCoreTemplate.js) owns that area.

import { mulberry32 } from './rng';
import { computeKnotworkZones, knotworkZoneAt } from './knotworkGrid';
import { applyKnotworkSymmetry, getSymmetrySeedRegionTest, getSymmetryTransforms } from './knotworkSymmetry';
import { knotworkPathToPixels, compileKnotworkPath } from './knotworkGeometry';

const DIRECTIONS = [
  { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
];

function cellKey(col, row) { return col + "," + row; }

function legalMoves(col, row, cols, rows, zones, blocked, claimed, onlyDir) {
  const out = [];
  for (let i = 0; i < DIRECTIONS.length; i++) {
    if (onlyDir !== null && i !== onlyDir) continue;
    const dir = DIRECTIONS[i];
    const nc = col + dir.dc, nr = row + dir.dr;
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
    if (knotworkZoneAt(zones, nc, nr) !== "meander") continue;
    if (blocked.has(cellKey(nc, nr))) continue;
    if (claimed.has(cellKey(nc, nr))) continue;
    out.push({ i, nc, nr });
  }
  return out;
}

function walkStrand(start, cols, rows, zones, blocked, claimed, rng, straightBias, minStraightRun, maxSteps) {
  const path = [start];
  claimed.add(cellKey(start.col, start.row));
  let { col, row } = start;
  let lastDirIndex = -1;
  let stepsSinceTurn = Infinity;

  for (let step = 0; step < maxSteps; step++) {
    const mustGoStraight = lastDirIndex !== -1 && stepsSinceTurn < minStraightRun;
    let moves = legalMoves(col, row, cols, rows, zones, blocked, claimed, mustGoStraight ? lastDirIndex : null);
    if (!moves.length) break;

    const candidates = moves.map(m => ({ ...m, weight: m.i === lastDirIndex ? straightBias : 1 }));
    const total = candidates.reduce((sum, c) => sum + c.weight, 0);
    let roll = rng() * total;
    let pick = candidates[candidates.length - 1];
    for (const c of candidates) {
      roll -= c.weight;
      if (roll <= 0) { pick = c; break; }
    }

    stepsSinceTurn = pick.i === lastDirIndex ? stepsSinceTurn + 1 : 0;
    lastDirIndex = pick.i;
    col = pick.nc; row = pick.nr;
    claimed.add(cellKey(col, row));
    path.push({ col, row });
  }

  return path;
}

function addSymmetricReplicas(cells, transforms, cols, rows, claimed) {
  const replicas = [];
  for (const transform of transforms) {
    const mapped = cells.map(cell => transform(cell, cols, rows));
    const inBounds = mapped.every(function (cell) { return cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows; });
    if (!inBounds) continue;
    const free = mapped.every(function (cell) { return !claimed.has(cellKey(cell.col, cell.row)); });
    if (!free) continue;
    for (const cell of mapped) claimed.add(cellKey(cell.col, cell.row));
    replicas.push(mapped);
  }
  return replicas;
}

export function computeKnotworkMeanderStrands(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    seed = 0,
    coreRadius = 5,
    straightBias = 6,
    minStraightRun = 1,
    density = 1,
    wallDensity = 0.08,
    symmetryMode = "none",
    kaleidoscopeFold = 4,
    // Set<"col,row"> of cells a "weave as letters" text mask wants covered
    // first (knotworkTextMask.js), or null/undefined when the feature is
    // off. Claimed before the symmetry pass and the general mop-up, both
    // of which already respect whatever is pre-claimed.
    textMaskCells = null,
  } = settings;

  const rng = mulberry32(seed);
  const zones = computeKnotworkZones(gridComputed, { coreRadius });

  const meanderCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (knotworkZoneAt(zones, c, r) === "meander") meanderCells.push({ col: c, row: r });
    }
  }

  const seedTest = getSymmetrySeedRegionTest(symmetryMode, kaleidoscopeFold);
  const transforms = getSymmetryTransforms(symmetryMode, kaleidoscopeFold);

  const wallSeedRegion = symmetryMode === "none"
    ? meanderCells
    : meanderCells.filter(function (cell) { return seedTest(cell.col, cell.row, cols, rows); });

  const wallSeed = new Set();
  for (const cell of wallSeedRegion) {
    if (rng() < wallDensity) wallSeed.add(cellKey(cell.col, cell.row));
  }
  const walls = symmetryMode === "none"
    ? wallSeed
    : applyKnotworkSymmetry(wallSeed, gridComputed, { mode: symmetryMode, kaleidoscopeFold: kaleidoscopeFold });

  const claimed = new Set();
  const maxSteps = cols * rows;
  const paths = [];
  const singleCellDots = [];
  const targetVisited = Math.round(meanderCells.length * density);

  // Letters-first pass: confined to textMaskCells the same way the
  // symmetry pass below is confined to its seed region -- blocked = walls
  // plus every meander cell outside the mask, so a walk can never wander
  // out of the letterform and blur its edges. Runs before the symmetry
  // pass and the general mop-up, both of which already treat whatever is
  // pre-claimed here as unavailable, so this composes with either.
  if (textMaskCells && textMaskCells.size) {
    const letterCells = meanderCells.filter(function (cell) { return textMaskCells.has(cellKey(cell.col, cell.row)); });
    const outsideLetters = new Set();
    for (const cell of meanderCells) {
      if (!textMaskCells.has(cellKey(cell.col, cell.row))) outsideLetters.add(cellKey(cell.col, cell.row));
    }
    const lettersBlocked = new Set([...walls, ...outsideLetters]);

    let letterClaimedCount = 0;
    let guardLetters = letterCells.length + 10;
    while (letterClaimedCount < letterCells.length && guardLetters-- > 0) {
      const starts = letterCells.filter(function (cell) {
        return !claimed.has(cellKey(cell.col, cell.row)) && !lettersBlocked.has(cellKey(cell.col, cell.row));
      });
      if (!starts.length) break;
      const start = starts[Math.floor(rng() * starts.length)];
      const path = walkStrand(start, cols, rows, zones, lettersBlocked, claimed, rng, straightBias, minStraightRun, maxSteps);
      letterClaimedCount += path.length;
      if (path.length >= 2) paths.push(path);
      else singleCellDots.push(path[0]);
    }
  }
  // Everything pushed to `paths`/`singleCellDots` above (if anything) came
  // from the letters pass; the symmetry pass and mop-up below only ever
  // append after this point. Recording the counts here lets the compose
  // step (knotworkCompose.js) tell letter strands/dots apart from general
  // ones by index alone, with no extra bookkeeping through the walk.
  const letterPathCount = paths.length;
  const letterDotCount = singleCellDots.length;

  if (transforms.length) {
    const seedCells = meanderCells.filter(function (cell) { return seedTest(cell.col, cell.row, cols, rows); });
    const outsideSeed = new Set();
    for (const cell of meanderCells) {
      if (!seedTest(cell.col, cell.row, cols, rows)) outsideSeed.add(cellKey(cell.col, cell.row));
    }
    const seedBlocked = new Set([...walls, ...outsideSeed]);
    const targetSeedVisited = Math.round(seedCells.length * density);

    let seedClaimedCount = 0;
    let guardSeed = seedCells.length + 10;
    while (seedClaimedCount < targetSeedVisited && guardSeed-- > 0) {
      const starts = seedCells.filter(function (cell) {
        return !claimed.has(cellKey(cell.col, cell.row)) && !seedBlocked.has(cellKey(cell.col, cell.row));
      });
      if (!starts.length) break;
      const start = starts[Math.floor(rng() * starts.length)];
      const path = walkStrand(start, cols, rows, zones, seedBlocked, claimed, rng, straightBias, minStraightRun, maxSteps);
      seedClaimedCount += path.length;

      if (path.length >= 2) {
        paths.push(path);
        for (const replica of addSymmetricReplicas(path, transforms, cols, rows, claimed)) paths.push(replica);
      } else {
        singleCellDots.push(path[0]);
        for (const replica of addSymmetricReplicas(path, transforms, cols, rows, claimed)) singleCellDots.push(replica[0]);
      }
    }
  }

  let guard = meanderCells.length + 10;
  while (claimed.size < targetVisited && guard-- > 0) {
    const starts = meanderCells.filter(function (cell) {
      return !claimed.has(cellKey(cell.col, cell.row)) && !walls.has(cellKey(cell.col, cell.row));
    });
    if (!starts.length) break;
    const start = starts[Math.floor(rng() * starts.length)];
    const path = walkStrand(start, cols, rows, zones, walls, claimed, rng, straightBias, minStraightRun, maxSteps);
    if (path.length >= 2) paths.push(path);
    else singleCellDots.push(path[0]);
  }

  return { paths: paths, singleCellDots: singleCellDots, letterPathCount: letterPathCount, letterDotCount: letterDotCount };
}

export function compileKnotworkMeanderStrands(paths, gridComputed, radius) {
  return paths
    .map(function (path) { return knotworkPathToPixels(path, gridComputed); })
    .map(function (points) { return compileKnotworkPath(points, radius); })
    .filter(Boolean);
}
