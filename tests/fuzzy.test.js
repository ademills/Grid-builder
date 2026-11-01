import { describe, it, expect } from 'vitest';
import { fuzzyScore } from '../src/shell/fuzzy';

const rank = (q, list) => list.map(t => [t, fuzzyScore(q, t)]).filter(([, s]) => s !== null).sort((a, b) => b[1] - a[1]).map(([t]) => t);

describe('palette search', () => {
  it('needs every character in order', () => {
    expect(fuzzyScore('sav', 'Save As…')).not.toBeNull();
    expect(fuzzyScore('vsa', 'Save As…')).toBeNull();
  });

  it('ranks word-start matches first', () => {
    expect(rank('sa', ['Show Swatches', 'Save', 'Select All'])[0]).toBe('Save');
    expect(rank('sel all', ['Close All Tabs', 'Select All', 'Select Same Colour'])[0]).toBe('Select All');
  });

  it('ignores spaces in the query', () => {
    expect(fuzzyScore('op chev', 'Op chevron Preset')).not.toBeNull();
  });
});
