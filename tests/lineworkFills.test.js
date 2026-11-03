import { describe, it, expect } from 'vitest';
import { lineworkLayerDefaults, createLineworkSettings, ANGULAR_FILLS, EXPERIMENTAL_FILLS } from '../src/modes/linework/settings';
import { composeLinework } from '../src/utils/linework/compose';
import { LINEWORK_LAYER_SCHEMA } from '../src/modes/linework/schema';
import { signedArea } from '../src/utils/linework/geometry';

const build = (layer, over = {}) => composeLinework({
  ...createLineworkSettings(), ...over,
  layers: [lineworkLayerDefaults({ sym: 'none', seed: 9, tile: 2, ...layer })],
}, { cols: 8, rows: 8 });
const ink = ({ items }) => items.filter(it => it.kind === 'ink');
// A contour's points ([['M', p], ['L', p], …, ['Z']]).
const pts = (c) => c.filter(k => k[0] !== 'Z').map(k => k[k.length - 1]);
const finite = (items) => items.every(it => it.contours.every(c => pts(c).every(p => p.every(Number.isFinite))));

describe('Linework angular fills', () => {
  it.each(['square', 'hex', 'triangle', 'voronoi'])('%s: every fill draws', (tiling) => {
    for (const [fill] of [...ANGULAR_FILLS, ...EXPERIMENTAL_FILLS]) {
      const out = build({ fills: [fill] }, { tiling });
      expect(finite(out.items)).toBe(true);
      // Empty draws no lines of its own, only outlines.
      if (fill === 'blank') expect(ink(out)).toHaveLength(0);
      else expect(ink(out).length).toBeGreaterThan(0);
    }
  });

  it('starts a new layer with every main fill and no experimental ones', () => {
    expect(lineworkLayerDefaults().fills).toEqual(ANGULAR_FILLS.map(([k]) => k));
  });

  it('lists the experimental fills when shown, or while the layer uses one', () => {
    const field = LINEWORK_LAYER_SCHEMA.flatMap(s => s.fields).find(f => f.key === 'fillsExperimental');
    const L = lineworkLayerDefaults();
    expect(field.showIf(L)).toBe(false);
    expect(field.showIf({ ...L, showExperimental: true })).toBe(true);
    expect(field.showIf({ ...L, fills: [...L.fills, 'tunnel'] })).toBe(true);
    // Picking one keeps the main fills.
    expect(field.onChange(['fan'], L).fills).toEqual([...L.fills, 'fan']);
  });

  it('draws sunburst rays and stripes a line wide, like hatching', () => {
    const widths = (fill) => ink(build({ fills: [fill], outline: false }))
      .flatMap(it => it.contours.map(c => {
        // A ray or hatch line is a strip: its narrow side is the line width.
        const q = pts(c);
        return Math.min(...q.map((a, i) => Math.hypot(...[0, 1].map(d => q[(i + 1) % q.length][d] - a[d]))).filter(l => l > 1));
      }));
    const line = 100 / 3 * 0.55;
    for (const fill of ['sunburst', 'stripes']) {
      const ws = widths(fill).filter(Number.isFinite);
      expect(Math.max(...ws)).toBeLessThan(line + 0.5);
    }
  });

  it('names the new fills', () => {
    const names = new Set(ink(build({ fills: ['zigzag', 'ziggurat', 'nestedU', 'spin', 'broken', 'stripes', 'herring', 'solid'], placement: 'rows', tile: 1 }))
      .map(it => it.name.replace(/ \d+$/, '')));
    for (const n of ['Zigzag', 'Ziggurat', 'Nested U', 'Spinning squares', 'Broken rings', 'Stripes', 'Herringbone', 'Solid']) expect(names.has(n)).toBe(true);
  });
});

describe('Linework tile merge, gap and outline weight', () => {
  const tiles = (layer) => {
    const regions = ink(build({ fills: ['solid'], outline: false, ...layer }));
    return regions.map(it => it.contours[0]);
  };

  it('merges tiles into bigger blocks', () => {
    expect(tiles({}).length).toBe(16);
    expect(tiles({ merge: 1 }).length).toBeLessThan(16);
  });

  it('leaves a gap round each tile', () => {
    const area = (layer) => ink(build({ fills: ['solid'], outline: false, ...layer }))
      .reduce((s, it) => s + Math.abs(signedArea(pts(it.contours[0]))), 0);
    const full = area({}), gapped = area({ gap: 0.5 });
    expect(full).toBeGreaterThan(0);
    // Tiles 2 cells across lose a quarter cell each side: (1.5 / 2)² of the area.
    expect(gapped / full).toBeCloseTo(0.5625, 2);
  });

  it('draws outlines heavier with a bigger weight', () => {
    const outline = (w) => build({ fills: ['blank'], outlineWeight: w }).items.find(it => it.key.endsWith(':outline'));
    expect(JSON.stringify(outline(2))).not.toEqual(JSON.stringify(outline(1)));
  });
});
