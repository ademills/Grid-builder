// Colour Guide (6.4): harmonies built from one colour, plus the document
// swatch groups they (and saved palettes, 6.2) are added as.

const clamp01 = v => Math.max(0, Math.min(1, v));

export function hexToHsl(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round(clamp01(v + m) * 255).toString(16).padStart(2, '0')).join('');
}

const turn = (hsl, deg) => hslToHex({ ...hsl, h: hsl.h + deg });

// Each harmony: { id, label, colours } — the base colour first where it belongs.
export function colourHarmonies(hex) {
  const hsl = hexToHsl(hex);
  const base = hex.toLowerCase();
  return [
    { id: 'complementary', label: 'Complementary', colours: [base, turn(hsl, 180)] },
    { id: 'split', label: 'Split complementary', colours: [base, turn(hsl, 150), turn(hsl, 210)] },
    { id: 'triad', label: 'Triad', colours: [base, turn(hsl, 120), turn(hsl, 240)] },
    { id: 'analogous', label: 'Analogous', colours: [turn(hsl, -60), turn(hsl, -30), base, turn(hsl, 30), turn(hsl, 60)] },
    { id: 'tetrad', label: 'Tetrad', colours: [base, turn(hsl, 90), turn(hsl, 180), turn(hsl, 270)] },
    { id: 'tints', label: 'Tints', colours: [0, 1, 2, 3, 4].map(i => hslToHex({ ...hsl, l: hsl.l + (1 - hsl.l) * (i / 5) })) },
    { id: 'shades', label: 'Shades', colours: [0, 1, 2, 3, 4].map(i => hslToHex({ ...hsl, l: hsl.l * (1 - i / 5) })) },
  ];
}

// ── Swatch groups ───────────────────────────────────────────────────────────
// A document swatch may carry `group` (a name). Grouped swatches are kept
// when a library replaces the palette, and start out of the palette, so
// adding a group never changes the design.

export const swatchGroupNames = swatches => [...new Set(swatches.map(s => s.group).filter(Boolean))];

// A group name not already used: "Name", "Name 2", ...
export function uniqueGroupName(swatches, name) {
  const taken = new Set(swatchGroupNames(swatches));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

export function addSwatchGroup(swatches, name, hexes) {
  const group = uniqueGroupName(swatches, name);
  return {
    group,
    swatches: [...swatches, ...hexes.map(hex => ({ id: crypto.randomUUID(), hex, enabled: false, source: 'custom', group }))],
  };
}

// Puts `subset` (some swatches, reordered) back into `all` in the slots
// those swatches held, leaving the rest where they were.
export function reorderSubset(all, subset) {
  const ids = new Set(subset.map(s => s.id));
  let i = 0;
  return all.map(s => (ids.has(s.id) ? subset[i++] : s));
}
