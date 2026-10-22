// Silhouette fill: an SVG or PNG (a logo, an animal outline…) drawn over the
// grid; cells it covers enough get filled. Rasterising needs the DOM, so this
// runs on the main thread and the cells are handed to the fill worker.
//
// settings = { src, fit, padding, threshold, source, invert, offsetX, offsetY, scale }
//   src       — data URL of the image
//   fit       — 'contain' | 'cover' | 'stretch' (within the grid area)
//   padding   — fraction of the grid kept clear on every side
//   threshold — fraction of a cell the shape must cover (0..1)
//   source    — what counts as "inside": 'auto' (transparency if the image
//               has any, else dark pixels), 'alpha', 'dark' or 'light'
//   scale     — 0.25..2, about the grid centre; offsetX / offsetY move it (fraction of the grid)

const SAMPLES = 8; // samples per cell side

// An SVG with only a viewBox has no intrinsic size, so the browser guesses
// one (and its proportions). Give it width / height from the viewBox.
function sizedSvg(src) {
  if (!src.startsWith('data:image/svg+xml')) return src;
  try {
    const comma = src.indexOf(',');
    const meta = src.slice(0, comma);
    const text = meta.includes(';base64') ? atob(src.slice(comma + 1)) : decodeURIComponent(src.slice(comma + 1));
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const root = doc.documentElement;
    if (doc.querySelector('parsererror') || (root.getAttribute('width') && root.getAttribute('height'))) return src;
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0)) return src;
    const k = 1000 / Math.max(vb[2], vb[3]);
    root.setAttribute('width', String(vb[2] * k));
    root.setAttribute('height', String(vb[3] * k));
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
  } catch {
    return src;
  }
}

const images = new Map(); // src → Promise<HTMLImageElement>
function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(src); reject(new Error('Could not read that image.')); };
      img.src = sizedSvg(src);
    }));
  }
  return images.get(src);
}

// Per-cell coverage (0..1) for the image placed on a cols × rows grid.
const coverageCache = new Map();
export async function silhouetteCoverage(cols, rows, s) {
  const key = [s.src?.length, s.src?.slice(-64), cols, rows, s.fit, s.padding, s.source, s.scale, s.offsetX, s.offsetY].join('|');
  if (coverageCache.has(key)) return coverageCache.get(key);

  const img = await loadImage(s.src);
  const W = cols * SAMPLES, H = rows * SAMPLES;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const pad = Math.max(0, Math.min(0.45, s.padding ?? 0));
  const boxW = W * (1 - pad * 2), boxH = H * (1 - pad * 2);
  // SVGs without a size report 0 (or 300 × 150); fall back to a square.
  const iw = img.naturalWidth || 300, ih = img.naturalHeight || iw;
  let dw, dh;
  if (s.fit === 'stretch') { dw = boxW; dh = boxH; }
  else {
    const k = s.fit === 'cover' ? Math.max(boxW / iw, boxH / ih) : Math.min(boxW / iw, boxH / ih);
    dw = iw * k; dh = ih * k;
  }
  const scale = s.scale ?? 1;
  dw *= scale; dh *= scale;
  const dx = (W - dw) / 2 + (s.offsetX ?? 0) * W;
  const dy = (H - dh) / 2 + (s.offsetY ?? 0) * H;
  ctx.drawImage(img, dx, dy, dw, dh);
  const { data } = ctx.getImageData(0, 0, W, H);

  // 'auto': transparency means the image is a cut-out; otherwise use darkness.
  let source = s.source ?? 'auto';
  if (source === 'auto') {
    // Pixels outside the drawn image are transparent anyway, so only look inside it.
    let transparent = false;
    const x0 = Math.max(0, Math.floor(dx)), x1 = Math.min(W, Math.ceil(dx + dw));
    const y0 = Math.max(0, Math.floor(dy)), y1 = Math.min(H, Math.ceil(dy + dh));
    outer: for (let y = y0; y < y1; y += 2)
      for (let x = x0; x < x1; x += 2)
        if (data[(y * W + x) * 4 + 3] < 128) { transparent = true; break outer; }
    source = transparent ? 'alpha' : 'dark';
  }

  const coverage = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let y = r * SAMPLES; y < (r + 1) * SAMPLES; y++)
        for (let x = c * SAMPLES; x < (c + 1) * SAMPLES; x++) {
          const i = (y * W + x) * 4;
          const a = data[i + 3] / 255;
          if (source === 'alpha') { sum += a; continue; }
          // Composite onto white so transparent areas count as light.
          const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
          const onWhite = lum * a + (1 - a);
          sum += source === 'light' ? (a > 0 ? onWhite * a : 0) : 1 - onWhite;
        }
      coverage[r * cols + c] = sum / (SAMPLES * SAMPLES);
    }
  coverageCache.set(key, coverage);
  if (coverageCache.size > 24) coverageCache.delete(coverageCache.keys().next().value);
  return coverage;
}

// The cells to fill: those covered at least `threshold` (or not, inverted).
export function silhouetteCells(coverage, cols, rows, { threshold = 0.5, invert = false }) {
  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = coverage[r * cols + c] >= Math.max(0.01, threshold);
      if (on !== invert) cells.push(`${c},${r}`);
    }
  return cells;
}
