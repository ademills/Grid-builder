import { colorizeSvg } from '../utils/colorize';

// Small helpers shared by the panels.

export const randomSeed = () => Math.floor(Math.random() * 0x80000000);

export function normalizeHex(raw) {
  const s = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(s)) {
    const [r, g, b] = s;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

// Generates a vivid hex colour from a hue (0-360), used to seed new mesh points
// with a colour distinct from white (so the colour swatch isn't blank-looking).
export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const c = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${c(f(0))}${c(f(8))}${c(f(4))}`;
}

// Drag-and-drop payload types: a document swatch id (Swatches → Layers) and
// a colour group key (Layers → Layers, to merge groups).
export const SWATCH_MIME = 'application/x-mps-swatch';
export const COLOUR_MIME = 'application/x-mps-colour';

// Neutral-grey thumbnail of a library shape, cached per asset.
const THUMB_PALETTE = ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];
const THUMB_BG = ['#27272a'];

// Thumbnails are the same for every document, so build each once.
const thumbCache = new Map();
export function assetThumb(asset) {
  let url = thumbCache.get(asset.id);
  if (!url) {
    const clean = colorizeSvg(asset.svgContent, 'uniform', THUMB_PALETTE, 0, 0, THUMB_BG)
      .replace(/^<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
    thumbCache.set(asset.id, url);
  }
  return url;
}
