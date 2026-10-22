import { regroupCopies } from './groups';

// Move tool: works out what dropping the blocks `ids` (dc, dr) cells away
// would do. Pure, so the canvas can preview the result while dragging.
//
// Blocks already on the target cells are handled by `mode`:
//   'replace' — they're removed
//   'swap'    — they move into the cells the moved blocks leave (first where
//               they'd land by trading places, else the first space that fits)
// Copying (Alt+drag) leaves the originals and always replaces.
// Locked blocks in the way stop the drop. Layout wireframes are ignored.
//
// Returns { ok, blocks, movedIds, targets, reason? }
//   blocks   — the block list after the drop (the input list when !ok)
//   movedIds — ids of the moved blocks (the new copies when copying)
//   targets  — [{ gridCol, gridRow, cols, rows }] where the moved blocks land

const cellsOf = (b, dc = 0, dr = 0) => {
  const out = [];
  for (let r = 0; r < b.rows; r++)
    for (let c = 0; c < b.cols; c++) out.push(`${b.gridCol + c + dc},${b.gridRow + r + dr}`);
  return out;
};

const overlaps = (a, b) =>
  a.gridCol < b.gridCol + b.cols && a.gridCol + a.cols > b.gridCol &&
  a.gridRow < b.gridRow + b.rows && a.gridRow + a.rows > b.gridRow;

// The furthest the blocks can move each way and stay on the grid.
export function moveLimits(blocks, ids, cols, rows) {
  const moving = blocks.filter(b => ids.has(b.id));
  return {
    minDc: -Math.min(...moving.map(b => b.gridCol)),
    maxDc: cols - Math.max(...moving.map(b => b.gridCol + b.cols)),
    minDr: -Math.min(...moving.map(b => b.gridRow)),
    maxDr: rows - Math.max(...moving.map(b => b.gridRow + b.rows)),
  };
}

export function planMove(blocks, ids, dc, dr, { cols, rows }, mode = 'replace', copy = false) {
  const moving = blocks.filter(b => ids.has(b.id));
  const fail = (reason) => ({ ok: false, reason, blocks, movedIds: [...ids], targets: moving.map(b => ({ ...b, gridCol: b.gridCol + dc, gridRow: b.gridRow + dr })) });
  if (!moving.length) return fail('empty');
  if (!dc && !dr && !copy) return { ok: true, blocks, movedIds: [...ids], targets: moving };

  let moved = moving.map(b => ({ ...b, gridCol: b.gridCol + dc, gridRow: b.gridRow + dr }));
  if (moved.some(b => b.gridCol < 0 || b.gridRow < 0 || b.gridCol + b.cols > cols || b.gridRow + b.rows > rows)) return fail('bounds');
  if (copy) {
    moved = regroupCopies(moved).blocks.map(b => ({ ...b, id: crypto.randomUUID() }));
    mode = 'replace';
  }

  const still = copy ? blocks : blocks.filter(b => !ids.has(b.id));
  const blockers = still.filter(b => b.type !== 'wireframe' && moved.some(m => overlaps(b, m)));
  if (blockers.some(b => b.locked)) return fail('locked');

  const blockerIds = new Set(blockers.map(b => b.id));
  const result = { ok: true, movedIds: moved.map(b => b.id), targets: moved };

  if (mode !== 'swap' || !blockers.length) {
    return { ...result, blocks: [...still.filter(b => !blockerIds.has(b.id)), ...moved] };
  }

  // Swap: blockers go into cells nobody will occupy after the move — the
  // moved blocks' old cells and the blockers' own cells outside the targets.
  const target = new Set(moved.flatMap(b => cellsOf(b)));
  const free = new Set([...moving, ...blockers].flatMap(b => cellsOf(b)).filter(k => !target.has(k)));
  const fits = (b, col, row) => {
    if (col < 0 || row < 0 || col + b.cols > cols || row + b.rows > rows) return false;
    return cellsOf({ ...b, gridCol: col, gridRow: row }).every(k => free.has(k));
  };
  const freeAnchors = () => [...free].map(k => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  const placed = new Map();
  for (const b of [...blockers].sort((a, b) => b.cols * b.rows - a.cols * a.rows)) {
    let spot = fits(b, b.gridCol - dc, b.gridRow - dr) ? [b.gridCol - dc, b.gridRow - dr] : null;
    if (!spot) spot = freeAnchors().find(([c, r]) => fits(b, c, r)) ?? null;
    if (!spot) return fail('swap');
    const next = { ...b, gridCol: spot[0], gridRow: spot[1] };
    for (const k of cellsOf(next)) free.delete(k);
    placed.set(b.id, next);
  }
  return { ...result, blocks: [...still.map(b => placed.get(b.id) ?? b), ...moved] };
}
