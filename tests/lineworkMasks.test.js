import { describe, it, expect } from 'vitest';
import { layerMaskSettings } from '../src/modes/linework/masks';
import { lineworkLayerDefaults, mergeLineworkSettings, createLineworkSettings } from '../src/modes/linework/settings';
import { composeLinework, maskShapes } from '../src/utils/linework/compose';
import { colourItems } from '../src/utils/linework/colour';

describe('Linework region masks are per layer', () => {
  const doc = { src: 'doc.svg', threshold: 0.5 };

  it('uses the layer’s own settings for its mask, else the document’s', () => {
    const plain = lineworkLayerDefaults({ mask: 'silhouette' });
    const own = lineworkLayerDefaults({ mask: 'silhouette', maskSettings: { silhouette: { src: 'own.svg', threshold: 0.2 } } });
    expect(layerMaskSettings(plain, doc)).toBe(doc);
    expect(layerMaskSettings(own, doc).src).toBe('own.svg');
  });

  it('keeps settings for one mask when the layer switches to another', () => {
    const L = lineworkLayerDefaults({ mask: 'noise', maskSettings: { silhouette: { src: 'own.svg' } } });
    expect(layerMaskSettings(L, doc)).toBe(doc);
    expect(layerMaskSettings({ ...L, mask: 'silhouette' }, doc).src).toBe('own.svg');
  });

  it('gives older documents’ layers an empty set of their own', () => {
    const s = mergeLineworkSettings({ layers: [{ mask: 'word' }, { id: 'p1', mask: 'noise' }] });
    expect(s.layers.map(l => l.maskSettings)).toEqual([{}, {}]);
  });
});

describe('Linework mask shapes taken separately', () => {
  const two = new Set(['0,0', '1,0', '0,1', '1,1', '4,3', '5,3', '4,4', '5,4']);
  const settings = (style, maskShapes, maskOutside = 'empty') => ({
    ...createLineworkSettings(),
    layers: [lineworkLayerDefaults({ style, sym: 'mirror-both', seed: 5, mask: 'noise', maskShapes, maskOutside })],
  });
  const maskFor = (li, cols, rows) => new Set([...two].filter(k => { const [i, j] = k.split(',').map(Number); return i < cols && j < rows; }));

  it('finds each shape and its box', () => {
    expect(maskShapes(two, 6, 6).map(({ x, y, w, h }) => [x, y, w, h])).toEqual([[0, 0, 2, 2], [4, 3, 2, 2]]);
  });

  it('builds one run per shape, keyed by shape', () => {
    for (const style of ['angular', 'circuit']) {
      const { items } = composeLinework(settings(style, 'each'), { cols: 6, rows: 6 }, { maskFor });
      const tags = new Set(items.filter(it => it.kind === 'ink').map(it => it.key.split(':')[0]));
      expect([...tags].sort()).toEqual(['L0s1', 'L0s2']);
    }
  });

  it('adds a run for the outside unless it is empty', () => {
    const { items } = composeLinework(settings('angular', 'each', 'fill'), { cols: 6, rows: 6 }, { maskFor });
    expect(new Set(items.filter(it => it.kind === 'ink').map(it => it.key.split(':')[0]))).toEqual(new Set(['L0s1', 'L0s2', 'L0']));
  });
});

describe('Linework colour per layer', () => {
  const items = [0, 0, 1, 1].map((layer, i) => ({ key: `k${i}`, kind: 'ink', layer, centre: [0, 0] }));
  const ctx = (layers) => ({ colorMode: 'none', palette: ['#a', '#b', '#c'], ink: '#ink', width: 10, height: 10, layers });

  it('follows the document unless a layer has a mode of its own', () => {
    expect(colourItems(items, ctx([{}, {}]))).toEqual(['#ink', '#ink', '#ink', '#ink']);
    expect(colourItems(items, ctx([{}, { colorMode: 'uniform' }]))).toEqual(['#ink', '#ink', '#a', '#b']);
  });

  it('shuffles a layer by its own seed', () => {
    const base = { colorMode: 'random' };
    const a = colourItems(items, ctx([base, { colorMode: 'random', colourSeed: 1 }]));
    const seeds = [2, 3, 4, 5, 6].map(s => colourItems(items, ctx([base, { colorMode: 'random', colourSeed: s }])));
    for (const b of seeds) expect(b.slice(0, 2)).toEqual(a.slice(0, 2));
    expect(seeds.some(b => b.slice(2).join() !== a.slice(2).join())).toBe(true);
  });
});
