import { describe, it, expect } from 'vitest';
import { createLineworkSettings, lineworkLayerDefaults } from '../src/modes/linework/settings';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { contoursBounds } from '../src/utils/linework/geometry';

const grid = { cols: 20, rows: 20 };
const design = (plate) => ({
  ...createLineworkSettings(),
  layers: [lineworkLayerDefaults({ seed: 7 }), lineworkLayerDefaults({ id: 'p1', name: 'Plate 1', seed: 11, size: 4, ox: 5, oy: 0, ...plate })],
});
const plateItems = (out) => out.items.filter(it => it.layerId === 'p1');

describe('Radial repeat (plates)', () => {
  it('draws nothing more while off', () => {
    const a = composeLinework(design({}), grid);
    const b = composeLinework(design({ radial: 1 }), grid);
    expect(JSON.stringify(b.items)).toBe(JSON.stringify(a.items));
  });

  it('draws the plate n times round the centre, each copy turned', () => {
    const one = plateItems(composeLinework(design({}), grid));
    const four = plateItems(composeLinework(design({ radial: 4 }), grid));
    expect(four.length).toBe(one.length * 4);
    for (const k of [1, 2, 3]) expect(four.filter(it => it.key.endsWith(`~${k}`)).length).toBe(one.length);
    // The plate sits 5 cells right of centre; a quarter turn puts copy 1 5 cells below.
    const centreOf = (its) => {
      const b = contoursBounds(its.flatMap(it => it.contours));
      return [(b.x + b.w / 2) / CELL, (b.y + b.h / 2) / CELL];
    };
    const [x0, y0] = centreOf(one);
    const [x1, y1] = centreOf(four.filter(it => it.key.endsWith('~1')));
    expect(x0).toBeCloseTo(15, 0); expect(y0).toBeCloseTo(10, 0);
    expect(x1).toBeCloseTo(10, 0); expect(y1).toBeCloseTo(15, 0);
  });

  it('turns about a centre of its own, and keeps copies on the canvas', () => {
    const out = plateItems(composeLinework(design({ radial: 2, radialX: 5, radialY: 0, ox: 8 }), grid));
    // centre (15, 10); the plate at x 18 → its copy at x 12
    const copy = out.filter(it => it.key.endsWith('~1'));
    const b = contoursBounds(copy.flatMap(it => it.contours));
    expect((b.x + b.w / 2) / CELL).toBeCloseTo(12, 0);
    for (const it of out) {
      const bb = contoursBounds(it.contours);
      expect(bb.x).toBeGreaterThanOrEqual(-1e-6);
      expect(bb.x + bb.w).toBeLessThanOrEqual(20 * CELL + 1e-6);
    }
  });
});
