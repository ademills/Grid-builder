// Composes the Meander design as separate layers: one filled outline per
// strand and per single-cell dot (knotworkOutline.js), plus the centre motif
// (ring+cross or celtic) as SVG markup drawn under/over them. DocumentEditor
// turns each strand/dot into its own `vector` block so it can be selected,
// recoloured, hidden and locked individually; the page background comes from
// the document's paper colour rather than a rect baked into the design.
//
// Strand corners come in three kinds, each with its own radius (all
// fractions of the cell, see meanderCornerRadii): end caps, the outer side
// of a bend, and the inner side of a bend.

import { computeKnotworkMeanderStrands } from './knotworkMeanderStrand';
import { buildCoreMeanderWeave } from './knotworkCoreMeanderWeave';
import { computeCelticCoreLoops, renderCelticCoreMarkup } from './knotworkCelticCore';
import { knotworkPathToPixels, addTensionWobble } from './knotworkGeometry';
import { compileKnotworkOutline, compileKnotworkDot } from './knotworkOutline';
import { mulberry32 } from './rng';
import { sampleStrandColours } from './knotworkImageSample';
import { computeTextMaskCells, computeScatteredTextMask } from './knotworkTextMask';

// Fisher-Yates shuffle of the strand colour list, seeded so the same
// colorSeed always reassigns colours the same way -- lets the Recolour
// button keep the knot layout untouched (geometry seed unchanged) while
// only reshuffling which colour lands on which strand. colorSeed 0 is
// treated as "no shuffle" by the caller, so the very first render (before
// anyone has hit Recolour) keeps the original palette-order assignment.
function shuffleColors(colors, seed) {
  const rng = mulberry32(seed);
  const arr = [...colors];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function layersMarkup(layers) {
  let s = '';
  for (const l of layers) {
    s += `<path d="${l.d}" stroke="${l.color}" stroke-width="${l.width}" fill="none" stroke-linecap="${l.cap}" stroke-linejoin="round" />`;
  }
  return s;
}


// A merge target must be a STRAIGHT-THROUGH cell in its own path -- i.e.
// its neighbours on either side, within that same path, continue in the
// same direction. If the target cell is itself a turn, a straight
// extension into it does not blend with the curved fillet geometry there
// (that is the "connection point is also a corner" case) and looks like a
// pinch/notch rather than a clean join, so the merge is skipped and a
// normal cap is drawn instead.
function isStraightThroughInPath(path, col, row) {
  const idx = path.findIndex(p => p.col === col && p.row === row);
  if (idx <= 0 || idx >= path.length - 1) return false;
  const prev = path[idx - 1], cur = path[idx], next = path[idx + 1];
  return (cur.col - prev.col) === (next.col - cur.col) && (cur.row - prev.row) === (next.row - cur.row);
}

// If the cell one step past a strand's dead end (continuing in the
// direction it was already travelling) turns out to be somewhere ELSE
// along that SAME strand's own path -- i.e. the path curled back around
// and nearly touches itself -- extend the compiled centreline straight
// into that neighbouring cell instead of capping off there. The two
// nearby passes then read as one continuous joined shape rather than a
// capped dead end sitting right next to another part of itself with a
// visible gap between them.
function findSelfMergeEnds(path) {
  const n = path.length;
  if (n < 2) return { startMerge: false, endMerge: false };
  const has = (col, row) => path.some(p => p.col === col && p.row === row);

  const s0 = path[0], s1 = path[1];
  const aheadStart = { col: s0.col + (s0.col - s1.col), row: s0.row + (s0.row - s1.row) };
  const startMerge = has(aheadStart.col, aheadStart.row) && isStraightThroughInPath(path, aheadStart.col, aheadStart.row);

  const e0 = path[n - 1], e1 = path[n - 2];
  const aheadEnd = { col: e0.col + (e0.col - e1.col), row: e0.row + (e0.row - e1.row) };
  const endMerge = has(aheadEnd.col, aheadEnd.row) && isStraightThroughInPath(path, aheadEnd.col, aheadEnd.row);

  return { startMerge, endMerge };
}

// Extends the pixel-space centreline by one full cell at merged ends,
// straight-line continuation of the existing last segment (never a new
// corner, since it is collinear by construction) -- purely for the
// compiled stroke geometry, not for cap positioning, which still uses the
// true endpoints.
function extendForMerge(pts, cellSize, startMerge, endMerge) {
  if (pts.length < 2) return pts;
  const out = [...pts];
  if (startMerge) {
    const p0 = pts[0], p1 = pts[1];
    const dx = p0.x - p1.x, dy = p0.y - p1.y;
    const l = Math.hypot(dx, dy) || 1;
    out.unshift({ x: p0.x + (dx / l) * cellSize, y: p0.y + (dy / l) * cellSize });
  }
  if (endMerge) {
    const pl = pts[pts.length - 1], pp = pts[pts.length - 2];
    const dx = pl.x - pp.x, dy = pl.y - pp.y;
    const l = Math.hypot(dx, dy) || 1;
    out.push({ x: pl.x + (dx / l) * cellSize, y: pl.y + (dy / l) * cellSize });
  }
  return out;
}

// Box around a centreline padded by the half-width (which also covers the
// caps), in the design's own units -- used for marquee selection.
function pointBounds(pts, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

// Corner radii from the Meander settings, all as fractions of the cell:
//   capRoundness  0-1, end caps (1 = semicircle, 0 = square)
//   innerRadius   inside of a bend
//   outerRadius   outside of a bend -- ignored while bendLinked, which keeps
//                 outer = inner + strand width so bends stay an even width
// Documents saved before v1.4.1 have a single `roundness` instead; that
// converts to whatever reproduces its old look (one shared radius of
// roundness * half a cell, which caps and inner bends clamped to their own
// limits).
export function meanderCornerSettings(s) {
  if (s.capRoundness != null) {
    return { capRoundness: s.capRoundness, innerRadius: s.innerRadius ?? 0, outerRadius: s.outerRadius ?? 0, bendLinked: s.bendLinked ?? true };
  }
  const r = 0.5 * (s.roundness ?? 1);
  const hw = (s.strandWidthRatio ?? 0.86) / 2;
  return {
    capRoundness: Math.min(r, hw) / hw,
    innerRadius: Math.max(0, r - hw),
    outerRadius: r + hw,
    bendLinked: true,
  };
}

// gridComputed: a self-contained local grid ({ cols, rows, cellSize,
// gridOriginX: 0, gridOriginY: 0 }) -- independent of the live app grid's
// own origin. Returns
//   { width, height,
//     items: [{ key, kind: 'strand'|'dot', d, fill, letter }],
//     coreUnder, coreOver }   (SVG markup strings, or '' when empty)
// Keys ('s<i>' / 'd<i>') are stable for a given seed and layout settings,
// which is what lets a reshape keep each strand's per-layer edits.
export function composeKnotworkLayers(gridComputed, settings) {
  const { cols, rows, cellSize } = gridComputed;
  const {
    seed = 0,
    coreRadius: requestedCoreRadius = 5,
    // Full coverage by default -- every meander cell ends up part of a
    // strand or a single-cell dot, no bare background gaps.
    density = 1,
    straightBias = 14,
    minStraightRun = 1,
    wallDensity = 0.015,
    symmetryMode = 'none',
    kaleidoscopeFold = 4,
    strandWidthRatio = 0.86,
    coreStrokeRatio = 0.6,
    coreArmLengthRatio = 1.6,
    fg = '#8a1f11',
    bg = '#f2ede3',
    showTerminalDots = true,
    // 'none': no centre motif at all -- the meander fills the whole grid.
    // 'celtic': a genuinely interlaced diagonal weave confined to the core
    // radius (knotworkCelticCore.js). 'ringCross': the original fixed
    // ring+cross motif. Both centre motifs are parked for now in favour of
    // 'none' while the centre concept gets rethought.
    coreStyle = 'none',
    latticeCellRatio = 0.55,
    // Reference knotwork/Kufic patterns read as woven partly because each
    // strand is its own distinct colour, not one flat tone -- cycling
    // through a small palette (falling back to a single-colour [fg] list)
    // gives that same several-interlocking-cords read.
    palette = [fg],
    colorSeed = 0,
    // 'palette' (default): strandColors below cycle through palette.
    // 'image': strand colour is sampled from imagePixels instead, once
    // per strand (averaged over a few points along its path) -- see
    // sampleStrandColours in knotworkImageSample.js.
    inkMode = 'palette',
    imagePixels = null,
    imageFit = 'cover',
    // Per-strand stroke-width variance (0-1, fraction of strandStrokeWidth
    // each strand's own width can drift by) and perpendicular wobble
    // amount (0-1) applied along straight runs only -- see strandWidths
    // and addTensionWobble below.
    widthJitter = 0,
    tension = 0,
    // "Weave as letters" -- see computeTextMaskCells (knotworkTextMask.js)
    // and the letters-first pass in computeKnotworkMeanderStrands.
    // seedWord is the same text the Seed field's word-hash uses; reused
    // here as the letterform source rather than a separate text input.
    seedWord = '',
    weaveAsLetters = false,
    letterSize = 0.7,
    // 'line' (default): one rasterized line of text, width-fit to the
    // grid (computeTextMaskCells). 'scatter': each letter rasterized and
    // sized independently, placed at a random row in left-to-right order
    // (computeScatteredTextMask) -- see letterArrangementSeed below.
    letterLayout = 'scatter',
    // Drives per-letter size/position in scatter layout only. Always
    // re-randomized on Fill (App.jsx handleKnotworkFill), unlike seed --
    // deliberately NOT reproduced from the word hash, so the same word
    // scatters differently each time you hit Fill.
    letterArrangementSeed = 0,
    // Scatter-mode fine controls (see computeScatteredTextMask):
    // randomSize/randomPlacement off pin that axis to a fixed value
    // instead of drawing from the RNG; align sets where the run of
    // letters starts horizontally once sizes are known.
    letterRandomSize = true,
    letterRandomPlacement = true,
    letterAlign = 'center',
    // Fixed colour for the word's own strands, chosen from the active
    // palette in the UI -- null falls back to fg. letterColourExclusive
    // removes it from the pool the rest of the design cycles through, so
    // it reads as unique to the word rather than just also turning up
    // elsewhere by coincidence of the normal palette cycle.
    letterColour = null,
    letterColourExclusive = false,
  } = settings;

  // On small grids a fixed coreRadius can swallow almost the whole canvas,
  // starving the meander zone down to a few isolated corner cells (each too
  // small to hold a well-formed strand). Clamp so the ring never eats more
  // than roughly half the shorter grid dimension, leaving real room to
  // meander regardless of the requested setting. With no centre motif at
  // all, there is no reason to reserve any core radius -- the meander
  // simply fills every cell.
  const coreRadius = coreStyle === 'none'
    ? 0
    : Math.max(1, Math.min(requestedCoreRadius, Math.floor(Math.min(cols, rows) / 2) - 2));

  const colors = { fg, bg };
  const strandStrokeWidth = cellSize * strandWidthRatio;
  const corners = meanderCornerSettings(settings);
  // Computed once, synchronously -- rasterizing text is cheap and
  // doesn't need the async image-loading path imagePixels does.
  const textMaskCells = weaveAsLetters && seedWord
    ? (letterLayout === 'scatter'
      ? computeScatteredTextMask(gridComputed, seedWord, letterSize, mulberry32(letterArrangementSeed || 1), { randomSize: letterRandomSize, randomPlacement: letterRandomPlacement, align: letterAlign })
      : computeTextMaskCells(gridComputed, seedWord, letterSize))
    : null;

  const { paths: strandPaths, singleCellDots, letterPathCount, letterDotCount } = computeKnotworkMeanderStrands(gridComputed, {
    seed, coreRadius, density, straightBias, minStraightRun, wallDensity, symmetryMode, kaleidoscopeFold,
    textMaskCells,
  });

  // Independent RNG stream from the geometry walk's own mulberry32(seed)
  // instance (that one is closed over inside computeKnotworkMeanderStrands
  // and already exhausted by the time it returns) -- keyed off the same
  // seed so width jitter is still fully deterministic and reproducible,
  // but XORed so it doesn't just replay the same draw sequence. Seeded off
  // seed (not colorSeed) so per-strand width stays stable across a
  // Recolour, which only ever changes colorSeed.
  const widthRng = mulberry32(seed ^ 0x9e3779b9);
  const strandWidths = strandPaths.map(() =>
    strandStrokeWidth * (1 + (widthRng() * 2 - 1) * widthJitter)
  );

  const strandMergeInfo = strandPaths.map(findSelfMergeEnds);
  const strandPixelPointsList = strandPaths.map(path => knotworkPathToPixels(path, gridComputed));
  const wobbledPointsList = tension > 0
    ? strandPixelPointsList.map(pts => addTensionWobble(pts, tension, cellSize, widthRng))
    : strandPixelPointsList;

  // The celtic lattice sits entirely inside the core radius (no arms
  // reaching into meander territory the way the ring+cross bars do), and
  // the meander walker already excludes core-zone cells outright -- so it
  // never overlaps a strand and needs no duck-under interlace logic of its
  // own; only ring+cross's outward-reaching bars need that treatment.
  const weave = coreStyle === 'ringCross'
    ? buildCoreMeanderWeave(
        gridComputed,
        { coreRadius, strokeWidth: cellSize * coreStrokeRatio, gapWidth: cellSize * coreStrokeRatio * 0.3, armLength: coreRadius * cellSize * coreArmLengthRatio },
        colors,
        strandPaths,
        strandStrokeWidth,
      )
    : { barUnderLayers: [], ringOverLayers: [], barOverLayers: [] };

  // Letter strands/dots (the first letterPathCount/letterDotCount entries
  // of strandPaths/singleCellDots -- see computeKnotworkMeanderStrands)
  // get a fixed colour when "weave as letters" is on; everything else
  // still cycles through the palette exactly as before, optionally with
  // that colour removed from the cycle (letterColourExclusive) so it
  // reads as unique to the word rather than a coincidence of the cycle.
  const basePalette = palette.length ? palette : [fg];
  const hasLetterOverride = weaveAsLetters && letterPathCount > 0;
  const effectiveLetterColour = letterColour || fg;
  const generalPaletteRaw = (hasLetterOverride && letterColourExclusive)
    ? basePalette.filter(c => c !== effectiveLetterColour)
    : basePalette;
  const generalPalette = generalPaletteRaw.length ? generalPaletteRaw : basePalette;

  const imageColours = (inkMode === 'image' && imagePixels)
    ? sampleStrandColours(strandPixelPointsList, imagePixels, cols * cellSize, rows * cellSize, imageFit, generalPalette)
    : null;
  const shuffledPalette = colorSeed ? shuffleColors(generalPalette, colorSeed) : generalPalette;
  const generalColourAt = i => (imageColours && imageColours.length)
    ? imageColours[i % imageColours.length]
    : shuffledPalette[i % shuffledPalette.length];

  const strandColors = strandPaths.map((_, i) =>
    (hasLetterOverride && i < letterPathCount) ? effectiveLetterColour : generalColourAt(i)
  );

  const holeRadius = showTerminalDots ? strandStrokeWidth * 0.15 : 0;
  const items = [];
  wobbledPointsList.forEach((pts, i) => {
    const hw = strandWidths[i] / 2;
    const inner = corners.innerRadius * cellSize;
    const radii = {
      cap: corners.capRoundness * hw,
      inner,
      outer: corners.bendLinked ? inner + hw * 2 : corners.outerRadius * cellSize,
    };
    const { startMerge, endMerge } = strandMergeInfo[i];
    const d = compileKnotworkOutline(extendForMerge(pts, cellSize, startMerge, endMerge), hw, radii, { startMerge, endMerge, holeRadius });
    if (d) items.push({ key: `s${i}`, kind: 'strand', d, fill: strandColors[i], letter: hasLetterOverride && i < letterPathCount, bounds: pointBounds(pts, hw) });
  });

  // Cells a walk could not extend beyond: a square the strand's width,
  // rounded like an end cap (a circle at full cap roundness). Reuses the
  // per-strand width sequence (cyclically) rather than drawing fresh from
  // widthRng, so a dot's size still varies with widthJitter without
  // needing its own RNG draw index.
  singleCellDots.forEach(({ col, row }, i) => {
    const [center] = knotworkPathToPixels([{ col, row }], gridComputed);
    const hw = (strandWidths.length ? strandWidths[i % strandWidths.length] : strandStrokeWidth) / 2;
    const letter = hasLetterOverride && i < letterDotCount;
    items.push({ key: `d${i}`, kind: 'dot', d: compileKnotworkDot(center, hw, corners.capRoundness * hw), fill: letter ? effectiveLetterColour : generalColourAt(i), letter, bounds: pointBounds([center], hw) });
  });

  let celticCoreMarkup = '';
  if (coreStyle === 'celtic') {
    const loopPaths = computeCelticCoreLoops(gridComputed, { coreRadius, latticeCellRatio, roundness: settings.roundness ?? corners.capRoundness });
    celticCoreMarkup = renderCelticCoreMarkup(loopPaths, cellSize, bg, strandColors);
  }

  return {
    width: cols * cellSize,
    height: rows * cellSize,
    items,
    coreUnder: layersMarkup(weave.barUnderLayers),
    coreOver: celticCoreMarkup + layersMarkup(weave.ringOverLayers) + layersMarkup(weave.barOverLayers),
  };
}
