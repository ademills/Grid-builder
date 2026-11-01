import { describe, it, expect } from 'vitest';
import { composeMeanderPlates, meanderPlateDefaults, newMeanderPlate } from '../src/utils/meanderPlates';
import { createDefaultDocState } from '../src/store/docDefaults';

const base = { ...createDefaultDocState('knotwork').knotworkSettings, fg: '#8a1f11', bg: '#f2ede3', palette: ['#8a1f11', '#c9a14c'] };
const grid = { cols: 16, rows: 22 };
const nums = d => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe('Meander plates', () => {
  it('draws shadow, background, rim and strands for a plate, in order', () => {
    const plate = meanderPlateDefaults({ id: 'a', cols: 8, rows: 6, shadow: 'soft', rim: 0.2, seed: 3 });
    const blocks = composeMeanderPlates({ ...base, plates: [plate] }, grid);
    const kinds = blocks.map(b => b.meanderKey.split(':')[1]);
    expect(kinds.slice(0, 3)).toEqual(['shadow', 'ground', 'rim']);
    expect(blocks.length).toBeGreaterThan(3);
    expect(new Set(blocks.map(b => b.groupId))).toEqual(new Set(['meander-plate-a']));
    const shadow = blocks[0];
    expect(shadow.blur).toBeGreaterThan(0);
    expect(shadow.opacity).toBeCloseTo(0.55);
  });

  it('places plates on whole cells inside the grid', () => {
    for (const [shape, ox] of [['square', 0], ['diamond', 0], ['square', 100], ['diamond', -100]]) {
      const plate = meanderPlateDefaults({ id: 'a', cols: 7, rows: 5, shape, ox, seed: 1 });
      for (const b of composeMeanderPlates({ ...base, plates: [plate] }, grid)) {
        expect(Number.isInteger(b.gridCol) && Number.isInteger(b.gridRow)).toBe(true);
        expect(b.gridCol).toBeGreaterThanOrEqual(0);
        expect(b.gridCol + b.cols).toBeLessThanOrEqual(grid.cols);
        expect(b.gridRow + b.rows).toBeLessThanOrEqual(grid.rows);
        for (const v of nums(b.d)) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('keeps a diamond plate inside its footprint', () => {
    const plate = meanderPlateDefaults({ id: 'a', cols: 6, shape: 'diamond', seed: 2 });
    for (const b of composeMeanderPlates({ ...base, plates: [plate] }, grid)) {
      expect(b.bounds.x).toBeGreaterThan(-1);
      expect(b.bounds.x + b.bounds.w).toBeLessThan(b.viewW + 1);
    }
  });

  it('skips hidden plates and gives new ones a smaller size', () => {
    const plate = meanderPlateDefaults({ id: 'a', enabled: false });
    expect(composeMeanderPlates({ ...base, plates: [plate] }, grid)).toEqual([]);
    const next = newMeanderPlate([meanderPlateDefaults({ id: 'p1', cols: 10, rows: 10 })], grid);
    expect(next.id).toBe('p2');
    expect(next.cols).toBeLessThan(10);
  });
});
