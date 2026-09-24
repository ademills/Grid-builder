// Rasterizes a word/phrase to an offscreen canvas and reports which grid
// cells fall inside its letterforms -- used to seed a "letters first" pass
// in computeKnotworkMeanderStrands (knotworkMeanderStrand.js) so the
// meander visibly spells the word before the normal fill settings take
// over the rest of the grid. Pure and synchronous: fillText() doesn't need
// image loading, so unlike the backdrop-image colour sampling this needs
// no React state/effect -- composeKnotworkSvg just calls it directly.

// text: the word/phrase to render. letterSize: target text height as a
// fraction (0.2-1) of the grid's pixel height; the font is then shrunk
// further if needed so the word fits within ~90% of the width instead of
// clipping. Returns a Set of "col,row" keys, or null for empty text.
export function computeTextMaskCells(gridComputed, text, letterSize = 0.7) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  const { cols, rows, cellSize } = gridComputed;
  const w = Math.round(cols * cellSize);
  const h = Math.round(rows * cellSize);
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Bold, chunky sans-serif -- reads as blocky/Kufic-style lettering at low
  // grid resolutions, unlike a thin face which would vanish into single
  // isolated cells rather than legible strokes.
  let fontPx = Math.max(1, Math.round(h * Math.min(1, Math.max(0.2, letterSize))));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontPx}px sans-serif`;

  const maxWidth = w * 0.9;
  const measured = ctx.measureText(trimmed).width;
  if (measured > maxWidth) {
    fontPx = Math.max(1, Math.floor(fontPx * (maxWidth / measured)));
    ctx.font = `bold ${fontPx}px sans-serif`;
  }

  ctx.fillStyle = '#000';
  ctx.fillText(trimmed, w / 2, h / 2);

  const { data } = ctx.getImageData(0, 0, w, h);
  const ALPHA_THRESHOLD = 64;
  // A single centre-pixel sample is too fragile against thin font strokes
  // -- a letter's ink can easily miss a cell's exact centre point even
  // when it visibly passes through that cell, producing broken/dotted
  // letterforms instead of solid ones. Sample a small grid of points across
  // each cell's own area instead and require a minimum ink coverage
  // fraction, the same "average over an area" idea colorizeSvgByImage uses
  // for per-shape colour sampling, applied here as a coverage test instead.
  const SUBSAMPLES = 4;
  const COVERAGE_THRESHOLD = 0.12;

  const cells = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let inkSamples = 0;
      for (let sy = 0; sy < SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SUBSAMPLES; sx++) {
          const px = Math.min(w - 1, Math.round((c + (sx + 0.5) / SUBSAMPLES) * cellSize));
          const py = Math.min(h - 1, Math.round((r + (sy + 0.5) / SUBSAMPLES) * cellSize));
          if (data[(py * w + px) * 4 + 3] >= ALPHA_THRESHOLD) inkSamples++;
        }
      }
      if (inkSamples / (SUBSAMPLES * SUBSAMPLES) >= COVERAGE_THRESHOLD) cells.add(`${c},${r}`);
    }
  }

  return cells.size ? cells : null;
}

// -- Scattered layout: each letter rasterized and sized independently, --
// -- placed at a random row but in strict left-to-right column order.  --

const SCATTER_ALPHA_THRESHOLD = 64;
const SCATTER_SUBSAMPLES = 4;
const SCATTER_COVERAGE_THRESHOLD = 0.12;

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Renders one character at the given font size onto its own generously
// padded offscreen canvas, crops to its tight ink bounding box, then
// samples per-cell coverage within that box (same technique as
// computeTextMaskCells, just scoped to one glyph). Returns
// { cells: Set<"c,r"> (local, 0-based from the glyph's own top-left),
// cols, rows } or null if the glyph produced no ink.
function rasterizeLetter(ch, fontPx, cellSize) {
  const pad = Math.ceil(fontPx * 0.7);
  const size = Math.ceil(fontPx * 1.4) + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.fillStyle = '#000';
  ctx.fillText(ch, size / 2, size / 2);

  const { data } = ctx.getImageData(0, 0, size, size);
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] >= SCATTER_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;

  const localCols = Math.max(1, Math.ceil((maxX - minX + 1) / cellSize));
  const localRows = Math.max(1, Math.ceil((maxY - minY + 1) / cellSize));

  const cells = new Set();
  for (let r = 0; r < localRows; r++) {
    for (let c = 0; c < localCols; c++) {
      let inkSamples = 0;
      for (let sy = 0; sy < SCATTER_SUBSAMPLES; sy++) {
        for (let sx = 0; sx < SCATTER_SUBSAMPLES; sx++) {
          const px = Math.min(size - 1, Math.round(minX + (c + (sx + 0.5) / SCATTER_SUBSAMPLES) * cellSize));
          const py = Math.min(size - 1, Math.round(minY + (r + (sy + 0.5) / SCATTER_SUBSAMPLES) * cellSize));
          if (data[(py * size + px) * 4 + 3] >= SCATTER_ALPHA_THRESHOLD) inkSamples++;
        }
      }
      if (inkSamples / (SCATTER_SUBSAMPLES * SCATTER_SUBSAMPLES) >= SCATTER_COVERAGE_THRESHOLD) cells.add(`${c},${r}`);
    }
  }
  return cells.size ? { cells, cols: localCols, rows: localRows } : null;
}

// text: the word/phrase to scatter, one letter at a time. letterSize
// (0.2-1) sets the per-letter height range each letter draws its own
// random height from (when randomSize is on) or its fixed shared height
// (when off). rng: a supplied RNG function (e.g.
// mulberry32(letterArrangementSeed)) -- this function does not seed
// itself, so the caller controls whether/when the scatter re-rolls.
//
// options:
//   randomSize (default true) -- each letter draws its own random height
//     from the range; when false every letter shares one fixed height
//     (the middle of the range), so only position varies.
//   randomPlacement (default true) -- each letter gets a random row;
//     when false every letter is vertically centred on the same row.
//   align (default 'center') -- 'left' | 'center' | 'right': where the
//     whole run of letters sits horizontally once their (possibly
//     random) sizes are known.
//
// Returns a Set of "col,row" keys, or null for empty text.
export function computeScatteredTextMask(gridComputed, text, letterSize, rng, options = {}) {
  const { randomSize = true, randomPlacement = true, align = 'center' } = options;
  const trimmed = (text || '').trim();
  if (!trimmed) return null;
  const chars = trimmed.split('').filter(ch => ch !== ' ');
  if (!chars.length) return null;

  const { cols, rows, cellSize } = gridComputed;
  if (cols <= 0 || rows <= 0) return null;

  const clampedSize = Math.min(1, Math.max(0.2, letterSize ?? 0.7));
  const minCells = Math.max(2, Math.round(rows * clampedSize * 0.4));
  const maxCells = Math.max(minCells + 1, Math.round(rows * clampedSize * 0.9));
  const fixedCells = Math.round((minCells + maxCells) / 2);
  const GAP = 1;

  // Phase 1: decide every letter's size (and rasterize it) before any
  // placement decision -- alignment needs the total width up front, which
  // means sizes can't depend on a running cursor position any more. Each
  // letter is capped to an even share of the grid width (accounting for
  // gaps) so however the random draws land, the whole run still fits.
  const avgSlot = Math.max(2, Math.floor((cols - (chars.length - 1) * GAP) / chars.length));
  const letters = [];
  for (const ch of chars) {
    let targetCells = randomSize ? randomInt(rng, minCells, maxCells) : fixedCells;
    let letter = null;
    while (targetCells >= 2) {
      const fontPx = Math.max(1, Math.round(targetCells * cellSize));
      letter = rasterizeLetter(ch, fontPx, cellSize);
      if (letter && letter.cols <= avgSlot) break;
      targetCells--;
    }
    if (letter) letters.push(letter);
  }
  if (!letters.length) return null;

  // Phase 2: place the now-sized letters left-to-right from whatever
  // column the chosen alignment starts at.
  const totalWidth = letters.reduce((sum, l) => sum + l.cols, 0) + (letters.length - 1) * GAP;
  const startCol = Math.max(0, align === 'center' ? Math.round((cols - totalWidth) / 2)
    : align === 'right' ? cols - totalWidth
    : 0);

  const globalCells = new Set();
  let cursorCol = startCol;
  for (const letter of letters) {
    const colOffset = cursorCol;
    const rowOffset = randomPlacement
      ? randomInt(rng, 0, Math.max(0, rows - letter.rows))
      : Math.round((rows - letter.rows) / 2);

    for (const key of letter.cells) {
      const [lc, lr] = key.split(',').map(Number);
      const gc = colOffset + lc, gr = rowOffset + lr;
      if (gc >= 0 && gc < cols && gr >= 0 && gr < rows) globalCells.add(`${gc},${gr}`);
    }

    cursorCol = colOffset + letter.cols + GAP;
  }

  return globalCells.size ? globalCells : null;
}
