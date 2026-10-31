// A short descriptive name for a colour ("Pale turquoise", "Deep indigo",
// "Charcoal"), for swatches that have no name of their own — e.g. palette
// colours in the Layers panel. Derived from hue, saturation and lightness,
// so it's stable and needs no lookup table.

const HUES = [
  [12, 'red'], [40, 'orange'], [52, 'gold'], [68, 'yellow'], [95, 'lime'], [150, 'green'],
  [172, 'teal'], [195, 'turquoise'], [215, 'sky blue'], [245, 'blue'], [265, 'indigo'],
  [290, 'violet'], [320, 'magenta'], [345, 'pink'], [360, 'red'],
];

function hsl(hex) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

const cap = s => s[0].toUpperCase() + s.slice(1);

export function colourName(hex) {
  if (!/^#?[0-9a-f]{3,8}$/i.test(hex ?? '')) return null;
  const full = hex.replace('#', '').length === 3 ? hex.replace('#', '').split('').map(c => c + c).join('') : hex;
  const { h, s, l } = hsl(full);

  if (s < 0.12 || l > 0.97 || l < 0.04) {
    if (l > 0.95) return 'White';
    if (l > 0.85) return 'Off-white';
    if (l > 0.65) return 'Light grey';
    if (l > 0.4) return 'Grey';
    if (l > 0.15) return 'Charcoal';
    return 'Black';
  }
  if (s < 0.35 && l > 0.82 && h >= 20 && h < 70) return 'Cream';

  let hue = HUES.find(([max]) => h < max)[1];
  if (hue === 'orange' && l < 0.4) return l < 0.2 ? 'Dark brown' : 'Brown';
  if (hue === 'gold' && l < 0.35) hue = 'olive';
  if (s < 0.3) hue = `greyish ${hue}`;

  if (l > 0.8) return `Pale ${hue}`;
  if (l > 0.65) return `Light ${hue}`;
  if (l < 0.22) return `Dark ${hue}`;
  if (l < 0.35) return `Deep ${hue}`;
  return cap(hue);
}
