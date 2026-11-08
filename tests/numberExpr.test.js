import { describe, it, expect } from 'vitest';
import { evalNumber } from '../src/utils/numberExpr';

describe('evalNumber', () => {
  it('reads plain numbers and readout suffixes', () => {
    expect(evalNumber('12')).toBe(12);
    expect(evalNumber('-3.5')).toBe(-3.5);
    expect(evalNumber('.5')).toBe(0.5);
    expect(evalNumber('55%')).toBe(55);
    expect(evalNumber('45°')).toBe(45);
    expect(evalNumber('2×')).toBe(2);
    expect(evalNumber('12,5')).toBe(12.5);
    expect(evalNumber('1,200')).toBe(1200);
  });
  it('does sums with precedence and brackets', () => {
    expect(evalNumber('12*3')).toBe(36);
    expect(evalNumber('2+3*4')).toBe(14);
    expect(evalNumber('(2+3)*4')).toBe(20);
    expect(evalNumber('10/4')).toBe(2.5);
    expect(evalNumber('10 - -2')).toBe(12);
    expect(evalNumber('6 × 2')).toBe(12);
    expect(evalNumber('9 ÷ 3')).toBe(3);
  });
  it('applies a leading operator to the current value', () => {
    expect(evalNumber('*2', { current: 7 })).toBe(14);
    expect(evalNumber('/4', { current: 10 })).toBe(2.5);
    expect(evalNumber('+5', { current: 10, relative: true })).toBe(15);
    expect(evalNumber('+5', { current: 10 })).toBe(5);
    expect(evalNumber('-5', { current: 10, relative: true })).toBe(-5);
  });
  it('converts units when the field takes them', () => {
    const toUnit = (v, u) => v * { mm: 72 / 25.4, cm: 720 / 25.4, in: 72, pt: 1, px: 1 }[u];
    expect(evalNumber('1in', { toUnit })).toBe(72);
    expect(evalNumber('8.5"', { toUnit })).toBe(612);
    expect(evalNumber('210mm', { toUnit })).toBeCloseTo(595.28, 2);
    expect(evalNumber('1in + 36pt', { toUnit })).toBe(108);
    expect(evalNumber('20mm')).toBe(20);
  });
  it('rejects text that is not a sum', () => {
    for (const t of ['', 'abc', '2+', '(3', '3)', '1/0', '2 3']) expect(evalNumber(t)).toBeNull();
  });
});
