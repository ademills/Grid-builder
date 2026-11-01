import { range, oneOf } from '../../panels/schemaUtils';
import { RD_PRESETS, CA_RULES } from '../../utils/organicFill';
import { symmetryOptions, normaliseSymmetry, ORGANIC_SYMMETRY } from '../../utils/symmetry';
import { StripPositions, SilhouetteImage } from './schemaFields';

// Grid Pattern's fill settings as data (see panels/schema.jsx), one schema
// per fill, keyed by fill id. The Generate panel, Linework's mask fills and
// Surprise Me (each field's `surprise`) are built from these. Surprise
// ranges are pulled in from the extremes that tend to leave the grid empty
// or solid.

const pct = v => `${Math.round(v * 100)}%`;
const cells = v => `${v} cells`;
const deg = v => `${v}°`;
const fixed2 = v => (+v).toFixed(2);
const int = (min, max) => range(min, max, 1);
const chance = p => r => r() < p;
const seedField = { key: 'seed', label: 'Seed', type: 'seed', surprise: r => Math.floor(r() * 0x80000000) };
const axisField = (surprise) => ({ key: 'axis', label: 'Axis', type: 'segmented', surprise,
  options: [{ key: 'h', label: 'Horizontal' }, { key: 'v', label: 'Vertical' }, { key: 'angle', label: 'Angle' }] });
const angleField = (showIf) => ({ key: 'angle', label: 'Angle', type: 'slider', min: 0, max: 180, step: 1, format: deg, showIf, surprise: int(0, 180) });
const centreFields = (lo = 0.2, hi = 0.8) => [
  { key: 'centerX', label: 'Centre X', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2, surprise: range(lo, hi, 0.01) },
  { key: 'centerY', label: 'Centre Y', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2, surprise: range(lo, hi, 0.01) },
];
const invertField = (p) => ({ key: 'invert', label: 'Invert', type: 'toggle', surprise: chance(p) });
const choices = (obj) => Object.entries(obj).map(([key, o]) => ({ key, label: o.label }));
const one = (fields) => [{ id: 'fill', fields }];

const geometric = (type) => (s) => s.patternType === type;

export const FILL_SCHEMAS = {
  glitch: one([
    { key: 'direction', label: 'Direction', type: 'segmented', surprise: oneOf(['h', 'h', 'v', 'both']),
      options: [{ key: 'h', label: 'H' }, { key: 'v', label: 'V' }, { key: 'both', label: 'Both' }] },
    { key: 'hBars', label: 'H Bars', type: 'slider', min: 0, max: 60, step: 1,
      surprise: (r, s) => (s.direction === 'v' ? 0 : int(4, 40)(r)) },
    { key: 'vBars', label: 'V Bars', type: 'slider', min: 0, max: 60, step: 1,
      surprise: (r, s) => (s.direction === 'h' ? 0 : int(4, 40)(r)) },
    { key: 'force', label: 'Force', type: 'slider', min: 0, max: 1, step: 0.01, format: pct, surprise: range(0.1, 0.7, 0.01) },
    { key: 'activeRatio', label: 'Active ratio', type: 'slider', min: 0, max: 1, step: 0.01, format: pct, surprise: range(0.2, 0.8, 0.01) },
    { key: 'barSizeVariance', label: 'Bar variance', type: 'slider', min: 0, max: 1, step: 0.01, format: pct, surprise: range(0, 1, 0.01) },
    { key: 'minDisplacement', label: 'Min shift', type: 'number', min: 1, max: 10, surprise: int(1, 4) },
    { key: 'bidirectional', label: 'Bidirectional', type: 'toggle', surprise: chance(0.7) },
    { key: 'maxScale', label: 'Max scale', type: 'slider', min: 1, max: 4, step: 1, format: v => `${v}×` },
    { key: 'scaleFreq', label: 'Scale freq', type: 'slider', min: 0, max: 100, step: 5, format: v => `${v}%`, showIf: s => s.maxScale > 1 },
    seedField,
  ]),

  strip: one([
    axisField(oneOf(['h', 'v', 'angle'])),
    angleField(s => s.axis === 'angle'),
    { key: 'position', label: 'Position', type: 'slider', min: 0, max: 1, step: 0.01, format: pct, surprise: range(0.25, 0.75, 0.01) },
    { key: 'width', label: 'Width', type: 'number', min: 1, max: 20, format: cells, surprise: int(2, 10) },
    { key: 'feather', label: 'Feather', type: 'number', min: 0, max: 5, format: cells, surprise: int(0, 3) },
    seedField,
  ]),

  multiStrip: one([
    axisField(oneOf(['h', 'v', 'angle', 'angle'])),
    angleField(s => s.axis === 'angle'),
    { key: 'numStrips', label: 'Strip count', type: 'number', min: 2, max: 12, surprise: int(2, 8) },
    { key: 'stripWidth', label: 'Strip width', type: 'number', min: 1, max: 10, format: cells, surprise: int(1, 5) },
    { key: 'spacing', label: 'Spacing', type: 'segmented', value: s => s.spacing ?? 'even', surprise: () => 'even',
      options: [{ key: 'even', label: 'Even' }, { key: 'manual', label: 'Manual' }] },
    { key: 'positions', type: 'custom', render: StripPositions, showIf: s => s.spacing === 'manual' },
    { key: 'stagger', label: 'Stagger', type: 'toggle', surprise: chance(0.4) },
    { key: 'feather', label: 'Feather', type: 'number', min: 0, max: 5, format: cells, surprise: int(0, 2) },
    seedField,
  ]),

  edge: one([
    { key: 'edgeThreshold', label: 'Edge threshold', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2, surprise: range(0.08, 0.4, 0.01) },
    { key: 'traceWidth', label: 'Trace width', type: 'number', min: 1, max: 4, format: cells, surprise: int(1, 2) },
    { key: 'minEdgeLength', label: 'Min edge length', type: 'number', min: 1, max: 20, format: cells, surprise: int(1, 4) },
    { key: 'direction', label: 'Direction', type: 'segmented', surprise: oneOf(['all', 'all', 'h', 'v']),
      options: [{ key: 'all', label: 'All' }, { key: 'h', label: 'Horizontal' }, { key: 'v', label: 'Vertical' }] },
  ]),

  brightness: one([
    { key: 'targetZone', label: 'Target zone', type: 'segmented', surprise: oneOf(['darks', 'midtones', 'lights']),
      options: [{ key: 'darks', label: 'Darks' }, { key: 'midtones', label: 'Mid' }, { key: 'lights', label: 'Lights' }, { key: 'custom', label: 'Custom' }] },
    { key: 'lowPoint', label: 'Low point', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2,
      showIf: s => s.targetZone === 'custom' || s.targetZone === 'midtones' },
    { key: 'highPoint', label: 'High point', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2,
      showIf: s => s.targetZone === 'custom' || s.targetZone === 'midtones' },
    // Darks fill below one boundary, lights above it.
    { key: 'boundary', label: 'Boundary', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2,
      showIf: s => s.targetZone === 'darks' || s.targetZone === 'lights',
      value: s => (s.targetZone === 'darks' ? s.lowPoint : s.highPoint),
      onChange: (v, s) => (s.targetZone === 'darks' ? { lowPoint: v } : { highPoint: v }) },
    { key: 'softEdge', label: 'Soft edge', type: 'slider', min: 0, max: 0.3, step: 0.01, format: fixed2, surprise: range(0, 0.2, 0.01) },
    invertField(0.25),
    seedField,
  ]),

  noise: one([
    { key: 'scale', label: 'Scale', type: 'slider', min: 0.05, max: 2, step: 0.01, format: fixed2, surprise: range(0.08, 0.6, 0.01) },
    { key: 'threshold', label: 'Threshold', type: 'slider', min: 0, max: 1, step: 0.01, format: pct, surprise: range(0.35, 0.65, 0.01) },
    { key: 'octaves', label: 'Octaves', type: 'number', min: 1, max: 4, surprise: int(1, 4) },
    invertField(0.3),
    seedField,
  ]),

  geometric: one([
    { key: 'patternType', label: 'Pattern', type: 'choices', surprise: oneOf(['stripes', 'rings', 'checkerboard', 'sunburst', 'dots', 'hex']),
      options: [
        { key: 'stripes', label: 'Stripes' }, { key: 'rings', label: 'Rings' }, { key: 'checkerboard', label: 'Checkerboard' },
        { key: 'sunburst', label: 'Sunburst' }, { key: 'dots', label: 'Dot Grid' }, { key: 'hex', label: 'Hex Grid' },
      ] },
    { ...angleField(geometric('stripes')) },
    { key: 'stripeWidth', label: 'Stripe width', type: 'number', min: 1, max: 20, format: cells, showIf: geometric('stripes'), surprise: int(1, 5) },
    { key: 'gapWidth', label: 'Gap width', type: 'number', min: 0, max: 20, format: cells, showIf: geometric('stripes'), surprise: int(1, 4) },
    ...centreFields().map(f => ({ ...f, showIf: s => s.patternType === 'rings' || s.patternType === 'sunburst' })),
    { key: 'ringWidth', label: 'Ring width', type: 'number', min: 1, max: 20, format: cells, showIf: geometric('rings'), surprise: int(1, 4) },
    { key: 'gap', label: 'Gap', type: 'number', min: 0, max: 20, format: cells, showIf: geometric('rings'), surprise: int(1, 4) },
    { key: 'numSpokes', label: 'Spokes', type: 'number', min: 2, max: 48, showIf: geometric('sunburst'), surprise: int(4, 24) },
    { key: 'spokeWidth', label: 'Spoke width', type: 'slider', min: 1, max: 45, step: 1, format: deg, showIf: geometric('sunburst'), surprise: int(5, 25) },
    { key: 'innerRadius', label: 'Inner radius', type: 'number', min: 0, max: 40, format: cells,
      showIf: s => s.patternType === 'rings' || s.patternType === 'sunburst', surprise: int(0, 4) },
    { key: 'tileSize', label: 'Tile size', type: 'number', min: 1, max: 20, format: cells, showIf: geometric('checkerboard'), surprise: int(1, 5) },
    { key: 'dotRadius', label: 'Dot radius', type: 'number', min: 0.5, max: 5, format: cells, showIf: geometric('dots'), surprise: oneOf([0.5, 1, 1.5, 2]) },
    { key: 'spacingX', label: 'Spacing X', type: 'number', min: 1, max: 20, showIf: geometric('dots'), surprise: int(2, 6) },
    { key: 'spacingY', label: 'Spacing Y', type: 'number', min: 1, max: 20, showIf: geometric('dots'), surprise: int(2, 6) },
    { key: 'offsetX', label: 'Offset X', type: 'number', min: 0, max: 20,
      showIf: s => s.patternType === 'checkerboard' || s.patternType === 'dots', surprise: int(0, 3) },
    { key: 'offsetY', label: 'Offset Y', type: 'number', min: 0, max: 20,
      showIf: s => s.patternType === 'checkerboard' || s.patternType === 'dots', surprise: int(0, 3) },
    { key: 'cellRadius', label: 'Cell radius', type: 'number', min: 1, max: 10, format: cells, showIf: geometric('hex'), surprise: int(1, 4) },
    { key: 'rowOffset', label: 'Row offset', type: 'slider', min: 0, max: 1, step: 0.01, format: fixed2, showIf: geometric('hex'), surprise: range(0, 1, 0.01) },
    { key: 'phase', label: 'Phase', type: 'slider', min: 0, max: 20, step: 0.5, surprise: range(0, 10, 0.5) },
  ]),

  organic: one([
    { key: 'algorithm', label: 'Engine', type: 'segmented', surprise: r => (r() < 0.6 ? 'reaction' : 'automaton'),
      options: [{ key: 'reaction', label: 'Reaction-diffusion' }, { key: 'automaton', label: 'Cellular automaton' }] },
    { key: 'preset', label: 'Pattern', type: 'choices', options: choices(RD_PRESETS), showIf: s => s.algorithm !== 'automaton',
      surprise: oneOf(['spots', 'maze', 'coral', 'worms', 'holes', 'waves']) },
    { key: 'feature', label: 'Feature size', type: 'slider', min: 1, max: 6, step: 0.5, format: cells, showIf: s => s.algorithm !== 'automaton',
      surprise: oneOf([1.5, 2, 2.5, 3]) },
    { key: 'iterations', label: 'Growth', type: 'slider', min: 500, max: 6000, step: 250, format: v => `${v} steps`, showIf: s => s.algorithm !== 'automaton',
      surprise: range(1500, 3500, 250) },
    { key: 'threshold', label: 'Threshold', type: 'slider', min: 0.05, max: 0.95, step: 0.01, format: pct, showIf: s => s.algorithm !== 'automaton',
      surprise: range(0.35, 0.6, 0.01) },
    { key: 'rule', label: 'Rule', type: 'choices', options: choices(CA_RULES), showIf: s => s.algorithm === 'automaton',
      surprise: oneOf(['cave', 'cave', 'coral', 'maze', 'daynight']) },
    { key: 'density', label: 'Start density', type: 'slider', min: 0.05, max: 0.9, step: 0.01, format: pct, showIf: s => s.algorithm === 'automaton',
      surprise: range(0.35, 0.55, 0.01) },
    { key: 'generations', label: 'Generations', type: 'number', min: 0, max: 200, showIf: s => s.algorithm === 'automaton', surprise: int(4, 14) },
    { key: 'wrap', label: 'Wrap edges', type: 'toggle', showIf: s => s.algorithm === 'automaton', surprise: chance(0.5) },
    { key: 'symmetry', label: 'Mirror start', type: 'segmented', value: s => normaliseSymmetry(s.symmetry),
      options: symmetryOptions(ORGANIC_SYMMETRY).map(m => ({ key: m.key, label: m.icon, title: m.title })),
      surprise: oneOf(['none', 'none', 'mirror-x', 'mirror-both']) },
    invertField(0.2),
    seedField,
  ]),

  silhouette: one([
    { key: 'note', type: 'note', text: 'Load an SVG or PNG (a logo, an outline). Shapes fill the cells it covers.' },
    { key: 'src', type: 'custom', render: SilhouetteImage },
    { key: 'source', label: 'Inside is', type: 'segmented', options: [
      { key: 'auto', label: 'Auto', title: 'Opaque parts if the image has transparency, otherwise dark parts' },
      { key: 'alpha', label: 'Opaque' }, { key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' },
    ] },
    { key: 'fit', label: 'Fit', type: 'segmented', options: [
      { key: 'contain', label: 'Contain' }, { key: 'cover', label: 'Cover' }, { key: 'stretch', label: 'Stretch' },
    ] },
    { key: 'threshold', label: 'Coverage', type: 'slider', min: 0.05, max: 0.95, step: 0.05, format: pct },
    { key: 'scale', label: 'Size', type: 'slider', min: 0.25, max: 2, step: 0.05, format: pct },
    { key: 'padding', label: 'Padding', type: 'slider', min: 0, max: 0.4, step: 0.01, format: pct },
    { key: 'offsetX', label: 'Offset X', type: 'slider', min: -0.5, max: 0.5, step: 0.01, format: pct },
    { key: 'offsetY', label: 'Offset Y', type: 'slider', min: -0.5, max: 0.5, step: 0.01, format: pct },
    { key: 'invert', label: 'Invert', type: 'toggle', help: 'Fill around the silhouette instead' },
  ]),

  halftone: one([
    { key: 'dotSpacing', label: 'Dot spacing', type: 'number', min: 2, max: 20, format: cells, surprise: int(3, 8) },
    { key: 'maxRadius', label: 'Max radius', type: 'slider', min: 0.5, max: 10, step: 0.5, surprise: range(1, 4, 0.5) },
    angleField(),
    ...centreFields(),
    invertField(0.3),
  ]),

  voronoi: one([
    { key: 'numPoints', label: 'Points', type: 'number', min: 2, max: 100, surprise: int(5, 40) },
    { key: 'borderOnly', label: 'Mode', type: 'segmented', surprise: chance(0.3),
      options: [{ key: false, label: 'Regions' }, { key: true, label: 'Borders' }] },
    { key: 'fillRatio', label: 'Fill ratio', type: 'slider', min: 0.1, max: 1, step: 0.05, format: pct, showIf: s => !s.borderOnly,
      surprise: range(0.3, 0.8, 0.05) },
    { key: 'borderWidth', label: 'Border width', type: 'number', min: 1, max: 5, format: cells, showIf: s => s.borderOnly, surprise: int(1, 2) },
    seedField,
  ]),

  spiral: one([
    { key: 'arms', label: 'Arms', type: 'number', min: 1, max: 12, surprise: int(1, 6) },
    { key: 'width', label: 'Width', type: 'slider', min: 0.5, max: 10, step: 0.5, surprise: range(1, 4, 0.5) },
    { key: 'tightness', label: 'Tightness', type: 'slider', min: 0.02, max: 1, step: 0.01, format: fixed2, surprise: range(0.05, 0.4, 0.01) },
    ...centreFields(0.3, 0.7),
    { key: 'direction', label: 'Direction', type: 'segmented', surprise: oneOf([1, -1]),
      options: [{ key: 1, label: 'CW' }, { key: -1, label: 'CCW' }] },
  ]),

  flowField: one([
    { key: 'scale', label: 'Scale', type: 'slider', min: 0.01, max: 0.5, step: 0.01, format: fixed2, surprise: range(0.03, 0.2, 0.01) },
    { key: 'numLines', label: 'Lines', type: 'number', min: 1, max: 200, surprise: int(10, 80) },
    { key: 'lineLength', label: 'Line length', type: 'number', min: 5, max: 200, surprise: int(15, 80) },
    { key: 'lineWidth', label: 'Line width', type: 'number', min: 1, max: 5, format: cells, surprise: int(1, 2) },
    seedField,
  ]),

  fractal: one([
    { key: 'patternType', label: 'Pattern', type: 'choices', surprise: oneOf(['sierpinski', 'cantorDust', 'vicsek']),
      options: [{ key: 'sierpinski', label: 'Sierpinski' }, { key: 'cantorDust', label: 'Cantor Dust' }, { key: 'vicsek', label: 'Vicsek' }] },
    { key: 'depth', label: 'Depth', type: 'number', min: 1, max: 6, surprise: int(2, 5) },
    invertField(0.3),
  ]),

  mondrian: one([
    { key: 'note', type: 'note', text: 'Recursive rectangle subdivision — creates De Stijl / poster layouts.' },
    { key: 'minSize', label: 'Min region', type: 'number', min: 1, max: 10, format: cells, surprise: int(1, 4) },
    { key: 'splitVariance', label: 'Split variance', type: 'slider', min: 0, max: 0.5, step: 0.05, format: fixed2, surprise: range(0.1, 0.45, 0.05) },
    seedField,
  ]),

  golden: one([
    { key: 'note', type: 'note', text: 'Phi-ratio recursive subdivision — creates harmonious, balanced layouts.' },
    { key: 'minSize', label: 'Min region', type: 'number', min: 1, max: 10, format: cells, surprise: int(1, 3) },
    { key: 'maxDepth', label: 'Max depth', type: 'number', min: 1, max: 12, surprise: int(4, 9) },
    { key: 'alternate', label: 'Alternate axes', type: 'toggle', surprise: chance(0.7) },
    seedField,
  ]),
};
