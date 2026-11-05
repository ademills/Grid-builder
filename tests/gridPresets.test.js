import { describe, it, expect } from 'vitest';
import { getValidCols, snapCols, computeGrid, PRESETS } from '../src/gridPresets';

const a4 = { width: 595, height: 842 };
const hd = { width: 1920, height: 1080 };
const letter = { width: 612, height: 792 };

describe('column counts that fit', () => {
  it('leaves out a count whose rows only nearly fit (1920 × 1080, 7 columns)', () => {
    // 3.94 rows: rounding up would run past the sheet, down would leave a gap.
    expect(getValidCols(hd, 0)).not.toContain(7);
    expect(getValidCols(hd, 0)).toContain(16);
  });

  it('keeps multiples of a count that fits (same gap in pixels)', () => {
    const valid = getValidCols(letter, 5);
    for (const c of [3, 6, 9, 12, 15]) expect(valid).toContain(c);
  });

  it('allows every count on a square sheet', () => {
    expect(getValidCols({ width: 1080, height: 1080 }, 5)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
  });

  it('finds a few counts even on a sheet that hardly divides', () => {
    for (const p of PRESETS.filter(p => p.width)) {
      for (const border of [0, 5, 10, 20]) expect(getValidCols(p, border)?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('column snapping', () => {
  it('keeps a count that fits', () => {
    expect(snapCols([10, 12, 14], 12)).toBe(12);
  });

  it('moves to the nearest count that fits', () => {
    expect(snapCols([10, 13, 20], 11)).toBe(10);
    expect(snapCols([10, 13, 20], 12)).toBe(13);
    expect(snapCols([4, 23], 13)).toBe(4);
  });
});

describe('the grid', () => {
  it('is equal squares inside the border, whatever the count', () => {
    for (const p of PRESETS.filter(p => p.width)) {
      for (const border of [0, 5, 10]) {
        for (let cols = 1; cols <= 40; cols++) {
          const g = computeGrid(p, { cols, borderPct: border });
          expect(g.gridW).toBeLessThanOrEqual(g.innerW + 1e-6);
          expect(g.gridH).toBeLessThanOrEqual(g.innerH + 1e-6);
          expect(g.gridOriginX).toBeGreaterThanOrEqual(g.borderPx - 1e-6);
          expect(g.gridOriginY).toBeGreaterThanOrEqual(g.borderPx - 1e-6);
          expect(g.gridW / g.cols).toBeCloseTo(g.gridH / g.rows, 9);
        }
      }
    }
  });

  it('fills the width when the count fits', () => {
    for (const cols of getValidCols(a4, 5)) {
      const g = computeGrid(a4, { cols, borderPct: 5 });
      // Rows leave at most a sliver of the sheet over, on one side or the other.
      expect(g.innerW - g.gridW + g.innerH - g.gridH).toBeLessThanOrEqual(0.005 * g.innerH + 1e-6);
    }
  });

  it('centres a grid that does not fit exactly', () => {
    const g = computeGrid(a4, { cols: 8, borderPct: 5 });
    expect(g.gridOriginX).toBeCloseTo((a4.width - g.gridW) / 2);
    expect(g.gridOriginY).toBeCloseTo((a4.height - g.gridH) / 2);
  });
});
