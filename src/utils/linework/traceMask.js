// Exact mask outlines (v1.14): a mask drawn at high resolution (a W × H grid
// of on / off pixels) traced into rings, for cutting a layer to the mask's
// real shape instead of whole cells (compose.js maskEdge 'exact').
//
// The boundary between on and off pixels is collected as directed unit
// edges (clockwise round every on region, so holes run the other way),
// chained into loops, thinned with Douglas–Peucker to take the pixel
// staircase off, and merged into clean rings. Rings come back in the box
// -0.5…0.5 across and down, like a shape plate's.

import { unionRings, cleanRings } from './shapeClip';

function loopsOf(on, W, H) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && on[y * W + x];
  const next = new Map(); // "x,y" → [[x, y] of each edge's end]
  const add = (x0, y0, x1, y1) => {
    const k = x0 + y0 * (W + 1);
    if (!next.has(k)) next.set(k, []);
    next.get(k).push([x1, y1]);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!on[y * W + x]) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, outs] of next) {
    while (outs.length) {
      const start = [k0 % (W + 1), Math.floor(k0 / (W + 1))];
      const loop = [start];
      let cur = outs.pop();
      while (cur[0] !== start[0] || cur[1] !== start[1]) {
        loop.push(cur);
        const list = next.get(cur[0] + cur[1] * (W + 1));
        if (!list?.length) break;
        cur = list.pop();
      }
      if (loop.length > 2) loops.push(loop);
    }
  }
  return loops;
}

// Douglas–Peucker on a closed ring.
function simplify(ring, tol) {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  const dp = (a, b) => {
    const [ax, ay] = ring[a], [bx, by] = ring[b % ring.length];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const d = Math.abs(dy * (px - ax) - dx * (py - ay)) / L;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    keep[best] = 1;
    dp(a, best);
    dp(best, b);
  };
  // Split at the point farthest from the start so the ring has two halves.
  let far = 0, farD = -1;
  ring.forEach(([x, y], i) => { const d = Math.hypot(x - ring[0][0], y - ring[0][1]); if (d > farD) { farD = d; far = i; } });
  keep[0] = 1; keep[far] = 1;
  dp(0, far);
  dp(far, ring.length);
  return ring.filter((_, i) => keep[i]);
}

// on: W × H pixels (truthy = inside). → rings in the box -0.5…0.5.
export function traceRings(on, W, H, { tolerance = 0.7 } = {}) {
  const loops = loopsOf(on, W, H).map(l => simplify(l, tolerance)).filter(l => l.length > 2);
  if (!loops.length) return [];
  const rings = cleanRings(unionRings(loops), tolerance / 4);
  return rings.map(r => r.map(([x, y]) => [Math.round((x / W - 0.5) * 1e5) / 1e5, Math.round((y / H - 0.5) * 1e5) / 1e5]));
}

// The grid size for a box of aspect w : h, `res` pixels on its long side.
export function rasterSize(aspect, res = 768) {
  return aspect >= 1
    ? [res, Math.max(8, Math.round(res / aspect))]
    : [Math.max(8, Math.round(res * aspect)), res];
}

// The Word mask's line layout (knotworkTextMask.js computeTextMaskCells) at
// W × H: bold sans-serif, letterSize of the height, shrunk to fit 90% of the
// width, centred. font: a font family (any installed font) in place of
// sans-serif. → on / off pixels. Needs the DOM.
export function rasterWord(text, letterSize, W, H, { font = 'sans-serif', weight = 'bold' } = {}) {
  const t = (text || '').trim();
  if (!t) return null;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let px = Math.max(1, Math.round(H * Math.min(1, Math.max(0.2, letterSize ?? 0.7))));
  const family = /[\s,]/.test(font) && !/["']/.test(font) && !font.includes(',') ? `"${font}"` : font;
  const set = () => { ctx.font = `${weight} ${px}px ${family}, sans-serif`; };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  set();
  const wid = ctx.measureText(t).width;
  if (wid > W * 0.9) { px = Math.max(1, Math.floor(px * (W * 0.9) / wid)); set(); }
  ctx.fillStyle = '#000';
  ctx.fillText(t, W / 2, H / 2);
  const { data } = ctx.getImageData(0, 0, W, H);
  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) on[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return on;
}

// Word plates (v1.14): a word set in a font, each letter traced into its
// own shape, laid out on one line. → { width, height, parts } as
// svgShapes.js returns them (a part per letter; spaces leave a gap), for
// settings.js platesFromShapes. font: any installed font family. whole:
// the word as one part instead. Needs the DOM.
export function wordShapes(text, { font = 'sans-serif', weight = 'bold', whole = false } = {}) {
  const t = (text || '').trim();
  if (!t) return { width: 1, height: 1, parts: [] };
  const px = 400;
  const family = /\s/.test(font) && !/["',]/.test(font) ? `"${font}"` : font;
  const fontCss = `${weight} ${px}px ${family}, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = fontCss;
  const advance = s => probe.measureText(s).width;
  const H = Math.round(px * 1.4), base = Math.round(px * 1.05);
  const pad = Math.round(px * 0.25);
  const width = Math.max(1, advance(t)), height = H;
  const glyphs = whole ? [{ s: t, x: 0 }] : [...t].map((ch, i) => ({ s: ch, x: advance(t.slice(0, i)) })).filter(g => g.s.trim());
  const parts = [];
  glyphs.forEach((g, i) => {
    const W = Math.ceil(advance(g.s) + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = fontCss;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(g.s, pad, base);
    const { data } = ctx.getImageData(0, 0, W, H);
    const on = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) on[k] = data[k * 4 + 3] >= 128 ? 1 : 0;
    // Into the line's units: the box -0.5…0.5 of this canvas, moved to the letter's place.
    const rings = traceRings(on, W, H).map(r => r.map(([u, v]) => [(u + 0.5) * W + g.x - pad, (v + 0.5) * H]));
    if (!rings.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0, h = y1 - y0;
    if (!(w > 0) || !(h > 0)) return;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const r5 = v => Math.round(v * 1e5) / 1e5;
    parts.push({
      key: `l${i}`, name: whole ? t : `Letter ${g.s}`, colour: '#000000', box: { x: x0, y: y0, w, h },
      rings: rings.map(r => r.map(([x, y]) => [r5((x - cx) / w), r5((y - cy) / h)])),
      d: rings.map(r => `M${r.map(([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`).join('L')}Z`).join(''),
      area: 0,
    });
  });
  // Crop the line to the letters, so the word fills the canvas.
  if (parts.length) {
    const l = Math.min(...parts.map(p => p.box.x)), r = Math.max(...parts.map(p => p.box.x + p.box.w));
    const tp = Math.min(...parts.map(p => p.box.y)), b = Math.max(...parts.map(p => p.box.y + p.box.h));
    for (const p of parts) {
      p.box = { ...p.box, x: p.box.x - l, y: p.box.y - tp };
      p.d = p.d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x, y) => `${+(+x - l).toFixed(1)} ${+(+y - tp).toFixed(1)}`);
    }
    return { width: r - l, height: b - tp, parts };
  }
  return { width, height, parts };
}
