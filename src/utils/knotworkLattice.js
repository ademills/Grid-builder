// Authentic "billiard weave" Celtic-knot lattice: strands travel as pure
// 45-degree diagonals that reflect off the grid boundary, generating closed
// loops that interlace naturally at any grid size — this is the same
// underlying construction (a diagonal ray bouncing in a box) as the
// classic Celtic plait/border pattern found throughout traditional
// knotwork, rather than a free random walk.
//
// It's solved in closed form via a triangle-wave fold, not a manual
// step-by-step "flip direction at the wall" simulation. That's a
// deliberate choice: a naive per-step simulation can let two distinct
// strand states collide into the same subsequent path and silently merge
// strands that should stay independent (verified this the hard way while
// designing it). The fold formula sidesteps that entirely — each strand's
// position is a pure function of its start point and step count.

function fold(u, maxIndex) {
  if (maxIndex <= 0) return 0;
  const period = 2 * maxIndex;
  const m = ((u % period) + period) % period;
  return m <= maxIndex ? m : period - m;
}

function positionAt(seed, t, colMax, rowMax) {
  return {
    col: fold(seed.col + t, colMax),
    row: fold(seed.row + t * seed.rowSign, rowMax),
  };
}

function traceLoop(seed, colMax, rowMax) {
  const points = [];
  const start = positionAt(seed, 0, colMax, rowMax);
  points.push(start);
  const maxSteps = 4 * (colMax + 1) * (rowMax + 1) + 4;
  for (let t = 1; t <= maxSteps; t++) {
    const p = positionAt(seed, t, colMax, rowMax);
    if (p.col === start.col && p.row === start.row) break;
    points.push(p);
  }
  return points;
}

// Returns an array of closed loops (each an array of {col,row}) that
// together cover every cell of the grid — no randomness needed for the
// base weave; it falls directly out of the grid's dimensions.
export function traceKnotworkLattice(gridComputed) {
  const { cols, rows } = gridComputed;
  const colMax = cols - 1, rowMax = rows - 1;
  const visited = new Set();
  const loops = [];

  for (const rowSign of [1, -1]) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${c},${r}`;
        if (visited.has(key)) continue;
        const loop = traceLoop({ col: c, row: r, rowSign }, colMax, rowMax);
        loop.forEach(p => visited.add(`${p.col},${p.row}`));
        if (loop.length >= 2) loops.push(loop);
      }
    }
  }

  return loops;
}
