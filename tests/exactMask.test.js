import { describe, it, expect } from 'vitest';
import { lineworkLayerDefaults, createLineworkSettings } from '../src/modes/linework/settings';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { traceRings } from '../src/utils/linework/traceMask';
import { contourRings, unionRings, ringsArea } from '../src/utils/linework/shapeClip';

// A disc in the box, as on / off pixels.
const disc = (W, H, r) => {
  const on = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) on[y * W + x] = Math.hypot(x + 0.5 - W / 2, y + 0.5 - H / 2) <= r ? 1 : 0;
  return on;
};

describe('Tracing a mask', () => {
  it('traces a disc into one smooth ring of the right area', () => {
    const rings = traceRings(disc(200, 200, 60), 200, 200);
    expect(rings).toHaveLength(1);
    expect(rings[0].length).toBeLessThan(200); // the staircase is thinned
    // π (0.3)² of the box.
    expect(ringsArea(rings)).toBeCloseTo(Math.PI * 0.09, 2);
  });

  it('keeps holes', () => {
    const on = disc(100, 100, 40);
    const hole = disc(100, 100, 15);
    for (let i = 0; i < on.length; i++) if (hole[i]) on[i] = 0;
    const rings = traceRings(on, 100, 100);
    expect(rings).toHaveLength(2);
    expect(ringsArea(rings)).toBeCloseTo(Math.PI * (0.16 - 0.0225), 2);
  });
});

describe('Exact mask edges', () => {
  // A diamond in the layer's box, as an exact mask outline.
  const DIAMOND = [[[0, -0.4], [0.4, 0], [0, 0.4], [-0.4, 0]]];
  const settings = (maskMode, over = {}) => ({
    ...createLineworkSettings(),
    layers: [lineworkLayerDefaults({ seed: 2, sym: 'none', tile: 1, mask: 'silhouette', maskMode, maskEdge: 'exact', ...over })],
  });
  const grid = { cols: 10, rows: 10 };
  const inkOf = items => items.filter(it => it.kind === 'ink' || (it.kind === 'outline' && !it.key.endsWith(':edge')));
  const area = items => ringsArea(unionRings(items.flatMap(it => contourRings(it.contours))));

  it('keeps lines only inside the outline with Invert, and only outside with Remove', () => {
    const maskShapeFor = () => DIAMOND;
    const inv = inkOf(composeLinework(settings('invert'), grid, { maskShapeFor }).items);
    const rem = inkOf(composeLinework(settings('remove'), grid, { maskShapeFor }).items);
    const all = inkOf(composeLinework({ ...settings('invert'), layers: [{ ...settings('invert').layers[0], mask: 'none' }] }, grid).items);
    // Diamond: half of a 0.8 × 0.8 box of a 10 × 10 grid = 32 cells.
    const D = 32 * CELL * CELL;
    for (const it of inv) for (const [x, y] of contourRings(it.contours).flat()) {
      expect(Math.abs(x - 500) + Math.abs(y - 500)).toBeLessThanOrEqual(400 + 1);
    }
    expect(area(inv)).toBeLessThan(D + 1);
    // Inside + outside make up the whole design (to within rounding).
    expect((area(inv) + area(rem)) / area(all)).toBeCloseTo(1, 2);
  });

  it('adds an outline along the cut', () => {
    const { items } = composeLinework(settings('invert', { maskOutline: 0.2 }), grid, { maskShapeFor: () => DIAMOND });
    expect(items.some(it => it.key.endsWith(':maskOutline'))).toBe(true);
  });

  it('falls back to cells until the outline is traced', () => {
    const cells = new Set(['4,4', '5,5']);
    const { items } = composeLinework(settings('invert'), grid, { maskFor: () => cells, maskShapeFor: () => null });
    expect(inkOf(items).length).toBeGreaterThan(0);
    expect(items.some(it => it.key.endsWith(':maskOutline'))).toBe(false);
  });
});
