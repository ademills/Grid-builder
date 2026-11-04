import { describe, it, expect } from 'vitest';
import { lineworkLayerDefaults, createLineworkSettings, platesFromShapes, fitPlates } from '../src/modes/linework/settings';
import { composeLinework, CELL } from '../src/utils/linework/compose';
import { contourRings, unionRings, insetRings, ringsArea, shapeCutter } from '../src/utils/linework/shapeClip';

const boundsOf = (items) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) for (const r of contourRings(it.contours)) for (const [x, y] of r) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
};

// A triangle pointing up, in a plate's box (-0.5…0.5).
const TRI = [[[-0.5, 0.5], [0, -0.5], [0.5, 0.5]]];
const inTri = ([x, y], cx, cy, w, h) => {
  const u = (x - cx) / w, v = (y - cy) / h;
  return v <= 0.5 + 1e-3 && Math.abs(u) <= (v + 0.5) / 2 + 1e-3;
};

describe('Plates on a diamond base', () => {
  it('reach past the diamond into the canvas corners', () => {
    const s = {
      ...createLineworkSettings(), orientation: 'diamond',
      layers: [lineworkLayerDefaults({ seed: 1 }), lineworkLayerDefaults({ id: 'p1', name: 'Plate 1', size: 6, ox: 6, oy: 6, seed: 2 })],
    };
    const { items } = composeLinework(s, { cols: 20, rows: 20 });
    const plate = items.filter(it => it.layer === 1);
    const pts = plate.flatMap(it => contourRings(it.contours).flat());
    // The diamond: |x - 10| + |y - 10| ≤ 14 / √2 cells (14 cells a side).
    const half = (14 / Math.SQRT2) * CELL;
    expect(pts.some(([x, y]) => Math.abs(x - 10 * CELL) + Math.abs(y - 10 * CELL) > half + 50)).toBe(true);
    // Still cut to the canvas.
    const b = boundsOf(plate);
    expect(b.x1).toBeLessThanOrEqual(20 * CELL + 1e-6);
    expect(b.y1).toBeLessThanOrEqual(20 * CELL + 1e-6);
  });
});

describe('Shape plates', () => {
  const settings = (over = {}) => ({
    ...createLineworkSettings(),
    layers: [
      lineworkLayerDefaults({ seed: 1 }),
      lineworkLayerDefaults({ id: 'p1', name: 'Tri', sizing: 'cells', w: 8, h: 6, upright: true, shapeClip: { rings: TRI }, seed: 3, ...over }),
    ],
  });

  it('cut everything to the shape, with an outline and a shape ground', () => {
    const { items } = composeLinework(settings(), { cols: 12, rows: 12 });
    const plate = items.filter(it => it.layer === 1);
    expect(plate.some(it => it.key.endsWith(':shapeOutline'))).toBe(true);
    expect(plate.some(it => it.key.endsWith(':edge') || it.key.endsWith(':rim'))).toBe(false);
    const ground = plate.find(it => it.kind === 'ground');
    // The ground is the triangle: half its 8 × 6 box.
    expect(ringsArea(unionRings(contourRings(ground.contours)))).toBeCloseTo(24 * CELL * CELL, -2);
    for (const it of plate) {
      for (const r of contourRings(it.contours)) for (const p of r) expect(inTri(p, 6 * CELL, 6 * CELL, 8 * CELL, 6 * CELL)).toBe(true);
    }
  });

  it('draw no outline at width 0', () => {
    const { items } = composeLinework(settings({ shapeOutline: 0 }), { cols: 12, rows: 12 });
    expect(items.some(it => it.key.endsWith(':shapeOutline'))).toBe(false);
  });

  it('in Mask mode, fill only the cells the shape covers and keep the square plate', () => {
    let asked = null;
    const maskFor = (li, cols, rows) => {
      if (li !== 1) return null;
      asked = [cols, rows];
      return new Set(['3,0', '4,0']);
    };
    const { items } = composeLinework(settings({ shapeMode: 'mask', tile: 1, sym: 'none' }), { cols: 12, rows: 12 }, { maskFor });
    expect(asked).toEqual([8, 6]);
    const ink = items.filter(it => it.layer === 1 && it.kind === 'ink');
    const b = boundsOf(ink);
    // Only the top row's middle two cells: x 5…7, y 3…4 in canvas cells.
    expect(b.y1).toBeLessThanOrEqual(4.2 * CELL);
    expect(b.x0).toBeGreaterThanOrEqual(4.8 * CELL);
    expect(b.x1).toBeLessThanOrEqual(7.2 * CELL);
    expect(items.some(it => it.key.endsWith(':shapeOutline'))).toBe(false);
  });

  it('stand upright on a diamond base', () => {
    const s = { ...settings(), orientation: 'diamond' };
    const { items } = composeLinework(s, { cols: 12, rows: 12 });
    const ground = items.find(it => it.layer === 1 && it.kind === 'ground');
    const b = boundsOf([ground]);
    expect(b.x1 - b.x0).toBeCloseTo(8 * CELL, 0);
    expect(b.y1 - b.y0).toBeCloseTo(6 * CELL, 0);
  });
});

describe('Shape geometry', () => {
  it('flattens arcs and keeps pieces wholly inside untouched', () => {
    const square = unionRings([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
    const cut = shapeCutter(square);
    const inside = [[['M', [10, 10]], ['L', [20, 10]], ['A', 5, 1, [20, 20]], ['L', [10, 20]], ['Z']]];
    expect(cut(inside)).toBe(inside);
    const outside = [[['M', [200, 200]], ['L', [210, 200]], ['L', [210, 210]], ['Z']]];
    expect(cut(outside)).toBeNull();
    const across = [[['M', [90, 40]], ['L', [110, 40]], ['L', [110, 60]], ['L', [90, 60]], ['Z']]];
    const out = cut(across);
    expect(ringsArea(unionRings(contourRings(out)))).toBeCloseTo(200, 0);
  });

  it('insets a shape by a width', () => {
    const square = unionRings([[[0, 0], [100, 0], [100, 100], [0, 100]]]);
    expect(ringsArea(insetRings(square, 10))).toBeCloseTo(6400, 0);
  });
});

describe('Plates from an SVG', () => {
  const shapes = {
    width: 200, height: 100,
    parts: [
      { name: 'Left', box: { x: 0, y: 0, w: 100, h: 100 }, rings: TRI },
      { name: 'Right', box: { x: 150, y: 25, w: 50, h: 50 }, rings: TRI },
    ],
  };

  it('fits the SVG to the canvas and places each part where it is', () => {
    const layers = [lineworkLayerDefaults()];
    const plates = platesFromShapes(layers, shapes, { w: 20, h: 20 }, { padding: 0 });
    expect(plates.map(p => p.name)).toEqual(['Left', 'Right']);
    // 200 SVG units across 20 cells: 0.1 cells each.
    expect([plates[0].w, plates[0].h, plates[0].ox, plates[0].oy]).toEqual([10, 10, -5, 0]);
    expect([plates[1].w, plates[1].h, plates[1].ox, plates[1].oy]).toEqual([5, 5, 7.5, 0]);
    for (const p of plates) {
      expect(p.upright).toBe(true);
      expect(p.shapeMode).toBe('cutout');
      expect(p.shapeClip.rings).toBe(TRI);
      expect(p.id).not.toBe('base');
    }
    expect(new Set(plates.map(p => p.id)).size).toBe(2);
  });

  it('scales the outline with the plates', () => {
    const plates = platesFromShapes([lineworkLayerDefaults()], shapes, { w: 20, h: 20 });
    const s = { ...createLineworkSettings(), layers: [lineworkLayerDefaults(), ...plates], plateFit: [20, 20] };
    const half = fitPlates(s, [10, 10]);
    expect(half.layers[1].shapeOutline).toBeCloseTo(plates[0].shapeOutline / 2);
  });
});

describe('Shape plate outlines', () => {
  // A square plate 6 × 6 cells in the middle of a 12 × 12 grid, shape = its whole box.
  const SQ = [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]];
  const compose = (over) => composeLinework({
    ...createLineworkSettings(),
    layers: [lineworkLayerDefaults({ seed: 1 }),
      lineworkLayerDefaults({ id: 'p1', name: 'Sq', sizing: 'cells', w: 6, h: 6, upright: true, shapeClip: { rings: SQ }, seed: 3, shapeOutline: 0.5, ...over })],
  }, { cols: 12, rows: 12 }).items.filter(it => it.layer === 1 && it.key.includes(':shapeOutline'));
  const area = it => ringsArea(unionRings(contourRings(it.contours))) / (CELL * CELL);

  it('puts a ring inside, centred on or outside the edge', () => {
    // 6 × 6 square, 0.5 wide ring: inside 36 − 25, centre 6.5² − 5.5², outside 7² − 36.
    expect(area(compose({ shapeOutlinePos: 'inside' })[0])).toBeCloseTo(11, 1);
    expect(area(compose({ shapeOutlinePos: 'centre' })[0])).toBeCloseTo(12, 1);
    expect(area(compose({ shapeOutlinePos: 'outside' })[0])).toBeCloseTo(13, 1);
  });

  it('adds a second ring for a double outline', () => {
    const [a, b] = compose({ shapeOutlineDouble: true, shapeOutlineGap: 0.5 });
    expect(b.name).toBe('Outline 2');
    // Second ring from 1 to 1.5 cells in: 4² − 3².
    expect(area(b)).toBeCloseTo(7, 1);
    expect(area(a)).toBeCloseTo(11, 1);
  });

  it('can draw the outline in the ground colour', () => {
    expect(compose({ shapeOutlineInk: false })[0].onGround).toBe(true);
    expect(compose({})[0].onGround).toBeUndefined();
  });
});

describe('Editing several plates at once', () => {
  it('sets a change on every plate picked, and lists what differs', async () => {
    const { updateLayers, differingKeys } = await import('../src/modes/linework/settings');
    const { layerFieldLabels } = await import('../src/modes/linework/schema');
    const s = {
      ...createLineworkSettings(),
      layers: [lineworkLayerDefaults(), lineworkLayerDefaults({ id: 'a', seed: 1, tile: 2 }), lineworkLayerDefaults({ id: 'b', seed: 2, tile: 2 }), lineworkLayerDefaults({ id: 'c', seed: 3 })],
    };
    const next = updateLayers(s, ['a', 'b'], { tile: 5 });
    expect(next.layers.map(l => l.tile)).toEqual([s.layers[0].tile, 5, 5, s.layers[3].tile]);
    const labels = layerFieldLabels();
    expect(labels.seed).toBe('Seed');
    expect(differingKeys(next.layers.slice(1, 3), Object.keys(labels))).toEqual(['seed']);
  });
});

describe('Refresh plates from an SVG', () => {
  const part = (name, key, x, over = {}) => ({ name, key, box: { x, y: 0, w: 50, h: 50 }, rings: TRI, colour: '#000000', ...over });
  const first = { width: 200, height: 100, parts: [part('Star', 'g0', 0), part('Ring', 'g1', 100)] };

  it('matches plates by name, unnamed parts by place, and keeps their own settings', async () => {
    const { planShapeRefresh, refreshShapePlates } = await import('../src/modes/linework/settings');
    const made = platesFromShapes([lineworkLayerDefaults()], first, { w: 20, h: 20 }, { padding: 0, by: 'group', file: 'a.svg' });
    made[0].tile = 7; // a setting changed after import
    const s = { ...createLineworkSettings(), layers: [lineworkLayerDefaults(), ...made] };
    const SQ = [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]];
    // Edited SVG: Star moved and reshaped, Ring replaced by Circle in its place, and a new Bar.
    const next = { width: 200, height: 100, parts: [part('Star', 'g0', 50, { rings: SQ }), part('Circle', 'g1', 100), part('Bar', 'g2', 150)] };
    const plan = planShapeRefresh(s.layers, next, 'group');
    expect(plan.matches.map(m => m.part.name)).toEqual(['Star']);
    expect(plan.added.map(p => p.name)).toEqual(['Circle', 'Bar']);
    expect(plan.missing).toEqual([made[1].id]);
    // Unnamed groups match by their place in the file.
    const anon = planShapeRefresh([lineworkLayerDefaults(), { ...made[1], shapeFrom: { ...made[1].shapeFrom, name: 'Group 2' } }],
      { parts: [part('Group 1', 'g0', 0), part('Group 7', 'g1', 0)] }, 'group');
    expect(anon.matches.map(m => m.part.name)).toEqual(['Group 7']);
    const out = refreshShapePlates(s, next, { w: 20, h: 20 }, plan, { add: plan.added, by: 'group' });
    const star = out.layers.find(l => l.id === made[0].id);
    expect(star.tile).toBe(7);
    expect(star.shapeClip.rings).toBe(SQ);
    expect(star.ox).toBe(-2.5); // box centre 75, 25 left of the middle, at 0.1 cells per unit
    expect(out.layers).toHaveLength(5);
    // Geometry off: only the shape changes.
    const still = refreshShapePlates(s, next, { w: 20, h: 20 }, plan, { geometry: false });
    expect(still.layers.find(l => l.id === made[0].id).ox).toBe(made[0].ox);
  });

  it('lists plates whose part has gone, and deletes the ones asked for', async () => {
    const { planShapeRefresh, refreshShapePlates } = await import('../src/modes/linework/settings');
    const made = platesFromShapes([lineworkLayerDefaults()], first, { w: 20, h: 20 }, { by: 'group' });
    const s = { ...createLineworkSettings(), layers: [lineworkLayerDefaults(), ...made] };
    const next = { width: 200, height: 100, parts: [part('Star', 'g0', 0)] };
    const plan = planShapeRefresh(s.layers, next, 'group');
    expect(plan.missing).toEqual([made[1].id]);
    const out = refreshShapePlates(s, next, { w: 20, h: 20 }, plan, { remove: plan.missing });
    expect(out.layers.map(l => l.name)).toEqual(['Base', 'Star']);
  });
});
