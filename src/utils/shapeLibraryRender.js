/**
 * shapeLibraryRender.js
 *
 * Zero-DOMParser render engine for image-mode colorization.
 * Replaces the chunked setTimeout pipeline in App.jsx with a single
 * synchronous pass of pure arithmetic + string replacement.
 *
 * For 30-60fps video, call renderImageFrame() inside requestAnimationFrame
 * with the latest imgData (from a video element snapshot), then apply
 * the returned URLs imperatively via imageRef.setAttribute('href', url)
 * to bypass React's render cycle entirely.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION — replace the two-phase useEffect in App.jsx:
 *
 *   import shapeLibraryData from '../assets/shapeLibrary.json';
 *   import { buildGridCells, renderImageFrame } from './utils/shapeLibraryRender';
 *
 *   // Derive virtual cell state once when blocks or grid geometry changes
 *   const gridCells = useMemo(
 *     () => buildGridCells(placedBlocks, gridComputed),
 *     [placedBlocks, gridComputed]
 *   );
 *
 *   // Replace the old chunked useEffect (App.jsx lines ~202-291) with:
 *   useEffect(() => {
 *     if (colorMode !== 'image' || !imagePixels || !gridCells.length) {
 *       setImageDataUrls({});
 *       return;
 *     }
 *     setImageDataUrls(
 *       renderImageFrame(gridCells, shapeLibraryData.shapes, imagePixels, workArea.width, workArea.height)
 *     );
 *   }, [colorMode, imagePixels, gridCells, workArea.width, workArea.height]);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VIDEO LOOP PATTERN (imperative, bypasses React):
 *
 *   const imageRefs = useRef({});  // blockId → <image> DOM node ref
 *
 *   useEffect(() => {
 *     if (colorMode !== 'video') return;
 *     let rafId;
 *     const tick = () => {
 *       const imgData = sampleVideoFrame(videoRef.current, workArea);
 *       const urls    = renderImageFrame(gridCells, shapeLibraryData.shapes, imgData, workArea.width, workArea.height);
 *       for (const [id, url] of Object.entries(urls)) {
 *         imageRefs.current[id]?.setAttribute('href', url);
 *       }
 *       rafId = requestAnimationFrame(tick);
 *     };
 *     rafId = requestAnimationFrame(tick);
 *     return () => cancelAnimationFrame(rafId);
 *   }, [colorMode, gridCells, workArea]);
 */

// ── Lazy library loading ──────────────────────────────────────────────────────
// shapeLibrary.json (~200KB) is only needed for image-mode colorization and
// shape-based animation — never for placing/colouring blocks via the normal
// palette/gradient/image-svg paths (those use block.svgContent directly). Load
// it asynchronously so its parse cost doesn't sit on the app's startup path;
// the dynamic import is cached so every caller shares one in-flight request.

let _shapeLibPromise = null;

export function loadShapeLibrary() {
  if (!_shapeLibPromise) {
    _shapeLibPromise = import('../assets/shapeLibrary.json').then(m => m.default);
  }
  return _shapeLibPromise;
}

// ── Key conversion ────────────────────────────────────────────────────────────

/**
 * Convert a block's assetId to the shapeLibrary.json lookup key.
 *
 * assetId format (from binPack.js / builtinAssets.js):
 *   "builtin::Default::1x1::Basic Geometric 1"
 *   "builtin::Basketball / Spurs::1x1::Por Vida 1"
 *
 * library key format (from generate-shape-library.js):
 *   "Default/1x1/Basic Geometric 1"
 *   "Basketball/Spurs/1x1/Por Vida 1"
 */
export function assetIdToLibKey(assetId) {
  if (!assetId?.startsWith('builtin::')) return null;
  const inner = assetId.slice('builtin::'.length);
  const parts = inner.split('::');
  if (parts.length < 3) return null;
  const name      = parts[parts.length - 1];
  const size      = parts[parts.length - 2];
  // theme may contain " / " separators for nested folder paths
  const themePath = parts.slice(0, -2).join('/').replace(/ \/ /g, '/');
  return `${themePath}/${size}/${name}`;
}

// ── Shape render cache ────────────────────────────────────────────────────────
// For each shape we pre-compute, once, and cache by libKey:
//   parts        — SVG template split at __SLOT_N__ markers, static segments
//                  pre-encoded (fast string-concat URL assembly for data URIs)
//   slotCenters  — [ [cx, cy], ... ] averaged anchor point per slot, in viewbox
//                  coordinates — used to derive each slot's canvas position so
//                  continuous animations can sample a colour per slot
//   innerMarkup  — template with the outer <svg> wrapper stripped and each
//                  __SLOT_N__ marker replaced with a placeholder fill plus a
//                  data-slot="N" tag, for inline (non-<image>) rendering whose
//                  fills can be mutated directly via element.style.fill
//
// This preserves multi-colour shapes (bauhaus blocks with bg/fg/accent slots).

const _shapeCache = new Map(); // libKey → { parts, slotCenters, innerMarkup }

const SVG_WRAPPER_RE = /^<svg[^>]*>([\s\S]*)<\/svg>\s*$/;
const INLINE_PLACEHOLDER_FILL = '#9ca3af';

export function getShapeCache(entry, libKey) {
  if (_shapeCache.has(libKey)) return _shapeCache.get(libKey);

  // Pre-encode static SVG segments; record slot indices as numbers in-between
  const parts = [];
  let last = 0;
  for (const m of entry.template.matchAll(/__SLOT_(\d+)__/g)) {
    parts.push(encodeURIComponent(entry.template.slice(last, m.index)));
    parts.push(+m[1]);
    last = m.index + m[0].length;
  }
  parts.push(encodeURIComponent(entry.template.slice(last)));

  // Average anchor points per slot → single representative position in viewbox space
  const slotCenters = entry.slots.map(({ pts }) => {
    if (!pts.length) return [0, 0];
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return [cx, cy];
  });

  // Inline-renderable markup: strip the outer <svg> wrapper and tag each slot
  // element with data-slot="N" so it can be queried once and its fill mutated
  // directly per frame — bypasses data-URI rebuild + <image> redecode entirely.
  const wrapped = entry.template.match(SVG_WRAPPER_RE);
  const inner = wrapped ? wrapped[1] : entry.template;
  const innerMarkup = inner.replace(
    /style="fill:__SLOT_(\d+)__"/g,
    (_, i) => `style="fill:${INLINE_PLACEHOLDER_FILL}" data-slot="${i}"`
  );

  const cached = { parts, slotCenters, innerMarkup };
  _shapeCache.set(libKey, cached);
  return cached;
}

// _shapeCache is naturally bounded — one entry per shape in the library
// (currently 112), keyed by libKey, never invalidated. Rather than let entries
// trickle in lazily (the first time each shape is animated, potentially
// mid-frame), pre-populate the whole cache once, right after the library
// loads — a few ms of string work done up front instead of as scattered
// per-shape hitches during animation.
export function warmShapeCache(shapeLib) {
  for (const [libKey, entry] of Object.entries(shapeLib)) {
    getShapeCache(entry, libKey);
  }
}

// Build a data URL using one colour per slot (indexed by slot number).
// Colours is an array; each part that is a number indexes into it.
export function buildUrlMulti(parts, colours) {
  let url = 'data:image/svg+xml;charset=utf-8,';
  for (let i = 0; i < parts.length; i++) {
    if (typeof parts[i] === 'number') {
      const c = colours[parts[i]] ?? colours[0] ?? '#000000';
      url += '%23' + c.slice(1);   // '#rrggbb' → '%23rrggbb'
    } else {
      url += parts[i];
    }
  }
  return url;
}

// ── Virtual grid state ────────────────────────────────────────────────────────

/**
 * Build the flat gridCells array from React state.
 * Memoize this with useMemo — it only needs to recompute when blocks or
 * grid geometry changes, not on every image frame.
 *
 * @param {Array}  placedBlocks  - current placedBlocks state from App.jsx
 * @param {object} gridComputed  - from computeGrid(); has cellSize, gridOriginX, gridOriginY
 * @returns {Array<GridCell>}
 *
 * GridCell: { id, libKey, cellX, cellY, cellW, cellH }
 */
export function buildGridCells(placedBlocks, gridComputed) {
  if (!gridComputed || !placedBlocks?.length) return [];
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  return placedBlocks.map(block => ({
    id:    block.id,
    libKey: assetIdToLibKey(block.assetId),
    cellX: gridOriginX + block.gridCol * cellSize,
    cellY: gridOriginY + block.gridRow * cellSize,
    cellW: block.cols * cellSize,
    cellH: block.rows * cellSize,
  }));
}

// ── Core render ───────────────────────────────────────────────────────────────

/**
 * Pure, synchronous image-mode colorization.
 * No DOMParser, no XMLSerializer, no DOM reads — only Uint8ClampedArray lookups
 * and string replacements on pre-built templates.
 *
 * @param {Array}   gridCells     - from buildGridCells()
 * @param {object}  shapeLib      - shapeLibraryData.shapes  (the .shapes sub-object from the JSON)
 * @param {object}  imgData       - { data: Uint8ClampedArray, width, height, scaleX, scaleY }
 *                                  (scaleX/scaleY = imgData.width / canvas.width, etc.)
 * @param {number}  canvasW       - workArea.width  (unscaled canvas dimensions)
 * @param {number}  canvasH       - workArea.height
 * @returns {object}  { [blockId]: dataUrl }  — drop-in replacement for imageDataUrls state
 */
export function renderImageFrame(gridCells, shapeLib, imgData, canvasW, canvasH) {
  if (!imgData || !gridCells?.length) return {};

  // imgData may be a downsampled buffer (max 512px longest side).
  // Use the stored scale factors if present, otherwise derive from dimensions.
  const scaleX = imgData.scaleX ?? (imgData.width  / canvasW);
  const scaleY = imgData.scaleY ?? (imgData.height / canvasH);

  const { data, width: iW, height: iH } = imgData;
  const result = {};

  for (const cell of gridCells) {
    if (!cell.libKey) continue;
    const entry = shapeLib[cell.libKey];
    if (!entry) continue;

    const [vbX, vbY, vbW, vbH] = entry.vb;
    const { cellX, cellY, cellW, cellH } = cell;

    // Replicate preserveAspectRatio="xMidYMid meet" letterbox geometry
    const blockScale = Math.min(cellW / vbW, cellH / vbH);
    const baseX      = cellX + (cellW - vbW * blockScale) / 2 - vbX * blockScale;
    const baseY      = cellY + (cellH - vbH * blockScale) / 2 - vbY * blockScale;

    // Sample pixels for every slot and average across that slot's anchor points
    const colors = entry.slots.map(({ pts }) => {
      if (!pts.length) return 'currentColor';

      let r = 0, g = 0, b = 0;
      for (const [ax, ay] of pts) {
        // Canvas → downsampled imgData coordinate space
        const px = Math.max(0, Math.min(Math.round((baseX + ax * blockScale) * scaleX), iW - 1));
        const py = Math.max(0, Math.min(Math.round((baseY + ay * blockScale) * scaleY), iH - 1));
        const i  = (py * iW + px) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }

      const n = pts.length;
      return (
        '#' +
        Math.round(r / n).toString(16).padStart(2, '0') +
        Math.round(g / n).toString(16).padStart(2, '0') +
        Math.round(b / n).toString(16).padStart(2, '0')
      );
    });

    // Single regex pass replaces all __SLOT_N__ markers in the pre-built template
    const svgStr = entry.template.replace(
      /__SLOT_(\d+)__/g,
      (_, i) => colors[+i] ?? 'currentColor'
    );

    result[cell.id] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  }

  return result;
}

// ── Optional: video frame capture helper ──────────────────────────────────────

/**
 * Sample a single frame from a <video> element into the same imgData format
 * that App.jsx's imagePixels state uses. Feed the result directly to renderImageFrame.
 *
 * Call this inside requestAnimationFrame — it is synchronous and fast.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {{ width: number, height: number }} workArea
 * @param {number} [maxSample=512]  - max buffer dimension (matches App.jsx default)
 * @returns {{ data: Uint8ClampedArray, width, height, scaleX, scaleY } | null}
 */
export function sampleVideoFrame(videoEl, workArea, maxSample = 512) {
  if (!videoEl || videoEl.readyState < 2) return null;  // HAVE_CURRENT_DATA = 2

  const cw = workArea.width;
  const ch = workArea.height;
  const ratio = Math.min(1, maxSample / Math.max(cw, ch));
  const sw = Math.round(cw * ratio);
  const sh = Math.round(ch * ratio);

  // Reuse a persistent off-screen canvas to avoid allocation per frame
  if (!sampleVideoFrame._canvas) {
    sampleVideoFrame._canvas = document.createElement('canvas');
    sampleVideoFrame._ctx    = sampleVideoFrame._canvas.getContext('2d', { willReadFrequently: true });
  }
  const cv  = sampleVideoFrame._canvas;
  const ctx = sampleVideoFrame._ctx;

  if (cv.width !== sw || cv.height !== sh) {
    cv.width = sw;
    cv.height = sh;
  }

  const vidAspect    = videoEl.videoWidth  / videoEl.videoHeight;
  const canvasAspect = sw / sh;
  let dw, dh, dx, dy;
  if (vidAspect > canvasAspect) {
    dh = sh; dw = dh * vidAspect; dx = (sw - dw) / 2; dy = 0;
  } else {
    dw = sw; dh = dw / vidAspect; dx = 0; dy = (sh - dh) / 2;
  }

  ctx.drawImage(videoEl, dx, dy, dw, dh);
  const { data } = ctx.getImageData(0, 0, sw, sh);
  return { data, width: sw, height: sh, scaleX: ratio, scaleY: ratio };
}
