import { describe, it, expect } from 'vitest';
import { resolveShapeStroke, strokeAttributes } from '../src/utils/shapeStroke';

const doc = { enabled: true, width: 4, hex: '#000000', swatch: null, align: 'outside', fill: true };

describe('shape outlines', () => {
  it('uses the document outline unless a shape has its own', () => {
    expect(resolveShapeStroke({}, doc)).toEqual({ width: 0.04, colour: '#000000', align: 'outside', fill: true });
    expect(resolveShapeStroke({ stroke: { off: true } }, doc)).toBeNull();
    expect(resolveShapeStroke({}, { ...doc, enabled: false })).toBeNull();
    // A shape's own outline works even when the document has none.
    expect(resolveShapeStroke({ stroke: { width: 2, hex: '#ff0000' } }, { ...doc, enabled: false }).colour).toBe('#ff0000');
  });

  it('follows a swatch and centres line art', () => {
    expect(resolveShapeStroke({}, { ...doc, swatch: 's1' }, { s1: '#123456' }).colour).toBe('#123456');
    expect(resolveShapeStroke({}, { ...doc, fill: false }).align).toBe('centre');
  });

  it('writes SVG attributes in the shape\'s own units', () => {
    const s = resolveShapeStroke({}, doc);
    expect(strokeAttributes(s, 500, 2)).toEqual({ stroke: '#000000', 'stroke-width': '20', 'stroke-linejoin': 'round', 'paint-order': 'stroke' });
    expect(strokeAttributes({ ...s, fill: false, align: 'centre' }, 500, 1)).toMatchObject({ fill: 'none', 'stroke-width': '20' });
  });
});
