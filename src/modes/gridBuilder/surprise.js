import { FILLS } from './fills';
import { PALETTES, PALETTE_KEYS } from '../../utils/colorize';
import { surpriseValues } from '../../panels/schemaUtils';

// Surprise Me: a random fill, random settings for it (each field's `surprise`
// in the fill's schema), a random palette and a fresh seed.

const pick = (list, r) => list[Math.floor(r() * list.length)];

// Picks the parts of a surprise. `canUseImage` limits it to fills that run
// without an image when none is loaded. `libraries` are the user's swatch
// libraries ({ name, swatches: [{ hex }] }). `settingsOf(key)` gives the
// document's current settings for a fill (fields shown depend on them).
// Returns the changed settings only.
export function pickSurprise({ canUseImage, libraries = [], settingsOf = () => ({}), r = Math.random }) {
  const fills = FILLS.filter(f => f.surprise !== false && (f.image !== 'required' || canUseImage));
  const fill = pick(fills, r);
  const settings = fill.schema ? surpriseValues(fill.schema, settingsOf(fill.settingsKey) ?? {}, r) : null;

  const palettes = [
    ...PALETTE_KEYS.map(key => ({ name: key, colours: PALETTES[key] })),
    ...libraries.filter(l => l.swatches.length >= 2).map(l => ({ name: l.name, colours: l.swatches.map(s => s.hex) })),
  ];
  return { fill, settings, palette: pick(palettes, r) };
}
