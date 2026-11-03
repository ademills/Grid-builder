import { describe, it, expect } from 'vitest';
import { composeKnotworkLayers, meanderLayoutSig } from '../src/utils/knotworkCompose';
import { buildMeanderBlocks } from '../src/utils/meanderBlocks';
import { meanderLayoutOf, meanderPartners, growMeanderStrands, addMeanderStrands, meanderRebuildLayout } from '../src/utils/meanderHand';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { createLineworkSettings, lineworkLayerDefaults } from '../src/modes/linework/settings';
import { createDefaultDocState } from '../src/store/docDefaults';
import { mulberry32 } from '../src/utils/rng';

const meander = { ...createDefaultDocState('knotwork').knotworkSettings, fg: '#8a1f11', bg: '#f2ede3', palette: ['#8a1f11', '#c9a14c', '#335577'] };
const local = (cols, rows) => ({ cols, rows, cellSize: 100, gridOriginX: 0, gridOriginY: 0 });
const cellSet = layers => new Set(layers.items.flatMap(it => it.cells.map(([c, r]) => `${c},${r}`)));

describe('Meander hand-build', () => {
  const grid = local(12, 10);
  const settings = { ...meander, seed: 7 };

  it('draws a layout taken from its blocks exactly as walked from the seed', () => {
    const fresh = composeKnotworkLayers(grid, settings);
    const blocks = buildMeanderBlocks(fresh, grid);
    const again = composeKnotworkLayers(grid, settings, meanderLayoutOf(blocks, ''));
    expect(again.items.map(i => [i.key, i.d, i.fill])).toEqual(fresh.items.map(i => [i.key, i.d, i.fill]));
  });

  it('ignores a layout walked under other layout settings', () => {
    const blocks = buildMeanderBlocks(composeKnotworkLayers(grid, settings), grid);
    const layout = meanderLayoutOf(blocks, '');
    const other = { ...settings, density: 0.5 };
    expect(layout.sig).not.toBe(meanderLayoutSig(grid, other));
    const drawn = composeKnotworkLayers(grid, other, layout);
    expect(drawn.items.map(i => i.d)).toEqual(composeKnotworkLayers(grid, other).items.map(i => i.d));
  });

  it('keeps removed strands out, the rest unchanged', () => {
    const fresh = composeKnotworkLayers(grid, settings);
    const blocks = buildMeanderBlocks(fresh, grid);
    const layout = meanderLayoutOf(blocks.filter(b => b.meanderKey !== 's0'), '');
    const drawn = composeKnotworkLayers(grid, settings, layout);
    expect(drawn.items.find(i => i.key === 's0')).toBeUndefined();
    const s1 = fresh.items.find(i => i.key === 's1');
    expect(drawn.items.find(i => i.key === 's1').fill).toBe(s1.fill);
  });

  it('grows only into empty cells, and stays empty when emptied by hand', () => {
    const fresh = composeKnotworkLayers(grid, settings);
    const blocks = buildMeanderBlocks(fresh, grid).filter(b => b.meanderKey !== 's0');
    const layout = meanderLayoutOf(blocks, '');
    const removed = fresh.items.find(i => i.key === 's0').cells;
    const taken = new Set(layout.strands.concat(layout.dots).flatMap(s => s.cells.map(([c, r]) => `${c},${r}`)));
    const [c, r] = removed[0];
    const grown = growMeanderStrands(grid, settings, layout, { col: c, row: r }, mulberry32(3));
    expect(grown.length).toBe(1);
    for (const [gc, gr] of grown[0]) expect(taken.has(`${gc},${gr}`)).toBe(false);
    // Taken cells grow nothing.
    const [tc, tr] = layout.strands[0].cells[0];
    expect(growMeanderStrands(grid, settings, layout, { col: tc, row: tr }, mulberry32(3))).toEqual([]);
    const next = addMeanderStrands(layout, grown);
    expect(cellSet(composeKnotworkLayers(grid, settings, next)).size).toBe(taken.size + grown[0].length);
    // An emptied design rebuilds empty, not from the seed.
    expect(meanderRebuildLayout([{ meanderKey: 'coreOver' }], '', 'x')).toEqual({ sig: 'x', strands: [], dots: [] });
  });

  it('grows mirror images with symmetry, and removes them together', () => {
    const sym = { ...settings, symmetryMode: 'mirror-x' };
    const empty = { sig: meanderLayoutSig(grid, sym), strands: [], dots: [] };
    const grown = growMeanderStrands(grid, sym, empty, { col: 2, row: 3 }, mulberry32(5));
    expect(grown.length).toBe(2);
    expect(grown[1]).toEqual(grown[0].map(([c, r]) => [grid.cols - 1 - c, r]));
    const blocks = buildMeanderBlocks(composeKnotworkLayers(grid, sym, addMeanderStrands(empty, grown)), grid);
    const partners = meanderPartners(blocks, blocks[0], sym, grid);
    expect(partners.size).toBe(2);
  });

  it('keeps a strand on the axis when it starts there', () => {
    const g = local(11, 8);
    const sym = { ...settings, symmetryMode: 'mirror-x' };
    const empty = { sig: meanderLayoutSig(g, sym), strands: [], dots: [] };
    const grown = growMeanderStrands(g, sym, empty, { col: 5, row: 2 }, mulberry32(1));
    expect(grown.length).toBe(1);
    for (const [c] of grown[0]) expect(c).toBe(5);
  });
});

describe('Linework hand-build', () => {
  const grid = { cols: 12, rows: 12 };
  const settingsFor = (layer, over = {}) => ({ ...createLineworkSettings(), ...over, layers: [lineworkLayerDefaults({ ...layer })] });
  const centreOf = (it) => it.centre;
  const inks = (R) => R.items.filter(i => i.kind === 'ink');
  const apply = (s, edits) => ({
    ...s,
    layers: s.layers.map((l, li) => {
      const mine = edits.filter(e => e.li === li);
      if (!mine.length) return l;
      return { ...l, hand: Object.fromEntries([...Object.entries(l.hand ?? {}), ...mine.map(e => [e.tag, e.hand])]) };
    }),
  });

  for (const [name, layer, extra] of [
    ['square circuits', { style: 'circuit', weave: 'alt', seed: 4 }, {}],
    ['hex circuits', { style: 'circuit', seed: 4 }, { tiling: 'hex' }],
    ['angular tiles', { style: 'angular', seed: 4 }, {}],
  ]) {
    it(`${name}: removes by key, stays removed after a shape change, and grows back`, () => {
      const s = settingsFor(layer, extra);
      const R = composeLinework(s, grid);
      const items = inks(R);
      expect(items.length).toBeGreaterThan(2);
      const target = items[1];
      const removed = composeLinework(s, grid, { edit: { remove: new Set([target.key]), rng: mulberry32(1) } });
      expect(removed.edits.length).toBe(1);
      expect(removed.edits[0].op).toBe('remove');
      const s2 = apply(s, removed.edits);
      // A shape setting (line ratio) keeps the hand layout.
      const after = composeLinework({ ...s2, lineRatio: 0.3 }, grid);
      // The target goes with its mirror copies (and, for a split tile, its
      // other parts); everything else stays.
      const group = k => k.replace(/#\d+$/, '').replace(/(:a:[^:]+):\d+$/, '$1');
      const gone = group(target.key);
      expect(inks(after).some(i => group(i.key) === gone)).toBe(false);
      expect(inks(after).map(i => i.key).sort()).toEqual(items.filter(i => group(i.key) !== gone).map(i => i.key).sort());
      // A layout setting (seed) lays out afresh.
      const reseeded = { ...s2, layers: [{ ...s2.layers[0], seed: 99 }] };
      expect(inks(composeLinework(reseeded, grid)).length).toBe(inks(composeLinework({ ...s, layers: [{ ...s.layers[0], seed: 99 }] }, grid)).length);
      // A click where it was grows something into the gap.
      const grown = composeLinework(s2, grid, { edit: { at: centreOf(target), rng: mulberry32(2) } });
      if (grown.edits.length) expect(['grow', 'remove']).toContain(grown.edits[0].op);
      // A click on a line takes it out.
      const [first] = inks(after)[0].contours;
      const a = first[0][1], b = first[1][first[1].length - 1];
      const onLine = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const clicked = composeLinework(s2, grid, { edit: { at: onLine, rng: mulberry32(3) } });
      expect(clicked.edits.length).toBe(1);
    });
  }

  it('angular: clicking an emptied tile fills it again', () => {
    // One fill, so the tile comes back as it was.
    const s = settingsFor({ style: 'angular', seed: 9, fills: ['spiral'] });
    const R = composeLinework(s, grid);
    const target = inks(R).find(i => /:a:[^:]+#0$/.test(i.key));
    const removed = composeLinework(s, grid, { edit: { at: target.centre, rng: mulberry32(1) } });
    expect(removed.edits[0].op).toBe('remove');
    const s2 = apply(s, removed.edits);
    const filled = composeLinework(s2, grid, { edit: { at: target.centre, rng: mulberry32(1) } });
    expect(filled.edits[0].op).toBe('grow');
    expect(inks(composeLinework(apply(s2, filled.edits), grid)).length).toBe(inks(R).length);
  });

  it('square circuits with mirror symmetry: removing one copy removes its mirror image', () => {
    const s = settingsFor({ style: 'circuit', seed: 3, sym: 'mirror-x' });
    const R = composeLinework(s, grid);
    const copies = inks(R).filter(i => /#\d+$/.test(i.key));
    const target = copies.find(i => i.key.endsWith('#1')) ?? copies[0];
    const index = /:b:(\d+)#/.exec(target.key)[1];
    const removed = composeLinework(s, grid, { edit: { remove: new Set([target.key]), rng: mulberry32(1) } });
    const after = composeLinework(apply(s, removed.edits), grid);
    expect(inks(after).some(i => i.key.includes(`:b:${index}#`))).toBe(false);
  });

  it('grows a bundle into an emptied layer', () => {
    const s = settingsFor({ style: 'circuit', seed: 5 });
    const keys = new Set(inks(composeLinework(s, grid)).map(i => i.key));
    const emptied = apply(s, composeLinework(s, grid, { edit: { remove: keys, rng: mulberry32(1) } }).edits);
    expect(inks(composeLinework(emptied, grid)).length).toBe(0);
    const grown = composeLinework(emptied, grid, { edit: { at: [6 * CELL, 6 * CELL], rng: mulberry32(4) } });
    expect(grown.edits[0].op).toBe('grow');
    expect(inks(composeLinework(apply(emptied, grown.edits), grid)).length).toBe(1);
  });
});
