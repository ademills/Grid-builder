import { describe, it, expect } from 'vitest';
import { hexToHsl, hslToHex, colourHarmonies, addSwatchGroup, uniqueGroupName, reorderSubset } from '../src/utils/colourGuide';

describe('colour guide', () => {
  it('round-trips colours through HSL', () => {
    for (const hex of ['#ff0000', '#7b61ff', '#123456', '#ffffff', '#000000']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex);
    }
  });

  it('builds harmonies around the base colour', () => {
    const h = Object.fromEntries(colourHarmonies('#ff0000').map(x => [x.id, x.colours]));
    expect(h.complementary).toEqual(['#ff0000', '#00ffff']);
    expect(h.triad).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(h.analogous[2]).toBe('#ff0000');
    expect(h.tints[0]).toBe('#ff0000');
    expect(h.shades[4]).not.toBe('#ff0000');
  });
});

describe('swatch groups', () => {
  const doc = [{ id: 'a', hex: '#111111', enabled: true, source: 'palette' }];

  it('adds a group out of the palette, with a unique name', () => {
    const { swatches, group } = addSwatchGroup(doc, 'Sunset', ['#ff0000', '#00ff00']);
    expect(group).toBe('Sunset');
    expect(swatches).toHaveLength(3);
    expect(swatches.slice(1).every(s => s.group === 'Sunset' && s.enabled === false && s.source === 'custom')).toBe(true);
    expect(uniqueGroupName(swatches, 'Sunset')).toBe('Sunset 2');
  });

  it('reorders a group in place', () => {
    const all = [{ id: 1 }, { id: 2, group: 'g' }, { id: 3 }, { id: 4, group: 'g' }];
    expect(reorderSubset(all, [{ id: 4, group: 'g' }, { id: 2, group: 'g' }]).map(s => s.id)).toEqual([1, 4, 3, 2]);
  });
});
