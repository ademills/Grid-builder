import { describe, it, expect } from 'vitest';
import { filletPoly, roundBandShape, seamIndex, rectPoly } from '../src/utils/linework/geometry';
import { angularLayer } from '../src/utils/linework/angular';
import { continuousLayer } from '../src/utils/linework/continuous';

const C = 100, p = 25, w = 12.5;
const L = { w: 600, h: 400, C, p, lineW: w, ratio: 0.5 };
const ANG = {
  style: 'angular', tile: 2, subdiv: 0, minTile: 1, fills: ['spiral', 'rings', 'cornerL', 'nestedU', 'zigzag', 'split4'],
  triFill: 'spiral', angles: ['45', '135'], orient: 'random', outline: false, core: true,
};
const all = (regions) => regions.flatMap(r => r.shapes).flatMap(sh => [sh.s, sh.h].filter(Boolean)).flat();
const box = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);

describe('round corners', () => {
  it('fillets a corner on a true arc, inside the shape', () => {
    const P = filletPoly(rectPoly(0, 0, 100, 100), true, () => 10);
    for (const [x, y] of P) {
      expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(100 + 1e-9);
      if (x < 10 && y < 10) expect(Math.hypot(x - 10, y - 10)).toBeCloseTo(10, 6);
    }
    // an open line keeps its ends
    const line = filletPoly([[0, 0], [50, 0], [50, 50]], false, () => 20);
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([50, 50]);
  });
  it('never takes more than half an edge', () => {
    const P = filletPoly(rectPoly(0, 0, 10, 100), true, () => 50);
    expect(Math.max(...P.map(q => q[0]))).toBeLessThanOrEqual(10 + 1e-9);
    // the short sides are rounded right across: no corner left, tangents at their middles
    expect(P.some(q => q[0] === 0 && q[1] === 0)).toBe(false);
    expect(P.filter(q => q[1] === 0).map(q => q[0])).toEqual([5, 5]);
  });
  it('keeps a band its width round a turn', () => {
    // an L-shaped band, 10 wide, turning at (50, 50)
    const s = [[0, 45], [55, 45], [55, 100], [45, 100], [45, 55], [0, 55]];
    const none = () => false;
    const out = roundBandShape({ s, h: null }, 20, 10, none, 1e-6);
    // the outer arc (radius 25 about (30, 70)) and the inner one (radius 15)
    // are 10 apart all the way round
    const outer = out.s.filter(q => q[0] > 30 && q[1] < 70 && Math.abs(Math.hypot(q[0] - 30, q[1] - 70) - 25) < 1e-6);
    const inner = out.s.filter(q => q[0] > 30 && q[1] < 70 && Math.abs(Math.hypot(q[0] - 30, q[1] - 70) - 15) < 1e-6);
    expect(outer.length).toBeGreaterThan(3);
    expect(inner.length).toBeGreaterThan(3);
  });
  it('leaves corners on a seam sharp', () => {
    const onSeam = seamIndex([rectPoly(0, 0, 100, 100)], 100);
    const out = roundBandShape({ s: rectPoly(0, 0, 100, 100), h: rectPoly(10, 10, 80, 80) }, 30, 10, onSeam, 1e-6);
    expect(out.s).toEqual(rectPoly(0, 0, 100, 100));
    expect(out.h.length).toBeGreaterThan(4);
  });
  it('changes nothing while off', () => {
    const a = angularLayer(L, ANG, 1234, [-1e9, -1e9, 1e9, 1e9], null);
    const b = angularLayer(L, { ...ANG, roundCorners: 0 }, 1234, [-1e9, -1e9, 1e9, 1e9], null);
    expect(JSON.stringify(b.regions)).toBe(JSON.stringify(a.regions));
  });
  it('rounds angular fills inside their tiles', () => {
    const a = angularLayer(L, ANG, 1234, [-1e9, -1e9, 1e9, 1e9], null);
    const b = angularLayer(L, { ...ANG, roundCorners: 1 }, 1234, [-1e9, -1e9, 1e9, 1e9], null);
    const pa = all(a.regions), pb = all(b.regions);
    expect(pb.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(pb.length).toBeGreaterThan(pa.length);
    expect(b.regions.map(r => r.key)).toEqual(a.regions.map(r => r.key));
    // lines still reach the tile edges
    expect(box(pb)).toEqual(box(pa));
  });
  it('rounds continuous lines on their centre line', () => {
    const cfg = { style: 'continuous', route: 'bundles', maxLen: 4, straight: 0.4, cornerShare: 0.6, gapLines: 'random' };
    const a = continuousLayer({ ...L, p: 20 }, cfg, 99, null);
    const b = continuousLayer({ ...L, p: 20 }, { ...cfg, roundCorners: 1 }, 99, null);
    expect(b.groups.map(g => g.key)).toEqual(a.groups.map(g => g.key));
    expect(JSON.stringify(b.groups)).not.toContain('NaN');
    expect(JSON.stringify(b.groups)).not.toBe(JSON.stringify(a.groups));
  });
});
