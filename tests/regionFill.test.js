import { describe, it, expect } from 'vitest';
import { computeColourRegions, regionCellLists, regionDefaults } from '../src/utils/regionFill';

// A 4×2 grid over an image whose left half is black and right half white.
const grid = { cols: 4, rows: 2, cellSize: 10, gridOriginX: 0, gridOriginY: 0 };
const px = (() => {
  const width = 40, height = 20, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = x < 20 ? 0 : 255, i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width, height };
})();

describe('colour regions', () => {
  it('splits cells by colour, darkest region first', () => {
    const r = computeColourRegions(grid, px, { numRegions: 2, smoothing: 0, seed: 1 });
    expect([...r.regionOf]).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(r.colours).toEqual(['#000000', '#ffffff']);
    expect(r.counts).toEqual([4, 4]);
  });

  it('leaves empty regions out and thins by density, keeping the same cells', () => {
    const found = computeColourRegions(grid, px, { numRegions: 2, smoothing: 0, seed: 1 });
    const regions = regionDefaults(2);
    regions[1] = { ...regions[1], shapes: 'none' };
    expect(regionCellLists(found, grid, regions, 3)).toEqual([['0,0', '1,0', '0,1', '1,1'], []]);
    const half = regionCellLists(found, grid, [{ ...regions[0], density: 0.5 }, regions[1]], 3)[0];
    const more = regionCellLists(found, grid, [{ ...regions[0], density: 0.8 }, regions[1]], 3)[0];
    expect(half.every(c => more.includes(c))).toBe(true);
  });
});
