// Runs Grid Pattern fills off the main thread, so a big fill (or an image
// fill sampling a photo) doesn't freeze the interface. Fills are pure
// functions of the grid, settings and shape footprints; the shapes' SVG is
// re-attached on the main thread (workers/fillClient.js).

import { fillGrid, fillMasked } from '../utils/binPack';
import { computeGlitchMask } from '../utils/glitchFill';
import { computeStripMask, computeMultiStripMask } from '../utils/stripFill';
import { computeEdgeMask } from '../utils/edgeFill';
import { computeBrightnessMask } from '../utils/brightnessFill';
import { computeNoiseMask } from '../utils/noiseFill';
import { computeGeometricMask } from '../utils/geometricFill';
import { computeHalftoneMask } from '../utils/halftoneFill';
import { computeVoronoiMask } from '../utils/voronoiFill';
import { computeSpiralMask } from '../utils/spiralFill';
import { computeFlowFieldMask } from '../utils/flowFieldFill';
import { computeFractalMask } from '../utils/fractalFill';
import { computeOrganicMask } from '../utils/organicFill';
import { generateMondrianLayout } from '../utils/mondrianFill';
import { generateGoldenLayout } from '../utils/goldenFill';

// Each mask fill: settings → the set of cells to pack, plus the message shown
// when the settings leave nothing to fill.
const MASKS = {
  glitch:     { mask: (g, s) => computeGlitchMask(g, s),              empty: 'No glitch cells generated — try increasing Force or Active Ratio.' },
  strip:      { mask: (g, s) => computeStripMask(g, s),               empty: 'No strip cells generated — try increasing Width.' },
  multiStrip: { mask: (g, s) => computeMultiStripMask(g, s),          empty: 'No strip cells generated — try increasing Width or Strip count.' },
  edge:       { mask: (g, s, px) => computeEdgeMask(g, px, s),        empty: 'No edge cells detected — try lowering Edge Threshold.', image: true },
  brightness: { mask: (g, s, px) => computeBrightnessMask(g, px, s),  empty: 'No cells matched this brightness zone — try adjusting the range.', image: true },
  noise:      { mask: (g, s) => computeNoiseMask(g, s),               empty: 'No cells matched this noise field — try raising the threshold.' },
  geometric:  { mask: (g, s) => computeGeometricMask(g, s),           empty: 'No cells matched this pattern — try adjusting its settings.' },
  halftone:   { mask: (g, s) => computeHalftoneMask(g, s),            empty: 'No cells matched — try adjusting halftone settings.' },
  voronoi:    { mask: (g, s) => computeVoronoiMask(g, s),             empty: 'No cells matched — try adjusting voronoi settings.' },
  spiral:     { mask: (g, s) => computeSpiralMask(g, s),              empty: 'No cells matched — try adjusting spiral settings.' },
  flowField:  { mask: (g, s) => computeFlowFieldMask(g, s),           empty: 'No cells matched — try adjusting flow field settings.' },
  fractal:    { mask: (g, s) => computeFractalMask(g, s),             empty: 'No cells matched — try adjusting fractal settings.' },
  organic:    { mask: (g, s) => computeOrganicMask(g, s),             empty: 'The pattern left nothing to fill — try another threshold, density or seed.' },
  silhouette: { mask: (g, s, px, cells) => new Set(cells ?? []),      empty: 'The silhouette covers no cells — load an image, or lower Coverage.' },
};

// Layouts that tile the grid themselves can't pack around shapes, so any
// of their blocks that would cover a kept shape are dropped.
function withoutOverlaps(blocks, existing) {
  if (!existing.length) return blocks;
  const taken = new Set();
  for (const b of existing)
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++) taken.add(`${b.gridCol + c},${b.gridRow + r}`);
  return blocks.filter(b => {
    for (let r = 0; r < b.rows; r++)
      for (let c = 0; c < b.cols; c++) if (taken.has(`${b.gridCol + c},${b.gridRow + r}`)) return false;
    return true;
  });
}

// request = { fillId, settings, grid, assets, imagePixels, layoutMask, maxScale, scaleFreq, existing, maskCells }
//   layoutMask — cells of the active layout's grid area (array), or null
//   existing   — blocks to pack around: everything for 'gaps', locked shapes for the rest
//   maskCells  — cells worked out on the main thread (fills that need the DOM)
function compute({ fillId, settings, grid, assets, imagePixels, layoutMask, maxScale, scaleFreq, existing = [], maskCells }) {
  if (fillId === 'gaps' || fillId === 'standard') {
    return { blocks: layoutMask
      ? fillMasked(assets, grid, new Set(layoutMask), maxScale, scaleFreq, existing)
      : fillGrid(assets, grid, maxScale, scaleFreq, existing) };
  }
  if (fillId === 'mondrian') return { blocks: withoutOverlaps(generateMondrianLayout(assets, grid, settings), existing) };
  if (fillId === 'golden') return { blocks: withoutOverlaps(generateGoldenLayout(assets, grid, settings), existing) };

  const def = MASKS[fillId];
  if (!def) return { error: `Unknown fill: ${fillId}` };
  if (def.image && !imagePixels) return { error: 'This fill needs an image loaded in Image colour mode.' };
  const cells = def.mask(grid, settings, imagePixels, maskCells);
  if (cells.size === 0) return { error: def.empty };
  // Glitch has its own scale settings; the rest use the document's.
  const [ms, sf] = fillId === 'glitch' ? [settings.maxScale, settings.scaleFreq] : [maxScale, scaleFreq];
  return { blocks: fillMasked(assets, grid, cells, ms, sf, existing) };
}

self.onmessage = ({ data }) => {
  const { id, request } = data;
  try {
    self.postMessage({ id, ...compute(request) });
  } catch (err) {
    self.postMessage({ id, error: `The fill failed: ${err?.message ?? err}` });
  }
};
