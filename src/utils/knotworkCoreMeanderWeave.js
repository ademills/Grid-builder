// Interlaces the core ring+cross template (knotworkCoreTemplate.js) against
// the meander zone's strand paths (knotworkMeanderStrand.js), so the core
// genuinely dives under and re-emerges over the strands rather than just
// sitting flatly on top of them.
//
// The meander zone no longer produces filled block polygons (that approach
// — knotworkBlockOutline.js — is retained but unused after the strand
// pivot), so "is this point covered by the meander?" is now a proximity
// test against the strand polylines instead of a point-in-polygon test:
// a sample point counts as "under a strand" when it falls within half the
// strand's stroke width (plus a small gap margin) of the nearest point on
// any strand path.
//
// Same 4-step fixed render stack as before, which reproduces the core's
// own ring/cross self-weave (bar-under-half < ring < bar-over-half,
// established in knotworkCoreTemplate.js) while also weaving correctly
// against the strands, entirely by strategic omission rather than true
// polygon clipping or per-point 3-way ordering:
//   1. bar-under-halves, drawn in full (dips under strands)
//   2. strands, drawn on top of (1) — hides the part of bar-under that
//      passes beneath a strand
//   3. ring, drawn only on the runs NOT near a strand (dips under strands,
//      stays over background/bar-under elsewhere)
//   4. bar-over-halves, drawn only on the runs NOT near a strand (same)

import { knotworkPathToPixels } from './knotworkGeometry';

function fmt(n) { return Math.round(n * 1000) / 1000; }

function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function minDistToStrands(x, y, strandPixelPaths) {
  let best = Infinity;
  for (const points of strandPixelPaths) {
    for (let i = 0; i < points.length - 1; i++) {
      const d = distPointToSegment(x, y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      if (d < best) best = d;
    }
  }
  return best;
}

function nearAnyStrand(x, y, strandPixelPaths, threshold) {
  return minDistToStrands(x, y, strandPixelPaths) <= threshold;
}

// Flips any maximal run of samples shorter than minLen to match its
// surrounding neighbours, so isolated 1-2-sample flicker (from a strand's
// rounded cap, or from two separate strands passing within a sample or two
// of each other) collapses into whichever state dominates around it,
// instead of rendering as a hairline dash.
function despeckle(samples, minLen) {
  const n = samples.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && samples[j].near === samples[i].near) j++;
    const runLen = j - i;
    if (runLen < minLen) {
      const before = samples[(i - 1 + n) % n].near;
      const after = samples[j % n].near;
      const fillValue = i === 0 ? after : before;
      for (let k = i; k < j; k++) samples[k].near = fillValue;
    }
    i = j;
  }
}

function ringRuns(cx, cy, r, strandPixelPaths, threshold, steps = 360) {
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    samples.push({ theta, x, y, near: nearAnyStrand(x, y, strandPixelPaths, threshold) });
  }
  despeckle(samples, Math.max(2, Math.round(steps * 0.01)));
  const runs = [];
  let runStart = 0;
  for (let i = 1; i <= steps; i++) {
    if (samples[i].near !== samples[runStart].near || i === steps) {
      const a = samples[runStart], b = samples[i];
      const span = b.theta - a.theta;
      if (span > 1e-6) {
        const largeArc = span > Math.PI ? 1 : 0;
        const d = `M ${fmt(a.x)} ${fmt(a.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} 1 ${fmt(b.x)} ${fmt(b.y)}`;
        runs.push({ d, near: samples[runStart].near });
      }
      runStart = i;
    }
  }
  return runs;
}

function lineRuns(p0, p1, strandPixelPaths, threshold, steps = 40) {
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = p0.x + (p1.x - p0.x) * t;
    const y = p0.y + (p1.y - p0.y) * t;
    samples.push({ x, y, near: nearAnyStrand(x, y, strandPixelPaths, threshold) });
  }
  despeckle(samples, 2);
  const runs = [];
  let runStart = 0;
  for (let i = 1; i <= steps; i++) {
    if (samples[i].near !== samples[runStart].near || i === steps) {
      const a = samples[runStart], b = samples[i];
      if (a.x !== b.x || a.y !== b.y) {
        const d = `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`;
        runs.push({ d, near: samples[runStart].near });
      }
      runStart = i;
    }
  }
  return runs;
}

// strandPaths: array of grid-space paths (each an array of {col,row}), i.e.
// the raw output of computeKnotworkMeanderStrands — NOT the compiled `d`
// strings. strandStrokeWidth: the width the strands will be rendered at, so
// the proximity threshold matches their visual footprint.
export function buildCoreMeanderWeave(gridComputed, settings, colors, strandPaths, strandStrokeWidth) {
  const { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed;
  const {
    coreRadius = 5,
    strokeWidth = cellSize * 0.6,
    gapWidth = strokeWidth * 0.3,
    armLength = coreRadius * cellSize * 1.6,
  } = settings;
  const { fg, bg } = colors;

  const cx = gridOriginX + (cols / 2) * cellSize;
  const cy = gridOriginY + (rows / 2) * cellSize;
  const r = coreRadius * cellSize;

  const strandPixelPaths = strandPaths.map(path => knotworkPathToPixels(path, gridComputed));
  const threshold = strandStrokeWidth / 2 + strokeWidth / 2 + gapWidth;

  const maskedLayer = (d, cap) => ([
    { d, color: bg, width: strokeWidth + gapWidth * 2, cap },
    { d, color: fg, width: strokeWidth, cap },
  ]);

  const hBarUnder = { p0: { x: cx - armLength, y: cy }, p1: { x: cx, y: cy } };
  const vBarUnder = { p0: { x: cx, y: cy - armLength }, p1: { x: cx, y: cy } };
  const hBarOver = { p0: { x: cx, y: cy }, p1: { x: cx + armLength, y: cy } };
  const vBarOver = { p0: { x: cx, y: cy }, p1: { x: cx, y: cy + armLength } };

  const barUnderLayers = [];
  for (const bar of [hBarUnder, vBarUnder]) {
    for (const run of lineRuns(bar.p0, bar.p1, strandPixelPaths, threshold)) {
      barUnderLayers.push(...maskedLayer(run.d, 'round'));
    }
  }

  const ringOverLayers = [];
  for (const run of ringRuns(cx, cy, r, strandPixelPaths, threshold)) {
    if (!run.near) ringOverLayers.push(...maskedLayer(run.d, 'butt'));
  }

  const barOverLayers = [];
  for (const bar of [hBarOver, vBarOver]) {
    for (const run of lineRuns(bar.p0, bar.p1, strandPixelPaths, threshold)) {
      if (!run.near) barOverLayers.push(...maskedLayer(run.d, 'round'));
    }
  }

  return { barUnderLayers, ringOverLayers, barOverLayers };
}
