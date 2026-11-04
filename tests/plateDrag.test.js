import { describe, it, expect } from 'vitest';
import { lineworkLayerDefaults, createLineworkSettings } from '../src/modes/linework/settings';
import { plateBoxes, plateOffsetFor } from '../src/utils/linework/compose';
import { hitPlate, handlesOf, snapMove, snappedOffset, resizeBox } from '../src/utils/linework/plateDrag';

const area = { x: 0, y: 0, w: 20, h: 20 };
const box = (over) => ({ id: 'p', cx: 10, cy: 10, w: 4, h: 4, rot: 0, baseRot: 0, area, upright: false, ...over });

describe('Plate boxes on the canvas', () => {
  it('places plates where they are drawn, and turns a centre back into an offset', () => {
    const s = { ...createLineworkSettings(), layers: [lineworkLayerDefaults(), lineworkLayerDefaults({ id: 'p1', size: 4, ox: 3, oy: -2 })] };
    const [b] = plateBoxes(s, { cols: 20, rows: 20 });
    expect([b.cx, b.cy, b.w, b.h, b.rot]).toEqual([13, 8, 4, 4, 0]);
    expect(plateOffsetFor(b, 13, 8)).toEqual([3, -2]);
  });

  it('turns offsets with a diamond base, unless the plate is upright', () => {
    const s = { ...createLineworkSettings(), orientation: 'diamond', layers: [lineworkLayerDefaults(), lineworkLayerDefaults({ id: 'p1', size: 4, ox: 2, oy: 0 })] };
    const [b] = plateBoxes(s, { cols: 20, rows: 20 });
    expect(b.rot).toBe(45);
    const [ox, oy] = plateOffsetFor(b, b.cx, b.cy);
    expect(ox).toBeCloseTo(2); expect(oy).toBeCloseTo(0);
    const up = { ...s, layers: [s.layers[0], { ...s.layers[1], upright: true }] };
    const [u] = plateBoxes(up, { cols: 20, rows: 20 });
    expect([u.cx, u.cy, u.rot]).toEqual([12, 10, 0]);
  });
});

describe('Dragging plates', () => {
  it('hits the topmost plate and gives handles only to plates that are not turned', () => {
    const a = box({ id: 'a' }), b = box({ id: 'b', cx: 11 });
    expect(hitPlate([a, b], [10, 10]).id).toBe('b');
    expect(hitPlate([a, b], [1, 1])).toBeNull();
    expect(handlesOf(a)).toHaveLength(8);
    expect(handlesOf(box({ rot: 45 }))).toHaveLength(0);
  });

  it('snaps to the canvas centre and other plates, else to half cells', () => {
    // Left edge (8.1 after the move) snaps to the other plate's right edge at 8.
    const other = box({ id: 'o', cx: 6 });
    const m = snapMove(box(), 0.1, 0, { others: [other] });
    expect(m.cx).toBeCloseTo(10);
    expect(m.guides).toContainEqual({ x: 8 });
    // Free: no snap; offset left exactly.
    const f = snapMove(box(), 1.23, 0, { free: true });
    expect(f.cx).toBeCloseTo(11.23);
    // Far from any line: the offset rounds to half cells.
    const g = snapMove(box(), 1.23, 0, { threshold: 0.01 });
    expect(snappedOffset([g.cx - 10, 0], g.grid)).toEqual([1, 0]);
  });

  it('keeps a move straight with Shift', () => {
    const m = snapMove(box(), 2, 0.4, { straight: true, free: true });
    expect([m.cx, m.cy]).toEqual([12, 10]);
  });

  it('resizes from a handle, keeping the opposite edge, and keeps the ratio on corners', () => {
    const r = resizeBox(box(), 'e', [14.2, 10], { threshold: 0.01 });
    expect([r.w, r.h, r.cx]).toEqual([6, 4, 11]);
    const k = resizeBox(box({ w: 4, h: 2 }), 'se', [16, 11], { keepRatio: true, free: true });
    expect([k.w, k.h]).toEqual([8, 4]);
    const tiny = resizeBox(box(), 'w', [30, 10], { free: true });
    expect(tiny.w).toBe(0.5);
  });
});
