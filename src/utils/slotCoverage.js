import { getColourTemplate } from './colorize';

// How much visible area each colour slot of a shape covers — needed to pick a
// block's dominant colour (a background rect is often the biggest *element*
// but mostly hidden under the shape on top of it).
//
// Measured once per unique svgContent by rasterising the shape at low
// resolution with every paintable slot filled a unique flat colour, then
// counting pixels. Results are cached for the session.

const SIZE = 40;
const cache = new Map();   // svgContent → Float32Array of per-slot weights (sum 1)
const slotMaps = new Map(); // svgContent → Int16Array (SIZE×SIZE) of the top slot per pixel, -1 = none
const pending = new Map(); // svgContent → Promise

const slotHex = (i) => {
  const n = i + 1;
  return `#${(n & 0xff).toString(16).padStart(2, '0')}${((n >> 8) & 0xff).toString(16).padStart(2, '0')}07`;
};

export function getSlotCoverage(svgContent) {
  return cache.get(svgContent) ?? null;
}

export function loadSlotCoverage(svgContent) {
  if (cache.has(svgContent)) return Promise.resolve(cache.get(svgContent));
  if (pending.has(svgContent)) return pending.get(svgContent);

  const template = getColourTemplate(svgContent);
  if (!template || !template.paintable.length) {
    cache.set(svgContent, null);
    return Promise.resolve(null);
  }

  let markup = '';
  for (const p of template.parts) markup += typeof p === 'number' ? slotHex(p) : p;
  // Hard edges so every pixel is exactly one slot's colour.
  markup = markup
    .replace(/^<\?xml[^>]*\?>\s*/i, '')
    .replace(/<svg\b/i, '<svg shape-rendering="crispEdges"');

  const promise = new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
      const weights = new Float32Array(template.slotMeta.length);
      const slotMap = new Int16Array(SIZE * SIZE).fill(-1);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 250 || data[i + 2] !== 7) continue;
        const slot = (data[i] | (data[i + 1] << 8)) - 1;
        if (slot >= 0 && slot < weights.length) { weights[slot]++; total++; slotMap[i / 4] = slot; }
      }
      slotMaps.set(svgContent, slotMap);
      if (total) for (let i = 0; i < weights.length; i++) weights[i] /= total;
      const result = total ? weights : null;
      cache.set(svgContent, result);
      pending.delete(svgContent);
      resolve(result);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      cache.set(svgContent, null);
      pending.delete(svgContent);
      resolve(null);
    };
    img.src = url;
  });
  pending.set(svgContent, promise);
  return promise;
}

// The colour slot visible at (u, v) — 0..1 across the shape's box — or -1.
// Resolves once the shape has been measured (usually instant after the first
// time). Used by the Eyedropper and Paint Bucket to act on the exact part
// that was clicked.
export async function slotAt(svgContent, u, v) {
  if (!slotMaps.has(svgContent)) await loadSlotCoverage(svgContent);
  const map = slotMaps.get(svgContent);
  if (!map) return -1;
  const x = Math.min(SIZE - 1, Math.max(0, Math.floor(u * SIZE)));
  const y = Math.min(SIZE - 1, Math.max(0, Math.floor(v * SIZE)));
  return map[y * SIZE + x];
}
