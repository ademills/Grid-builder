import { describe, it, expect } from 'vitest';
import { getValidCols, snapCols, computeGrid } from '../src/gridPresets';

const a4 = { width: 595, height: 842 };

describe('column snapping', () => {
  it('keeps a count that already tiles the artboard', () => {
    expect(snapCols([10, 12, 14], 12)).toBe(12);
  });

  it('moves to a tiling count close by', () => {
    expect(snapCols([10, 13, 20], 11)).toBe(10);
    expect(snapCols([10, 13, 20], 12)).toBe(13);
  });

  it('keeps the count when the nearest tiling count is far away', () => {
    // A4 at a 10% border tiles at 4 and 23 but nothing in between.
    const valid = getValidCols(a4, 10);
    expect(valid).toContain(4);
    expect(valid).not.toContain(13);
    expect(snapCols(valid, 13)).toBe(13);
  });

  it('centres a grid that does not tile exactly', () => {
    const g = computeGrid(a4, { cols: 13, borderPct: 10 });
    expect(g.gridOriginX).toBeCloseTo((a4.width - g.gridW) / 2);
    expect(g.gridOriginY).toBeCloseTo((a4.height - g.gridH) / 2);
  });
});
