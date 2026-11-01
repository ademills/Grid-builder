import { describe, it, expect } from 'vitest';
import { composeLinework } from '../src/utils/linework/compose';
import { LINEWORK_PRESETS, mergeLineworkSettings } from '../src/modes/linework/settings';
import { composeKnotworkLayers } from '../src/utils/knotworkCompose';
import { createDefaultDocState } from '../src/store/docDefaults';

// Regression snapshots for the generators. Each reference design is reduced
// to a digest (item count, kinds, and a hash of the rounded geometry). If a
// change alters what these settings draw, the snapshot fails:
//   - unintended → fix the change;
//   - intended   → bump LINEWORK_ENGINE in DocumentEditor.jsx (so older
//     saves rebuild on open) and run `npm test -- -u` to accept it.

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const round = v => (typeof v === 'number' ? Math.round(v * 10) / 10 : Array.isArray(v) ? v.map(round) : v);
const countBy = (list, key) => list.reduce((acc, it) => ({ ...acc, [it[key]]: (acc[it[key]] ?? 0) + 1 }), {});

function lineworkDigest(design) {
  return {
    size: [design.width, design.height],
    items: design.items.length,
    kinds: countBy(design.items, 'kind'),
    geometry: fnv(JSON.stringify(design.items.map(it => [it.key, it.kind, it.layer, round(it.contours)]))),
  };
}

function meanderDigest(design) {
  return {
    size: [design.width, design.height],
    items: design.items.length,
    kinds: countBy(design.items, 'kind'),
    geometry: fnv(JSON.stringify(design.items.map(it => [it.key, it.kind, it.d, it.fill]))),
    core: fnv(`${design.coreUnder}|${design.coreOver}`),
  };
}

describe('Linework presets draw the same designs', () => {
  it.each(LINEWORK_PRESETS.map(p => [p.name, p]))('%s', (_, preset) => {
    const settings = mergeLineworkSettings(preset.settings);
    const grid = { cols: preset.cols, rows: Math.round(preset.cols * 1.41) };
    const design = composeLinework(settings, grid);
    expect(design.items.length).toBeGreaterThan(0);
    // Same input twice gives the same output (no unseeded randomness).
    expect(lineworkDigest(composeLinework(settings, grid))).toEqual(lineworkDigest(design));
    expect(lineworkDigest(design)).toMatchSnapshot();
  });
});

const MEANDERS = [
  ['default, seed 7', { seed: 7 }],
  ['mirrored, seed 42', { seed: 42, symmetryMode: 'mirror-x' }],
  ['four-way, seed 1234', { seed: 1234, symmetryMode: 'mirror-both' }],
  ['rounded corners, seed 99', { seed: 99, capRoundness: 1, innerRadius: 0.2, outerRadius: 0.6 }],
];

describe('Meander designs draw the same strands', () => {
  const base = createDefaultDocState('knotwork').knotworkSettings;
  const grid = { cols: 24, rows: 32, cellSize: 100, gridOriginX: 0, gridOriginY: 0 };
  const theme = { fg: '#8a1f11', bg: '#f2ede3', palette: ['#8a1f11', '#c9a14c', '#1d3a9c'] };

  it.each(MEANDERS)('%s', (_, over) => {
    const settings = { ...base, ...theme, ...over };
    const design = composeKnotworkLayers(grid, settings);
    expect(design.items.length).toBeGreaterThan(0);
    expect(meanderDigest(composeKnotworkLayers(grid, settings))).toEqual(meanderDigest(design));
    expect(meanderDigest(design)).toMatchSnapshot();
  });
});
