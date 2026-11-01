import { describe, it, expect } from 'vitest';
import { FILLS } from '../src/modes/gridBuilder/fills';
import { pickSurprise } from '../src/modes/gridBuilder/surprise';
import { surpriseValues, visible } from '../src/panels/schemaUtils';
import { createDefaultDocState } from '../src/store/docDefaults';

const defaults = createDefaultDocState('gridBuilder');
const withSettings = FILLS.filter(f => f.settingsKey);
const fieldsOf = schema => schema.flatMap(sec => sec.fields);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('Grid Pattern fill schemas', () => {
  it('every fill with settings has a schema', () => {
    for (const f of withSettings) expect(f.schema, f.id).toBeTruthy();
  });

  it.each(withSettings.map(f => [f.id, f]))('%s: every setting it edits exists in the defaults', (_, f) => {
    const keys = Object.keys(defaults[f.settingsKey]);
    for (const field of fieldsOf(f.schema)) {
      if (['custom', 'note'].includes(field.type) || field.value) continue;
      expect(keys, `${f.id}.${field.key}`).toContain(field.key);
    }
  });

  it.each(withSettings.filter(f => f.surprise !== false).map(f => [f.id, f]))('%s: Surprise Me stays in range', (_, f) => {
    for (let seed = 1; seed <= 30; seed++) {
      const base = defaults[f.settingsKey];
      const out = { ...base, ...surpriseValues(f.schema, base, rng(seed)) };
      for (const field of fieldsOf(f.schema)) {
        if (!field.surprise || !visible(field, out, {}) || typeof out[field.key] !== 'number') continue;
        if (typeof field.min === 'number') expect(out[field.key], `${f.id}.${field.key}`).toBeGreaterThanOrEqual(field.min);
        if (typeof field.max === 'number') expect(out[field.key], `${f.id}.${field.key}`).toBeLessThanOrEqual(field.max);
      }
      if ('seed' in base) expect(out.seed).not.toBe(base.seed);
    }
  });

  it('pickSurprise never picks the silhouette fill and always returns a palette', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { fill, palette } = pickSurprise({ canUseImage: false, settingsOf: k => defaults[k], r: rng(seed) });
      expect(fill.id).not.toBe('silhouette');
      expect(fill.image).not.toBe('required');
      expect(palette.colours.length).toBeGreaterThan(1);
    }
  });
});
