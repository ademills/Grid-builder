import { describe, it, expect } from 'vitest';
import { foldSettingsStep, settingsLabel, isUndoableField } from '../src/hooks/settingsHistory';

const entry = (label, born, extra = {}) => ({ label, blocks: [label], at: born, born, coalesce: true, ...extra });

describe('settings undo', () => {
  it('adds a settings-only step with the blocks from before it', () => {
    const stacks = { undo: [entry('Fill', 10)], redo: [entry('Redo', 5)] };
    foldSettingsStep(stacks, { fields: { gridSettings: { cols: 8 } }, blocks: ['before'], since: 100, label: 'Grid' });
    expect(stacks.undo).toHaveLength(2);
    expect(stacks.undo[1]).toMatchObject({ label: 'Grid', blocks: ['before'], fields: { gridSettings: { cols: 8 } }, coalesce: false });
    expect(stacks.redo).toEqual([]);
  });

  it('folds block steps from the same gesture into one step', () => {
    const stacks = {
      undo: [
        entry('Earlier', 50),
        entry('Reshape Strands', 120, { blocks: ['oldest'], fields: { knotworkSettings: 'k0' } }),
        entry('Reshape Strands', 180, { blocks: ['newer'], fields: { knotworkSettings: 'k1' } }),
      ],
      redo: [],
    };
    foldSettingsStep(stacks, { fields: { knotworkSettings: 'k-pending', shapeColors: 'p0' }, blocks: ['pending'], since: 100, label: 'Meander Settings' });
    expect(stacks.undo.map(e => e.label)).toEqual(['Earlier', 'Reshape Strands']);
    // The oldest blocks and the oldest value of each field win.
    expect(stacks.undo[1].blocks).toEqual(['oldest']);
    expect(stacks.undo[1].fields).toEqual({ knotworkSettings: 'k0', shapeColors: 'p0' });
    expect(stacks.undo[1].coalesce).toBe(false);
  });

  it('names a step after the setting that changed', () => {
    expect(settingsLabel(['shapeColors'])).toBe('Palette');
    expect(settingsLabel(['shapeColors', 'paletteKey'])).toBe('Palette');
    expect(settingsLabel(['glitchSettings'])).toBe('Glitch Settings');
    expect(settingsLabel(['lineworkSettings', 'groupNames'])).toBe('Linework Settings');
    expect(settingsLabel(['gridSettings', 'shapeColors'])).toBe('Settings');
  });

  it('leaves blocks and view state to their own history', () => {
    expect(isUndoableField('placedBlocks')).toBe(false);
    expect(isUndoableField('viewTransform')).toBe(false);
    expect(isUndoableField('gradientSettings')).toBe(true);
  });
});
