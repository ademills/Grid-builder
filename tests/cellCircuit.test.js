import { describe, it, expect } from 'vitest';
import { cellCircuitLayer } from '../src/utils/linework/cellCircuit';
import { lineworkLayerDefaults } from '../src/modes/linework/settings';

const CELL = 100;
const L = { w: 12 * CELL, h: 16 * CELL, C: CELL, p: CELL / 3, ratio: 0.5 };
L.lineW = L.p * L.ratio;
const TILINGS = ['hex', 'triangle', 'voronoi'];

// Every number in a set of contours, to check for broken geometry.
function numbers(x, out = []) {
  if (typeof x === 'number') out.push(x);
  else if (Array.isArray(x)) for (const v of x) numbers(v, out);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) numbers(v, out);
  return out;
}
const points = contours => contours.flatMap(c => c.filter(seg => Array.isArray(seg[1])).map(seg => seg[seg.length - 1]));
const cfgOf = over => ({ ...lineworkLayerDefaults(), style: 'circuit', ...over });
const sane = R => {
  expect(R.bundles.length).toBeGreaterThan(0);
  for (const b of R.bundles) expect(numbers(b.contours).every(Number.isFinite)).toBe(true);
};

describe('circuits on hexagon, triangle and Voronoi cells', () => {
  it.each(TILINGS)('%s: bundles', (tiling) => {
    sane(cellCircuitLayer(L, cfgOf({}), 7, tiling, 0.5, false));
  });

  it.each(TILINGS)('%s: mirror symmetry routes the left half only', (tiling) => {
    for (const sym of ['mirror-x', 'mirror-both']) {
      const R = cellCircuitLayer(L, cfgOf({ density: 1 }), 11, tiling, 0.5, false, { sym });
      sane(R);
      expect(R.whole).toBe(false);
      for (const b of R.bundles) for (const [x, y] of points(b.contours)) {
        expect(x).toBeLessThan(L.p);
        if (sym === 'mirror-both') expect(y).toBeLessThan(L.p);
      }
      expect(R.bundles.some(b => b.axes.size > 0)).toBe(true);
    }
  });

  it.each(TILINGS)('%s: a mask keeps bundles inside it', (tiling) => {
    const inside = (x) => x < 0;
    const R = cellCircuitLayer(L, cfgOf({ density: 1 }), 5, tiling, 0.5, false, { inside, maskOutside: 'empty' });
    sane(R);
    for (const b of R.bundles) expect(b.centre[0]).toBeLessThan(0);
    const both = cellCircuitLayer(L, cfgOf({ density: 1 }), 5, tiling, 0.5, false, { inside, maskOutside: 'fill' });
    expect(both.bundles.some(b => b.centre[0] > 0)).toBe(true);
  });

  it('hexagons: over / under crossings', () => {
    let total = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const R = cellCircuitLayer(L, cfgOf({ density: 1, weave: 'alternate', straight: 0.9 }), seed, 'hex', 0.5, false);
      sane(R);
      total += R.crossings;
    }
    expect(total).toBeGreaterThan(0);
  });

  it('single-cell eyes', () => {
    let eyes = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const R = cellCircuitLayer(L, cfgOf({ density: 0.3, eyes: true, maxLen: 3 }), seed, 'hex', 0.5, false);
      eyes += R.bundles.filter(b => b.single).length;
    }
    expect(eyes).toBeGreaterThan(0);
  });

  it.each(TILINGS)('%s: fill every cell as one route', (tiling) => {
    for (const loop of [true, false]) {
      const R = cellCircuitLayer(L, cfgOf({ route: 'single', fill: true, loop }), 3, tiling, 0.5, true);
      sane(R);
      expect(R.bundles).toHaveLength(1);
    }
    const S = cellCircuitLayer(L, cfgOf({ route: 'single', fill: true }), 3, tiling, 0.5, true, { sym: 'mirror-x' });
    sane(S);
    expect(S.bundles[0].axes.size).toBeGreaterThan(0);
  });
});
