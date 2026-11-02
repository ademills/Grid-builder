// Building a Meander by hand: strands removed one at a time (with their
// symmetric partners) and new ones grown into the empty cells.
//
// Every strand / dot block carries the cells it runs through (`cells`, as
// [col, row] pairs) and the layout signature it was walked under
// (`layoutSig`, see meanderLayoutSig). That's the layout: a reshape draws
// it again from the blocks rather than walking a new one from the seed, so
// removed strands stay removed and grown ones stay.

import { computeKnotworkZones, knotworkZoneAt } from './knotworkGrid';
import { getSymmetryTransforms } from './knotworkSymmetry';
import { meanderKeyIndex } from './knotworkCompose';

const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const cellKey = (col, row) => `${col},${row}`;

// A design's own strands and dots: the main design's keys are 's3' / 'd0',
// a plate's 'p<id>:s3'.
const designPart = (prefix) => new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[sd]\\d+$`);
export const isMeanderStrand = (block, prefix = '') => block.meanderKey != null && designPart(prefix).test(block.meanderKey);

// The layout drawn by a design's blocks ({ sig, strands, dots }), or null
// when they don't carry one (built before v1.11). composeKnotworkLayers
// draws it only while its sig is current -- a reshape after a layout
// setting changed lays out afresh -- but a hand edit keeps what's on the
// canvas, so it passes the layout on with the current sig.
export function meanderLayoutOf(blocks, prefix) {
  const own = blocks.filter(b => isMeanderStrand(b, prefix));
  const sig = own[0]?.layoutSig;
  if (!own.length || own.some(b => !b.cells || b.layoutSig !== sig)) return null;
  const entry = b => ({ key: b.meanderKey.slice(prefix.length), cells: b.cells, letter: !!b.letter });
  const strands = own.filter(b => b.cells.length > 1).map(entry);
  const dots = own.filter(b => b.cells.length === 1).map(entry);
  return { sig, strands, dots };
}

// The layout a rebuild draws a design with (composeKnotworkLayers checks
// its sig). A main design emptied by hand -- a Meander with no strands
// left, plates aside -- stays empty rather than walking a new one.
export function meanderRebuildLayout(blocks, prefix, sig) {
  const own = meanderLayoutOf(blocks, prefix);
  if (own || prefix !== '') return own;
  const designed = blocks.some(b => b.meanderKey != null);
  return designed && !blocks.some(b => isMeanderStrand(b)) ? { sig, strands: [], dots: [] } : null;
}

const sameCells = (a, b) => {
  if (a.length !== b.length) return false;
  const set = new Set(a.map(([c, r]) => cellKey(c, r)));
  return b.every(([c, r]) => set.has(cellKey(c, r)));
};

// The block and the blocks of the same design that are its mirror / rotated
// images under the symmetry (grid: the design's { cols, rows }).
export function meanderPartners(blocks, block, settings, grid) {
  const prefix = /^(p[^:]+:)?/.exec(block.meanderKey)[0];
  const out = new Set([block.id]);
  if (!block.cells) return out;
  const own = blocks.filter(b => b !== block && b.cells && isMeanderStrand(b, prefix));
  for (const T of getSymmetryTransforms(settings.symmetryMode ?? 'none', settings.kaleidoscopeFold ?? 4)) {
    const image = block.cells.map(([col, row]) => { const c = T({ col, row }, grid.cols, grid.rows); return [c.col, c.row]; });
    const twin = own.find(b => sameCells(b.cells, image));
    if (twin) out.add(twin.id);
  }
  return out;
}

// The design's strand at a cell, if any.
export function meanderStrandAt(blocks, prefix, col, row) {
  return blocks.find(b => b.cells && isMeanderStrand(b, prefix) && b.cells.some(([c, r]) => c === col && r === row)) ?? null;
}

// Grows a new strand from the empty cell `start` ({ col, row }) through
// empty cells only, the same random walk the generator uses (straightness,
// minimum straight run), going both ways from the start until stuck -- it
// may fill the whole gap or stop at one cell. With symmetry on, its images
// are grown with it: a cell is only taken while each image is empty too.
// Images that would land on the start itself (a cell on a mirror axis, or
// the centre) keep the walk on that axis, so the strand is its own mirror
// image there. Returns the new strands' cells ([[col, row], ...] each, the
// grown strand first), or [] when the start isn't free.
export function growMeanderStrands(grid, settings, layout, start, rng) {
  const { cols, rows } = grid;
  const coreRadius = settings.coreStyle === 'none' || settings.coreStyle == null ? 0
    : Math.max(1, Math.min(settings.coreRadius ?? 5, Math.floor(Math.min(cols, rows) / 2) - 2));
  const zones = computeKnotworkZones(grid, { coreRadius });
  const taken = new Set();
  for (const s of [...(layout?.strands ?? []), ...(layout?.dots ?? [])]) for (const [c, r] of s.cells) taken.add(cellKey(c, r));
  const open = (col, row) => col >= 0 && row >= 0 && col < cols && row < rows
    && knotworkZoneAt(zones, col, row) === 'meander' && !taken.has(cellKey(col, row));
  if (!open(start.col, start.row)) return [];

  const transforms = getSymmetryTransforms(settings.symmetryMode ?? 'none', settings.kaleidoscopeFold ?? 4);
  const at = (T, cell) => T(cell, cols, rows);
  const same = (a, b) => a.col === b.col && a.row === b.row;
  // Maps that fix the start pin the walk to their axis; the rest copy it,
  // one copy per distinct image of the start.
  const fixing = transforms.filter(T => same(at(T, start), start));
  const copies = [];
  for (const T of transforms) {
    if (fixing.includes(T)) continue;
    const img = at(T, start);
    if (img.col < 0 || img.row < 0 || img.col >= cols || img.row >= rows) continue;
    if (copies.some(U => same(at(U, start), img))) continue;
    copies.push(T);
  }
  const claimed = new Set();
  // Whether the walk may take `cell`: empty, on every fixing axis, and each
  // copy's image empty, distinct and not the cell itself.
  const canTake = (cell) => {
    if (!open(cell.col, cell.row) || claimed.has(cellKey(cell.col, cell.row))) return false;
    if (!fixing.every(T => same(at(T, cell), cell))) return false;
    const seen = new Set([cellKey(cell.col, cell.row)]);
    for (const T of copies) {
      const img = at(T, cell), k = cellKey(img.col, img.row);
      if (seen.has(k) || !open(img.col, img.row) || claimed.has(k)) return false;
      seen.add(k);
    }
    return true;
  };
  const claim = (cell) => {
    claimed.add(cellKey(cell.col, cell.row));
    for (const T of copies) { const img = at(T, cell); claimed.add(cellKey(img.col, img.row)); }
  };
  if (!canTake(start)) return [];
  claim(start);

  const straightBias = settings.straightBias ?? 14;
  const minStraightRun = settings.minStraightRun ?? 1;
  const walk = (from, firstDir, forbidDir) => {
    const path = [];
    let { col, row } = from;
    let lastDir = firstDir, sinceTurn = Infinity;
    for (let n = 0; n < cols * rows; n++) {
      const mustGoStraight = lastDir !== -1 && sinceTurn < minStraightRun;
      const moves = [];
      DIRECTIONS.forEach(([dc, dr], i) => {
        if (mustGoStraight && i !== lastDir) return;
        if (path.length === 0 && i === forbidDir) return;
        const cell = { col: col + dc, row: row + dr };
        if (canTake(cell)) moves.push({ i, cell, weight: i === lastDir ? straightBias : 1 });
      });
      if (!moves.length) break;
      let roll = rng() * moves.reduce((s, m) => s + m.weight, 0);
      let pick = moves[moves.length - 1];
      for (const m of moves) { roll -= m.weight; if (roll <= 0) { pick = m; break; } }
      sinceTurn = pick.i === lastDir ? sinceTurn + 1 : 0;
      lastDir = pick.i;
      ({ col, row } = pick.cell);
      claim(pick.cell);
      path.push(pick.cell);
    }
    return path;
  };
  const ahead = walk(start, -1, -1);
  // Then back the other way from the start, so the strand can run through it.
  const firstDir = ahead.length ? DIRECTIONS.findIndex(([dc, dr]) => ahead[0].col - start.col === dc && ahead[0].row - start.row === dr) : -1;
  const behind = walk(start, -1, firstDir);
  const cells = [...behind.reverse(), start, ...ahead];
  const strand = cells.map(c => [c.col, c.row]);
  return [strand, ...copies.map(T => cells.map(c => { const img = at(T, c); return [img.col, img.row]; }))];
}

// The layout with new strands added (dots for single cells), each with the
// next free key number.
export function addMeanderStrands(layout, strands) {
  const all = [...layout.strands, ...layout.dots];
  let next = all.reduce((m, s) => Math.max(m, meanderKeyIndex(s.key) + 1), 0);
  const out = { ...layout, strands: [...layout.strands], dots: [...layout.dots] };
  for (const cells of strands) {
    const n = next++;
    if (cells.length > 1) out.strands.push({ key: `s${n}`, cells, letter: false });
    else out.dots.push({ key: `d${n}`, cells, letter: false });
  }
  return out;
}
