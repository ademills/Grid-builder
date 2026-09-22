// A genuinely woven Celtic-knot centre motif for the composition, built from
// knotworkLattice.js -- the classic "billiard weave" (a diagonal ray
// bouncing off the walls of a box, solved in closed form). Unlike the
// orthogonal meander walker, this weave produces true self-crossings by
// construction (two diagonal rays bouncing in a shared box necessarily
// cross), so no proximity test or duck-under logic is needed to get real
// interlace within the motif itself -- drawing each loop in sequence with
// the same background-cutter-then-colour technique used everywhere else in
// this build is enough, since a later loop's cutter pass automatically cuts
// a clean gap through any earlier loop it crosses.
//
// The motif is confined to its own small local grid (roughly coreRadius*2
// cells across) rather than the full canvas, then translated to sit
// centred in pixel space -- so it reads as a self-contained focal knot,
// distinct from (and not clipped by) the surrounding meander.

import { traceKnotworkLattice } from './knotworkLattice';
import { compileClosedKnotworkPath } from './knotworkGeometry';

// Returns an array of { d } compiled closed-loop path strings, in pixel
// space, centred on the design.
export function computeCelticCoreLoops(gridComputed, settings) {
  const { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed;
  const { coreRadius = 5, latticeCellRatio = 0.55, roundness = 1 } = settings;

  const cx = gridOriginX + (cols / 2) * cellSize;
  const cy = gridOriginY + (rows / 2) * cellSize;

  // A finer local cell size than the meander's own gives the knot more
  // strands to weave with inside the same physical radius, so it reads as
  // more intricate than the coarser surrounding maze rather than just a
  // scaled-up copy of it.
  const localCellSize = cellSize * latticeCellRatio;
  const boxRadiusPx = coreRadius * cellSize;
  const localSize = Math.max(4, Math.round((boxRadiusPx * 2) / localCellSize));
  const localGrid = { cols: localSize, rows: localSize, cellSize: localCellSize, gridOriginX: 0, gridOriginY: 0 };

  const loops = traceKnotworkLattice(localGrid);

  const originX = cx - (localSize / 2) * localCellSize;
  const originY = cy - (localSize / 2) * localCellSize;
  // Closed loops have no path ends to cap, so roundness only affects the
  // corner fillet here.
  const fillRadius = localCellSize * 0.42 * roundness;

  return loops
    .filter(loop => loop.length >= 3)
    .map(loop => {
      const pts = loop.map(({ col, row }) => ({
        x: originX + (col + 0.5) * localCellSize,
        y: originY + (row + 0.5) * localCellSize,
      }));
      return compileClosedKnotworkPath(pts, fillRadius);
    })
    .filter(Boolean);
}

// Renders the loops with the background-cutter-then-colour technique,
// cycling through `palette` per loop -- each loop reads as its own
// distinct interlocking cord, consistent with how the meander strands are
// coloured.
export function renderCelticCoreMarkup(loopPaths, cellSize, bg, palette, strokeRatio = 0.62) {
  const strokeWidth = cellSize * 0.55 * strokeRatio * 2;
  const gapWidth = strokeWidth * 0.12;
  const colors = palette.length ? palette : ['#000000'];
  let markup = '';
  loopPaths.forEach((d, i) => {
    const color = colors[i % colors.length];
    markup += `<path d="${d}" stroke="${bg}" stroke-width="${strokeWidth + gapWidth * 2}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
    markup += `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
  });
  return markup;
}
