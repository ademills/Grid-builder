import { hashSeed } from '../../utils/textSeed';
import { MEANDER_SYMMETRY } from '../../utils/symmetry';
import { range, oneOf } from '../../panels/schemaUtils';
import { CornerControls, WordColour } from './schemaFields';
import { maxPlateSize } from '../../utils/meanderPlates';

// Meander's settings (knotworkSettings), as data for the inspector, the
// control bar and Surprise Me (see panels/schema.jsx).

const pct = v => `${Math.round(v * 100)}%`;
const letters = v => !!(v.seedWord && v.weaveAsLetters);
const scatter = v => letters(v) && v.letterLayout === 'scatter';

export const MEANDER_SCHEMA = [
  {
    id: 'meander.layout', title: 'Layout', fields: [
      { key: 'density', label: 'Density', type: 'slider', min: 0.1, max: 1, step: 0.05, format: pct,
        help: 'How much of the grid the strands fill', surprise: oneOf([0.6, 0.8, 1, 1]) },
      { key: 'straightBias', label: 'Straight bias', type: 'slider', min: 1, max: 15, step: 1, format: v => v,
        help: 'Higher keeps strands running straight for longer before turning', surprise: range(1, 15, 1) },
      { key: 'wallDensity', label: 'Wall density', type: 'slider', min: 0, max: 0.3, step: 0.01, format: pct,
        surprise: oneOf([0, 0, 0.05, 0.12]) },
      { key: 'symmetryMode', label: 'Symmetry', type: 'symmetry', keys: MEANDER_SYMMETRY, bar: true,
        surprise: oneOf(MEANDER_SYMMETRY.filter(k => k !== 'kaleidoscope')) },
      { key: 'kaleidoscopeFold', label: 'Kaleidoscope fold', type: 'number', min: 2, max: 12,
        showIf: v => v.symmetryMode === 'kaleidoscope' },
      { key: 'seed', label: 'Seed', type: 'seed', bar: true,
        onChange: seed => ({ seed, seedWord: '' }), surprise: r => Math.floor(r() * 0x80000000) },
    ],
  },
  {
    id: 'meander.strands', title: 'Strands', fields: [
      { key: 'strandWidthRatio', label: 'Width', type: 'slider', min: 0.3, max: 1, step: 0.02, format: v => v.toFixed(2),
        help: 'Strand width as a share of the cell', surprise: range(0.4, 0.9, 0.02) },
      { key: 'corners', type: 'custom', render: CornerControls,
        surprise: (r, v) => {
          const inner = oneOf([0, 0.1, 0.25, 0.25, 0.5])(r);
          return { capRoundness: oneOf([0.5, 1, 1])(r), innerRadius: inner, outerRadius: inner + v.strandWidthRatio, bendLinked: true };
        } },
      { key: 'showTerminalDots', label: 'Terminal dots', type: 'toggle', surprise: r => r() < 0.3 },
    ],
  },
  {
    id: 'meander.word', title: 'Word',
    info: 'Type a name or word to seed the design: the same word always gives the same layout. Weave as letters draws its letterforms into the strands.',
    fields: [
      { key: 'seedWord', label: 'Name / word', type: 'text', placeholder: 'Type a word…',
        onChange: seedWord => ({ seedWord, seed: hashSeed(seedWord) }) },
      { key: 'weaveAsLetters', label: 'Weave as letters', type: 'toggle', showIf: v => !!v.seedWord,
        help: "Fill the word's letterforms first, then the rest of the grid as usual" },
      { key: 'letterLayout', label: 'Layout', type: 'segmented', showIf: letters,
        options: [{ key: 'scatter', label: 'Scattered' }, { key: 'line', label: 'Line' }] },
      { key: 'letterRandomSize', label: 'Random size', type: 'toggle', showIf: scatter,
        help: 'Each letter draws its own random size, or off for one shared size' },
      { key: 'letterRandomPlacement', label: 'Random placement', type: 'toggle', showIf: scatter,
        help: 'Each letter lands on a random row, or off to centre them all on one row' },
      { key: 'letterAlign', label: 'Alignment', type: 'segmented', showIf: scatter,
        options: [{ key: 'left', label: 'Left' }, { key: 'center', label: 'Centre' }, { key: 'right', label: 'Right' }] },
      { key: 'letterSize', label: 'Letter size', type: 'slider', min: 0.2, max: 1, step: 0.05, format: pct, showIf: letters },
      { key: 'letterColour', type: 'custom', render: WordColour, showIf: letters },
      { key: 'letterColourExclusive', label: 'Word colour only', type: 'toggle', showIf: letters,
        help: "Keep this colour only on the word's strands, or let the rest of the fill use it too" },
    ],
  },
];

// One plate over the design (knotworkSettings.plates[i]; see
// utils/meanderPlates.js), edited in the Meander panel's Plates section.
// ctx: { grid, maxCells, base } (grid: { cols, rows }; base: the main design's settings).
const cells = v => `${+(+v).toFixed(1)}`;
const backed = p => p.backing !== 'none';
export const MEANDER_PLATE_SCHEMA = [
  {
    id: 'meander.plate', fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'enabled', label: 'Show', type: 'toggle' },
      { key: 'shape', label: 'Shape', type: 'segmented',
        options: [{ key: 'square', label: 'Square' }, { key: 'diamond', label: 'Diamond 45°' }] },
      { key: 'cols', label: p => (p.shape === 'diamond' ? 'Size' : 'Width'), type: 'number', min: 2,
        max: (p, c) => maxPlateSize(p.shape, c.grid, 'cols'), help: 'In grid cells (a plate too big for the grid shrinks to fit)',
        value: (p, c) => Math.min(p.cols, maxPlateSize(p.shape, c.grid, 'cols')) },
      { key: 'rows', label: 'Height', type: 'number', min: 2, max: (p, c) => maxPlateSize(p.shape, c.grid, 'rows'),
        value: (p, c) => Math.min(p.rows, maxPlateSize(p.shape, c.grid, 'rows')),
        showIf: p => p.shape !== 'diamond', help: 'In grid cells' },
      { key: 'ox', label: 'Offset X', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells },
      { key: 'oy', label: 'Offset Y', type: 'slider', min: (_, c) => -c.maxCells / 2, max: (_, c) => c.maxCells / 2, step: 0.5, format: cells },
      { key: 'backing', label: 'Background', type: 'segmented',
        options: [{ key: 'square', label: 'Solid' }, { key: 'none', label: 'Transparent' }] },
      { key: 'corner', label: 'Corner radius', type: 'slider', min: 0, max: 1, step: 0.05, format: pct, showIf: backed },
      { key: 'shadow', label: 'Shadow', type: 'segmented', showIf: backed,
        options: [{ key: 'none', label: 'None' }, { key: 'hard', label: 'Hard' }, { key: 'soft', label: 'Soft' }] },
      { key: 'depth', label: 'Depth', type: 'slider', min: 0, max: 1, step: 0.01, format: cells, help: 'Shadow offset, in cells',
        showIf: p => backed(p) && p.shadow !== 'none' },
      { key: 'rim', label: 'Rim', type: 'slider', min: 0, max: 0.5, step: 0.01, format: cells, showIf: backed,
        help: 'An edge band in the ink colour, in cells' },
      { key: 'symmetryMode', label: 'Symmetry', type: 'symmetry', keys: MEANDER_SYMMETRY,
        value: (p, ctx) => p.symmetryMode ?? ctx?.base?.symmetryMode ?? 'none' },
      { key: 'seed', label: 'Seed', type: 'seed' },
    ],
  },
];
