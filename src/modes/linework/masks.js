// Region masks for Linework: the Generate panel's mask fills, run over a
// layer's own cell grid with the document's settings for that fill, plus the
// seed word's letterforms. A mask is a Set of "col,row" keys.

import { FILLS_BY_ID } from '../gridBuilder/fills';
import { computeGlitchMask } from '../../utils/glitchFill';
import { computeStripMask, computeMultiStripMask } from '../../utils/stripFill';
import { computeEdgeMask } from '../../utils/edgeFill';
import { computeBrightnessMask } from '../../utils/brightnessFill';
import { computeNoiseMask } from '../../utils/noiseFill';
import { computeGeometricMask } from '../../utils/geometricFill';
import { computeHalftoneMask } from '../../utils/halftoneFill';
import { computeVoronoiMask } from '../../utils/voronoiFill';
import { computeSpiralMask } from '../../utils/spiralFill';
import { computeFlowFieldMask } from '../../utils/flowFieldFill';
import { computeFractalMask } from '../../utils/fractalFill';
import { computeOrganicMask } from '../../utils/organicFill';
import { computeTextMaskCells, computeScatteredTextMask } from '../../utils/knotworkTextMask';
import { mulberry32 } from '../../utils/rng';
import { hashSeed } from '../../utils/textSeed';

const SOURCES = {
  geometric:  (g, s) => computeGeometricMask(g, s),
  noise:      (g, s) => computeNoiseMask(g, s),
  organic:    (g, s) => computeOrganicMask(g, s),
  strip:      (g, s) => computeStripMask(g, s),
  multiStrip: (g, s) => computeMultiStripMask(g, s),
  glitch:     (g, s) => computeGlitchMask(g, s),
  halftone:   (g, s) => computeHalftoneMask(g, s),
  voronoi:    (g, s) => computeVoronoiMask(g, s),
  spiral:     (g, s) => computeSpiralMask(g, s),
  flowField:  (g, s) => computeFlowFieldMask(g, s),
  fractal:    (g, s) => computeFractalMask(g, s),
  brightness: (g, s, px) => (px ? computeBrightnessMask(g, px, s) : null),
  edge:       (g, s, px) => (px ? computeEdgeMask(g, px, s) : null),
  // Worked out asynchronously by the editor (it needs the DOM); see silhouetteCells.
  silhouette: null,
};

// The mask sources offered in the Linework panel, in Generate-panel order.
export const MASK_SOURCES = [
  { id: 'word', label: 'Word' },
  ...Object.keys(SOURCES).map(id => FILLS_BY_ID[id]).filter(Boolean).map(f => ({ id: f.id, label: f.label, fill: f })),
];

// A mask over a cols × rows grid laid across the real grid's pixels (image
// fills sample the picture there). Returns a Set, or null for no mask.
export function computeLineworkMask(source, { cols, rows, realGrid, settings, imagePixels, word, seed }) {
  const grid = {
    cols, rows,
    cellSize: realGrid.gridW / cols,
    gridOriginX: realGrid.gridOriginX, gridOriginY: realGrid.gridOriginY,
    gridW: realGrid.gridW, gridH: realGrid.gridH,
  };
  if (source === 'word') {
    if (!word?.text?.trim()) return null;
    return word.layout === 'scatter'
      ? computeScatteredTextMask(grid, word.text, word.letterSize, mulberry32(hashSeed(word.text) ^ (seed | 0)), {
        randomSize: word.randomSize, randomPlacement: word.randomPlacement, align: word.align,
      })
      : computeTextMaskCells(grid, word.text, word.letterSize);
  }
  const fn = SOURCES[source];
  if (!fn || !settings) return null;
  try {
    return fn(grid, settings, imagePixels) ?? null;
  } catch {
    return null;
  }
}
