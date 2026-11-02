import { describe, it, expect } from 'vitest';
import { pointInPolygon } from '../src/hooks/useSelection';

describe('lasso', () => {
  const l = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 4 }, { x: 0, y: 10 }];
  it('finds points inside an irregular loop', () => {
    expect(pointInPolygon(2, 2, l)).toBe(true);
    expect(pointInPolygon(9, 8, l)).toBe(true);
    expect(pointInPolygon(5, 8, l)).toBe(false);   // in the notch
    expect(pointInPolygon(12, 5, l)).toBe(false);
  });
});
