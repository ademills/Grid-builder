import { LINEWORK_SYMMETRY } from '../../utils/symmetry';
import { MASK_SOURCES } from './masks';
import { PlateSize, DiamondNote, MaskWord, MaskFillSettings, EditLayer, FillWeights } from './schemaFields';
import { SvgPlates } from './SvgPlatesDialog';
import { ANGULAR_FILLS, EXPERIMENTAL_FILLS } from './settings';
import { range, oneOf } from '../../panels/schemaUtils';

// Linework's settings as data (see panels/schema.jsx). The document-wide
// grid and lines go in Properties (LINEWORK_GRID_SCHEMA in its Grid section,
// LINEWORK_LINES_SCHEMA as its own section); the Linework panel holds only
// the layer being edited, base or plate (LINEWORK_LAYER_SCHEMA).
// ctx: { plate, tiling, layers, layerCount, setEditLayer, maxCells, grid,
// diamondCells, word, style }. `surprise` gives Surprise Me's pick
// for a field; ctx.style (Surprise Me only) keeps plates in the base's style.

const pct = v => `${Math.round(v * 100)}%`;
const cells = v => `${+v.toFixed(2)}`;

const FILL_OPTIONS = ANGULAR_FILLS;
const FILL_KEYS = FILL_OPTIONS.map(([k]) => k);
const MAIN_KEYS = new Set(FILL_KEYS);
// One to three fills, in a random order.
const shuffledFills = (r) => FILL_KEYS.map(k => [k, r()]).sort((a, b) => a[1] - b[1]).slice(0, 1 + Math.floor(r() * 3)).map(([k]) => k);
const ANGLE_OPTIONS = [['0', '0°'], ['45', '45°'], ['90', '90°'], ['135', '135°']];
export const TILING_OPTIONS = [
  { key: 'square', label: 'Squares' }, { key: 'hex', label: 'Hexagons' },
  { key: 'triangle', label: 'Triangles' }, { key: 'voronoi', label: 'Voronoi' },
];

const usesFill = (L, keys) => keys.some(k => L.fills?.includes(k));
const angular = L => L.style !== 'circuit';
const single = L => L.style === 'circuit' && L.route === 'single';
const filled = L => single(L) && L.fill;
// Square cells (Properties › Grid › Cells), where angular subdivision works.
const square = (_, ctx) => (ctx.tiling ?? 'square') === 'square';
// Triangles have no straight way through a cell, so circuits can't cross there.
const canCross = (_, ctx) => ctx.tiling !== 'triangle';
const plate = (_, ctx) => ctx.plate;
const masked = L => L.mask && L.mask !== 'none';
// Masks that can be cut exactly: Silhouette, and Word laid out in a line.
const exactable = L => L.mask === 'silhouette' || (L.mask === 'word' && (L.maskSettings?.word?.layout ?? 'line') !== 'scatter');
// Shape plates (Plates from SVG): cut to the shape (Cutout) or masked to its cells (Mask).
const shaped = (L, ctx) => !!ctx?.plate && !!L.shapeClip?.rings?.length;
const cutout = (L, ctx) => shaped(L, ctx) && (L.shapeMode ?? 'cutout') === 'cutout';

// Plate backgrounds (settings.js); the band-built ones are circuit-only, and
// an angular plate set to one draws Square.
const BACKINGS = [
  { key: 'square', label: 'Square' }, { key: 'outline', label: 'Outline', circuit: true },
  { key: 'sticker', label: 'Sticker', circuit: true }, { key: 'infill', label: 'In-fill', circuit: true },
  { key: 'none', label: 'Transparent' },
];
const BANDED_KEYS = Object.fromEntries(BACKINGS.filter(o => o.circuit).map(o => [o.key, true]));
const backing = L => {
  const b = L.backing ?? 'square';
  return angular(L) && BACKINGS.find(o => o.key === b)?.circuit ? 'square' : b;
};

export const LINEWORK_GRID_SCHEMA = [
  {
    id: 'linework.grid', fields: [
      { key: 'orientation', label: 'Orientation', type: 'segmented',
        options: [{ key: 'square', label: 'Square' }, { key: 'diamond', label: 'Diamond 45°' }],
        help: 'Lay the design on the grid square, or turned 45° as a diamond', surprise: oneOf(['square', 'diamond']) },
      { key: 'diamondNote', type: 'custom', render: DiamondNote, showIf: (_, ctx) => !!ctx.diamondCells },
      { key: 'tiling', label: 'Cells', type: 'select', options: TILING_OPTIONS, value: s => s.tiling ?? 'square',
        info: 'The cells every Linework layer is built on. Angular tiles take the cell shape at their Tile size; circuits run through the cells.' },
      { key: 'regularity', label: 'Regularity', type: 'slider', min: 0, max: 1, step: 0.25, format: pct,
        value: s => s.regularity ?? 0.5, showIf: s => s.tiling === 'voronoi',
        help: '0%: scattered cells of every size; 100%: relaxed into even, honeycomb-like cells' },
      { key: 'svgPlates', type: 'custom', render: SvgPlates },
    ],
  },
];

export const LINEWORK_LINES_SCHEMA = [
  {
    id: 'linework.lines', title: 'Lines', fields: [
      { key: 'linesPerCell', label: 'Lines per cell', type: 'number', min: 1, max: 12,
        help: 'How many lines fit across one grid cell', surprise: oneOf([2, 3, 3, 4, 5]) },
      { key: 'lineRatio', label: 'Line weight', type: 'slider', min: 0.1, max: 0.9, step: 0.01, format: pct,
        help: "Line width as a share of each line's pitch; the rest is the gap", surprise: oneOf([0.3, 0.45, 0.55, 0.65]) },
    ],
  },
];

export const LINEWORK_LAYER_SCHEMA = [
  {
    id: 'linework.layer', title: L => `Layer · ${L.name}`,
    info: (_, ctx) => (ctx.layerCount > 1 ? 'Pick the layer to edit in the Layers panel or the control bar. Add and reorder plates in Layers.' : undefined),
    fields: [
      // In the control bar instead while the inspector layout is on.
      { key: 'editLayer', type: 'custom', render: EditLayer, bar: true, showIf: (_, ctx) => ctx.layerCount > 1 },
      // Style decides the sections below, so it heads the layer, in the panel.
      { key: 'style', label: 'Style', type: 'segmented',
        options: [{ key: 'angular', label: 'Angular' }, { key: 'circuit', label: 'Circuit' }],
        surprise: (r, _, ctx) => ctx.style ?? (r() < 0.6 ? 'angular' : 'circuit') },
      { key: 'sym', label: 'Symmetry', type: 'symmetry', keys: LINEWORK_SYMMETRY, bar: true,
        surprise: (r, L) => oneOf(L.style === 'circuit' ? ['mirror-both', 'mirror-x', 'none'] : ['mirror-both', 'mirror-diag', 'mirror-diag', 'rotate4'])(r) },
      { key: 'scale', label: 'Line scale', type: 'slider', min: 0.2, max: 2, step: 0.05, format: v => `${v}×`,
        help: "Scales this layer's cells and lines" },
      { key: 'invert', label: 'Swap colours', type: 'toggle', help: 'Swap ink and ground on this layer' },
      { key: 'frame', label: 'Frame', type: 'slider', min: 0, max: 1, step: 0.01, format: cells,
        help: 'An ink border round the canvas, in cells', showIf: (_, ctx) => !ctx.plate },
      { key: 'seed', label: 'Seed', type: 'seed', bar: true, surprise: r => Math.floor(r() * 0x80000000) },
    ],
  },
  {
    // The base layer's background, for circuits: Square is its ground (the
    // whole canvas, when Ground has its own colour); the banded ones and
    // their shadow follow the bundles.
    id: 'linework.base', title: 'Background', showIf: (L, ctx) => !ctx.plate && !angular(L), fields: [
      { key: 'backing', label: 'Background', type: 'select', value: backing, options: BACKINGS,
        info: 'Square: the whole canvas in the Ground colour. Outline: one shape round all the lines, filling what they enclose. Sticker: a shape round each bundle. In-fill: just between each bundle\'s lines. Transparent: no ground.' },
      { key: 'groundNote', type: 'note', showIf: (L, ctx) => backing(L) !== 'none' && !ctx.groundSplit,
        text: 'The ground uses the canvas colour, so it won\'t show: give Ground its own colour in the Colour panel.' },
      { key: 'pad', label: 'Padding', type: 'slider', min: 0, max: 1, step: 0.05, format: cells,
        showIf: L => ['outline', 'sticker'].includes(backing(L)), help: 'Margin round the lines, in cells' },
      { key: 'shadow', label: 'Shadow', type: 'segmented', showIf: L => !!BANDED_KEYS[backing(L)],
        options: [{ key: 'none', label: 'None' }, { key: 'hard', label: 'Hard' }, { key: 'soft', label: 'Soft' }] },
      { key: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, format: cells, help: 'Shadow offset, in cells',
        showIf: L => !!BANDED_KEYS[backing(L)] && L.shadow !== 'none' },
    ],
  },
  {
    // A plate's placement (shape, size, offset) and background (its shape,
    // shadow and rim).
    id: 'linework.plate', title: 'Plate', showIf: plate, fields: [
      { key: 'shapeMode', label: 'Shape', type: 'segmented', showIf: shaped, value: L => L.shapeMode ?? 'cutout',
        options: [{ key: 'cutout', label: 'Cutout' }, { key: 'mask', label: 'Mask' }],
        help: "Cutout: the plate cut to the SVG shape exactly, with an outline. Mask: only the cells the shape covers are filled, as a Silhouette mask" },
      { key: 'shapeOutline', label: 'Outline', type: 'slider', min: 0, max: 1, step: 0.01, format: cells, showIf: cutout,
        help: "Width of the outline round the shape, in cells" },
      { key: 'shapeOutlinePos', label: 'Outline at', type: 'segmented', showIf: (L, ctx) => cutout(L, ctx) && L.shapeOutline > 0,
        value: L => L.shapeOutlinePos ?? 'inside',
        options: [{ key: 'inside', label: 'Inside' }, { key: 'centre', label: 'Centre' }, { key: 'outside', label: 'Outside' }],
        help: 'Inside the shape’s edge, centred on it, or outside it' },
      { key: 'shapeOutlineDouble', label: 'Double outline', type: 'toggle', showIf: (L, ctx) => cutout(L, ctx) && L.shapeOutline > 0,
        help: 'A second ring, further in (further out for Outside)' },
      { key: 'shapeOutlineGap', label: 'Gap', type: 'slider', min: 0, max: 1, step: 0.01, format: cells,
        value: L => L.shapeOutlineGap ?? 0.1, showIf: (L, ctx) => cutout(L, ctx) && L.shapeOutline > 0 && L.shapeOutlineDouble,
        help: 'Space between the two rings, in cells' },
      { key: 'shapeOutlineInk', label: 'Outline colour', type: 'segmented', showIf: (L, ctx) => cutout(L, ctx) && L.shapeOutline > 0,
        value: L => (L.shapeOutlineInk === false ? 'ground' : 'ink'), onChange: v => ({ shapeOutlineInk: v === 'ink' }),
        options: [{ key: 'ink', label: 'Ink' }, { key: 'ground', label: 'Ground' }] },
      { key: 'plateSize', type: 'custom', render: PlateSize },
      { key: 'ox', label: 'Offset X', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells },
      { key: 'oy', label: 'Offset Y', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells },
      { key: 'backing', label: 'Background', type: 'select', value: backing,
        options: L => (angular(L) ? BACKINGS.filter(o => !o.circuit) : BACKINGS),
        info: 'Square: the plate itself. Outline: one shape round all its lines, filling what they enclose. Sticker: a shape round each bundle. In-fill: just between each bundle\'s lines. Transparent: no background or shadow.' },
      { key: 'corner', label: 'Corner radius', type: 'slider', min: 0, max: 1, step: 0.05, format: pct,
        showIf: (L, ctx) => backing(L) === 'square' && !cutout(L, ctx), help: "Rounds the plate's corners (and its shadow and rim)" },
      { key: 'pad', label: 'Padding', type: 'slider', min: 0, max: 1, step: 0.05, format: cells,
        showIf: L => ['outline', 'sticker'].includes(backing(L)), help: 'Margin round the lines, in cells' },
      { key: 'shadow', label: 'Shadow', type: 'segmented', showIf: L => backing(L) !== 'none',
        options: [{ key: 'none', label: 'None' }, { key: 'hard', label: 'Hard' }, { key: 'soft', label: 'Soft' }],
        surprise: oneOf(['soft', 'soft', 'hard', 'none']) },
      { key: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, format: cells, help: 'Shadow offset, in cells',
        showIf: L => backing(L) !== 'none' && L.shadow !== 'none', surprise: range(0.15, 0.4, 0.01) },
      { key: 'rim', label: 'Rim', type: 'slider', min: 0, max: 0.5, step: 0.01, format: cells, help: 'Edge band round the plate, in cells',
        showIf: (L, ctx) => backing(L) === 'square' && !cutout(L, ctx), surprise: oneOf([0, 0, 0.1, 0.15]) },
      { key: 'rimInk', label: 'Rim colour', type: 'segmented', showIf: (L, ctx) => backing(L) === 'square' && L.rim > 0 && !cutout(L, ctx),
        value: L => (L.rimInk ? 'ink' : 'ground'), onChange: v => ({ rimInk: v === 'ink' }),
        options: [{ key: 'ground', label: 'Ground' }, { key: 'ink', label: 'Ink' }] },
    ],
  },
  {
    id: 'linework.angular', title: 'A · Angular', showIf: angular, fields: [
      { key: 'tile', label: 'Tile size', type: 'number', min: 1, max: (_, c) => c.maxCells, help: 'Tile size in cells',
        surprise: oneOf([1, 2, 2, 3, 4]) },
      { key: 'subdiv', label: 'Subdivide', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: square,
        help: 'Chance each tile splits into four smaller ones', surprise: oneOf([0, 0, 0.2, 0.4]) },
      { key: 'minTile', label: 'Smallest tile', type: 'slider', min: 0.25, max: 8, step: 0.25, format: cells,
        showIf: (L, ctx) => square(L, ctx) && L.subdiv > 0 },
      { key: 'merge', label: 'Merge tiles', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: square,
        help: 'Chance a tile joins its neighbours into a 2 × 1, 1 × 2 or 2 × 2 block', surprise: oneOf([0, 0, 0.2, 0.4]) },
      { key: 'gap', label: 'Tile gap', type: 'slider', min: 0, max: 1, step: 0.05, format: cells,
        help: 'A ground gutter between tiles, in cells', surprise: oneOf([0, 0, 0, 0.15, 0.3]) },
      // One list of fills, shown as two groups: each row edits only its own.
      { key: 'fills', label: 'Fills', type: 'chips', options: FILL_OPTIONS, surprise: shuffledFills,
        value: L => (L.fills ?? []).filter(k => MAIN_KEYS.has(k)),
        onChange: (v, L) => ({ fills: [...v, ...(L.fills ?? []).filter(k => !MAIN_KEYS.has(k))] }) },
      { key: 'showExperimental', label: 'Experimental fills', type: 'toggle',
        help: 'List the fills still being tried out. Hiding them leaves any you picked in use, still listed',
        surprise: (_, L) => !!L.showExperimental },
      // Listed while shown, or while the layer uses one, so a fill in use is never hidden.
      { key: 'fillsExperimental', label: 'Experimental', type: 'chips', options: EXPERIMENTAL_FILLS,
        showIf: L => L.showExperimental || (L.fills ?? []).some(k => !MAIN_KEYS.has(k)),
        info: 'Fills still being tried out. Off until you pick them.',
        value: L => (L.fills ?? []).filter(k => !MAIN_KEYS.has(k)),
        onChange: (v, L) => ({ fills: [...(L.fills ?? []).filter(k => MAIN_KEYS.has(k)), ...v] }) },
      { key: 'placement', label: 'Placement', type: 'select', showIf: L => (L.fills?.length ?? 0) > 1,
        help: 'Where each fill goes: at random (weighted below), or cycling through the fills in a pattern',
        options: [
          { key: 'random', label: 'Random' }, { key: 'checker', label: 'Checkerboard' }, { key: 'rows', label: 'Rows' },
          { key: 'cols', label: 'Columns' }, { key: 'rings', label: 'Rings from centre' },
        ], surprise: r => (r() < 0.6 ? 'random' : oneOf(['checker', 'rows', 'cols', 'rings'])(r)) },
      { key: 'fillWeights', type: 'custom', render: FillWeights, showIf: L => (L.fills?.length ?? 0) > 1 && (L.placement ?? 'random') === 'random' },
      { key: 'spiralTurn', label: 'Spiral turn', type: 'segmented',
        showIf: L => usesFill(L, ['spiral', 'twin', 'quad', 'split2', 'split4', 'diamond', 'octagon', 'bowtie', 'spin', 'quadSpin', 'spinTri', 'twist']),
        help: 'Which way the key spirals and spinning squares wind; Alternate mirrors neighbouring tiles',
        options: [{ key: 'random', label: 'Random' }, { key: 'cw', label: '↻' }, { key: 'ccw', label: '↺' }, { key: 'alternate', label: 'Alternate' }],
        surprise: oneOf(['random', 'random', 'cw', 'alternate']) },
      { key: 'triFill', label: 'Triangle fill', type: 'segmented', showIf: L => usesFill(L, ['split2', 'split4', 'diamond', 'octagon', 'bowtie']),
        options: [{ key: 'spiral', label: 'Spiral' }, { key: 'rings', label: 'Rings' }, { key: 'mix', label: 'Mix' }],
        surprise: oneOf(['spiral', 'rings', 'mix']) },
      { key: 'angles', label: 'Hatch angles', type: 'chips', options: ANGLE_OPTIONS, showIf: L => usesFill(L, ['hatch', 'chevron']) },
      { key: 'orient', label: 'Orientation', type: 'segmented',
        options: [{ key: 'random', label: 'Random' }, { key: 'uniform', label: 'Uniform' }], surprise: oneOf(['uniform', 'random']) },
      { key: 'outline', label: 'Tile outlines', type: 'toggle' },
      { key: 'outlineWeight', label: 'Outline weight', type: 'slider', min: 0.25, max: 3, step: 0.25, format: v => `${v}×`,
        showIf: L => L.outline, help: "Tile outlines' width, as a multiple of the lines'", surprise: oneOf([1, 1, 1, 0.5, 2]) },
      { key: 'core', label: 'Solid centres', type: 'toggle', help: "Fill the last ring's middle" },
    ],
  },
  {
    id: 'linework.circuit', title: 'B · Circuit', showIf: L => !angular(L), fields: [
      { key: 'route', label: 'Route', type: 'segmented', value: L => (single(L) ? 'single' : 'bundles'),
        help: 'Many separate bundles, or one circuit that follows the same rules and runs as far as it can',
        options: [{ key: 'bundles', label: 'Bundles' }, { key: 'single', label: 'One circuit' }],
        // One circuit wants room to run: lift a short max length to no limit.
        onChange: (v, L) => ({ route: v, ...(v === 'single' && (L.maxLen ?? 40) < 200 ? { maxLen: 200 } : {}) }),
        surprise: r => (r() < 0.3 ? 'single' : 'bundles') },
      { key: 'fill', label: 'Fill every cell', type: 'toggle', showIf: single,
        help: 'Route through every cell exactly once (an odd column or row is left as a margin, half each side). It then never crosses itself, so over / under and running off edges are off' },
      { key: 'loop', label: 'Closed loop', type: 'toggle', showIf: filled,
        help: 'Join the circuit into a loop with no ends, instead of two hairpin ends' },
      { key: 'bundle', label: 'Bundle size', type: 'number', min: 1, max: 8,
        help: 'Cells per bundle; a bundle carries Lines per cell × this many strands', surprise: oneOf([1, 1, 2]) },
      { key: 'straight', label: 'Straightness', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, surprise: range(0.4, 0.8, 0.05) },
      { key: 'maxLen', label: 'Max length', type: 'slider', min: 1, max: 200, step: 1, format: v => (v >= 200 ? 'No limit' : v),
        help: 'Longest run, in bundles', showIf: L => !filled(L) },
      { key: 'density', label: 'Density', type: 'slider', min: 0.05, max: 1, step: 0.05, format: pct, showIf: L => !single(L) },
      { key: 'edgeExit', label: 'Run off edges', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: L => !filled(L),
        help: 'Chance a bundle runs off the edge instead of turning back (only when the grid holds whole bundles)' },
      { key: 'weave', label: 'Over / under', type: 'segmented', showIf: (L, ctx) => !filled(L) && canCross(L, ctx),
        options: [{ key: 'off', label: 'Off' }, { key: 'alternate', label: 'Alternate' }, { key: 'random', label: 'Random' }],
        surprise: oneOf(['off', 'alternate']) },
      { key: 'eyes', label: 'Single-cell eyes', type: 'toggle', showIf: L => !single(L) },
    ],
  },
  {
    // A route through every cell has nothing for a mask to steer.
    id: 'linework.mask', title: 'Region mask', showIf: (L, ctx) => !filled(L) && !(shaped(L, ctx) && L.shapeMode === 'mask'), defaultOpen: masked,
    info: 'Cut a shape, image or word out of the design, or invert it to keep the design only inside the mask.',
    fields: [
      { key: 'mask', label: 'Mask', type: 'select',
        options: [{ key: 'none', label: 'None' }, ...MASK_SOURCES.map(m => ({ key: m.id, label: m.label }))], surprise: () => 'none' },
      { key: 'maskMode', label: 'Masked area', type: 'segmented', showIf: masked,
        options: [{ key: 'remove', label: 'Remove' }, { key: 'invert', label: 'Invert' }],
        help: 'Remove: the masked area is left empty. Invert: only the masked area is filled' },
      { key: 'maskEdge', label: 'Edges', type: 'segmented', showIf: L => exactable(L), value: L => L.maskEdge ?? 'cells',
        options: [{ key: 'cells', label: 'Cells' }, { key: 'exact', label: 'Exact' }],
        help: 'Cells: whole cells are filled or emptied. Exact: the lines are cut to the mask’s real outline' },
      { key: 'maskOutline', label: 'Outline', type: 'slider', min: 0, max: 1, step: 0.01, format: cells,
        value: L => L.maskOutline ?? 0, showIf: L => exactable(L) && L.maskEdge === 'exact',
        help: 'An outline along the cut, in cells (0: none)' },
      { key: 'maskShapes', label: 'Shapes', type: 'segmented', showIf: L => masked(L) && !(exactable(L) && L.maskEdge === 'exact'),
        options: [{ key: 'one', label: 'As one' }, { key: 'each', label: 'Each separately' }],
        help: 'Each separately: every separate filled shape gets its own design, centred and mirrored on itself' },
      { key: 'maskWord', type: 'custom', render: MaskWord, showIf: L => L.mask === 'word' },
      { key: 'maskFill', type: 'custom', render: MaskFillSettings,
        showIf: L => !!MASK_SOURCES.find(m => m.id === L.mask)?.fill },
    ],
  },
];

// Each layer setting's label, by key, for telling which settings differ
// between plates edited together (LineworkPanel). The plate's size and
// shape (a custom row) are listed by hand.
export function layerFieldLabels() {
  const out = { shape: 'Shape', size: 'Size', w: 'Width', h: 'Height', sizing: 'Sides', aspect: 'Ratio' };
  for (const sec of LINEWORK_LAYER_SCHEMA) {
    for (const f of sec.fields) if (f.label && typeof f.label === 'string') out[f.key] = f.label;
  }
  // These two edit the one fills list.
  delete out.fillsExperimental;
  out.fills = 'Fills';
  return out;
}
