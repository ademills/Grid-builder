import { describe, it, expect } from 'vitest';
import { surpriseValues } from '../src/panels/schemaUtils';
import { LINEWORK_LAYER_SCHEMA, LINEWORK_GRID_SCHEMA, LINEWORK_LINES_SCHEMA } from '../src/modes/linework/schema';
import { lineworkLayerDefaults } from '../src/modes/linework/settings';

// A seeded random so the picks are repeatable.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('Linework Surprise Me from the schema', () => {
  it('re-rolls a layer within the old ranges', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const L = { ...lineworkLayerDefaults(), ...surpriseValues(LINEWORK_LAYER_SCHEMA, lineworkLayerDefaults(), rng(seed), { plate: false, tiling: 'square' }) };
      expect(['angular', 'circuit']).toContain(L.style);
      expect(L.mask).toBe('none');
      if (L.style === 'circuit') {
        expect(['mirror-both', 'mirror-x', 'none']).toContain(L.sym);
        expect(['single', 'bundles']).toContain(L.route);
        if (L.route === 'single') expect(L.maxLen).toBeGreaterThanOrEqual(200);
      } else {
        expect(['mirror-both', 'mirror-diag', 'rotate4']).toContain(L.sym);
        expect(L.fills.length).toBeGreaterThanOrEqual(1);
        expect(L.fills.length).toBeLessThanOrEqual(3);
        expect([1, 2, 3, 4]).toContain(L.tile);
      }
    }
  });

  it('keeps plates in the style it is given', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const out = surpriseValues(LINEWORK_LAYER_SCHEMA, lineworkLayerDefaults(), rng(seed), { plate: true, tiling: 'square', style: 'circuit' });
      expect(out.style).toBe('circuit');
      expect(['soft', 'hard', 'none']).toContain(out.shadow);
    }
  });

  it('rolls the grid and lines', () => {
    const out = { ...surpriseValues(LINEWORK_GRID_SCHEMA, {}, rng(3)), ...surpriseValues(LINEWORK_LINES_SCHEMA, {}, rng(3)) };
    expect(['square', 'diamond']).toContain(out.orientation);
    expect([2, 3, 4, 5]).toContain(out.linesPerCell);
    expect(out.lineRatio).toBeGreaterThan(0);
  });
});
