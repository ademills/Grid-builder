/**
 * shapeLibraryRender.js
 *
 * Image colour mode helpers built on the pre-generated shape library
 * (assets/shapeLibrary.json): which colours the image gives every shape slot,
 * used to build the colour-tolerance remap. The shapes themselves are drawn by
 * ShapeCanvas (components/ShapeCanvas.jsx).
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

function sampleSlots(entry, cell, data, iW, iH, scaleX, scaleY) {
  const [vbX, vbY, vbW, vbH] = entry.vb;
  const { cellX, cellY, cellW, cellH } = cell;
  const blockScale = Math.min(cellW / vbW, cellH / vbH);
  const baseX      = cellX + (cellW - vbW * blockScale) / 2 - vbX * blockScale;
  const baseY      = cellY + (cellH - vbH * blockScale) / 2 - vbY * blockScale;

  return entry.slots.map(({ pts }) => {
    if (!pts.length) return 'currentColor';
    let r = 0, g = 0, b = 0;
    for (const [ax, ay] of pts) {
      const px = Math.max(0, Math.min(Math.round((baseX + ax * blockScale) * scaleX), iW - 1));
      const py = Math.max(0, Math.min(Math.round((baseY + ay * blockScale) * scaleY), iH - 1));
      const i  = (py * iW + px) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const n = pts.length;
    return (
      '#' +
      Math.round(r / n).toString(16).padStart(2, '0') +
      Math.round(g / n).toString(16).padStart(2, '0') +
      Math.round(b / n).toString(16).padStart(2, '0')
    );
  });
}

/**
 * Returns all sampled slot colours across all cells — used to compute the
 * colour-tolerance remap (buildColourRemap) for image colour mode.
 */
export function sampleFrameColours(gridCells, shapeLib, imgData, canvasW, canvasH) {
  if (!imgData || !gridCells?.length) return [];
  const scaleX = imgData.scaleX ?? (imgData.width  / canvasW);
  const scaleY = imgData.scaleY ?? (imgData.height / canvasH);
  const { data, width: iW, height: iH } = imgData;
  const all = [];
  for (const cell of gridCells) {
    if (!cell.libKey) continue;
    const entry = shapeLib[cell.libKey];
    if (!entry) continue;
    for (const c of sampleSlots(entry, cell, data, iW, iH, scaleX, scaleY))
      if (c !== 'currentColor') all.push(c);
  }
  return all;
}

// ── Optional: video frame capture helper ──────────────────────────────────────

/**
 * Sample a single frame from a <video> element into the same imgData format
 * that the editor's imagePixels state uses.
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
