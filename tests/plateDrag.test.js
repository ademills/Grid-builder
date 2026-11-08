import { describe, it, expect } from 'vitest';
import { lineworkLayerDefaults, createLineworkSettings } from '../src/modes/linework/settings';
import { plateBoxes, plateOffsetFor } from '../src/utils/linework/compose';
import { hitPlate, handlesOf, snapMove, snappedOffset, resizeBox, measureGaps } from '../src/utils/linework/plateDrag';

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

describe('Smart guides', () => {
  // Two plates in a row, 2 cells apart: x 2–6 and 8–12, y 8–12.
  const a = box({ id: 'a', cx: 4, cy: 10 }), b = box({ id: 'b', cx: 10, cy: 10 });

  it('snaps a third plate to the same gap, with no edge to snap to', () => {
    // dragged to x 14.3–18.3: 2.3 from b; the even gap is 2 (14–18)
    const r = snapMove(box({ id: 'c', cx: 16, cy: 10 }), 0.3, 0.05, { others: [a, b], threshold: 0.4 });
    expect(r.cx).toBeCloseTo(16);
    expect(r.grid.x).toBe(false);
    const g = r.gaps.find(x => x.axis === 'x' && x.to <= 14.01);
    expect(g.to - g.from).toBeCloseTo(2);
    expect(g.equal).toBe(true);
  });

  it('snaps halfway between two plates', () => {
    const far = box({ id: 'f', cx: 18, cy: 10, w: 2 }); // x 17–19
    // a plate 2 wide between b (ends 12) and far (starts 17): middle 13.5–15.5
    const r = snapMove(box({ id: 'm', cx: 14.3, cy: 10, w: 2 }), 0.1, 0, { others: [b, far], threshold: 0.4 });
    expect(r.cx).toBeCloseTo(14.5);
    const xs = r.gaps.filter(g => g.axis === 'x');
    expect(xs).toHaveLength(2);
    expect(xs.every(g => g.equal)).toBe(true);
  });

  it('measures to the canvas edge where no plate is across', () => {
    const gaps = measureGaps(box({ cx: 10, cy: 10 }), [], area);
    expect(gaps.map(g => [g.axis, g.from, g.to])).toEqual([['x', 0, 8], ['x', 12, 20], ['y', 0, 8], ['y', 12, 20]]);
    expect(gaps.some(g => g.equal)).toBe(false);
  });

  it('leaves Alt (free) moves alone', () => {
    const r = snapMove(box({ id: 'c', cx: 16, cy: 10 }), 0.3, 0, { others: [a, b], threshold: 0.4, free: true });
    expect(r.cx).toBeCloseTo(16.3);
  });
});
