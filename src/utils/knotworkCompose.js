// Composes the full Knotwork/Kufic design (core ring+cross, interlaced with
// the meander strand paths) into one standalone SVG markup string, ready to
// drop straight into the apps existing `type: image` placed-block
// pipeline as a data URI -- see handleKnotworkFill in App.jsx. This keeps
// the whole subsystem additive: PlacedBlocks.jsx and buildFlatSvgElement
// already render/export `image` blocks generically, so no changes are
// needed there.
//
// Reverted from the solid-outline-shape rewrite (knotworkOutline.js): a
// generic "round every vertex of the outline by the shared radius" pass
// cannot reproduce a true semicircle cap, because a cap needs a FIXED
// protrusion length independent of roundness, while the generic fillet
// clamps trim distance by the adjacent segments own length -- and the
// caps short protrusion edge only provides half of what a full semicircle
// needs. Caps genuinely need their own bespoke formula (capPathD, below),
// not the same generic polygon-rounding treatment as an interior turn.
// knotworkOutline.js is left in place, unused, rather than deleted.

import { computeKnotworkMeanderStrands } from './knotworkMeanderStrand';
import { buildCoreMeanderWeave } from './knotworkCoreMeanderWeave';
import { computeCelticCoreLoops, renderCelticCoreMarkup } from './knotworkCelticCore';
import { knotworkPathToPixels, compileKnotworkPath } from './knotworkGeometry';
import { mulberry32 } from './rng';

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

function fmt(n) { return Math.round(n * 1000) / 1000; }

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

// A path stroke end cap that is genuinely proportional to `roundness`,
// unlike native SVG stroke-linecap (only butt/round/square, no continuous
// in-between). The cap always protrudes a fixed strokeWidth/2 past the true
// path endpoint -- the same extent a native square OR round linecap uses --
// so dialling roundness down never shrinks the strand shorter; it only
// squares off the two far corners of that fixed-size cap. At roundness = 0
// (corner radius 0) the shape is a plain sharp-cornered rectangle, i.e. a
// native "square" cap. At roundness = 1 (corner radius = strokeWidth/2) the
// two rounded corners meet with no straight edge between them and the
// shape degenerates into a perfect semicircle, i.e. a native "round" cap.
//
// Built in a local (u, p) frame -- u along the strand's outward tangent, p
// its perpendicular -- so the two corner arcs always sweep the same fixed
// direction (1, 1) no matter which way the strand actually points in pixel
// space: p is always u rotated 90 degrees the same way, so the local frame
// has the same handedness for every strand.
//
// `sharedRadius` is the SAME value every other rounded element in the
// composition uses (corner fillets, single-cell dots) -- not an
// independent roundness*something formula of its own. Every shape just
// clamps that one shared number to whatever its own size allows, which is
// what makes "50% roundness" read as the same curvature everywhere: at low
// values every shape is using the literal same radius, they only diverge
// once a smaller shape (the cap, capped at strokeWidth/2) hits its own
// ceiling before a bigger one (corner fillets, which keep growing all the
// way to cellSize/2) does.
function capPathD(pEnd, pInward, strokeWidth, sharedRadius) {
  const dx = pEnd.x - pInward.x, dy = pEnd.y - pInward.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = -uy, py = ux;
  const hw = strokeWidth / 2;
  const capLen = hw;
  const r = Math.min(sharedRadius, hw);

  const pt = (u, p) => ({ x: pEnd.x + ux * u + px * p, y: pEnd.y + uy * u + py * p });

  const a = pt(0, -hw);
  const bStart = pt(capLen - r, -hw);
  const cEnd = pt(capLen, -hw + r);
  const dStart = pt(capLen, hw - r);
  const eEnd = pt(capLen - r, hw);
  const f = pt(0, hw);

  return [
    `M ${fmt(a.x)} ${fmt(a.y)}`,
    `L ${fmt(bStart.x)} ${fmt(bStart.y)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cEnd.x)} ${fmt(cEnd.y)}`,
    `L ${fmt(dStart.x)} ${fmt(dStart.y)}`,
    `A ${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(eEnd.x)} ${fmt(eEnd.y)}`,
    `L ${fmt(f.x)} ${fmt(f.y)}`,
    'Z',
  ].join(' ');
}

// gridComputed: a self-contained local grid ({ cols, rows, cellSize,
// gridOriginX: 0, gridOriginY: 0 }) -- independent of the live app grids
// own origin, since this produces a standalone asset with its own viewBox.
export function composeKnotworkSvg(gridComputed, settings) {
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
    // Drives ONE shared radius value (radius, below = cellSize/2 *
    // roundness) that every rounded element in the piece -- corner
    // fillets, strand end caps, single-cell dots -- clamps to its own
    // natural ceiling, rather than each computing its own independent
    // roundness*something formula. That is what makes a given roundness
    // value read as the same curvature everywhere: at low values every
    // shape is quite literally using the same radius, they only diverge
    // once a smaller shape hits its own ceiling before corner fillets
    // (which keep growing all the way to cellSize/2, the widest "pill"
    // sweep) do. Caps and dots plateau at their own half-width early;
    // corner fillets alone keep climbing to give the wide sweeping bend at
    // roundness = 1. One side effect: a fillet radius below strokeWidth/2
    // still cannot round a turn's INSIDE edge (a stroke's inner offset
    // only curves once the turn radius clears half the stroke width), so
    // the inside of a bend stays a sharp pinch until roundness is fairly
    // high, even though the outside is already sweeping -- an inherent
    // consequence of a constant-width stroke, not a units mismatch.
    roundness = 1,
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
  const radius = (cellSize / 2) * roundness;
  const strandJoin = roundness > 0 ? 'round' : 'miter';

  const { paths: strandPaths, singleCellDots } = computeKnotworkMeanderStrands(gridComputed, {
    seed, coreRadius, density, straightBias, minStraightRun, wallDensity, symmetryMode, kaleidoscopeFold,
  });
  const strandMergeInfo = strandPaths.map(findSelfMergeEnds);
  const strandPixelPointsList = strandPaths.map(path => knotworkPathToPixels(path, gridComputed));
  const compiledStrands = strandPixelPointsList.map((pts, i) => {
    const { startMerge, endMerge } = strandMergeInfo[i];
    const extended = extendForMerge(pts, cellSize, startMerge, endMerge);
    return compileKnotworkPath(extended, radius);
  }).filter(Boolean);

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

  const strandColors = colorSeed
    ? shuffleColors(palette.length ? palette : [fg], colorSeed)
    : (palette.length ? palette : [fg]);

  // Base strokes always use a plain flush (butt) cap now -- the actual
  // end-cap shape is drawn separately below via capPathD, since native
  // linecap cannot interpolate continuously with roundness.
  let strandMarkup = '';
  compiledStrands.forEach((d, i) => {
    const strandColor = strandColors[i % strandColors.length];
    strandMarkup += `<path d="${d}" stroke="${strandColor}" stroke-width="${strandStrokeWidth}" fill="none" stroke-linecap="butt" stroke-linejoin="${strandJoin}" />`;
  });

  let capMarkupStr = '';
  strandPixelPointsList.forEach((pts, i) => {
    if (pts.length < 2) return;
    const strandColor = strandColors[i % strandColors.length];
    const { startMerge, endMerge } = strandMergeInfo[i];
    if (!startMerge) {
      const startCap = capPathD(pts[0], pts[1], strandStrokeWidth, radius);
      if (startCap) capMarkupStr += `<path d="${startCap}" fill="${strandColor}" />`;
    }
    if (!endMerge) {
      const endCap = capPathD(pts[pts.length - 1], pts[pts.length - 2], strandStrokeWidth, radius);
      if (endCap) capMarkupStr += `<path d="${endCap}" fill="${strandColor}" />`;
    }
  });

  // Cells a walk could not extend beyond render as a small filled square,
  // rounded by the same shared radius as corners and caps -- a circle once
  // that shared value clears the dot's own half-size, a sharp square at
  // roundness 0, and (since dots are the smallest shape in the piece) the
  // first thing to visibly finish rounding out as the slider climbs. Sized
  // to strandStrokeWidth/2 (not some smaller fraction of it) so an
  // isolated cell reads as the same visual weight as the connected
  // strands -- a stub of the same "line", not a separate smaller dot.
  let cellDotsMarkup = '';
  const cellDotRadius = strandStrokeWidth / 2;
  singleCellDots.forEach(({ col, row }, i) => {
    const [{ x, y }] = knotworkPathToPixels([{ col, row }], gridComputed);
    const dotColor = strandColors[i % strandColors.length];
    const innerCorner = Math.min(radius, cellDotRadius);
    cellDotsMarkup += `<rect x="${fmt(x - cellDotRadius)}" y="${fmt(y - cellDotRadius)}" width="${fmt(cellDotRadius * 2)}" height="${fmt(cellDotRadius * 2)}" rx="${fmt(innerCorner)}" ry="${fmt(innerCorner)}" fill="${dotColor}" />`;
  });

  let celticCoreMarkup = '';
  if (coreStyle === 'celtic') {
    const loopPaths = computeCelticCoreLoops(gridComputed, { coreRadius, latticeCellRatio, roundness });
    celticCoreMarkup = renderCelticCoreMarkup(loopPaths, cellSize, bg, strandColors);
  }

  let dotsMarkup = '';
  if (showTerminalDots) {
    const dotRadius = strandStrokeWidth * 0.15;
    strandPixelPointsList.forEach((pts, i) => {
      const { startMerge, endMerge } = strandMergeInfo[i];
      const first = pts[0], last = pts[pts.length - 1];
      if (!startMerge) dotsMarkup += `<circle cx="${first.x}" cy="${first.y}" r="${dotRadius}" fill="${bg}" />`;
      if (!endMerge) dotsMarkup += `<circle cx="${last.x}" cy="${last.y}" r="${dotRadius}" fill="${bg}" />`;
    });
  }

  const w = cols * cellSize, h = rows * cellSize;
  const bgRect = `<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}" />`;

  const body = bgRect
    + layersMarkup(weave.barUnderLayers)
    + strandMarkup
    + capMarkupStr
    + cellDotsMarkup
    + dotsMarkup
    + celticCoreMarkup
    + layersMarkup(weave.ringOverLayers)
    + layersMarkup(weave.barOverLayers);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
