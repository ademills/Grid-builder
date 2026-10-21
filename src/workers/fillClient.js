import { ALL_BUILTIN_ASSETS } from '../builtinAssets';

// Main-thread side of workers/fillWorker.js. Shapes travel to the worker as
// footprints only ({ id, name, cols, rows }); the SVG markup is re-attached
// to the returned blocks here, so messages stay small.

const assetMap = new Map(ALL_BUILTIN_ASSETS.map(a => [a.id, a]));
const footprint = ({ id, name, cols, rows }) => ({ id, name, cols, rows });
const strip = (b) => { const r = { ...b }; delete r.svgContent; return r; };

let worker = null;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./fillWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const resolve = pending.get(data.id);
      pending.delete(data.id);
      resolve?.(data);
    };
    worker.onerror = (e) => {
      for (const resolve of pending.values()) resolve({ error: `The fill failed: ${e.message}` });
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  return worker;
}

// Resolves to { blocks } (with svgContent) or { error }.
export function runFillInWorker({ fillId, settings, grid, assets, imagePixels, layoutMask, maxScale, scaleFreq, existing = [] }) {
  const id = ++nextId;
  const request = {
    fillId, settings, grid, maxScale, scaleFreq,
    assets: assets.map(footprint),
    imagePixels: imagePixels ? { data: imagePixels.data, width: imagePixels.width, height: imagePixels.height, scaleX: imagePixels.scaleX, scaleY: imagePixels.scaleY } : null,
    layoutMask: layoutMask ? [...layoutMask] : null,
    existing: existing.map(strip),
  };
  return new Promise((resolve) => {
    pending.set(id, (res) => {
      if (res.error) { resolve({ error: res.error }); return; }
      resolve({ blocks: res.blocks.map(b => ({ ...b, svgContent: assetMap.get(b.assetId)?.svgContent ?? b.svgContent ?? '' })) });
    });
    getWorker().postMessage({ id, request });
  });
}
