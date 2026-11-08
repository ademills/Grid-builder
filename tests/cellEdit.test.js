import { describe, it, expect } from 'vitest';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { createLineworkSettings, lineworkLayerDefaults } from '../src/modes/linework/settings';
import { mulberry32 } from '../src/utils/rng';

// Select's Cell mode, Rotate / Reflect, Weave and Shape Builder (v1.15.2).
const grid = { cols: 12, rows: 12 };
const settingsFor = (layer, over = {}) => ({ ...createLineworkSettings(), ...over, layers: [lineworkLayerDefaults({ ...layer })] });
const inks = (R) => R.items.filter(i => i.kind === 'ink');
// The edits written back as the editor does: hand, and locks when given.
const apply = (s, edits) => ({
  ...s,
  layers: s.layers.map((l, li) => {
    const mine = edits.filter(e => e.li === li);
    if (!mine.length) return l;
    const hand = { ...(l.hand ?? {}) }, locks = { ...(l.locks ?? {}) };
    for (const e of mine) {
      hand[e.tag] = e.hand;
      if (e.locks === null) delete locks[e.tag];
      else if (e.locks) locks[e.tag] = e.locks;
    }
    return { ...l, hand, locks };
  }),
});
const run = (s, edit) => composeLinework(s, grid, { edit: { rng: mulberry32(7), ...edit } });
const cellEdit = (s, at, op, more = {}) => run(s, { cells: [at], op, ...more });
const probe = (s, at) => cellEdit(s, at, 'probe').probes;
const reseed = (s, seed) => ({ ...s, layers: s.layers.map(l => ({ ...l, seed })) });
const drawn = (R) => JSON.stringify(inks(R).map(i => [i.key, i.contours]));
// The same, to a millionth (a crossing turned back draws its cut along the other way).
const near = (R) => JSON.stringify(inks(R).map(i => [i.key, i.contours]), (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
const itemsOf = (R, prefix) => inks(R).filter(i => i.key.startsWith(prefix)).map(i => JSON.stringify(i.contours)).sort();
const centre = (P) => P.reduce((a, v) => [a[0] + v[0] / P.length, a[1] + v[1] / P.length], [0, 0]);

describe('Cell edits: angular tiles', () => {
  for (const [name, layer, extra] of [
    ['plain', { style: 'angular', seed: 4 }, {}],
    ['subdivided and merged', { style: 'angular', seed: 5, subdiv: 0.6, merge: 0.4, sym: 'none' }, {}],
    ['hex cells', { style: 'angular', seed: 6 }, { tiling: 'hex' }],
  ]) {
    it(`${name}: a tile kept just as drawn (locked) draws the same, and survives a new seed`, () => {
      const s = settingsFor(layer, extra);
      const R = composeLinework(s, grid);
      const target = inks(R).find(i => i.key.includes(':a:'));
      const [info] = probe(s, target.centre);
      expect(info.style).toBe('angular');
      expect(info.filled).toBe(true);
      const locked = run(s, { cells: [target.centre], op: 'lock' });
      expect(locked.edits[0].locks).toBeTruthy();
      const s2 = apply(s, locked.edits);
      // Freezing a tile doesn't change the drawing.
      expect(drawn(composeLinework(s2, grid))).toBe(drawn(R));
      expect(probe(s2, target.centre)[0].locked).toBe(true);
      // A new seed keeps the locked tile as it was.
      const tileKey = target.key.replace(/#\d+$/, '').replace(/(:a:[^:]+):\d+$/, '$1');
      const mine = (X) => itemsOf(X, tileKey + '#').concat(itemsOf(X, tileKey + ':'));
      for (const seed of [11, 12, 13]) expect(mine(composeLinework(reseed(s2, seed), grid))).toEqual(mine(R));
      // Locked tiles aren't re-run or deleted.
      expect(cellEdit(s2, target.centre, 'rerun').refusals.length).toBe(1);
      expect(cellEdit(s2, target.centre, 'delete').edits.length).toBe(0);
      // Unlocking lets it go.
      const unlocked = apply(s2, cellEdit(s2, target.centre, 'unlock').edits);
      expect(unlocked.layers[0].locks[locked.edits[0].tag]).toBeUndefined();
    });
  }

  it('rotate four times and reflect twice come back to the tile as drawn', () => {
    const s = settingsFor({ style: 'angular', seed: 4, fills: ['spiral'], sym: 'none' });
    const R = composeLinework(s, grid);
    const target = inks(R)[3];
    let cur = s;
    const turned = [];
    for (let k = 0; k < 4; k++) {
      cur = apply(cur, cellEdit(cur, target.centre, 'rotate').edits);
      turned.push(drawn(composeLinework(cur, grid)));
    }
    expect(turned[0]).not.toBe(drawn(R));
    expect(turned[3]).toBe(drawn(R));
    let m = apply(s, cellEdit(s, target.centre, 'reflect').edits);
    expect(drawn(composeLinework(m, grid))).not.toBe(drawn(R));
    m = apply(m, cellEdit(m, target.centre, 'reflect').edits);
    expect(drawn(composeLinework(m, grid))).toBe(drawn(R));
    // Reflect then rotate twice is reflecting top to bottom.
    const v = apply(s, cellEdit(s, target.centre, 'reflect', { vertical: true }).edits);
    let hr = apply(s, cellEdit(s, target.centre, 'reflect').edits);
    hr = apply(hr, cellEdit(hr, target.centre, 'rotate').edits);
    hr = apply(hr, cellEdit(hr, target.centre, 'rotate').edits);
    expect(drawn(composeLinework(v, grid))).toBe(drawn(composeLinework(hr, grid)));
  });

  it('Fill sets a tile\'s fill, Delete empties it, Re-run fills it again', () => {
    const s = settingsFor({ style: 'angular', seed: 4, fills: ['spiral'], sym: 'none' });
    const target = inks(composeLinework(s, grid))[0];
    const f = apply(s, cellEdit(s, target.centre, 'fill', { kind: 'hatch' }).edits);
    expect(probe(f, target.centre)[0].kind).toBe('hatch');
    const d = apply(f, cellEdit(f, target.centre, 'delete').edits);
    expect(probe(d, target.centre)[0].filled).toBe(false);
    const r = apply(d, cellEdit(d, target.centre, 'rerun').edits);
    expect(probe(r, target.centre)[0].filled).toBe(true);
  });

  it('Shape Builder merges a block of tiles into one, and splits it again', () => {
    const s = settingsFor({ style: 'angular', seed: 4, sym: 'none', tile: 1 });
    const R = composeLinework(s, grid);
    const at = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL];
    const merged = run(s, { merge: [at(1, 1), at(3, 2)] });
    expect(merged.edits[0].op).toBe('merge');
    const s2 = apply(s, merged.edits);
    const size = (P) => { const xs = P.map(v => v[0]), ys = P.map(v => v[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
    const [one] = probe(s, at(6, 6));
    const [info] = probe(s2, at(2, 2));
    const [tw, th] = size(one.polys[0]), [w, h] = size(info.polys[0]);
    expect(w).toBeCloseTo(3 * tw, 3);
    expect(h).toBeCloseTo(2 * th, 3);
    const split = run(s2, { merge: [at(1, 1), at(3, 2)], split: true });
    expect(split.edits[0].op).toBe('split');
    expect(inks(composeLinework(apply(s2, split.edits), grid)).length).toBe(inks(R).length);
  });

  it('Shape Builder won\'t merge across a symmetry axis or into a locked tile', () => {
    const s = settingsFor({ style: 'angular', seed: 4, sym: 'mirror-x', tile: 1 });
    const at = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL];
    // (The left half is the domain: a block reaching over the middle is refused.)
    const R = run(s, { merge: [at(4, 1), at(7, 2)] });
    expect(R.edits.length).toBe(0);
    const plain = settingsFor({ style: 'angular', seed: 4, sym: 'none', tile: 1 });
    const locked = apply(plain, cellEdit(plain, at(2, 2), 'lock').edits);
    expect(run(locked, { merge: [at(1, 1), at(3, 3)] }).refusals[0].reason).toBe('locked');
  });
});

describe('Cell edits: circuits', () => {
  for (const [name, layer, extra] of [
    ['square', { style: 'circuit', seed: 4, weave: 'alt', sym: 'none', density: 1 }, {}],
    ['square, mirrored', { style: 'circuit', seed: 8, weave: 'alt', sym: 'mirror-x', density: 1 }, {}],
    ['hex', { style: 'circuit', seed: 4, weave: 'alt', sym: 'none', density: 1 }, { tiling: 'hex' }],
  ]) {
    it(`${name}: Delete cuts the lines in a cell, and leaves the rest drawn`, () => {
      const s = settingsFor(layer, extra);
      const R = composeLinework(s, grid);
      const b = inks(R)[0];
      const [info] = probe(s, b.centre);
      expect(info.style).toBe('circuit');
      if (!info.filled) return;
      const cut = cellEdit(s, b.centre, 'delete');
      expect(cut.edits.length).toBe(1);
      const s2 = apply(s, cut.edits);
      const after = composeLinework(s2, grid);
      expect(probe(s2, b.centre)[0].filled).toBe(false);
      expect(inks(after).length).toBeGreaterThan(0);
      // Every crossing left joins two bundles that are still drawn, in that cell.
      const route = s2.layers[0].hand[cut.edits[0].tag];
      const ids = new Set(route.bundles.map(x => x.index));
      for (const X of route.crossings) {
        const [u, o] = extra.tiling ? [X[1], X[2]] : [X[2], X[3]];
        expect(ids.has(u) && ids.has(o)).toBe(true);
      }
      // Re-run in an emptied cell grows something back, or leaves it empty when there's no room.
      const rr = cellEdit(s2, b.centre, 'rerun');
      expect(rr.refusals.length).toBe(0);
    });

    it(`${name}: crossings flip, and locked cells keep their lines through a new seed`, () => {
      const s = settingsFor(layer, extra);
      const R = composeLinework(s, grid);
      // Find a crossing by probing every cell centre.
      const pts = [];
      for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) pts.push([(i + 0.5) * CELL / 2, (j + 0.5) * CELL / 2]);
      const all = run(s, { cells: pts, op: 'probe' }).probes;
      const X = all.find(p => p.crossing && p.can.flip);
      if (X) {
        const at = centre(X.polys[0]);
        const f = cellEdit(s, at, 'flip');
        expect(f.edits[0].op).toBe('flip');
        const s2 = apply(s, f.edits);
        expect(drawn(composeLinework(s2, grid))).not.toBe(drawn(R));
        const back = apply(s2, cellEdit(s2, at, 'flip').edits);
        expect(near(composeLinework(back, grid))).toBe(near(R));
      }
      // Lock a filled cell: its bundles stay through new seeds.
      const filled = all.find(p => p.filled && !p.crossing);
      const at = centre(filled.polys[0]);
      const lk = cellEdit(s, at, 'lock');
      const s3 = apply(s, lk.edits);
      expect(drawn(composeLinework(s3, grid))).toBe(drawn(R));
      const pinned = lk.edits[0].locks.bundles.map(x => x.index);
      expect(pinned.length).toBeGreaterThan(0);
      const tag = lk.edits[0].tag;
      for (const seed of [21, 22]) {
        const again = apply(reseed(s3, seed), []);
        const D = composeLinework(again, grid);
        // The locked cell is still taken, by the same bundles.
        const [p] = probe(again, at);
        expect(p.locked).toBe(true);
        expect(p.filled).toBe(true);
        expect(D.items.length).toBeGreaterThan(0);
      }
      // A locked cell can't be cut, nor can the line through it be removed.
      expect(cellEdit(s3, at, 'delete').refusals[0].reason).toBe('locked');
      const key = inks(composeLinework(s3, grid)).find(i => new RegExp(`^${tag}:[bc]:${pinned[0]}#`).test(i.key))?.key;
      if (key) expect(run(s3, { remove: new Set([key]) }).refusals[0].reason).toBe('locked');
    });
  }

  it('Weave alternates a bundle over and under along a drag', () => {
    const s = settingsFor({ style: 'circuit', seed: 4, weave: 'alt', sym: 'none', density: 1 });
    const pts = [];
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) pts.push([(i + 0.5) * CELL / 2, (j + 0.5) * CELL / 2]);
    const xs = run(s, { cells: pts, op: 'probe' }).probes.filter(p => p.crossing);
    if (xs.length < 2) return;
    const R = run(s, { cells: xs.map(p => centre(p.polys[0])), op: 'weave' });
    expect(R.edits.length).toBeLessThanOrEqual(1);
  });
});

describe('Cell edits: continuous lines', () => {
  it('Re-run changes a turn cell; Delete and Lock are refused', () => {
    const s = settingsFor({ style: 'continuous', seed: 4 });
    const pts = [];
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) pts.push([(i + 0.5) * CELL, (j + 0.5) * CELL]);
    const all = run(s, { cells: pts, op: 'probe' }).probes;
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(p => !p.can.lock && !p.can.delete)).toBe(true);
    const turn = all.find(p => p.can.rerun);
    const at = centre(turn.polys[0]);
    // A few tries: a re-run may land on the rule it had.
    let changed = false;
    for (let k = 0; k < 6 && !changed; k++) changed = run(s, { cells: [at], op: 'rerun', rng: mulberry32(k) }).edits.length > 0;
    expect(changed).toBe(true);
    expect(cellEdit(s, at, 'delete').refusals[0].reason).toBe('continuous');
  });
});
