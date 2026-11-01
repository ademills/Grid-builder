// Linework document settings (lineworkSettings) and the built-in presets.
//
// Sizes are grid-relative so a design keeps its look when the artboard or
// column count changes: lines per cell and the line : pitch ratio set the
// line weight; plate sizes, offsets, depths and rims are in cells.

const randomSeed = () => Math.floor(Math.random() * 0x80000000);

// One generated layer: the base (index 0) or a plate (1 and up, bottom to
// top). Plates have a stable id, so reordering keeps each one's edits.
export const lineworkLayerDefaults = (over = {}) => ({
  // Plates only
  id: 'base', name: 'Base', enabled: true, shape: 'square', size: 6, ox: 0, oy: 0,
  // Plate sides: 'equal' (size × size), 'cells' (w × h cells) or 'ratio'
  // (`aspect` with `size` as the long side, turned upright by `portrait`).
  sizing: 'equal', w: 6, h: 4, aspect: '3:2', portrait: false,
  shadow: 'soft', depth: 0.25, rim: 0, rimInk: false,
  // Background: 'square' (corner: rounding, 0–1 of the short side's half),
  // 'none', or for circuits 'outline' | 'sticker' | 'infill' (pad: cells
  // of margin round the lines for outline and sticker).
  backing: 'square', corner: 0, pad: 0.15,
  // Any layer
  scale: 1, invert: false, style: 'angular', sym: 'mirror-both', seed: randomSeed(),
  // Base only: an ink frame round the canvas, in cells
  frame: 0,
  // A · angular (the cell shape is the document's `tiling`; tile size sets
  // the cell size)
  tile: 2, subdiv: 0, minTile: 1, fills: ['spiral'], triFill: 'spiral', angles: ['45', '135'],
  orient: 'random', outline: true, core: true,
  // B · circuit. route: 'bundles' (many walks) or 'single' (one walk, same
  // rules); `fill` makes the single route visit every cell (no crossings),
  // optionally as a closed `loop`. maxLen 200 means no limit.
  route: 'bundles', fill: false, loop: false, bundle: 1, straight: 0.6, maxLen: 40, density: 1, edgeExit: 0.5, weave: 'off', eyes: true,
  // Region mask: a Generate-panel fill (its own settings) or 'word'
  mask: 'none', maskFills: ['rings'], maskOutside: 'fill',
  ...over,
});

export const createLineworkSettings = () => ({
  orientation: 'square',
  // Cell shape for every layer and style: 'square' | 'hex' | 'triangle' |
  // 'voronoi'; regularity evens out Voronoi cells (Properties › Grid).
  tiling: 'square',
  regularity: 0.5,
  linesPerCell: 3,
  lineRatio: 0.55,
  // Colour roles: swatch ids, or null — ink: the first palette swatch;
  // ground: the canvas colour; shadow: black.
  inkSwatch: null,
  groundSwatch: null,
  shadowSwatch: null,
  inkFromImage: false,
  colourSeed: 0,
  // "Word" region mask (the seed word's letterforms, as in Meander).
  word: { text: '', letterSize: 0.7, layout: 'line', randomSize: true, randomPlacement: true, align: 'center' },
  layers: [lineworkLayerDefaults()],
});

const newId = () => Math.random().toString(36).slice(2, 8);

// Plate aspect ratios (long side : short side). 'match' follows the grid.
export const PLATE_ASPECTS = [
  { key: 'match', label: 'Match grid' },
  { key: '5:4', label: '5 : 4', r: 5 / 4 },
  { key: '4:3', label: '4 : 3', r: 4 / 3 },
  { key: 'sqrt2', label: '√2 : 1 (A paper)', r: Math.SQRT2 },
  { key: '3:2', label: '3 : 2', r: 3 / 2 },
  { key: 'golden', label: 'Golden (1.618 : 1)', r: (1 + Math.sqrt(5)) / 2 },
  { key: '16:9', label: '16 : 9', r: 16 / 9 },
  { key: '2:1', label: '2 : 1', r: 2 },
  { key: '3:1', label: '3 : 1', r: 3 },
];

// A plate's width and height in cells. `grid` is the base layer's size in
// cells, for the 'match' ratio.
export function plateCells(cfg, grid = null) {
  const size = Math.max(0.5, cfg.size ?? 4);
  if (cfg.sizing === 'cells') return [Math.max(0.5, cfg.w ?? size), Math.max(0.5, cfg.h ?? size)];
  if (cfg.sizing === 'ratio') {
    const r = cfg.aspect === 'match'
      ? (grid ? grid.w / grid.h : 1)
      : (PLATE_ASPECTS.find(a => a.key === cfg.aspect)?.r ?? 1.5);
    // 'match' already carries the grid's orientation; Portrait turns it.
    const wide = cfg.aspect === 'match' ? r >= 1 !== !!cfg.portrait : !cfg.portrait;
    const long = size, short = size / Math.max(r, 1 / r);
    return wide ? [long, short] : [short, long];
  }
  return [size, size];
}

// A layer's design settings: what a new plate copies from the layer it's
// added on top of (its placement, seed, frame and mask are its own).
const DESIGN_KEYS = [
  'style', 'sym', 'scale',
  'tile', 'subdiv', 'minTile', 'fills', 'triFill', 'angles', 'orient', 'outline', 'core',
  'route', 'fill', 'loop', 'bundle', 'straight', 'maxLen', 'density', 'edgeExit', 'weave', 'eyes',
  'backing', 'corner', 'pad',
];

// A new plate, named after the next free number, sized to fit inside
// whatever is under it, and drawn in the same style and settings.
export function newPlate(layers, over = {}) {
  const used = new Set(layers.map(l => l.name));
  let n = layers.length;
  while (used.has(`Plate ${n}`)) n++;
  const under = layers[layers.length - 1];
  const size = layers.length > 1 ? Math.max(1, Math.round(Math.min(...plateCells(under)) * 0.6 * 2) / 2) : 6;
  const design = Object.fromEntries(DESIGN_KEYS.filter(k => under?.[k] !== undefined).map(k => [k, under[k]]));
  return lineworkLayerDefaults({ ...design, id: newId(), name: `Plate ${n}`, size, ...over });
}

// Fills older or partial settings out to the full shape. Documents from
// before plates could be added had three fixed slots with an on/off switch:
// the switched-off ones are dropped and the rest get ids.
export function mergeLineworkSettings(saved) {
  const d = createLineworkSettings();
  if (!saved) return d;
  const [base, ...plates] = saved.layers?.length ? saved.layers : d.layers;
  return {
    ...d,
    // Cells were briefly a per-layer setting: the base layer's carries over.
    ...(saved.tiling == null && base?.tiling ? { tiling: base.tiling, regularity: base.regularity ?? d.regularity } : {}),
    ...saved,
    word: { ...d.word, ...(saved.word ?? {}) },
    layers: [
      { ...lineworkLayerDefaults(), ...base, id: 'base', name: 'Base' },
      ...plates.filter(l => l && l.enabled !== false).map((l, i) => ({
        ...lineworkLayerDefaults(), ...l, id: l.id ?? `p${i + 1}`, name: l.name ?? `Plate ${i + 1}`, enabled: true,
      })),
    ],
  };
}

// Presets: settings plus colours (ink, ground, shadow) and a column count.
const L = lineworkLayerDefaults;
const P = (n, over) => L({ id: `p${n}`, name: `Plate ${n}`, ...over });
export const LINEWORK_PRESETS = [
  {
    name: 'Greek-key tiles', cols: 17, colours: ['#111111', '#ffffff', '#000000'],
    settings: { orientation: 'diamond', linesPerCell: 4, lineRatio: 0.55, layers: [
      L({ tile: 3, fills: ['spiral'], sym: 'mirror-both', orient: 'uniform', seed: 11 }),
      P(1, { size: 6, shape: 'diamond', tile: 2, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', depth: 0.27, seed: 4 }),
      P(2, { size: 3, scale: 0.6, tile: 3, fills: ['spiral'], sym: 'mirror-diag', orient: 'uniform', depth: 0.18, seed: 2 }),
    ] },
  },
  {
    name: 'Triangle keys', cols: 17, colours: ['#d0a64e', '#1d3a9c', '#000000'],
    settings: { orientation: 'diamond', linesPerCell: 4, lineRatio: 0.26, layers: [
      L({ tile: 4, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', seed: 3 }),
      P(1, { size: 6, shape: 'diamond', tile: 2, scale: 0.5, fills: ['split4', 'spiral'], sym: 'mirror-diag', orient: 'uniform', shadow: 'none', rim: 0.06, rimInk: true, seed: 5 }),
      P(2, { size: 2.5, tile: 4, scale: 0.4, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', shadow: 'none', rim: 0.06, rimInk: true, seed: 8 }),
    ] },
  },
  {
    name: 'Op chevron', cols: 12, colours: ['#1b1b1b', '#efebe3', '#000000'],
    settings: { orientation: 'square', linesPerCell: 2, lineRatio: 0.55, layers: [
      L({ tile: 40, fills: ['hatch'], angles: ['90'], sym: 'none', outline: false, frame: 0.55 }),
      P(1, { size: 17, shape: 'diamond', oy: 9, tile: 40, fills: ['rings'], sym: 'none', shadow: 'none' }),
    ] },
  },
  {
    name: 'Circuit weave', cols: 15, colours: ['#4b4b4b', '#dcdcdc', '#000000'],
    settings: { orientation: 'square', linesPerCell: 6, lineRatio: 0.33, layers: [
      L({ style: 'circuit', sym: 'none', bundle: 3, straight: 0.6, maxLen: 14, weave: 'alternate', density: 0.9, edgeExit: 0, seed: 21 }),
    ] },
  },
  {
    name: 'Labyrinth mandala', cols: 24, colours: ['#c9e86a', '#0f0f0f', '#000000'],
    settings: { orientation: 'square', linesPerCell: 2, lineRatio: 0.69, layers: [
      L({ style: 'circuit', sym: 'mirror-both', bundle: 1, straight: 0.5, maxLen: 30, edgeExit: 0.3, seed: 7 }),
      P(1, { style: 'circuit', size: 12, shape: 'diamond', sym: 'mirror-both', straight: 0.7, edgeExit: 0, shadow: 'none', rim: 0.3, seed: 3 }),
    ] },
  },
  {
    name: 'Maze diamond', cols: 20, colours: ['#121212', '#c9a14c', '#000000'],
    settings: { orientation: 'diamond', linesPerCell: 2, lineRatio: 0.7, layers: [
      L({ style: 'circuit', sym: 'mirror-both', straight: 0.65, maxLen: 24, edgeExit: 0.4, seed: 12 }),
      P(1, { size: 2, tile: 2, fills: ['rings'], sym: 'none', shadow: 'none' }),
    ] },
  },
  {
    name: 'Stacked planes', cols: 16, colours: ['#2f8fe3', '#f7f1e3', '#6b4a1e'],
    settings: { orientation: 'square', linesPerCell: 2, lineRatio: 0.64, layers: [
      L({ tile: 4, fills: ['split2', 'chevron', 'hatch'], triFill: 'rings', angles: ['45', '135'], sym: 'mirror-diag', seed: 5 }),
      P(1, { size: 11.3, shape: 'diamond', tile: 2, fills: ['hatch', 'split4', 'rings'], triFill: 'rings', angles: ['0', '90'], sym: 'mirror-diag', depth: 0.35, rim: 0.15, seed: 9 }),
      P(2, { size: 6, tile: 3, fills: ['split4'], triFill: 'rings', sym: 'mirror-diag', depth: 0.3, rim: 0.15, seed: 2 }),
      P(3, { size: 4.2, shape: 'diamond', tile: 2, fills: ['split4'], orient: 'uniform', sym: 'mirror-diag', depth: 0.25, rim: 0.12, seed: 6 }),
    ] },
  },
];
