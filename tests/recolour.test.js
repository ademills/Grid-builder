import { describe, it, expect } from 'vitest';
import { artworkColours, reduceColours, recolourMapping, applyRecolour, adjustColour } from '../src/utils/recolour';

const state = {
  shapeColors: [
    { id: 'a', hex: '#FF0000', enabled: true },
    { id: 'b', hex: '#ee1111', enabled: true },
    { id: 'c', hex: '#0000ff', enabled: false },
  ],
  bgColors: [{ id: 'bg', hex: '#ffffff', enabled: true }],
  canvasBg: '#ffffff',
  placedBlocks: [
    { id: 'v1', type: 'vector', fill: '#00ff00' },
    { id: 'v2', type: 'vector', fill: '#00ff00', fillSwatch: 'a' },
    { id: 's1', gridCol: 0 },
  ],
};

describe('recolour artwork', () => {
  it('collects every colour and what uses it', () => {
    const rows = artworkColours(state);
    expect(rows.map(r => r.hex).sort()).toEqual(['#00ff00', '#ee1111', '#ff0000', '#ffffff']);
    expect(rows.find(r => r.hex === '#00ff00').refs).toEqual([{ kind: 'block', id: 'v1' }]);
  });

  it('reduces to n colours, near colours first', () => {
    const rows = artworkColours(state);
    const groups = reduceColours(rows, 3);
    expect(groups.get('#ee1111')).toBe(groups.get('#ff0000'));
    expect(new Set(groups.values()).size).toBe(3);
  });

  it('applies picks and a harmony shift to the swatches, paper and painted layers', () => {
    const rows = artworkColours(state);
    const mapping = recolourMapping(rows, { picks: { '#ffffff': '#000000' }, adjust: {} });
    const changes = applyRecolour(state, rows, mapping);
    expect(changes.canvasBg).toBe('#000000');
    expect(changes.shapeColors).toBeUndefined();
    const shifted = applyRecolour(state, rows, recolourMapping(rows, { adjust: { hue: 120 } }));
    expect(shifted.shapeColors[0].hex).toBe('#00ff00');
    expect(shifted.placedBlocks.find(b => b.id === 'v1').fill).toBe('#0000ff');
    expect(shifted.placedBlocks.find(b => b.id === 'v2').fill).toBe('#00ff00');   // follows its swatch instead
    expect(adjustColour('#808080', { light: 1 })).toBe('#ffffff');
  });
});
