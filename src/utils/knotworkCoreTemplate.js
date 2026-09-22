// Fixed, radially-symmetric core motifs — a curated alternative to walking
// the pathfinder for the center of the composition, per the reference: a
// ring interlaced with a cross, woven over/under at its 4 crossing points.
//
// The ring is a true circle (two semicircle `A` commands — still arc-only,
// no Bezier). Each bar is split at its own center into two straight halves
// so the two halves can sit at different z-order — one half renders under
// the ring, the other over — without any visible seam, since the split
// point is mid-stroke, not at a crossing.
//
// Each layer is drawn as a wide background-color "masking" stroke followed
// by the normal-width colored stroke on top of it, per the stroke-masking
// technique: this punches a clean gap in whatever was drawn immediately
// before it, then fills that gap with the real color — giving the visible
// separation/border at each crossing rather than a flat paint-over.

function circleAsArcs(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
}

// Returns an ordered array of { d, color, width, cap } stroke layers, ready
// to render bottom-to-top (later entries drawn on top of earlier ones).
// `colors`: { fg, bg }. `settings`: { coreRadius (cells), strokeWidth (px),
// gapWidth (px, extra width for the masking pass), armLength (px) }.
export function buildRingCrossCore(gridComputed, settings, colors) {
  const { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed;
  const {
    coreRadius = 3,
    strokeWidth = cellSize * 0.6,
    gapWidth = strokeWidth * 0.3,
    armLength = coreRadius * cellSize * 1.6,
  } = settings;
  const { fg, bg } = colors;

  const cx = gridOriginX + (cols / 2) * cellSize;
  const cy = gridOriginY + (rows / 2) * cellSize;
  const r = coreRadius * cellSize;

  const ringD = circleAsArcs(cx, cy, r);
  const hBarUnder = `M ${cx - armLength} ${cy} L ${cx} ${cy}`;
  const hBarOver = `M ${cx} ${cy} L ${cx + armLength} ${cy}`;
  const vBarUnder = `M ${cx} ${cy - armLength} L ${cx} ${cy}`;
  const vBarOver = `M ${cx} ${cy} L ${cx} ${cy + armLength}`;

  const maskedLayer = (d, cap) => ([
    { d, color: bg, width: strokeWidth + gapWidth * 2, cap },
    { d, color: fg, width: strokeWidth, cap },
  ]);

  return [
    ...maskedLayer(hBarUnder, 'round'),
    ...maskedLayer(vBarUnder, 'round'),
    ...maskedLayer(ringD, 'butt'),
    ...maskedLayer(hBarOver, 'round'),
    ...maskedLayer(vBarOver, 'round'),
  ];
}
