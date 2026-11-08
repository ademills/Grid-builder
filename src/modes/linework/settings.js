// Linework document settings (lineworkSettings) and the built-in presets.
//
// Sizes are grid-relative so a design keeps its look when the artboard or
// column count changes: lines per cell and the line : pitch ratio set the
// line weight; plate sizes, offsets and depths are in cells, scaled
// with the base layer when its cell count changes (fitPlates).

const randomSeed = () => Math.floor(Math.random() * 0x80000000);

// One generated layer: the base (index 0) or a plate (1 and up, bottom to
// top). Plates have a stable id, so reordering keeps each one's edits.
export const lineworkLayerDefaults = (over = {}) => ({
  // Plates only. shape: 'square' | 'diamond', or a built-in shape cut out
  // exactly ('circle' | 'hexagon' | 'octagon' | 'triangle'; shapeClip.js).
  id: 'base', name: 'Base', enabled: true, shape: 'square', size: 6, ox: 0, oy: 0,
  // Plate sides: 'equal' (size × size), 'cells' (w × h cells) or 'ratio'
  // (`aspect` with `size` as the long side, turned upright by `portrait`).
  sizing: 'equal', w: 6, h: 4, aspect: '3:2', portrait: false,
  shadow: 'none', depth: 0.25,
  // Plate outlines, from the plate's edge on: each `weight` line widths
  // wide (the layer's lines), colour 'ink' | 'ground' | 'none' (a gap) |
  // 'swatch:<id>' | '#rrggbb'. outlinePos 'outside' | 'centre' | 'inside':
  // where the stack sits on the edge. Not round a banded background.
  outlines: [], outlinePos: 'outside',
  // Background: 'square' (corner: rounding, 0–1 of the short side's half),
  // 'none', or for circuits 'outline' | 'sticker' | 'infill' (pad: cells
  // of margin round the lines for outline and sticker).
  backing: 'square', corner: 0, pad: 0.15,
  // Radial repeat (v1.16): the plate drawn `radial` times (1: once) round a
  // centre radialX / radialY cells from the canvas's centre.
  radial: 1, radialX: 0, radialY: 0,
  // Any layer
  scale: 1, invert: false, style: 'angular', sym: 'mirror-both', seed: randomSeed(),
  // Colour mode and shuffle seed of its own, or null for the document's
  // (utils/linework/colour.js).
  colorMode: null, colourSeed: null,
  // Base only: an ink frame round the canvas, in cells
  frame: 0,
  // A · angular (the cell shape is the document's `tiling`; tile size sets
  // the cell size)
  tile: 2, subdiv: 0, minTile: 1, fills: ANGULAR_FILLS.map(([k]) => k), triFill: 'spiral', angles: ['45', '135'],
  orient: 'random', outline: true, core: true,
  // merge: chance a tile joins its neighbours into a 2 × 1, 1 × 2 or 2 × 2
  // block (square cells); gap: a ground gutter between tiles, in cells;
  // outlineWeight: tile outlines' width as a multiple of the lines'.
  merge: 0, gap: 0, outlineWeight: 1,
  // Whether the panel lists the experimental fills (EXPERIMENTAL_FILLS).
  showExperimental: false,
  // How tiles pick from `fills`: placement 'random' (weighted by
  // fillWeights, { [fill]: 0–1 }, even when unset) or 'checker' | 'rows' |
  // 'cols' | 'rings' (cycling through them); spiralTurn 'random' | 'cw' |
  // 'ccw' | 'alternate'.
  placement: 'random', fillWeights: {}, spiralTurn: 'random',
  // B · circuit. route: 'bundles' (many walks) or 'single' (one walk, same
  // rules); `fill` makes the single route visit every cell (no crossings),
  // optionally as a closed `loop`. maxLen 200 means no limit.
  route: 'bundles', fill: false, loop: false, bundle: 1, straight: 0.6, maxLen: 40, density: 1, edgeExit: 0.5, weave: 'off', eyes: true,
  // C · continuous (utils/linework/continuous.js) shares the circuit's route,
  // straightness and max length, and the angular placement ('random' |
  // 'checker' | 'alternate') and merge (here the chance a cell starts a
  // merged group). cornerShare: the share of turns drawn as a 90° corner
  // rather than a diagonal; gapLines: lines in a diagonal's empty half,
  // 'off' | 'random' | 'vertical' | 'horizontal' | 'diagonal'; mergeCells:
  // join some squares of cells into one, up to mergeMax × mergeMax.
  cornerShare: 0.4, gapLines: 'random', mergeCells: false, mergeMax: 3,
  // Angular and continuous lines (v1.16): how round they turn, the centre
  // line's radius in pitches (0 square).
  roundCorners: 0,
  // Region mask: a Generate-panel fill or 'word'. maskMode 'remove' empties
  // the masked area, 'invert' keeps only the masked area; what's kept takes
  // the layer's own fills. maskSettings holds this layer's own settings for
  // each mask it has used, by mask id; a mask the layer hasn't changed yet
  // starts from the document's (layerMaskSettings). maskShapes: 'one' lays
  // the design over everything kept, 'each' gives each separate shape of it
  // a design of its own (compose.js layerRuns).
  mask: 'none', maskMode: 'remove', maskSettings: {}, maskShapes: 'one',
  // maskEdge 'cells' fills or empties whole cells; 'exact' (Silhouette and
  // Word masks) cuts the lines to the mask's traced outline, with an outline
  // maskOutline cells wide along the cut (compose.js cutToMask).
  maskEdge: 'cells', maskOutline: 0,
  // Shape plates (made by Plates from SVG; utils/linework/shapeClip.js):
  // shapeClip { rings } is the shape in the plate's box, or null for a
  // plain plate. shapeMode 'cutout' cuts the plate to the shape exactly
  // (its outlines follow the shape); 'mask' masks it to the cells the shape
  // covers, as a Silhouette mask does. upright: placed on the canvas as
  // drawn, not turned with a diamond base.
  shapeClip: null, shapeMode: 'cutout', upright: false,
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
  // "Word" region mask (the seed word's letterforms, as in Meander): what a
  // layer's word mask starts from.
  word: { text: '', letterSize: 0.7, layout: 'line', randomSize: true, randomPlacement: true, align: 'center' },
  layers: [lineworkLayerDefaults()],
  // The base layer's size in cells, [w, h], the plates are sized for
  // (fitPlates); null until there are plates.
  plateFit: null,
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
  'placement', 'fillWeights', 'spiralTurn', 'merge', 'gap', 'outlineWeight',
  'route', 'fill', 'loop', 'bundle', 'straight', 'maxLen', 'density', 'edgeExit', 'weave', 'eyes',
  'cornerShare', 'gapLines', 'mergeCells', 'mergeMax',
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

// Editing several plates at once (v1.14): ids are the layers being edited.
// A change sets those fields to the same value on each of them.
export const updateLayers = (settings, ids, changes) => ({
  ...settings, layers: settings.layers.map(l => (ids.includes(l.id) ? { ...l, ...changes } : l)),
});

// The keys whose values differ between the given layers.
export function differingKeys(layers, keys) {
  if (layers.length < 2) return [];
  return keys.filter(k => layers.some(l => JSON.stringify(l[k] ?? null) !== JSON.stringify(layers[0][k] ?? null)));
}

// Plates for the parts of an SVG (utils/linework/svgShapes.js), in its
// drawing order, bottom to top. parts: [{ name, box: { x, y, w, h }, rings }]
// in the SVG's units, over an svg of width × height. area: the canvas in
// cells ({ w, h }); the SVG is fitted inside it, `padding` (a fraction)
// clear all round, and each plate takes its part's box and place. over: any
// settings for every plate.
export function platesFromShapes(layers, { parts, width, height }, area, { padding = 0.05, over = {}, file = null, by = 'group' } = {}) {
  const k = Math.min((area.w * (1 - 2 * padding)) / width, (area.h * (1 - 2 * padding)) / height);
  const round = v => Math.round(v * 1000) / 1000;
  const out = [];
  for (const part of parts) {
    const plate = newPlate([...layers, ...out], {
      name: part.name, sizing: 'cells', w: round(Math.max(0.5, part.box.w * k)), h: round(Math.max(0.5, part.box.h * k)),
      ox: round((part.box.x + part.box.w / 2 - width / 2) * k), oy: round((part.box.y + part.box.h / 2 - height / 2) * k),
      shape: 'square', upright: true, backing: 'square', corner: 0, shadow: 'none',
      mask: 'none', maskSettings: {},
      shapeClip: { rings: part.rings }, shapeMode: 'cutout',
      outlines: [{ weight: 1, colour: 'ink' }], outlinePos: 'inside',
      // Where the shape came from, for Refresh from SVG (refreshShapePlates).
      shapeFrom: { file, by, name: part.name, key: part.key, padding },
      ...over,
    });
    out.push(plate);
  }
  return out;
}

// Refresh from SVG: which shape plates (made from an SVG split `by`) the
// new SVG's parts belong to, matched by name; parts without a name of their
// own (Group 3, Shape 2) fall back to their place in the file, since a
// named part that's gone is more likely deleted than renamed. → { matches:
// [{ id, part }], added: [part], missing: [id] }.
export function planShapeRefresh(layers, { parts }, by) {
  const plates = layers.filter((l, i) => i > 0 && l.shapeFrom && (l.shapeFrom.by ?? 'group') === by);
  const used = new Set();
  const matches = [];
  const take = (pred) => {
    for (const p of plates) {
      if (matches.some(m => m.id === p.id)) continue;
      const part = parts.find(q => !used.has(q.key) && pred(p, q));
      if (part) { used.add(part.key); matches.push({ id: p.id, part }); }
    }
  };
  take((p, q) => q.name === p.shapeFrom.name);
  const unnamed = name => /^(Group|Shape) \d+$/.test(name ?? '');
  take((p, q) => q.key === p.shapeFrom.key && unnamed(q.name) && unnamed(p.shapeFrom.name));
  return {
    matches,
    added: parts.filter(q => !used.has(q.key)),
    missing: plates.filter(p => !matches.some(m => m.id === p.id)).map(p => p.id),
  };
}

// Applies a refresh: matched plates take the new shape (and, with
// geometry, its new place and size on the canvas); `add` parts become new
// plates on top; `remove` plate ids are deleted. Every other setting stays.
export function refreshShapePlates(settings, shapes, area, plan, { geometry = true, add = [], remove = [], file = null, by = 'group' } = {}) {
  const fresh = new Map(plan.matches.map(m => {
    const plate = settings.layers.find(l => l.id === m.id);
    const padding = plate.shapeFrom?.padding ?? 0.05;
    const [made] = platesFromShapes(settings.layers, { ...shapes, parts: [m.part] }, area, { padding, file, by });
    return [m.id, made];
  }));
  const layers = settings.layers.filter(l => !remove.includes(l.id)).map(l => {
    const made = fresh.get(l.id);
    if (!made) return l;
    return {
      ...l, shapeClip: made.shapeClip, shapeFrom: { ...made.shapeFrom, padding: l.shapeFrom?.padding ?? made.shapeFrom.padding },
      ...(geometry ? { sizing: 'cells', w: made.w, h: made.h, ox: made.ox, oy: made.oy } : {}),
    };
  });
  const padding = settings.layers.find(l => l.shapeFrom)?.shapeFrom.padding ?? 0.05;
  const added = add.length ? platesFromShapes(layers, { ...shapes, parts: add }, area, { padding, file, by }) : [];
  return { ...settings, layers: [...layers, ...added] };
}

// The angular style's fills, in panel order: the main ones (all on for a
// new layer), then the experimental ones, off until picked.
export const ANGULAR_FILLS = [
  ['spiral', 'Key spiral'], ['rings', 'Rings'], ['split2', '◩ 2 triangles'],
  ['split4', '⊠ 4 triangles'], ['hatch', 'Hatch'], ['chevron', 'Chevron'],
  ['diamond', 'Diamond'], ['octagon', 'Octagon'], ['cornerL', 'Corner L'], ['cross', 'Cross'],
  ['weave', 'Weave'], ['twin', 'Twin spiral'], ['quad', 'Quad spiral'], ['pinwheel', 'Pinwheel'], ['bowtie', 'Bowtie'],
  ['zigzag', 'Zigzag'], ['ziggurat', 'Ziggurat'], ['nestedU', 'Nested U'], ['spin', 'Spinning squares'],
  ['stripes', 'Stripes'], ['herring', 'Herringbone'], ['stairs', 'Stairs'], ['sunburst', 'Sunburst'],
  ['brick', 'Brick'], ['cornerSteps', 'Corner steps'], ['quadSpin', 'Quad spin'], ['spinTri', 'Spin triangles'],
];
export const EXPERIMENTAL_FILLS = [
  ['broken', 'Broken rings'], ['solid', 'Solid'], ['blank', 'Empty'], ['crosshatch', 'Crosshatch'],
  ['moire', 'Moiré'], ['dots', 'Dots'], ['checker', 'Checker'], ['twist', 'Twist rings'],
  ['tunnel', 'Tunnel'], ['fan', 'Corner fan'],
];

// Plates are sized in cells, so a base layer with fewer cells (a smaller
// artboard, fewer columns) would leave them too big for it. base: the base
// layer's size in cells now, [w, h]. Scales the plates' size, place, line
// scale, shadow and padding by as much as the base has shrunk or grown
// since settings.plateFit, and records the new size (or forgets it once
// there are no plates). Returns the same settings when nothing changes.
const PLATE_LENGTHS = ['size', 'w', 'h', 'ox', 'oy', 'depth', 'pad', 'scale'];
export function fitPlates(settings, base) {
  const ref = settings.plateFit;
  if ((settings.layers?.length ?? 0) < 2) return ref ? { ...settings, plateFit: null } : settings;
  if (ref && Math.abs(ref[0] - base[0]) < 1e-6 && Math.abs(ref[1] - base[1]) < 1e-6) return settings;
  if (!ref) return { ...settings, plateFit: base };
  const k = Math.min(base[0] / ref[0], base[1] / ref[1]);
  const round = v => Math.round(v * 1000) / 1000;
  return {
    ...settings,
    plateFit: base,
    layers: settings.layers.map((l, i) => (i === 0 ? l : {
      ...l, ...Object.fromEntries(PLATE_LENGTHS.filter(f => typeof l[f] === 'number').map(f => [f, round(l[f] * k)])),
    })),
  };
}

// Masks once had inside fills of their own and an Outside setting: Outside
// Empty kept just the masked area (now Invert); otherwise the masked area
// is now emptied.
function maskModeOf(l) {
  if (!l || l.maskMode) return l;
  const rest = { ...l, maskMode: l.maskOutside === 'empty' ? 'invert' : 'remove' };
  delete rest.maskFills;
  delete rest.maskOutside;
  return rest;
}

// Plates once had a Rim (rim cells wide inside a square background, ink or
// ground by rimInk) and shape plates an Outline (shapeOutline cells wide,
// shapeOutlinePos, optionally doubled shapeOutlineGap apart, ground when
// shapeOutlineInk was false): both become outlines, their widths in the
// layer's line widths. lines: the document's lines per cell and ratio.
const LEGACY_OUTLINE = ['rim', 'rimInk', 'shapeOutline', 'shapeOutlinePos', 'shapeOutlineDouble', 'shapeOutlineGap', 'shapeOutlineInk'];
function outlinesOf(l, plate, { n, ratio }) {
  if (!l || !LEGACY_OUTLINE.some(k => k in l)) return l;
  const rest = { ...l };
  for (const k of LEGACY_OUTLINE) delete rest[k];
  if (l.outlines || !plate) return rest;
  const lines = cells => Math.round((cells * n) / ((l.scale ?? 1) * ratio) * 1000) / 1000;
  const cutout = l.shapeClip && (l.shapeMode ?? 'cutout') === 'cutout';
  if (cutout && (l.shapeOutline ?? 0.1) > 0) {
    const one = { weight: lines(l.shapeOutline ?? 0.1), colour: l.shapeOutlineInk === false ? 'ground' : 'ink' };
    const outlines = l.shapeOutlineDouble ? [one, { weight: lines(l.shapeOutlineGap ?? 0.1), colour: 'none' }, { ...one }] : [one];
    return { ...rest, outlines, outlinePos: l.shapeOutlinePos ?? 'inside' };
  }
  if (!cutout && (l.backing ?? 'square') === 'square' && (l.rim ?? 0) > 0) {
    return { ...rest, outlines: [{ weight: lines(l.rim), colour: l.rimInk ? 'ink' : 'ground' }], outlinePos: 'inside' };
  }
  return rest;
}

// Fills older or partial settings out to the full shape. Documents from
// before plates could be added had three fixed slots with an on/off switch:
// the switched-off ones are dropped and the rest get ids.
export function mergeLineworkSettings(saved) {
  const d = createLineworkSettings();
  if (!saved) return d;
  const [base, ...plates] = saved.layers?.length ? saved.layers : d.layers;
  const lines = { n: Math.max(1, saved.linesPerCell ?? d.linesPerCell), ratio: Math.min(0.95, Math.max(0.05, saved.lineRatio ?? d.lineRatio)) };
  return {
    ...d,
    // Cells were briefly a per-layer setting: the base layer's carries over.
    ...(saved.tiling == null && base?.tiling ? { tiling: base.tiling, regularity: base.regularity ?? d.regularity } : {}),
    ...saved,
    word: { ...d.word, ...(saved.word ?? {}) },
    layers: [
      { ...lineworkLayerDefaults(), ...outlinesOf(maskModeOf(base), false, lines), id: 'base', name: 'Base' },
      ...plates.filter(l => l && l.enabled !== false).map((l, i) => ({
        ...lineworkLayerDefaults(), ...outlinesOf(maskModeOf(l), true, lines), id: l.id ?? `p${i + 1}`, name: l.name ?? `Plate ${i + 1}`, enabled: true,
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
      P(1, { size: 6, shape: 'diamond', tile: 2, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', shadow: 'soft', depth: 0.27, seed: 4 }),
      P(2, { size: 3, scale: 0.6, tile: 3, fills: ['spiral'], sym: 'mirror-diag', orient: 'uniform', shadow: 'soft', depth: 0.18, seed: 2 }),
    ] },
  },
  {
    name: 'Triangle keys', cols: 17, colours: ['#d0a64e', '#1d3a9c', '#000000'],
    settings: { orientation: 'diamond', linesPerCell: 4, lineRatio: 0.26, layers: [
      L({ tile: 4, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', seed: 3 }),
      P(1, { size: 6, shape: 'diamond', tile: 2, scale: 0.5, fills: ['split4', 'spiral'], sym: 'mirror-diag', orient: 'uniform', shadow: 'none', outlines: [{ weight: 1.75, colour: 'ink' }], outlinePos: 'inside', seed: 5 }),
      P(2, { size: 2.5, tile: 4, scale: 0.4, fills: ['split4'], sym: 'mirror-diag', orient: 'uniform', shadow: 'none', outlines: [{ weight: 2.25, colour: 'ink' }], outlinePos: 'inside', seed: 8 }),
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
      P(1, { style: 'circuit', size: 12, shape: 'diamond', sym: 'mirror-both', straight: 0.7, edgeExit: 0, shadow: 'none', outlines: [{ weight: 1, colour: 'ground' }], outlinePos: 'inside', seed: 3 }),
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
    name: 'Continuous lines', cols: 11, colours: ['#111111', '#ffffff', '#000000'],
    settings: { orientation: 'square', linesPerCell: 7, lineRatio: 0.4, layers: [
      L({ style: 'continuous', sym: 'none', route: 'bundles', maxLen: 4, straight: 0.45, cornerShare: 0.4, gapLines: 'random', mergeCells: true, mergeMax: 3, merge: 0.35, frame: 0.12, seed: 1234 }),
    ] },
  },
  {
    name: 'Stacked planes', cols: 16, colours: ['#2f8fe3', '#f7f1e3', '#6b4a1e'],
    settings: { orientation: 'square', linesPerCell: 2, lineRatio: 0.64, layers: [
      L({ tile: 4, fills: ['split2', 'chevron', 'hatch'], triFill: 'rings', angles: ['45', '135'], sym: 'mirror-diag', seed: 5 }),
      P(1, { size: 11.3, shape: 'diamond', tile: 2, fills: ['hatch', 'split4', 'rings'], triFill: 'rings', angles: ['0', '90'], sym: 'mirror-diag', shadow: 'soft', depth: 0.35, outlines: [{ weight: 0.5, colour: 'ground' }], outlinePos: 'inside', seed: 9 }),
      P(2, { size: 6, tile: 3, fills: ['split4'], triFill: 'rings', sym: 'mirror-diag', shadow: 'soft', depth: 0.3, outlines: [{ weight: 0.5, colour: 'ground' }], outlinePos: 'inside', seed: 2 }),
      P(3, { size: 4.2, shape: 'diamond', tile: 2, fills: ['split4'], orient: 'uniform', sym: 'mirror-diag', shadow: 'soft', depth: 0.25, outlines: [{ weight: 0.5, colour: 'ground' }], outlinePos: 'inside', seed: 6 }),
    ] },
  },
];
