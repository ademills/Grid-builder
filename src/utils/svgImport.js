import { SHAPE_SEL } from './colorize';

// Custom SVG shape import (5.1). analyseSvg() cleans an SVG up and finds its
// colours; buildImportedSvg() turns that into a shape for the library:
//   - the viewBox starts at 0, 0, so shapes fit their cells the same way
//   - every filled element gets its fill inline (classes and inherited
//     fills resolved), so colour modes can recolour it
//   - each colour slot (one or more original colours) tags its elements
//     data-slot="n" (see colorize.js slotGroups), so elements that shared a
//     colour keep sharing one; "kept" colours stay as they are
//   - optionally a background square in a background layer, like the
//     built-in shapes have

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNSAFE = 'script, foreignObject, iframe, object, embed, audio, video, image, style[type="text/javascript"]';

const toHex = (rgb) => {
  const m = rgb.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (!m) return null;
  if (m[4] !== undefined && +m[4] === 0) return null;
  return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
};

// The average of a gradient's stop colours, for a fill of url(#id).
function gradientAverage(liveRoot, fill) {
  const id = fill.match(/url\(\s*["']?#([^"')]+)/)?.[1];
  const grad = id && liveRoot.querySelector(`[id="${CSS.escape(id)}"]`);
  const stops = grad ? [...grad.querySelectorAll('stop')] : [];
  const rgbs = stops.map(s => getComputedStyle(s).stopColor.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number)).filter(c => c?.length === 3);
  if (!rgbs.length) return null;
  const avg = [0, 1, 2].map(k => rgbs.reduce((a, c) => a + c[k], 0) / rgbs.length);
  return toHex(`rgb(${avg.map(Math.round).join(',')})`);
}

const parseLength = v => (v == null ? NaN : parseFloat(String(v).replace(/[a-z%]+$/i, '')));

// Grid sizes a shape can take, and the one closest to an aspect ratio.
export const IMPORT_SIZES = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3], [4, 1], [1, 4]];
export function suggestSize(w, h) {
  const r = Math.log(w / h);
  let best = [1, 1], bestD = Infinity;
  for (const [c, rr] of IMPORT_SIZES.filter(([c, rr]) => c * rr <= 4)) {
    const d = Math.abs(Math.log(c / rr) - r);
    if (d < bestD - 1e-9) { best = [c, rr]; bestD = d; }
  }
  return { cols: best[0], rows: best[1] };
}

// → { markup, width, height, colours: [{ hex, area }] (largest first), suggested: { cols, rows } }
// `markup` is the cleaned SVG with data-orig="#hex" on each recolourable element.
export async function analyseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'svg') throw new Error('This file isn’t a valid SVG.');

  // Nothing that runs code or loads other files.
  for (const el of [...root.querySelectorAll(UNSAFE)]) el.remove();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (/href$/i.test(a.name) && !a.value.trim().startsWith('#')) el.removeAttribute(a.name);
    }
  }

  // Normalise the viewBox to start at 0, 0.
  let [x, y, w, h] = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    x = 0; y = 0;
    w = parseLength(root.getAttribute('width')) || 100;
    h = parseLength(root.getAttribute('height')) || 100;
  }

  // Resolve each element's fill as the browser would (classes, inheritance).
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  const live = document.importNode(root, true);
  host.appendChild(live);
  document.body.appendChild(host);
  const srcEls = [...root.querySelectorAll(SHAPE_SEL)];
  const liveEls = [...live.querySelectorAll(SHAPE_SEL)];
  try {
    srcEls.forEach((el, i) => {
      if (el.closest('defs, clipPath, mask, pattern, symbol, marker')) return;
      const fill = getComputedStyle(liveEls[i]).fill;
      if (!fill || fill === 'none') return;
      // Gradients become their average colour: shapes are flat colour slots.
      const hex = fill.startsWith('url(') ? gradientAverage(live, fill) : toHex(fill);
      if (!hex) return;
      el.removeAttribute('fill');
      el.removeAttribute('class');
      const style = (el.getAttribute('style') || '').replace(/\bfill\s*:[^;]*;?/g, '').trim();
      el.setAttribute('style', `${style}${style && !style.endsWith(';') ? ';' : ''}fill:${hex}`);
      el.setAttribute('data-orig', hex);
    });
  } finally {
    host.remove();
  }

  const content = [...root.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
  const translate = x || y ? ` transform="translate(${-x} ${-y})"` : '';
  const markup = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}"><g${translate}>${content}</g></svg>`;

  return { markup, width: w, height: h, colours: await measureColours(markup), suggested: suggestSize(w, h) };
}

// How much of the artwork each colour covers (0–1), largest first, by
// drawing each colour in a code colour and counting pixels.
async function measureColours(markup) {
  const hexes = [...new Set([...markup.matchAll(/data-orig="(#[0-9a-f]{6})"/g)].map(m => m[1]))];
  if (!hexes.length) return [];
  let coded = markup;
  hexes.forEach((hex, i) => {
    const code = `#${((i + 1) & 0xff).toString(16).padStart(2, '0')}${(((i + 1) >> 8) & 0xff).toString(16).padStart(2, '0')}07`;
    coded = coded.split(`fill:${hex}`).join(`fill:${code}`);
  });
  coded = coded.replace(/<svg\b/, '<svg shape-rendering="crispEdges" width="96" height="96" preserveAspectRatio="none"');
  const counts = new Array(hexes.length).fill(0);
  try {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([coded], { type: 'image/svg+xml' }));
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    URL.revokeObjectURL(url);
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 96, 96);
    const { data } = ctx.getImageData(0, 0, 96, 96);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 250 || data[i + 2] !== 7) continue;
      const k = (data[i] | (data[i + 1] << 8)) - 1;
      if (k >= 0 && k < counts.length) counts[k]++;
    }
  } catch { /* areas stay 0; order falls back to document order */ }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return hexes.map((hex, i) => ({ hex, area: counts[i] / total })).sort((a, b) => b.area - a.area);
}

// slots: [{ hexes: ['#…'], keep?: true }] in slot order. keep: the colour
// stays as drawn instead of taking palette colours.
// background: a hex for a background square behind the shape, or null.
// cols, rows: the grid size; the artwork is centred in a box of that shape.
export function buildImportedSvg(analysis, { slots, background = null, cols = 1, rows = 1 }) {
  const doc = new DOMParser().parseFromString(analysis.markup, 'image/svg+xml');
  const root = doc.documentElement;
  const offset = background ? 1 : 0;
  const slotOfHex = new Map();
  let n = 0;
  for (const slot of slots) {
    if (slot.keep) continue;
    for (const hex of slot.hexes) slotOfHex.set(hex, n + offset);
    n++;
  }
  for (const el of [...root.querySelectorAll('[data-orig]')]) {
    const k = slotOfHex.get(el.getAttribute('data-orig'));
    el.removeAttribute('data-orig');
    if (k !== undefined) el.setAttribute('data-slot', String(k));
  }

  // Pad the viewBox out to the cells' proportions, artwork centred.
  const aspect = cols / rows;
  const w = Math.max(analysis.width, analysis.height * aspect);
  const h = w / aspect;
  const dx = (w - analysis.width) / 2, dy = (h - analysis.height) / 2;
  root.setAttribute('viewBox', `0 0 ${+w.toFixed(3)} ${+h.toFixed(3)}`);
  const shape = doc.createElementNS(SVG_NS, 'g');
  shape.setAttribute('id', 'shape');
  if (dx || dy) shape.setAttribute('transform', `translate(${+dx.toFixed(3)} ${+dy.toFixed(3)})`);
  for (const child of [...root.childNodes]) shape.appendChild(child);
  if (background) {
    const bg = doc.createElementNS(SVG_NS, 'g');
    bg.setAttribute('id', 'background');
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(+w.toFixed(3)));
    rect.setAttribute('height', String(+h.toFixed(3)));
    rect.setAttribute('style', `fill:${background}`);
    rect.setAttribute('data-slot', '0');
    bg.appendChild(rect);
    root.appendChild(bg);
  }
  root.appendChild(shape);
  return new XMLSerializer().serializeToString(root);
}
