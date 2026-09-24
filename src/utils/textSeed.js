// Deterministic word/phrase -> 32-bit seed, so a Meander design can be
// reproduced from a typed word rather than a numeric seed. Feeds straight
// into the existing knotworkSettings.seed field (see App.jsx) -- the walker
// already derives its entire layout (walls, strand starts, every turn) from
// that one seed via mulberry32, so hashing text into it is the whole
// feature; no changes are needed elsewhere.
export function hashSeed(text) {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
