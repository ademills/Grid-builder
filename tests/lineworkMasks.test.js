import { describe, it, expect } from 'vitest';
import { layerMaskSettings } from '../src/modes/linework/masks';
import { lineworkLayerDefaults, mergeLineworkSettings, createLineworkSettings, fitPlates } from '../src/modes/linework/settings';
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
  const settings = (style, maskShapes, maskMode = 'invert') => ({
    ...createLineworkSettings(),
    layers: [lineworkLayerDefaults({ style, sym: 'mirror-both', seed: 5, mask: 'noise', maskShapes, maskMode })],
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

  it('takes the shapes left over when the mask removes', () => {
    const { items } = composeLinework(settings('angular', 'each', 'remove'), { cols: 6, rows: 6 }, { maskFor });
    // Everything but the two squares is one shape, joined edge to edge.
    expect(new Set(items.filter(it => it.kind === 'ink').map(it => it.key.split(':')[0]))).toEqual(new Set(['L0s1']));
  });
});

describe('Linework masks remove or invert', () => {
  const left = (li, cols, rows) => {
    const m = new Set();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols / 2; i++) m.add(`${i},${j}`);
    return m;
  };
  const build = (over) => composeLinework({
    ...createLineworkSettings(),
    layers: [lineworkLayerDefaults({ sym: 'none', seed: 3, tile: 1, mask: 'noise', ...over })],
  }, { cols: 8, rows: 8 }, { maskFor: left });
  const sides = (items) => {
    const ink = items.filter(it => it.kind === 'ink');
    return [ink.some(it => it.centre[0] < 400), ink.some(it => it.centre[0] > 400)];
  };

  it.each(['angular', 'circuit'])('%s: Remove empties the masked side, Invert keeps only it', (style) => {
    expect(sides(build({ style, maskMode: 'remove', edgeExit: 0 }).items)).toEqual([false, true]);
    expect(sides(build({ style, maskMode: 'invert', edgeExit: 0 }).items)).toEqual([true, false]);
  });

  it('fills what it keeps with the layer’s own fills', () => {
    const { items } = build({ fills: ['hatch'], maskMode: 'remove' });
    expect(items.filter(it => it.kind === 'ink').every(it => it.name.startsWith('Hatch'))).toBe(true);
  });

  it('reads older documents’ Outside setting as Remove or Invert', () => {
    const s = mergeLineworkSettings({ layers: [{ mask: 'noise', maskOutside: 'empty', maskFills: ['rings'] }, { id: 'p1', mask: 'noise', maskOutside: 'fill' }] });
    expect(s.layers.map(l => l.maskMode)).toEqual(['invert', 'remove']);
    expect(s.layers[0].maskFills).toBeUndefined();
  });
});

describe('Linework plates follow the base layer’s size', () => {
  const doc = (plateFit) => ({
    ...createLineworkSettings(), plateFit,
    layers: [lineworkLayerDefaults(), lineworkLayerDefaults({ id: 'p1', size: 6, ox: 2, oy: -1, scale: 0.5, depth: 0.3 })],
  });

  it('records the size the plates were made for, then scales them with it', () => {
    const first = fitPlates(doc(null), [10, 12]);
    expect(first.plateFit).toEqual([10, 12]);
    expect(first.layers[1].size).toBe(6);
    const half = fitPlates(first, [5, 8]);
    expect(half.layers[1]).toMatchObject({ size: 3, ox: 1, oy: -0.5, scale: 0.25, depth: 0.15 });
    expect(half.layers[0]).toBe(first.layers[0]);
    expect(fitPlates(half, [5, 8])).toBe(half);
  });

  it('forgets the size once there are no plates', () => {
    const s = { ...doc([10, 10]), layers: [lineworkLayerDefaults()] };
    expect(fitPlates(s, [4, 4]).plateFit).toBeNull();
    expect(fitPlates({ ...s, plateFit: null }, [4, 4]).plateFit).toBeNull();
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
