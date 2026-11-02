import { describe, it, expect } from 'vitest';
import { presetFields } from '../src/store/presetStore';
import { createDefaultDocState } from '../src/store/docDefaults';

describe('presets', () => {
  it('keep a Grid Pattern design: its fill, that fill\'s settings and the colours', () => {
    const state = { ...createDefaultDocState('gridBuilder'), activeFill: 'noise' };
    const f = presetFields('gridBuilder', state);
    expect(f.activeFill).toBe('noise');
    expect(f.noiseSettings).toBe(state.noiseSettings);
    expect(f.glitchSettings).toBeUndefined();
    expect(Array.isArray(f.enabledAssetIds)).toBe(true);
    expect(f.shapeColors).toBe(state.shapeColors);
    expect(f.placedBlocks).toBeUndefined();
    expect(f.imageSrc).toBeUndefined();
  });

  it('keep Meander and Linework settings for their modes only', () => {
    expect(Object.keys(presetFields('knotwork', createDefaultDocState('knotwork')))).toContain('knotworkSettings');
    expect(Object.keys(presetFields('knotwork', createDefaultDocState('knotwork')))).not.toContain('lineworkSettings');
    expect(Object.keys(presetFields('linework', createDefaultDocState('linework')))).toContain('lineworkSettings');
  });
});
