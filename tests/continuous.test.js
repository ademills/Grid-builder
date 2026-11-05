import { describe, it, expect } from 'vitest';
import { continuousLayer, lineOutline } from '../src/utils/linework/continuous';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { createLineworkSettings, lineworkLayerDefaults } from '../src/modes/linework/settings';

const cfgOf = over => ({ ...lineworkLayerDefaults(), style: 'continuous', sym: 'none', ...over });
const layerOf = (cols, rows, n = 6, ratio = 0.4) => ({ w: cols * CELL, h: rows * CELL, C: CELL, p: CELL / n, ratio, lineW: (CELL / n) * ratio });

// Every centreline segment, tagged with its line.
const segsOf = R => R.groups.flatMap((g, gi) => g.lines.flatMap((l, li) => l.pts.slice(1).map((q, i) => ({ a: l.pts[i], b: q, line: `${gi}.${li}` }))));
const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
// A true crossing: each segment's ends strictly either side of the other.
const crosses = (s, t) => {
  const o1 = orient(s.a, s.b, t.a), o2 = orient(s.a, s.b, t.b), o3 = orient(t.a, t.b, s.a), o4 = orient(t.a, t.b, s.b);
  return o1 * o2 < -1e-6 && o3 * o4 < -1e-6;
};
const numbers = x => (Array.isArray(x) ? x.flatMap(numbers) : typeof x === 'number' ? [x] : []);

describe('continuous lines', () => {
  const settings = [
    ['many paths, random gap lines', { route: 'bundles', maxLen: 4, gapLines: 'random' }],
    ['one path, no gap lines', { route: 'single', gapLines: 'off' }],
    ['all corners', { cornerShare: 1, gapLines: 'vertical' }],
    ['all diagonals, 45° gap lines', { cornerShare: 0, gapLines: 'diagonal' }],
    ['checker placement, bigger cells', { placement: 'checker', bundle: 2, gapLines: 'horizontal' }],
  ];

  it.each(settings)('%s: every cell is drawn, nothing crosses', (_, over) => {
    for (const seed of [1, 7, 1234]) {
      const L = layerOf(6, 5);
      const R = continuousLayer(L, cfgOf(over), seed, null);
      expect(R.cells.size).toBe(R.cols * R.rows);
      expect(R.groups.length).toBeGreaterThan(0);
      for (const g of R.groups) expect(numbers(g.contours.map(c => c.map(x => x.slice(1)))).every(Number.isFinite)).toBe(true);
      const segs = segsOf(R);
      let crossings = 0;
      for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
        if (segs[i].line !== segs[j].line && crosses(segs[i], segs[j])) crossings++;
      }
      expect(crossings).toBe(0);
    }
  });

  it('lines meet cell edges only at the shared points', () => {
    const L = layerOf(5, 4, 5);
    const R = continuousLayer(L, cfgOf({ gapLines: 'off' }), 3, null);
    const S = R.S, k = R.k, ox = -R.cols * S / 2, oy = -R.rows * S / 2;
    const lattice = v => { const m = ((v % S) + S) % S; return Array.from({ length: k }, (_, s) => (s + 0.5) * S / k).some(d => Math.abs(m - d) < 1e-6); };
    // Every bend of a line that sits on a cell edge is one of its k points.
    for (const g of R.groups) for (const l of g.lines) for (const [x, y] of l.pts.slice(1, -1)) {
      const gx = x - ox, gy = y - oy;
      const onV = Math.abs(gx / S - Math.round(gx / S)) < 1e-6, onH = Math.abs(gy / S - Math.round(gy / S)) < 1e-6;
      if (onV && !onH) expect(lattice(gy)).toBe(true);
      if (onH && !onV) expect(lattice(gx)).toBe(true);
    }
  });

  it('lines that meet end to end are one line (so bends join cleanly)', () => {
    for (const seed of [1, 2, 1234]) for (const gapLines of ['random', 'diagonal', 'off']) {
      const R = continuousLayer(layerOf(8, 6, 5), cfgOf({ bundle: 2, maxLen: 4, gapLines }), seed, null);
      const ends = new Map();
      const key = p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;
      for (const g of R.groups) for (const l of g.lines) if (!l.closed) for (const p of [l.pts[0], l.pts[l.pts.length - 1]]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
      expect([...ends.values()].filter(n => n > 1).length).toBe(0);
    }
  });

  it('a mask leaves cells empty, and the rest are still drawn', () => {
    const L = layerOf(6, 6);
    const inside = (i, j) => !(i >= 2 && i <= 3 && j >= 2 && j <= 3);
    const R = continuousLayer(L, cfgOf({}), 5, inside);
    expect(R.cells.size).toBe(32);
    for (const id of [14, 15, 20, 21]) expect(R.cells.has(id)).toBe(false);
  });

  it('the same seed draws the same lines', () => {
    const L = layerOf(6, 5);
    const a = continuousLayer(L, cfgOf({}), 42, null), b = continuousLayer(L, cfgOf({}), 42, null);
    expect(a.groups.map(g => g.contours)).toEqual(b.groups.map(g => g.contours));
  });

  it('the Build tool switches a turn cell, and the pin is kept', () => {
    const L = layerOf(6, 5);
    const cfg = cfgOf({ cornerShare: 0.5 });
    const R = continuousLayer(L, cfg, 9, null);
    const [id, c] = [...R.cells].find(([, c]) => c.kind === 'diag' || c.kind === 'corner');
    const at = [(id % R.cols + 0.5) * R.S - R.cols * R.S / 2, (Math.floor(id / R.cols) + 0.5) * R.S - R.rows * R.S / 2];
    const E = continuousLayer(L, cfg, 9, null, { edit: { at } });
    expect(E.edited.op).toBe('turn');
    expect(E.cells.get(id).kind).toBe(c.kind === 'diag' ? 'corner' : 'diag');
    const again = continuousLayer(L, cfg, 9, null, { hand: { rules: E.edited.rules } });
    expect(again.cells.get(id).kind).toBe(E.cells.get(id).kind);
  });

  it('outlines a bend as one solid shape', () => {
    const [contour] = lineOutline([[0, 0], [10, 0], [10, 10]], 1);
    expect(contour[0][0]).toBe('M');
    expect(contour[contour.length - 1][0]).toBe('Z');
  });

  it('composes as a Linework layer', () => {
    const s = createLineworkSettings();
    s.layers = [{ ...s.layers[0], ...cfgOf({ seed: 4, frame: 0.1 }) }];
    const { items } = composeLinework(s, { cols: 6, rows: 5 });
    const lines = items.filter(it => it.key.includes(':l:'));
    expect(lines.length).toBeGreaterThan(0);
    expect(items.some(it => it.key.endsWith(':frame'))).toBe(true);
  });

  it('nothing reaches past the grid (lines, or a base Sticker background and its shadow)', () => {
    const W = 6 * CELL, H = 5 * CELL;
    for (const [style, over] of [['continuous', {}], ['continuous', { scale: 0.75 }], ['circuit', { backing: 'sticker', shadow: 'hard', depth: 0.3 }], ['circuit', { backing: 'outline' }]]) {
      for (const seed of [1, 2, 3]) {
        const s = { ...createLineworkSettings(), linesPerCell: 3, lineRatio: 0.6 };
        s.layers = [lineworkLayerDefaults({ style, sym: 'none', seed, ...over })];
        const { items } = composeLinework(s, { cols: 6, rows: 5 });
        for (const it of items) for (const c of it.contours) for (const cmd of c) {
          if (cmd[0] === 'Z') continue;
          const [x, y] = cmd[cmd.length - 1];
          expect(Math.max(-x, -y, x - W, y - H)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('a hand edit through compose comes back as the layer\'s rules', () => {
    const s = createLineworkSettings();
    s.layers = [{ ...s.layers[0], ...cfgOf({ seed: 4, cornerShare: 0.5 }) }];
    let edits = [];
    // Try cell centres until one is a turn.
    for (let j = 0; j < 5 && !edits.length; j++) for (let i = 0; i < 6 && !edits.length; i++) {
      edits = composeLinework(s, { cols: 6, rows: 5 }, { edit: { at: [(i + 0.5) * CELL, (j + 0.5) * CELL], rng: Math.random } }).edits;
    }
    expect(edits.length).toBe(1);
    expect(edits[0].op).toBe('turn');
    expect(Object.keys(edits[0].hand.rules).length).toBe(1);
    expect(typeof edits[0].hand.sig).toBe('string');
  });
});
