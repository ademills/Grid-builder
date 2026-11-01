import { describe, it, expect } from 'vitest';
import { carryGeneratedEdits } from '../src/utils/meanderBlocks';
import { composeLinework } from '../src/utils/linework/compose';
import { LINEWORK_PRESETS, mergeLineworkSettings } from '../src/modes/linework/settings';
import { contoursBounds } from '../src/utils/linework/geometry';

// Blocks as DocumentEditor builds them from a Linework design.
function blocksFor(settings, cols, rows) {
  const { width, height, items } = composeLinework(settings, { cols, rows });
  return items.map((it, i) => ({
    id: `${cols}-${i}`, type: 'vector', viewW: width, viewH: height, fill: '#000000',
    bounds: contoursBounds(it.contours), genKey: it.key, lwLayer: it.layerId, lwKind: it.kind,
  }));
}
// Centre as a share of the design's size.
const shareOf = b => [(b.bounds.x + b.bounds.w / 2) / b.viewW, (b.bounds.y + b.bounds.h / 2) / b.viewH];

describe('Linework paint after a size change', () => {
  const settings = mergeLineworkSettings(LINEWORK_PRESETS.find(p => p.name === 'Greek-key tiles').settings);
  const before = blocksFor(settings, 17, 24);
  // Paint a few base-layer ink tiles near the middle.
  const painted = before.filter(b => b.lwKind === 'ink' && b.lwLayer === 'base').slice(10, 14)
    .map(b => ({ ...b, fill: '#ff0000', fillFixed: true }));
  const prev = before.map(b => painted.find(p => p.id === b.id) ?? b);

  it('keeps each paint on the tile at the same place in the design', () => {
    const next = blocksFor(settings, 19, 26);
    const after = carryGeneratedEdits(next, prev, { keepFill: false, byPosition: true });
    const red = after.filter(b => b.fill === '#ff0000');
    expect(red.length).toBe(painted.length);
    for (const b of red) {
      const old = painted.find(p => p.id === b.id);
      const [u0, v0] = shareOf(old), [u1, v1] = shareOf(b);
      expect(Math.hypot((u1 - u0) * b.viewW, (v1 - v0) * b.viewH)).toBeLessThanOrEqual(Math.max(old.bounds.w, old.bounds.h) / 2);
    }
  });

  it('matching by key loses it (the bug this fixes)', () => {
    const after = carryGeneratedEdits(blocksFor(settings, 19, 26), prev, { keepFill: false });
    expect(after.filter(b => b.fill === '#ff0000').length).toBeLessThan(painted.length);
  });

  it('a tile that no longer exists loses its paint', () => {
    const far = { ...painted[0], id: 'far', lwLayer: 'nowhere' };
    const after = carryGeneratedEdits(blocksFor(settings, 19, 26), [...prev, far], { keepFill: false, byPosition: true });
    expect(after.some(b => b.id === 'far')).toBe(false);
  });
});
