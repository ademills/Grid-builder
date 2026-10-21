import { FILLS } from './fills';
import { PALETTES, PALETTE_KEYS } from '../../utils/colorize';

// Surprise Me: a random fill, random settings for it, a random palette and a
// fresh seed. Ranges are the Generate panel's, pulled in from the extremes
// where those tend to produce an empty or solid grid.

const rand = (min, max) => min + Math.random() * (max - min);
const int = (min, max) => Math.floor(rand(min, max + 1));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (p = 0.5) => Math.random() < p;
const round = (v, step) => Math.round(v / step) * step;
const seed = () => Math.floor(Math.random() * 0x80000000);

const RANDOM_SETTINGS = {
  glitch: () => {
    const direction = pick(['h', 'h', 'v', 'both']);
    return {
      direction,
      hBars: direction === 'v' ? 0 : int(4, 40),
      vBars: direction === 'h' ? 0 : int(4, 40),
      force: round(rand(0.1, 0.7), 0.01),
      activeRatio: round(rand(0.2, 0.8), 0.01),
      barSizeVariance: round(rand(0, 1), 0.01),
      minDisplacement: int(1, 4),
      bidirectional: chance(0.7),
      seed: seed(),
    };
  },
  strip: () => ({
    axis: pick(['h', 'v', 'angle']),
    angle: int(0, 180),
    position: round(rand(0.25, 0.75), 0.01),
    width: int(2, 10),
    feather: int(0, 3),
    seed: seed(),
  }),
  multiStrip: () => ({
    axis: pick(['h', 'v', 'angle', 'angle']),
    angle: int(0, 180),
    numStrips: int(2, 8),
    stripWidth: int(1, 5),
    spacing: 'even',
    stagger: chance(0.4),
    feather: int(0, 2),
    seed: seed(),
  }),
  edge: () => ({
    edgeThreshold: round(rand(0.08, 0.4), 0.01),
    traceWidth: int(1, 2),
    minEdgeLength: int(1, 4),
    direction: pick(['all', 'all', 'h', 'v']),
  }),
  brightness: () => ({
    targetZone: pick(['darks', 'midtones', 'lights']),
    invert: chance(0.25),
    softEdge: round(rand(0, 0.2), 0.01),
    seed: seed(),
  }),
  noise: () => ({
    scale: round(rand(0.08, 0.6), 0.01),
    threshold: round(rand(0.35, 0.65), 0.01),
    octaves: int(1, 4),
    invert: chance(0.3),
    seed: seed(),
  }),
  geometric: () => ({
    patternType: pick(['stripes', 'rings', 'checkerboard', 'sunburst', 'dots', 'hex']),
    angle: int(0, 180),
    stripeWidth: int(1, 5), gapWidth: int(1, 4),
    centerX: round(rand(0.2, 0.8), 0.01), centerY: round(rand(0.2, 0.8), 0.01),
    ringWidth: int(1, 4), gap: int(1, 4), innerRadius: int(0, 4),
    tileSize: int(1, 5), offsetX: int(0, 3), offsetY: int(0, 3),
    numSpokes: int(4, 24), spokeWidth: int(5, 25),
    dotRadius: pick([0.5, 1, 1.5, 2]), spacingX: int(2, 6), spacingY: int(2, 6),
    cellRadius: int(1, 4), rowOffset: round(rand(0, 1), 0.01),
    phase: round(rand(0, 10), 0.5),
  }),
  halftone: () => ({
    dotSpacing: int(3, 8),
    maxRadius: round(rand(1, 4), 0.5),
    angle: int(0, 180),
    centerX: round(rand(0.2, 0.8), 0.01), centerY: round(rand(0.2, 0.8), 0.01),
    invert: chance(0.3),
  }),
  voronoi: () => ({
    numPoints: int(5, 40),
    fillRatio: round(rand(0.3, 0.8), 0.05),
    borderOnly: chance(0.3),
    borderWidth: int(1, 2),
    seed: seed(),
  }),
  spiral: () => ({
    arms: int(1, 6),
    width: round(rand(1, 4), 0.5),
    tightness: round(rand(0.05, 0.4), 0.01),
    centerX: round(rand(0.3, 0.7), 0.01), centerY: round(rand(0.3, 0.7), 0.01),
    direction: pick([1, -1]),
  }),
  flowField: () => ({
    scale: round(rand(0.03, 0.2), 0.01),
    numLines: int(10, 80),
    lineLength: int(15, 80),
    lineWidth: int(1, 2),
    seed: seed(),
  }),
  fractal: () => ({
    patternType: pick(['sierpinski', 'cantorDust', 'vicsek']),
    depth: int(2, 5),
    invert: chance(0.3),
  }),
  mondrian: () => ({ minSize: int(1, 4), splitVariance: round(rand(0.1, 0.45), 0.05), seed: seed() }),
  golden: () => ({ minSize: int(1, 3), maxDepth: int(4, 9), alternate: chance(0.7), seed: seed() }),
};

// Picks the parts of a surprise. `canUseImage` limits it to fills that run
// without an image when none is loaded. `libraries` are the user's swatch
// libraries ({ name, swatches: [{ hex }] }).
export function pickSurprise({ canUseImage, libraries = [] }) {
  const fills = FILLS.filter(f => f.image !== 'required' || canUseImage);
  const fill = pick(fills);
  const settings = RANDOM_SETTINGS[fill.id]?.() ?? null;

  const palettes = [
    ...PALETTE_KEYS.map(key => ({ name: key, colours: PALETTES[key] })),
    ...libraries.filter(l => l.swatches.length >= 2).map(l => ({ name: l.name, colours: l.swatches.map(s => s.hex) })),
  ];
  return { fill, settings, palette: pick(palettes) };
}
