import { LINEWORK_SYMMETRY } from '../../utils/symmetry';
import { MASK_SOURCES } from './masks';
import { PlateSize, DiamondNote, MaskWord, MaskFillSettings, EditLayer } from './schemaFields';

// Linework's settings as data (see panels/schema.jsx): the document-wide
// grid and lines, and the settings of the layer being edited (the base or a
// plate). ctx: { plate, layers, layerCount, setEditLayer, maxCells, grid,
// diamondCells, word, setWord }.

const pct = v => `${Math.round(v * 100)}%`;
const cells = v => `${+v.toFixed(2)}`;

const FILL_OPTIONS = [
  ['spiral', 'Key spiral'], ['rings', 'Rings'], ['split2', '◩ 2 triangles'],
  ['split4', '⊠ 4 triangles'], ['hatch', 'Hatch'], ['chevron', 'Chevron'],
];
const ANGLE_OPTIONS = [['0', '0°'], ['45', '45°'], ['90', '90°'], ['135', '135°']];
const TILING_OPTIONS = [
  { key: 'square', label: 'Squares' }, { key: 'hex', label: 'Hexagons' },
  { key: 'triangle', label: 'Triangles' }, { key: 'voronoi', label: 'Voronoi' },
];

const usesFill = (L, keys) => keys.some(k => L.fills?.includes(k) || L.maskFills?.includes(k));
const angular = L => L.style !== 'circuit';
const single = L => L.style === 'circuit' && L.route === 'single';
const square = L => (L.tiling ?? 'square') === 'square';
const plate = (_, ctx) => ctx.plate;
const masked = L => L.mask && L.mask !== 'none';

export const LINEWORK_GRID_SCHEMA = [
  {
    id: 'linework.grid', title: 'Grid & lines', fields: [
      { key: 'orientation', label: 'Orientation', type: 'segmented',
        options: [{ key: 'square', label: 'Square' }, { key: 'diamond', label: 'Diamond 45°' }] },
      { key: 'diamondNote', type: 'custom', render: DiamondNote, showIf: (_, ctx) => !!ctx.diamondCells },
      { key: 'linesPerCell', label: 'Lines per cell', type: 'number', min: 1, max: 12,
        help: 'How many lines fit across one grid cell' },
      { key: 'lineRatio', label: 'Line weight', type: 'slider', min: 0.1, max: 0.9, step: 0.01, format: pct,
        help: "Line width as a share of each line's pitch; the rest is the gap" },
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
      { key: 'plateSize', type: 'custom', render: PlateSize, showIf: plate },
      { key: 'ox', label: 'Offset X', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells, showIf: plate },
      { key: 'oy', label: 'Offset Y', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells, showIf: plate },
      { key: 'shadow', label: 'Shadow', type: 'segmented', showIf: plate,
        options: [{ key: 'none', label: 'None' }, { key: 'hard', label: 'Hard' }, { key: 'soft', label: 'Soft' }] },
      { key: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, format: cells, help: 'Shadow offset, in cells',
        showIf: (L, ctx) => ctx.plate && L.shadow !== 'none' },
      { key: 'rim', label: 'Rim', type: 'slider', min: 0, max: 0.5, step: 0.01, format: cells, help: 'Edge band round the plate, in cells', showIf: plate },
      { key: 'rimInk', label: 'Rim colour', type: 'segmented', showIf: (L, ctx) => ctx.plate && L.rim > 0,
        value: L => (L.rimInk ? 'ink' : 'ground'), onChange: v => ({ rimInk: v === 'ink' }),
        options: [{ key: 'ground', label: 'Ground' }, { key: 'ink', label: 'Ink' }] },
      { key: 'style', label: 'Style', type: 'segmented', bar: true,
        options: [{ key: 'angular', label: 'A · Angular' }, { key: 'circuit', label: 'B · Circuit' }],
        barOptions: [{ key: 'angular', label: 'Angular' }, { key: 'circuit', label: 'Circuit' }] },
      { key: 'sym', label: 'Symmetry', type: 'symmetry', keys: LINEWORK_SYMMETRY, bar: true },
      { key: 'scale', label: 'Line scale', type: 'slider', min: 0.2, max: 2, step: 0.05, format: v => `${v}×`,
        help: "Scales this layer's cells and lines" },
      { key: 'invert', label: 'Swap colours', type: 'toggle', help: 'Swap ink and ground on this layer' },
      { key: 'frame', label: 'Frame', type: 'slider', min: 0, max: 1, step: 0.01, format: cells,
        help: 'An ink border round the canvas, in cells', showIf: (_, ctx) => !ctx.plate },
      { key: 'seed', label: 'Seed', type: 'seed', bar: true },
    ],
  },
  {
    id: 'linework.angular', title: 'A · Angular', showIf: angular, fields: [
      { key: 'tiling', label: 'Tiles', type: 'select', options: TILING_OPTIONS, value: L => L.tiling ?? 'square',
        help: 'The shape of the tiles the fills go in' },
      { key: 'tile', label: 'Tile size', type: 'number', min: 1, max: (_, c) => c.maxCells, help: 'Tile size in cells' },
      { key: 'regularity', label: 'Regularity', type: 'slider', min: 0, max: 1, step: 0.25, format: pct,
        value: L => L.regularity ?? 0.5, showIf: L => L.tiling === 'voronoi',
        help: '0%: scattered cells of every size; 100%: relaxed into even, honeycomb-like cells' },
      { key: 'subdiv', label: 'Subdivide', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: square,
        help: 'Chance each tile splits into four smaller ones' },
      { key: 'minTile', label: 'Smallest tile', type: 'slider', min: 0.25, max: 8, step: 0.25, format: cells,
        showIf: L => square(L) && L.subdiv > 0 },
      { key: 'fills', label: 'Fills', type: 'chips', options: FILL_OPTIONS },
      { key: 'triFill', label: 'Triangle fill', type: 'segmented', showIf: L => usesFill(L, ['split2', 'split4']),
        options: [{ key: 'spiral', label: 'Spiral' }, { key: 'rings', label: 'Rings' }, { key: 'mix', label: 'Mix' }] },
      { key: 'angles', label: 'Hatch angles', type: 'chips', options: ANGLE_OPTIONS, showIf: L => usesFill(L, ['hatch', 'chevron']) },
      { key: 'orient', label: 'Orientation', type: 'segmented',
        options: [{ key: 'random', label: 'Random' }, { key: 'uniform', label: 'Uniform' }] },
      { key: 'outline', label: 'Tile outlines', type: 'toggle' },
      { key: 'core', label: 'Solid centres', type: 'toggle', help: "Fill the last ring's middle" },
    ],
  },
  {
    id: 'linework.circuit', title: 'B · Circuit', showIf: L => !angular(L), fields: [
      { key: 'route', label: 'Route', type: 'segmented', value: L => (single(L) ? 'single' : 'bundles'),
        help: 'Many separate bundles, or one circuit that flows through every cell without crossing itself',
        options: [{ key: 'bundles', label: 'Bundles' }, { key: 'single', label: 'One circuit' }] },
      { key: 'loop', label: 'Closed loop', type: 'toggle', showIf: single,
        help: 'Join the circuit into a loop with no ends, instead of two hairpin ends (an odd number of cells always has ends)' },
      { key: 'bundle', label: 'Bundle size', type: 'number', min: 1, max: 8,
        help: 'Cells per bundle; a bundle carries Lines per cell × this many strands' },
      { key: 'straight', label: 'Straightness', type: 'slider', min: 0, max: 1, step: 0.05, format: pct },
      { key: 'maxLen', label: 'Max length', type: 'slider', min: 1, max: 200, step: 1, format: v => v, help: 'Longest run, in bundles', showIf: L => !single(L) },
      { key: 'density', label: 'Density', type: 'slider', min: 0.05, max: 1, step: 0.05, format: pct, showIf: L => !single(L) },
      { key: 'edgeExit', label: 'Run off edges', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: L => !single(L),
        help: 'Chance a bundle runs off the edge instead of turning back (only when the grid holds whole bundles)' },
      { key: 'weave', label: 'Over / under', type: 'segmented', showIf: L => !single(L),
        options: [{ key: 'off', label: 'Off' }, { key: 'alternate', label: 'Alternate' }, { key: 'random', label: 'Random' }] },
      { key: 'eyes', label: 'Single-cell eyes', type: 'toggle', showIf: L => !single(L) },
    ],
  },
  {
    // One line runs through every cell, so a mask has nothing to steer.
    id: 'linework.mask', title: 'Region mask', showIf: L => !single(L), defaultOpen: masked,
    info: 'Confine part of the design to a shape, image or word. Angular tiles inside it take their own fills; circuit bundles route inside it first.',
    fields: [
      { key: 'mask', label: 'Mask', type: 'select',
        options: [{ key: 'none', label: 'None' }, ...MASK_SOURCES.map(m => ({ key: m.id, label: m.label }))] },
      { key: 'maskFills', label: 'Inside fills', type: 'chips', options: FILL_OPTIONS, showIf: L => masked(L) && angular(L) },
      { key: 'maskOutside', label: 'Outside', type: 'segmented', showIf: L => masked(L) && angular(L),
        options: [{ key: 'fill', label: 'Layer fills' }, { key: 'empty', label: 'Empty' }] },
      { key: 'maskOutsideRoute', label: 'Outside', type: 'segmented', showIf: L => masked(L) && !angular(L),
        value: L => L.maskOutside, onChange: v => ({ maskOutside: v }),
        options: [{ key: 'fill', label: 'Route after' }, { key: 'empty', label: 'Empty' }] },
      { key: 'maskWord', type: 'custom', render: MaskWord, showIf: L => L.mask === 'word' },
      { key: 'maskFill', type: 'custom', render: MaskFillSettings,
        showIf: L => !!MASK_SOURCES.find(m => m.id === L.mask)?.fill },
    ],
  },
];
