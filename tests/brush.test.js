import { describe, it, expect } from 'vitest';
import { brushCells, brushOrigin, clampBrush } from '../src/utils/brush';

describe('brush size', () => {
  it('keeps the size between 1 and 6', () => {
    expect(clampBrush(0)).toBe(1);
    expect(clampBrush(9)).toBe(6);
    expect(clampBrush(undefined)).toBe(1);
  });

  it('centres a footprint on the cell and keeps it on the grid', () => {
    expect(brushOrigin(5, 5, 3, 3, 10, 10)).toEqual({ col: 4, row: 4 });
    expect(brushOrigin(0, 9, 3, 3, 10, 10)).toEqual({ col: 0, row: 7 });
    expect(brushOrigin(5, 5, 1, 1, 10, 10)).toEqual({ col: 5, row: 5 });
  });

  it('covers a square or a round patch', () => {
    expect(brushCells(5, 5, 3, 'square', 10, 10)).toHaveLength(9);
    expect(brushCells(5, 5, 3, 'round', 10, 10)).toHaveLength(5);
    expect(brushCells(5, 5, 5, 'round', 10, 10)).toHaveLength(21);
    expect(brushCells(0, 0, 3, 'square', 10, 10)).toHaveLength(4);
  });
});
