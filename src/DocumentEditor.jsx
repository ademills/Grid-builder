import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { ContextMenu } from './components/ContextMenu';
import { Dock } from './shell/Dock';
import { MODE_REGISTRY } from './modes/registry';
import { EditorContext } from './editor/EditorContext';
import { ExportDialog, ShortcutsDialog } from './editor/Dialogs';
import { AnimationLayer, ANIM_FILTER_ID } from './components/AnimationLayer';
import { createAudioAnalyser } from './utils/audioAnalysis';
import { Grid } from './components/Grid';
import { PlacedBlocks } from './components/PlacedBlocks';
import { SelectionToolbar } from './components/SelectionToolbar';
import { PRESETS, computeGrid, getValidCols } from './gridPresets';
import { fillGrid, fillMasked } from './utils/binPack';
import { computeGlitchMask } from './utils/glitchFill';
import { computeStripMask, computeMultiStripMask } from './utils/stripFill';
import { extractPalette } from './utils/kmeans';
import { computeEdgeMask } from './utils/edgeFill';
import { computeBrightnessMask } from './utils/brightnessFill';
import { computeNoiseMask } from './utils/noiseFill';
import { computeGeometricMask } from './utils/geometricFill';
import { computeHalftoneMask } from './utils/halftoneFill';
import { computeVoronoiMask } from './utils/voronoiFill';
import { computeSpiralMask } from './utils/spiralFill';
import { computeFlowFieldMask } from './utils/flowFieldFill';
import { computeFractalMask } from './utils/fractalFill';
import { generateMondrianLayout } from './utils/mondrianFill';
import { generateGoldenLayout } from './utils/goldenFill';
import { composeKnotworkSvg } from './utils/knotworkCompose';
import { LAYOUTS, computeGridMask, buildWireframeBlocks, wireframeRects } from './utils/layouts';
import { colorizeSvg, colorizeSvgByImage, buildColourRemap, applyColorTemperatureShift } from './utils/colorize';
import { save as tauriSaveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { buildGridCells, renderImageFrame, sampleFrameColours, loadShapeLibrary, warmShapeCache } from './utils/shapeLibraryRender';
import { ALL_BUILTIN_ASSETS } from './builtinAssets';
import { useHistory } from './hooks/useHistory';
import { isTauri } from './shell/fileIO';
import { useDocField, useDocId } from './store/useDocField';
import { useAppStore } from './store/appStore';
import { buildSwatchMap, resolvePins, blockColourBreakdown, blockSlotColours, dominantColour } from './utils/blockColours';
import { shapeTransform, unTransformUV, rotateBlock } from './utils/blockTransform';
import { slotAt } from './utils/slotCoverage';
import { useColorPalette } from './hooks/useColorPalette';
import { useSelection } from './hooks/useSelection';
import './App.css';
import styles from './DocumentEditor.module.css';


// Replace fill="#rrggbb" and fill:#rrggbb in style attrs using a colour remap map.
function applyFillRemap(svgStr, remap) {
  if (!remap) return svgStr;
  return svgStr
    .replace(/fill="(#[0-9a-fA-F]{3,8})"/g, (m, c) => {
      const mapped = remap[c.toLowerCase()];
      return mapped ? `fill="${mapped}"` : m;
    })
    .replace(/(fill\s*:\s*)(#[0-9a-fA-F]{3,8})/g, (m, prefix, c) => {
      const mapped = remap[c.toLowerCase()];
      return mapped ? `${prefix}${mapped}` : m;
    });
}

// Loads an image src (data URL or file URL) into a downsized pixel buffer,
// used for palette extraction from the background image layer.
function loadImagePixels(src, maxSample = 512) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSample / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      resolve({ data, width: w, height: h });
    };
    img.onerror = reject;
    img.src = src;
  });
}

const FLAT_SVG_NS = 'http://www.w3.org/2000/svg';
const FLAT_SVG_EXPORT_UNIT = 500;

// Builds the assembled flat SVG element from placed blocks. Returns { svgEl, exportW, exportH }.
// Called from both handleExport (download) and handleExportSeparated (send to worker).
// `layer` selects which part of the composition to build:
//  - 'all'        — background + backdrop + blocks, with mix-blend-mode applied (default, used for SVG export)
//  - 'background' — background + backdrop only, no blocks
//  - 'shapes'     — blocks only, no background/backdrop, no blend-mode styling
// Splitting into layers lets raster export composite them with canvas
// globalCompositeOperation instead of relying on in-SVG mix-blend-mode,
// which avoids antialiasing seam artefacts at shape boundaries.
function buildFlatSvgElement({
  placedBlocks, workArea, gridComputed, colorMode, activePalette, activeBgColors,
  canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled, colourRemap,
  backdropSrc, backdropSettings, blendMode, layer = 'all', includeWireframes = false, swatchMap,
}) {
  // Hidden layers (Layers panel) are left out of every export.
  placedBlocks = placedBlocks.filter(b => !b.hidden);
  const { width, height } = workArea;
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const unitPerPx = FLAT_SVG_EXPORT_UNIT / cellSize;
  const exportW = Math.round(width  * unitPerPx);
  const exportH = Math.round(height * unitPerPx);
  const exportMX = Math.round(gridOriginX * unitPerPx);
  const exportMY = Math.round(gridOriginY * unitPerPx);
  const parser = new DOMParser();
  const palette = activePalette;

  const flattenStyles = (doc) => {
    const root = doc.documentElement;
    const map = {};
    root.querySelectorAll('style').forEach(s => {
      for (const [, cls, fill] of (s.textContent || '').matchAll(
        /\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs
      )) map[cls] = fill.trim();
    });
    if (!Object.keys(map).length) return;
    root.querySelectorAll('rect,circle,ellipse,path,polygon,polyline,line').forEach(el => {
      const cls = (el.getAttribute('class') || '').trim().split(/\s+/);
      const cssFill = cls.map(c => map[c]).find(v => v !== undefined);
      if (cssFill === undefined) return;
      const style = el.getAttribute('style') || '';
      if (!/\bfill\s*:/.test(style))
        el.setAttribute('style', `${style}${style ? ';' : ''}fill:${cssFill}`);
    });
    root.querySelectorAll('style').forEach(s => s.remove());
  };

  const out = document.createElementNS(FLAT_SVG_NS, 'svg');
  out.setAttribute('xmlns', FLAT_SVG_NS);
  out.setAttribute('width', String(width));
  out.setAttribute('height', String(height));
  out.setAttribute('viewBox', `0 0 ${exportW} ${exportH}`);
  if (layer === 'all' && blendMode && blendMode !== 'normal') {
    out.style.isolation = 'isolate';
  }

  if (layer !== 'shapes') {
  const bgRect = document.createElementNS(FLAT_SVG_NS, 'rect');
  bgRect.setAttribute('width', String(exportW));
  bgRect.setAttribute('height', String(exportH));
  bgRect.setAttribute('fill', canvasBg);
  out.appendChild(bgRect);

  if (backdropSrc && backdropSettings?.mode === 'backdrop') {
    const bdImg = document.createElementNS(FLAT_SVG_NS, 'image');
    bdImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', backdropSrc);
    bdImg.setAttribute('href', backdropSrc);
    bdImg.setAttribute('x', '0');
    bdImg.setAttribute('y', '0');
    bdImg.setAttribute('width', String(exportW));
    bdImg.setAttribute('height', String(exportH));
    bdImg.setAttribute('preserveAspectRatio',
      backdropSettings.fit === 'cover' ? 'xMidYMid slice'
      : backdropSettings.fit === 'stretch' ? 'none'
      : 'xMidYMid meet');
    bdImg.setAttribute('opacity', String(backdropSettings.opacity));
    out.appendChild(bdImg);

    if (backdropSettings.tintOpacity > 0) {
      const tintRect = document.createElementNS(FLAT_SVG_NS, 'rect');
      tintRect.setAttribute('x', '0');
      tintRect.setAttribute('y', '0');
      tintRect.setAttribute('width', String(exportW));
      tintRect.setAttribute('height', String(exportH));
      tintRect.setAttribute('fill', backdropSettings.tintColour);
      tintRect.setAttribute('opacity', String(backdropSettings.tintOpacity));
      out.appendChild(tintRect);
    }
  }
  }

  if (layer === 'background') {
    return { svgEl: out, exportW, exportH };
  }

  const blocksGroup = document.createElementNS(FLAT_SVG_NS, 'g');
  if (layer === 'all' && blendMode && blendMode !== 'normal') {
    blocksGroup.style.mixBlendMode = blendMode;
    blocksGroup.style.isolation = 'isolate';
  }
  out.appendChild(blocksGroup);

  placedBlocks.forEach(block => {
    const imgBx = gridOriginX + block.gridCol * cellSize;
    const imgBy = gridOriginY + block.gridRow * cellSize;
    const imgBw = block.cols * cellSize;
    const imgBh = block.rows * cellSize;
    const bx = exportMX + block.gridCol * FLAT_SVG_EXPORT_UNIT;
    const by = exportMY + block.gridRow * FLAT_SVG_EXPORT_UNIT;
    const bw = block.cols * FLAT_SVG_EXPORT_UNIT;
    const bh = block.rows * FLAT_SVG_EXPORT_UNIT;

    // Wireframe placeholders are a reference overlay — never part of the normal
    // export; handled separately below when includeWireframes is set.
    if (block.type === 'wireframe') return;

    // Image elements export as a native <image> (works in vector and raster).
    if (block.type === 'image') {
      if (!block.imageSrc) return;

      // If the "image" is actually inline SVG markup encoded as a data URI
      // (e.g. a generated vector design like a Knotwork fill, which reuses
      // this same generic block-placement pipeline), export it as genuine
      // inline SVG rather than a nested <image> reference. Browsers render
      // a nested image/svg+xml data URI fine, but many vector tools --
      // Illustrator in particular -- do not reliably rasterise it, and the
      // export comes out blank there even though it looks correct here.
      const isSvgDataUri = block.imageSrc.startsWith('data:image/svg+xml');
      const commaIdx = isSvgDataUri ? block.imageSrc.indexOf(',') : -1;
      if (commaIdx !== -1) {
        const svgText = decodeURIComponent(block.imageSrc.slice(commaIdx + 1));
        const blockDoc = parser.parseFromString(svgText, 'image/svg+xml');
        if (!blockDoc.querySelector('parsererror')) {
          const blockRoot = blockDoc.documentElement;
          let vbX = 0, vbY = 0, vbW, vbH;
          const vbStr = blockRoot.getAttribute('viewBox');
          if (vbStr) {
            const p = vbStr.trim().split(/[\s,]+/).map(Number);
            [vbX, vbY, vbW, vbH] = p;
          } else {
            vbW = parseFloat(blockRoot.getAttribute('width') || String(bw));
            vbH = parseFloat(blockRoot.getAttribute('height') || String(bh));
          }
          const scale = Math.min(bw / vbW, bh / vbH);
          const tx = bx + (bw - vbW * scale) / 2 - vbX * scale;
          const ty = by + (bh - vbH * scale) / 2 - vbY * scale;
          const g = document.createElementNS(FLAT_SVG_NS, 'g');
          g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
          for (const child of [...blockRoot.childNodes]) g.appendChild(document.importNode(child, true));
          blocksGroup.appendChild(g);
          return;
        }
        // Fall through to <image> below as a safety net if parsing failed.
      }

      const imgEl = document.createElementNS(FLAT_SVG_NS, 'image');
      imgEl.setAttribute('href', block.imageSrc);
      imgEl.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', block.imageSrc);
      imgEl.setAttribute('x', String(bx));
      imgEl.setAttribute('y', String(by));
      imgEl.setAttribute('width', String(bw));
      imgEl.setAttribute('height', String(bh));
      imgEl.setAttribute('preserveAspectRatio',
        block.imageFit === 'cover' ? 'xMidYMid slice'
        : block.imageFit === 'stretch' ? 'none'
        : 'xMidYMid meet');
      blocksGroup.appendChild(imgEl);
      return;
    }

    // Text elements export as a foreignObject (vector SVG; may not rasterise).
    if (block.type === 'text') {
      const fo = document.createElementNS(FLAT_SVG_NS, 'foreignObject');
      fo.setAttribute('x', String(bx));
      fo.setAttribute('y', String(by));
      fo.setAttribute('width', String(bw));
      fo.setAttribute('height', String(bh));
      const div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      div.setAttribute('style', [
        'width:100%', 'height:100%', 'display:flex', 'flex-direction:column',
        `align-items:${block.textAlign === 'left' ? 'flex-start' : block.textAlign === 'right' ? 'flex-end' : 'center'}`,
        `justify-content:${block.textVAlign === 'flex-start' ? 'flex-start' : block.textVAlign === 'flex-end' ? 'flex-end' : 'center'}`,
        `font-family:${block.fontFamily ?? 'sans-serif'}`,
        `font-size:${block.fontSize === 'auto' || !block.fontSize ? Math.max(8, Math.min(bw, bh) * 0.35) : block.fontSize}px`,
        `font-weight:${block.fontWeight ?? 700}`,
        `font-style:${block.fontStyle ?? 'normal'}`,
        `color:${block.textColor ?? '#000000'}`,
        `text-align:${block.textAlign ?? 'center'}`,
        `line-height:${block.lineHeight ?? 1.15}`,
        `letter-spacing:${block.letterSpacing != null ? block.letterSpacing + 'em' : 'normal'}`,
        `text-transform:${block.textTransform ?? 'none'}`,
        'word-break:break-word', 'box-sizing:border-box', `padding:${bh * 0.06}px ${bw * 0.06}px`,
      ].join(';'));
      div.textContent = block.text ?? '';
      fo.appendChild(div);
      if (block.rotation) fo.setAttribute('transform', `rotate(${block.rotation} ${bx + bw / 2} ${by + bh / 2})`);
      blocksGroup.appendChild(fo);
      return;
    }

    const blockPalette = (randomReverseEnabled && block.reverseColor) ? [...palette].reverse() : palette;
    let svgText;
    if (colorMode === 'image') {
      svgText = colorizeSvgByImage(block.svgContent, imgBx, imgBy, imgBw, imgBh, imagePixels);
      if (colourRemap) svgText = applyFillRemap(svgText, colourRemap);
    } else if (colorMode !== 'none' || block.slotPins) {
      svgText = colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, activeBgColors,
        colorMode === 'gradient' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...activeGradientSettings } : null,
        colorMode === 'mesh' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...meshSettings } : null,
        resolvePins(block, swatchMap ?? {}));
    } else {
      svgText = block.svgContent;
    }

    const blockDoc = parser.parseFromString(svgText, 'image/svg+xml');
    if (blockDoc.querySelector('parsererror')) return;
    flattenStyles(blockDoc);
    const blockRoot = blockDoc.documentElement;

    let vbX = 0, vbY = 0, vbW, vbH;
    const vbStr = blockRoot.getAttribute('viewBox');
    if (vbStr) {
      const p = vbStr.trim().split(/[\s,]+/).map(Number);
      [vbX, vbY, vbW, vbH] = p;
    } else {
      vbW = parseFloat(blockRoot.getAttribute('width')  || String(bw));
      vbH = parseFloat(blockRoot.getAttribute('height') || String(bh));
    }

    const scale = Math.min(bw / vbW, bh / vbH);
    const tx = bx + (bw - vbW * scale) / 2 - vbX * scale;
    const ty = by + (bh - vbH * scale) / 2 - vbY * scale;

    const g = document.createElementNS(FLAT_SVG_NS, 'g');
    // Rotate / Reflect tool transform (about the block centre) wraps the fit.
    const blockT = shapeTransform(block, bx, by, bw, bh);
    g.setAttribute('transform', `${blockT ? `${blockT} ` : ''}translate(${tx},${ty}) scale(${scale})`);
    for (const child of [...blockRoot.childNodes]) g.appendChild(document.importNode(child, true));
    blocksGroup.appendChild(g);
  });

  // Optional reference layer: the wireframe placeholders, drawn on top of
  // everything else. Off by default so normal exports contain only artwork.
  if (includeWireframes) {
    const refGroup = document.createElementNS(FLAT_SVG_NS, 'g');
    refGroup.setAttribute('data-reference-layer', 'true');
    refGroup.setAttribute('id', 'layout-reference');
    for (const block of placedBlocks) {
      if (block.type !== 'wireframe') continue;
      const bx = exportMX + block.gridCol * FLAT_SVG_EXPORT_UNIT;
      const by = exportMY + block.gridRow * FLAT_SVG_EXPORT_UNIT;
      const bw = block.cols * FLAT_SVG_EXPORT_UNIT;
      const bh = block.rows * FLAT_SVG_EXPORT_UNIT;
      const blockG = document.createElementNS(FLAT_SVG_NS, 'g');
      if (block.rotation) blockG.setAttribute('transform', `rotate(${block.rotation} ${bx + bw / 2} ${by + bh / 2})`);
      const bg = document.createElementNS(FLAT_SVG_NS, 'rect');
      bg.setAttribute('x', String(bx)); bg.setAttribute('y', String(by));
      bg.setAttribute('width', String(bw)); bg.setAttribute('height', String(bh));
      bg.setAttribute('fill', 'rgba(0,0,0,0.04)');
      blockG.appendChild(bg);
      for (const r of wireframeRects(block.slotRole, block.align)) {
        const rect = document.createElementNS(FLAT_SVG_NS, 'rect');
        rect.setAttribute('x', String(bx + r.x * bw));
        rect.setAttribute('y', String(by + r.y * bh));
        rect.setAttribute('width', String(r.w * bw));
        rect.setAttribute('height', String(r.h * bh));
        rect.setAttribute('rx', String(Math.min(bw, bh) * 0.015));
        rect.setAttribute('fill', `rgba(0,0,0,${r.shade})`);
        blockG.appendChild(rect);
      }
      refGroup.appendChild(blockG);
    }
    out.appendChild(refGroup);
  }

  return { svgEl: out, exportW, exportH };
}

// Rasterizes a serialized SVG string to a canvas at the given output pixel size.
// Renders at `supersample`x the output size first, then downscales with high-quality
// smoothing — this averages out the hairline antialiasing seams that appear between
// adjacent shapes when rasterizing directly at 1x.
function rasterizeSvgToCanvas(svgString, outWidth, outHeight, supersample = 1) {
  return new Promise((resolve, reject) => {
    const renderWidth = outWidth * supersample;
    const renderHeight = outHeight * supersample;
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = renderWidth;
      renderCanvas.height = renderHeight;
      const rctx = renderCanvas.getContext('2d');
      rctx.drawImage(img, 0, 0, renderWidth, renderHeight);
      URL.revokeObjectURL(url);

      if (renderWidth === outWidth && renderHeight === outHeight) {
        resolve(renderCanvas);
        return;
      }
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = outWidth;
      finalCanvas.height = outHeight;
      const fctx = finalCanvas.getContext('2d');
      fctx.imageSmoothingEnabled = true;
      fctx.imageSmoothingQuality = 'high';
      fctx.drawImage(renderCanvas, 0, 0, outWidth, outHeight);
      resolve(finalCanvas);
    };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to encode image')), mimeType, quality);
  });
}

// Triggers a browser download for a blob (non-Tauri environments).
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const MAX_CANVAS_DIMENSION = 16384;

const DEFAULT_VIEW = { x: 0, y: 0, scale: 1 };

const isTypingTarget = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// The editor for one open document. All document state lives in the
// document store (read via useDocField); the shell mounts one editor at a
// time, keyed by document id, so per-document effects start fresh on every
// tab switch instead of reacting to the previous document's values.
export function DocumentEditor({ mode: appMode }) {
  const docId = useDocId();
  const [storedView, setViewTransform] = useDocField('viewTransform');
  const viewTransform = storedView ?? DEFAULT_VIEW;
  const [viewportSize, setViewportSize] = useState(null);
  const activeTool = useAppStore(s => s.toolOverride ?? s.activeTool);
  const [bgColor] = useDocField('bgColor');
  const [canvasBg, setCanvasBg] = useDocField('canvasBg');
  const [maxScale] = useDocField('maxScale');
  const [scaleFreq] = useDocField('scaleFreq');

  // Work area
  const [presetKey] = useDocField('presetKey');
  const [customSize] = useDocField('customSize');

  const presetData = PRESETS.find(p => p.key === presetKey);
  // Memoized so callbacks depending on it (and the shell bridge built from
  // them) keep a stable identity between renders.
  const workArea = useMemo(
    () => (presetKey === 'custom' ? customSize : { width: presetData.width, height: presetData.height }),
    [presetKey, customSize, presetData]
  );

  // Grid settings
  const [gridSettings, setGridSettings] = useDocField('gridSettings');

  const validCols = useMemo(
    // Meander mode gets a higher column ceiling than Grid Builder mode --
    // fine-grained letter placement (knotworkTextMask.js) benefits from
    // more columns than the shape-grid side typically needs.
    () => getValidCols(workArea, gridSettings.borderPct, appMode === 'knotwork' ? 160 : 80),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workArea.width, workArea.height, gridSettings.borderPct, appMode]
  );

  useEffect(() => {
    if (!validCols) return;
    setGridSettings(prev => {
      if (validCols.includes(prev.cols)) return prev;
      const nearest = validCols.reduce((a, b) =>
        Math.abs(b - prev.cols) < Math.abs(a - prev.cols) ? b : a
      );
      return { ...prev, cols: nearest };
    });
  }, [validCols]);

  const gridComputed = useMemo(
    () => computeGrid(workArea, gridSettings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workArea.width, workArea.height, gridSettings.cols, gridSettings.borderPct]
  );

  // Visible canvas-space rectangle, derived from the on-screen viewport size
  // and current pan/zoom — lets PlacedBlocks render only blocks that are
  // actually on screen (plus a cell-sized overscan margin) instead of every
  // placed block regardless of whether it's visible. Quantized to whole grid
  // cells so the rect's edges land on cell boundaries — blocks don't pop in
  // mid-cell at the overscan edge, and the bounds stay stable across the
  // sub-cell pan deltas that dominate a smooth drag.
  const visibleRect = useMemo(() => {
    if (!viewportSize || !gridComputed) return null;
    const { x, y, scale } = viewTransform;
    const cellSize = gridComputed.cellSize || 1;
    const margin = cellSize * 2;
    return {
      left:   Math.floor((-x / scale - margin) / cellSize) * cellSize,
      top:    Math.floor((-y / scale - margin) / cellSize) * cellSize,
      right:  Math.ceil(((-x + viewportSize.width)  / scale + margin) / cellSize) * cellSize,
      bottom: Math.ceil(((-y + viewportSize.height) / scale + margin) / cellSize) * cellSize,
    };
  }, [viewTransform, viewportSize, gridComputed]);

  // Colour palette
  const {
    colorMode,
    shapeColors, setShapeColors,
    bgColors, setBgColors,
    effectivePalette,
    activeBgColors,
  } = useColorPalette();

  // Uniform reverse
  const [uniformReverse] = useDocField('uniformReverse');
  const [randomReverseEnabled] = useDocField('randomReverseEnabled');
  const [randomReversePct] = useDocField('randomReversePct');

  // Colour temperature shift: -100 (cool) .. 0 (off) .. 100 (warm)
  const [colorTempShift] = useDocField('colorTempShift');

  // Global block blend mode (CSS/SVG mix-blend-mode on the placed-blocks layer)
  const [blendMode] = useDocField('blendMode');

  const activePalette = useMemo(() => {
    const base = uniformReverse && colorMode === 'uniform' ? [...effectivePalette].reverse() : effectivePalette;
    return applyColorTemperatureShift(base, colorTempShift);
  }, [uniformReverse, colorMode, effectivePalette, colorTempShift]);

  // Document swatches by id — what block pins resolve against.
  const swatchMap = useMemo(() => buildSwatchMap(shapeColors, bgColors), [shapeColors, bgColors]);

  const handleRandomReverse = useCallback(() => {
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      reverseColor: Math.random() * 100 < randomReversePct,
    })));
  }, [randomReversePct]);

  const handleRandomRerun = useCallback(() => {
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
    })));
  }, []);

  // Gradient
  const [gradientSettings] = useDocField('gradientSettings');

  const activeGradientSettings = useMemo(() => ({
    ...gradientSettings,
    gradBgColors: (gradientSettings.gradBgColors ?? []).filter(c => c.enabled).map(c => c.hex),
  }), [gradientSettings]);

  // Gradient mesh
  const [meshSettings] = useDocField('meshSettings');

  // Glitch fill
  const [glitchSettings] = useDocField('glitchSettings');

  // Strip fill
  const [stripSettings] = useDocField('stripSettings');

  // Multi-strip / slash fill
  const [multiStripSettings] = useDocField('multiStripSettings');

  // Edge Trace fill
  const [edgeSettings] = useDocField('edgeSettings');

  // Brightness fill
  const [brightnessSettings] = useDocField('brightnessSettings');

  // Noise Field fill
  const [noiseSettings] = useDocField('noiseSettings');

  // Geometric Pattern fill
  const [geometricSettings] = useDocField('geometricSettings');

  // Experimental fills
  const [halftoneSettings] = useDocField('halftoneSettings');

  const [voronoiSettings] = useDocField('voronoiSettings');

  const [spiralSettings] = useDocField('spiralSettings');

  const [flowFieldSettings] = useDocField('flowFieldSettings');

  const [fractalSettings] = useDocField('fractalSettings');

  const [knotworkSettings, setKnotworkSettings] = useDocField('knotworkSettings');

  // Single-motif seamless-tile preview toggle -- see tilePreviewDataUri
  // below and the 3x3 preview rendered into Canvas's overlay slot.
  const [showTilePreview] = useDocField('showTilePreview');

  const [mondrianSettings] = useDocField('mondrianSettings');

  const [goldenSettings] = useDocField('goldenSettings');

  // Predetermined wireframe layouts. The active layout's grid slot becomes a
  // fill mask for the main Fill button; its other slots render as wireframes.
  const [activeLayoutId, setActiveLayoutId] = useDocField('activeLayoutId');
  const activeLayout = useMemo(
    () => LAYOUTS.find(l => l.id === activeLayoutId) ?? null,
    [activeLayoutId]
  );
  const layoutGridMask = useMemo(
    () => (activeLayout && gridComputed) ? computeGridMask(activeLayout, gridComputed) : null,
    [activeLayout, gridComputed]
  );

  // Built-in asset enable/disable
  const [enabledAssetIds] = useDocField('enabledAssetIds');


  const activeAssets = useMemo(
    () => ALL_BUILTIN_ASSETS.filter(a => enabledAssetIds.has(a.id)),
    [enabledAssetIds]
  );

  const [placedBlocks, setPlacedBlocks] = useDocField('placedBlocks');
const [autoFill] = useDocField('autoFill');
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Background image layer (reference / backdrop)
  const [backdropSrc] = useDocField('backdropSrc');
  const [backdropSettings] = useDocField('backdropSettings');

  // Pixel buffer for the backdrop image, used by the Palette Extractor.
  const [backdropPixels, setBackdropPixels] = useState(null);
  useEffect(() => {
    if (!backdropSrc) { setBackdropPixels(null); return; }
    let cancelled = false;
    loadImagePixels(backdropSrc).then(px => { if (!cancelled) setBackdropPixels(px); }).catch(() => {});
    return () => { cancelled = true; };
  }, [backdropSrc]);

  // Image colour mode
  const [imageSrc] = useDocField('imageSrc');
  const [imagePixels, setImagePixels] = useState(null);
  const [imageDataUrls, setImageDataUrls] = useState({});
  const [imageProgress, setImageProgress] = useState(null);
  const [imageColourTolerance] = useDocField('imageColourTolerance');

  // Palette Extractor
  const [paletteExtractSettings] = useDocField('paletteExtractSettings');
  const extractedPalette = useMemo(() => {
    const px = paletteExtractSettings.extractFrom === 'backdrop' ? backdropPixels : imagePixels;
    if (!px) return [];
    return extractPalette(px, paletteExtractSettings.numColours);
  }, [paletteExtractSettings.extractFrom, paletteExtractSettings.numColours, backdropPixels, imagePixels]);
  const handleApplyExtractedToShapes = useCallback(() => {
    if (!extractedPalette.length) return;
    setShapeColors(extractedPalette.map((hex, i) => ({ id: `extract-${i}`, hex, enabled: true, source: 'custom' })));
  }, [extractedPalette, setShapeColors]);
  const handleApplyExtractedToBg = useCallback(() => {
    if (!extractedPalette.length) return;
    setBgColors(extractedPalette.map((hex, i) => ({ id: `extract-bg-${i}`, hex, enabled: true })));
  }, [extractedPalette, setBgColors]);

  // Animation
  const [animSettings] = useDocField('animSettings');
  const imageRefsMap = useRef({});
  const slotRefsMap = useRef({});

  // Audio Reactive Mode
  const [audioSettings] = useDocField('audioSettings');
  const [audioFileSrc, setAudioFileSrc] = useState(null);
  const audioDataRef = useRef({ amplitude: 0, bands: [0, 0, 0, 0], beat: false });
  const audioFileElRef = useRef(null);

  // Manage the audio analyser lifecycle: start it (mic or file) when audio
  // reactive mode is enabled, tear it down when disabled or the source changes.
  useEffect(() => {
    if (!audioSettings.enabled) return;

    let analyserCtl = null;
    let rafId = null;
    let cancelled = false;

    const loop = () => {
      if (!analyserCtl) return;
      const state = analyserCtl.update(audioSettings.beatSensitivity);
      audioDataRef.current = { amplitude: state.amplitude, bands: state.bands, beat: state.beat };
      rafId = requestAnimationFrame(loop);
    };

    if (audioSettings.inputSource === 'mic') {
      navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        analyserCtl = createAudioAnalyser(stream);
        analyserCtl._stream = stream;
        loop();
      }).catch(err => {
        console.error('Microphone access denied:', err);
      });
    } else if (audioSettings.inputSource === 'file' && audioFileElRef.current) {
      const el = audioFileElRef.current;
      analyserCtl = createAudioAnalyser(el);
      el.play().catch(() => {});
      loop();
    }

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (analyserCtl) {
        analyserCtl._stream?.getTracks().forEach(t => t.stop());
        analyserCtl.stop();
      }
      audioDataRef.current = { amplitude: 0, bands: [0, 0, 0, 0], beat: false };
    };
  }, [audioSettings.enabled, audioSettings.inputSource, audioSettings.beatSensitivity, audioFileSrc]);

  // shapeLibrary.json (~200KB) is only needed for image-mode colorization and
  // shape-based animation, never for normal block placement/colouring — load
  // it off the startup path and warm its render cache once it's ready.
  const [shapeLibrary, setShapeLibrary] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadShapeLibrary().then(lib => {
      if (cancelled) return;
      setShapeLibrary(lib);
      warmShapeCache(lib.shapes);
    });
    return () => { cancelled = true; };
  }, []);

  // Step 1: extract pixel buffer when image or work area changes
  useEffect(() => {
    if (colorMode !== 'image' || !imageSrc) {
      setImagePixels(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      const cw = workArea.width;
      const ch = workArea.height;
      // Downsample to at most 512px on the longest side — colour sampling
      // needs only rough per-block colour; smaller buffer = much faster
      // getImageData and ready for per-frame video sampling later.
      const MAX_SAMPLE = 512;
      const ratio = Math.min(1, MAX_SAMPLE / Math.max(cw, ch));
      const sw = Math.round(cw * ratio);
      const sh = Math.round(ch * ratio);
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      const ctx = cv.getContext('2d');
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = sw / sh;
      let dw, dh, dx, dy;
      if (imgAspect > canvasAspect) {
        dh = sh; dw = dh * imgAspect; dx = (sw - dw) / 2; dy = 0;
      } else {
        dw = sw; dh = dw / imgAspect; dx = 0; dy = (sh - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      const { data } = ctx.getImageData(0, 0, sw, sh);
      setImagePixels({ data, width: sw, height: sh, scaleX: ratio, scaleY: ratio });
    };
    img.src = imageSrc;
    return () => { img.onload = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, imageSrc, workArea.width, workArea.height]);

  // Virtual cell state — flat array of { id, libKey, cellX, cellY, cellW, cellH }.
  // Memoized so it only recomputes on block or grid geometry changes, not image changes.
  const gridCells = useMemo(
    () => buildGridCells(placedBlocks, gridComputed),
    [placedBlocks, gridComputed]
  );

  // Colour-tolerance remap for image mode — computed from sampled slot colours so the
  // slider live-updates the preview without a separate full render pass.
  const imageColourRemap = useMemo(() => {
    if (colorMode !== 'image' || !imagePixels || !gridCells.length || !shapeLibrary || imageColourTolerance <= 0)
      return null;
    const allFills = sampleFrameColours(gridCells, shapeLibrary.shapes, imagePixels, workArea.width, workArea.height);
    return buildColourRemap(allFills, imageColourTolerance) ?? null;
  }, [colorMode, imagePixels, gridCells, shapeLibrary, imageColourTolerance, workArea.width, workArea.height]);

  // Image colour mode — pure arithmetic pass against the pre-built shape library.
  // Pre-clears old URLs so the browser frees decoded SVG bitmaps before allocating new ones,
  // then defers the computation one rAF so it doesn't block the React render cycle.
  useEffect(() => {
    if (colorMode !== 'image' || !imagePixels || !gridCells.length || !shapeLibrary) {
      setImageDataUrls({});
      setImageProgress(null);
      return;
    }
    // Clear old data URLs first — lets the browser release old decoded SVG bitmaps before
    // we allocate a new set, halving peak GPU/browser-side memory usage.
    setImageDataUrls({});
    const snapPixels = imagePixels;
    const snapCells  = gridCells;
    const snapW      = workArea.width;
    const snapH      = workArea.height;
    const snapLib    = shapeLibrary;
    const snapRemap  = imageColourRemap;
    const rafId = requestAnimationFrame(() => {
      setImageDataUrls(
        renderImageFrame(snapCells, snapLib.shapes, snapPixels, snapW, snapH, snapRemap)
      );
      setImageProgress(null);
    });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, imagePixels, gridCells, workArea.width, workArea.height, shapeLibrary, imageColourRemap]);

  // ── History ────────────────────────────────────────────────────────────────
  const {
    pushHistory,
    handleUndo: _handleUndo,
    handleRedo: _handleRedo,
    historySize,
    syncHistorySize,
    clearHistory,
  } = useHistory(docId, placedBlocks, setPlacedBlocks);

  // ── Selection ──────────────────────────────────────────────────────────────
  const {
    selectedIds, setSelectedIds,
    selectedBlocks,
    contextMenu, setContextMenu,
    handleSelectBlock, handleDeselectAll,
    handleOpenContextMenu,
    handleContextRefresh, handleContextRandomise, handleContextToggleLock, handleContextDelete,
    handleMarqueeSelect,
    handleDeleteSelected, handleRefreshSelected, handleRandomiseSelected,
    handleFlipH, handleFlipV,
    handleToggleLockSelected, handleSwapSelected,
  } = useSelection({
    placedBlocks, setPlacedBlocks,
    gridComputed, viewTransform,
    activeAssets, colorMode,
    pushHistory, syncHistorySize,
  });

  // Wrap undo/redo to also clear selection
  const handleUndo = useCallback(() => {
    _handleUndo();
    setSelectedIds(new Set());
  }, [_handleUndo, setSelectedIds]);

  const handleRedo = useCallback(() => {
    _handleRedo();
    setSelectedIds(new Set());
  }, [_handleRedo, setSelectedIds]);

  // When grid geometry changes: attempt proportional rescale, clear if incompatible
  const prevGridRef = useRef(null);
  const placedBlocksRef = useRef(placedBlocks);
  useEffect(() => { placedBlocksRef.current = placedBlocks; }, [placedBlocks]);

  useEffect(() => {
    const prev = prevGridRef.current;
    prevGridRef.current = gridComputed;

    if (!gridComputed) { setPlacedBlocks(p => (p.length ? [] : p)); return; }
    if (!prev || !placedBlocksRef.current.length) return;
    if (prev.cols === gridComputed.cols && prev.rows === gridComputed.rows) return;

    const scaleC = gridComputed.cols / prev.cols;
    const scaleR = gridComputed.rows / prev.rows;

    const rescaled = placedBlocksRef.current.map(b => ({
      ...b,
      gridCol: Math.round(b.gridCol * scaleC),
      gridRow: Math.round(b.gridRow * scaleR),
    }));

    const fits = rescaled.every(b =>
      b.gridCol >= 0 && b.gridCol + b.cols <= gridComputed.cols &&
      b.gridRow >= 0 && b.gridRow + b.rows <= gridComputed.rows
    );

    const occupied = new Set();
    const noOverlap = fits && rescaled.every(b => {
      for (let r = 0; r < b.rows; r++)
        for (let c = 0; c < b.cols; c++) {
          const key = `${b.gridCol + c},${b.gridRow + r}`;
          if (occupied.has(key)) return false;
          occupied.add(key);
        }
      return true;
    });

    if (noOverlap) {
      setPlacedBlocks(rescaled);
    } else {
      setPlacedBlocks([]);
      clearHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridComputed?.cols, gridComputed?.rows, gridComputed?.cellSize]);

  // Auto-fill when settings change — debounced 150ms so rapid slider drags don't spam binPack
  const autoFillRef = useRef(autoFill);
  useEffect(() => { autoFillRef.current = autoFill; }, [autoFill]);
  const activeAssetsRef = useRef(activeAssets);
  useEffect(() => { activeAssetsRef.current = activeAssets; }, [activeAssets]);
  const autoFillTimerRef = useRef(null);
  // Only re-fill when the settings actually change — not when the editor
  // mounts (e.g. switching to this document's tab).
  const autoFillKeyRef = useRef(null);

  useEffect(() => {
    const key = `${gridComputed?.cols},${gridComputed?.rows},${gridComputed?.cellSize},${maxScale},${scaleFreq}`;
    const isFirstRun = autoFillKeyRef.current === null;
    const changed = autoFillKeyRef.current !== key;
    autoFillKeyRef.current = key;
    if (isFirstRun || !changed) return;
    if (!autoFillRef.current || !gridComputed || !activeAssetsRef.current.length) return;
    clearTimeout(autoFillTimerRef.current);
    autoFillTimerRef.current = setTimeout(() => {
      const blocks = fillGrid(activeAssetsRef.current, gridComputed, maxScale, scaleFreq).map(b => ({
        ...b,
        colorSeed: Math.floor(Math.random() * 0x80000000),
        colorOffset: 0,
      }));
      setPlacedBlocks(blocks);
    }, 150);
    return () => clearTimeout(autoFillTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridComputed?.cols, gridComputed?.rows, gridComputed?.cellSize, maxScale, scaleFreq]);

  // Keyboard shortcuts (undo/redo + arrow nudge)
  const gridComputedRef = useRef(gridComputed);
  useEffect(() => { gridComputedRef.current = gridComputed; }, [gridComputed]);

  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (isTypingTarget(e.target)) return;

      if (ctrl) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); return; }
      }

      if (e.key === '?') { e.preventDefault(); setShowShortcuts(s => !s); return; }

      const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!arrowKeys.includes(e.key)) return;
      if (!selectedIdsRef.current.size || !gridComputedRef.current) return;

      e.preventDefault();
      const { cols, rows } = gridComputedRef.current;
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp'   ? -1 : e.key === 'ArrowDown'  ? 1 : 0;

      setPlacedBlocks(prev => {
        const moving = prev.filter(b => selectedIdsRef.current.has(b.id));
        const still  = prev.filter(b => !selectedIdsRef.current.has(b.id));

        for (const b of moving) {
          if (b.gridCol + dx < 0 || b.gridCol + b.cols + dx > cols) return prev;
          if (b.gridRow + dy < 0 || b.gridRow + b.rows + dy > rows) return prev;
        }

        const occupiedByStill = new Set(
          still.flatMap(b =>
            Array.from({ length: b.rows }, (_, r) =>
              Array.from({ length: b.cols }, (_, c) => `${b.gridCol + c},${b.gridRow + r}`)
            ).flat()
          )
        );

        for (const b of moving)
          for (let r = 0; r < b.rows; r++)
            for (let c = 0; c < b.cols; c++)
              if (occupiedByStill.has(`${b.gridCol + c + dx},${b.gridRow + r + dy}`)) return prev;

        return prev.map(b =>
          selectedIdsRef.current.has(b.id)
            ? { ...b, gridCol: b.gridCol + dx, gridRow: b.gridRow + dy }
            : b
        );
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // ── View controls ──────────────────────────────────────────────────────────
  const handleZoom = useCallback((direction) => {
    const factor = direction > 0 ? 1.2 : 1 / 1.2;
    setViewTransform(stored => {
      const prev = stored ?? DEFAULT_VIEW;
      const newScale = Math.min(Math.max(prev.scale * factor, 0.05), 20);
      const sf = newScale / prev.scale;
      const cx = prev.x + (workArea.width * prev.scale) / 2;
      const cy = prev.y + (workArea.height * prev.scale) / 2;
      return { scale: newScale, x: cx - (cx - prev.x) * sf, y: cy - (cy - prev.y) * sf };
    });
  }, [workArea, setViewTransform]);

  const handleSetZoom = useCallback((scale) => {
    setViewTransform(stored => {
      const prev = stored ?? DEFAULT_VIEW;
      const vw = viewportSize?.width ?? window.innerWidth;
      const vh = viewportSize?.height ?? window.innerHeight;
      // Keep the viewport centre fixed while changing scale.
      const sf = scale / prev.scale;
      const cx = vw / 2, cy = vh / 2;
      return { scale, x: cx - (cx - prev.x) * sf, y: cy - (cy - prev.y) * sf };
    });
  }, [viewportSize, setViewTransform]);

  const handleResetView = useCallback(() => {
    const vw = viewportSize?.width ?? window.innerWidth;
    const vh = viewportSize?.height ?? window.innerHeight;
    const padding = 60;
    const scale = Math.min((vw - padding * 2) / workArea.width, (vh - padding * 2) / workArea.height, 1);
    setViewTransform({
      x: (vw - workArea.width * scale) / 2,
      y: (vh - workArea.height * scale) / 2,
      scale,
    });
  }, [workArea, viewportSize, setViewTransform]);

  // ── Fill ───────────────────────────────────────────────────────────────────
  const assetUsageCounts = useMemo(() => {
    const counts = {};
    for (const b of placedBlocks) counts[b.assetId] = (counts[b.assetId] ?? 0) + 1;
    return counts;
  }, [placedBlocks]);

  const handleFillGrid = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    // With a layout active, fill only the grid-area mask and keep the wireframe
    // placeholders; otherwise fill the whole grid as before.
    const wireframes = layoutGridMask ? placedBlocks.filter(b => b.type === 'wireframe') : [];
    const shapes = (layoutGridMask
      ? fillMasked(activeAssets, gridComputed, layoutGridMask, maxScale, scaleFreq)
      : fillGrid(activeAssets, gridComputed, maxScale, scaleFreq)
    ).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks([...wireframes, ...shapes]);
    syncHistorySize();
  }, [activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks, layoutGridMask, pushHistory, syncHistorySize]);

  const handleFillGaps = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    const newBlocks = (layoutGridMask
      ? fillMasked(activeAssets, gridComputed, layoutGridMask, maxScale, scaleFreq, placedBlocks)
      : fillGrid(activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks)
    ).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(prev => [...prev, ...newBlocks]);
    syncHistorySize();
  }, [activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks, layoutGridMask, pushHistory, syncHistorySize]);

  const handleGlitchFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeGlitchMask(gridComputed, glitchSettings);
    if (activeCells.size === 0) {
      alert('No glitch cells generated — try increasing Force or Active Ratio.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, glitchSettings.maxScale, glitchSettings.scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, glitchSettings, placedBlocks, pushHistory, syncHistorySize]);

  const handleStripFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeStripMask(gridComputed, stripSettings);
    if (activeCells.size === 0) {
      alert('No strip cells generated — try increasing Width.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, stripSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleMultiStripFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeMultiStripMask(gridComputed, multiStripSettings);
    if (activeCells.size === 0) {
      alert('No strip cells generated — try increasing Width or Strip count.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, multiStripSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  // Re-run the active fill whenever its seed changes (e.g. via the
  // randomise-seed button or manual entry), but not on initial mount.
  // Tracks the previous seed value (rather than a "have we run yet" flag) so
  // StrictMode's mount→cleanup→remount in dev doesn't mistake the second
  // mount for a real seed change and trigger an unwanted fill.
  const glitchSeedRef = useRef(glitchSettings.seed);
  useEffect(() => {
    if (glitchSeedRef.current === glitchSettings.seed) return;
    glitchSeedRef.current = glitchSettings.seed;
    if (activeAssets.length > 0 && gridComputed) handleGlitchFill();
  }, [glitchSettings.seed]);

  const stripSeedRef = useRef(stripSettings.seed);
  useEffect(() => {
    if (stripSeedRef.current === stripSettings.seed) return;
    stripSeedRef.current = stripSettings.seed;
    if (activeAssets.length > 0 && gridComputed) handleStripFill();
  }, [stripSettings.seed]);

  const multiStripSeedRef = useRef(multiStripSettings.seed);
  useEffect(() => {
    if (multiStripSeedRef.current === multiStripSettings.seed) return;
    multiStripSeedRef.current = multiStripSettings.seed;
    if (activeAssets.length > 0 && gridComputed) handleMultiStripFill();
  }, [multiStripSettings.seed]);

  const brightnessSeedRef = useRef(brightnessSettings.seed);
  useEffect(() => {
    if (brightnessSeedRef.current === brightnessSettings.seed) return;
    brightnessSeedRef.current = brightnessSettings.seed;
    if (activeAssets.length > 0 && gridComputed && imagePixels) handleBrightnessFill();
  }, [brightnessSettings.seed]);

  const noiseSeedRef = useRef(noiseSettings.seed);
  useEffect(() => {
    if (noiseSeedRef.current === noiseSettings.seed) return;
    noiseSeedRef.current = noiseSettings.seed;
    if (activeAssets.length > 0 && gridComputed) handleNoiseFill();
  }, [noiseSettings.seed]);

  const handleEdgeFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed || !imagePixels) return;
    const activeCells = computeEdgeMask(gridComputed, imagePixels, edgeSettings);
    if (activeCells.size === 0) {
      alert('No edge cells detected — try lowering Edge Threshold.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, imagePixels, edgeSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleBrightnessFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed || !imagePixels) return;
    const activeCells = computeBrightnessMask(gridComputed, imagePixels, brightnessSettings);
    if (activeCells.size === 0) {
      alert('No cells matched this brightness zone — try adjusting the range.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, imagePixels, brightnessSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleNoiseFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeNoiseMask(gridComputed, noiseSettings);
    if (activeCells.size === 0) {
      alert('No cells matched this noise field — try raising the threshold.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, noiseSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleGeometricFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeGeometricMask(gridComputed, geometricSettings);
    if (activeCells.size === 0) {
      alert('No cells matched this pattern — try adjusting its settings.');
      return;
    }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, geometricSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleHalftoneFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeHalftoneMask(gridComputed, halftoneSettings);
    if (activeCells.size === 0) { alert('No cells matched — try adjusting halftone settings.'); return; }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, halftoneSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleVoronoiFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeVoronoiMask(gridComputed, voronoiSettings);
    if (activeCells.size === 0) { alert('No cells matched — try adjusting voronoi settings.'); return; }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, voronoiSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleSpiralFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeSpiralMask(gridComputed, spiralSettings);
    if (activeCells.size === 0) { alert('No cells matched — try adjusting spiral settings.'); return; }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, spiralSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleFlowFieldFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeFlowFieldMask(gridComputed, flowFieldSettings);
    if (activeCells.size === 0) { alert('No cells matched — try adjusting flow field settings.'); return; }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, flowFieldSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleFractalFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    const activeCells = computeFractalMask(gridComputed, fractalSettings);
    if (activeCells.size === 0) { alert('No cells matched — try adjusting fractal settings.'); return; }
    pushHistory(placedBlocks);
    const blocks = fillMasked(activeAssets, gridComputed, activeCells, maxScale, scaleFreq).map(b => ({
      ...b, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, fractalSettings, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  // Sourced from the app's active theme rather than its own colour pickers
  // — changing the palette/background reshapes future knotwork fills too.
  const knotworkThemeColors = useMemo(() => ({
    fg: activePalette[0] ?? '#8a1f11',
    bg: canvasBg,
    palette: activePalette.length ? activePalette : ['#8a1f11'],
    // Only wired through when inkMode is 'image' -- composeKnotworkSvg
    // ignores these otherwise. backdropPixels is the same buffer the
    // Palette Extractor already samples from (loaded whenever backdropSrc
    // changes), reused here rather than re-downsampling the image again.
    imagePixels: knotworkSettings.inkMode === 'image' ? backdropPixels : null,
    imageFit: backdropSettings.fit,
  }), [activePalette, canvasBg, knotworkSettings.inkMode, backdropPixels, backdropSettings.fit]);

  // Builds a placed image block for the given knotwork settings, confined
  // to the grid's own inset footprint (same cols/rows/border the preview
  // shows) so the generated pattern lines up with what was previewed
  // before hitting Fill, rather than bleeding past the border to the page
  // edges.
  const buildKnotworkBlock = useCallback((fullSettings) => {
    if (!gridComputed) return null;
    const localGrid = { cols: gridComputed.cols, rows: gridComputed.rows, cellSize: 100, gridOriginX: 0, gridOriginY: 0 };
    const svgMarkup = composeKnotworkSvg(localGrid, fullSettings);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    return {
      id: crypto.randomUUID(),
      type: 'image',
      gridCol: 0,
      gridRow: 0,
      cols: gridComputed.cols, rows: gridComputed.rows,
      imageSrc: dataUri, imageFit: 'contain',
    };
  }, [gridComputed]);

  // Randomises the seed on every press rather than reusing whatever was
  // last set, so each click of Fill gives a fresh variation without
  // needing to separately manage the seed field first -- UNLESS a
  // seedWord is set, in which case the whole point is that the same word
  // always reproduces the same design, so the word-derived seed already in
  // knotworkSettings.seed is left alone.
  const handleKnotworkFill = useCallback(() => {
    if (!gridComputed) return;
    const seed = knotworkSettings.seedWord ? knotworkSettings.seed : Math.floor(Math.random() * 0x80000000);
    // Unlike seed, this always re-rolls on Fill even when a word is set --
    // the scatter layout is deliberately not reproduced from the word hash.
    const letterArrangementSeed = Math.floor(Math.random() * 0x80000000);
    const nextSettings = { ...knotworkSettings, seed, letterArrangementSeed };
    setKnotworkSettings(nextSettings);
    const block = buildKnotworkBlock({ ...nextSettings, ...knotworkThemeColors });
    if (!block) return;
    pushHistory(placedBlocks);
    setPlacedBlocks([block]);
    syncHistorySize();
  }, [gridComputed, knotworkSettings, knotworkThemeColors, buildKnotworkBlock, placedBlocks, pushHistory, syncHistorySize]);

  // Swatch edits (or a library applied from the Swatches panel) re-render the
  // current Meander design in place -- same seed, so the same layout with the
  // new colours. Debounced so dragging in the colour picker doesn't rebuild
  // the design every frame; skipped on mount (e.g. switching to this tab) and
  // when nothing has been generated yet.
  const knotPaletteSig = activePalette.join(',');
  const knotPaletteRef = useRef(null);
  const knotRegenTimer = useRef(null);
  useEffect(() => {
    const prev = knotPaletteRef.current;
    knotPaletteRef.current = knotPaletteSig;
    if (prev === null || prev === knotPaletteSig) return;
    if (appMode !== 'knotwork' || !placedBlocksRef.current.length) return;
    clearTimeout(knotRegenTimer.current);
    knotRegenTimer.current = setTimeout(() => {
      const block = buildKnotworkBlock({ ...knotworkSettings, ...knotworkThemeColors });
      if (!block) return;
      pushHistory(placedBlocksRef.current);
      setPlacedBlocks([block]);
      syncHistorySize();
    }, 120);
    return () => clearTimeout(knotRegenTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knotPaletteSig]);

  // Same immediate-preview behaviour as handleKnotworkPaletteSelect, for the
  // canvas background colour itself -- the knotwork block bakes bg into its
  // own SVG (background rect, terminal dots) at generation time, so without
  // this it stays stale until the next Fill even though the live page rect
  // underneath (Canvas.jsx) already shows the new colour -- exactly the
  // "why is there still a white shape on top" mismatch that motivated this.
  // Takes the new colour as a param rather than reading canvasBg from the
  // closure, since setCanvasBg's update isn't visible synchronously here.
  const handleKnotworkCanvasBgChange = useCallback((color) => {
    setCanvasBg(color);
    if (!gridComputed || placedBlocks.length === 0) return;
    const themeColors = { fg: activePalette[0] ?? '#8a1f11', bg: color, palette: activePalette.length ? activePalette : ['#8a1f11'] };
    const block = buildKnotworkBlock({ ...knotworkSettings, ...themeColors });
    if (!block) return;
    pushHistory(placedBlocks);
    setPlacedBlocks([block]);
    syncHistorySize();
  }, [gridComputed, knotworkSettings, activePalette, buildKnotworkBlock, placedBlocks, pushHistory, syncHistorySize]);

  // Reassigns which strand gets which palette colour without touching the
  // knot layout itself -- a fresh colorSeed reshuffles the strand-to-colour
  // mapping (knotworkCompose.js), while knotworkSettings.seed (the actual
  // geometry) is left untouched, so the shapes on screen stay exactly where
  // they are and only their colours move.
  const handleKnotworkRecolour = useCallback(() => {
    if (!gridComputed || placedBlocks.length === 0) return;
    const colorSeed = Math.floor(Math.random() * 0x80000000) || 1;
    const nextSettings = { ...knotworkSettings, colorSeed };
    setKnotworkSettings(nextSettings);
    const block = buildKnotworkBlock({ ...nextSettings, ...knotworkThemeColors });
    if (!block) return;
    pushHistory(placedBlocks);
    setPlacedBlocks([block]);
    syncHistorySize();
  }, [gridComputed, knotworkSettings, knotworkThemeColors, buildKnotworkBlock, placedBlocks, pushHistory, syncHistorySize]);

  const handleMondrianFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    const blocks = generateMondrianLayout(activeAssets, gridComputed, mondrianSettings);
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, mondrianSettings, placedBlocks, pushHistory, syncHistorySize]);

  const handleGoldenFill = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    const blocks = generateGoldenLayout(activeAssets, gridComputed, goldenSettings);
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, goldenSettings, placedBlocks, pushHistory, syncHistorySize]);

  // Apply a predetermined layout: drop its wireframe placeholders and arm the
  // grid-area mask (used by the main Fill button). Starts from a clean canvas.
  const handleApplyLayout = useCallback((layoutId) => {
    if (!gridComputed) return;
    const layout = LAYOUTS.find(l => l.id === layoutId);
    if (!layout) return;
    pushHistory(placedBlocks);
    setActiveLayoutId(layoutId);
    setPlacedBlocks(buildWireframeBlocks(layout, gridComputed));
    syncHistorySize();
  }, [gridComputed, placedBlocks, pushHistory, syncHistorySize]);

  // Clear the active layout: remove wireframes and disarm the mask (shapes stay).
  const handleClearLayout = useCallback(() => {
    pushHistory(placedBlocks);
    setActiveLayoutId(null);
    setPlacedBlocks(prev => prev.filter(b => b.type !== 'wireframe'));
    syncHistorySize();
  }, [placedBlocks, pushHistory, syncHistorySize]);

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async (options = {}) => {
    const {
      format = 'svg',
      scale = 1,
      transparentBackground = false,
      jpegQuality = 0.92,
      photoComposite = false,
      includeWireframeLayer = false,
    } = options;
    if (!placedBlocks.length || !gridComputed) return;

    const effectiveBackdropSettings = (photoComposite && backdropSrc)
      ? { ...backdropSettings, mode: 'backdrop' }
      : backdropSettings;

    const commonBuildArgs = {
      placedBlocks, workArea, gridComputed, colorMode, activePalette, activeBgColors,
      canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled,
      colourRemap: imageColourRemap, swatchMap,
      backdropSrc, backdropSettings: effectiveBackdropSettings, blendMode,
      includeWireframes: includeWireframeLayer,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'svg') {
      const { svgEl } = buildFlatSvgElement(commonBuildArgs);
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const filename = `grid-layout-${timestamp}.svg`;
      if (isTauri) {
        try {
          const path = await tauriSaveDialog({
            title: 'Export SVG',
            defaultPath: filename,
            filters: [{ name: 'SVG Files', extensions: ['svg'] }],
          });
          if (!path) return;
          await writeTextFile(path, svgString);
        } catch (err) {
          alert('Export failed: ' + err.message);
        }
      } else {
        downloadBlob(new Blob([svgString], { type: 'image/svg+xml' }), filename);
      }
      return;
    }

    // Raster export (PNG / JPEG)
    const targetW = Math.round(workArea.width * scale);
    const targetH = Math.round(workArea.height * scale);
    if (targetW > MAX_CANVAS_DIMENSION || targetH > MAX_CANVAS_DIMENSION) {
      alert(`Export dimensions (${targetW}×${targetH}px) exceed the ${MAX_CANVAS_DIMENSION}px canvas limit. Reduce the export scale.`);
      return;
    }

    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    const filename = `grid-layout-${timestamp}.${extension}`;
    const transparentBg = format === 'png' && transparentBackground;

    // Render at up to 3x the output resolution and downscale, to smooth away
    // hairline antialiasing seams between adjacent shapes/paths.
    const supersample = Math.max(1, Math.min(3, Math.floor(MAX_CANVAS_DIMENSION / Math.max(targetW, targetH))));

    try {
      const { svgEl } = buildFlatSvgElement({ ...commonBuildArgs, layer: transparentBg ? 'shapes' : 'all' });
      const svgString = new XMLSerializer().serializeToString(svgEl);
      const finalCanvas = await rasterizeSvgToCanvas(svgString, targetW, targetH, supersample);
      const blob = await canvasToBlob(finalCanvas, mimeType, format === 'jpeg' ? jpegQuality : undefined);
      if (isTauri) {
        const path = await tauriSaveDialog({
          title: 'Export Image',
          defaultPath: filename,
          filters: [{ name: format.toUpperCase(), extensions: [extension] }],
        });
        if (!path) return;
        await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      } else {
        downloadBlob(blob, filename);
      }
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }, [placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled, imageColourRemap, backdropSrc, backdropSettings, blendMode, swatchMap]);

  // Full-canvas data URI for the Meander single-motif tile preview --
  // same buildFlatSvgElement path handleExport uses, so the preview always
  // matches what Export actually produces (background + border margin +
  // the knot block). Only computed while the preview is actually shown.
  const tilePreviewDataUri = useMemo(() => {
    if (appMode !== 'knotwork' || !showTilePreview || !placedBlocks.length || !gridComputed) return null;
    const { svgEl } = buildFlatSvgElement({
      placedBlocks, workArea, gridComputed, colorMode, activePalette, activeBgColors,
      canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled,
      colourRemap: imageColourRemap, backdropSrc, backdropSettings, blendMode, swatchMap,
    });
    const svgString = new XMLSerializer().serializeToString(svgEl);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  }, [appMode, showTilePreview, placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled, imageColourRemap, backdropSrc, backdropSettings, blendMode, swatchMap]);

  // Small PNG preview of the current design, used for recent-file cards on
  // the home screen. Same build path as Export so it matches the output.
  const buildThumbnail = useCallback(async (maxSide = 240) => {
    if (!gridComputed) return null;
    const { svgEl } = buildFlatSvgElement({
      placedBlocks, workArea, gridComputed, colorMode, activePalette, activeBgColors,
      canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled,
      colourRemap: imageColourRemap, backdropSrc, backdropSettings, blendMode, swatchMap,
    });
    const ratio = maxSide / Math.max(workArea.width, workArea.height);
    const canvas = await rasterizeSvgToCanvas(
      new XMLSerializer().serializeToString(svgEl),
      Math.max(1, Math.round(workArea.width * ratio)),
      Math.max(1, Math.round(workArea.height * ratio)),
    );
    return canvas.toDataURL('image/png');
  }, [placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled, imageColourRemap, backdropSrc, backdropSettings, blendMode, swatchMap]);

  // ── Panels ─────────────────────────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false);
  const openExport = useCallback(() => setShowExport(true), []);

  // Fill id (modes/gridBuilder/fills.js) → its handler and availability.
  const canShapeFill = activeAssets.length > 0 && gridComputed !== null;
  const fillActions = useMemo(() => ({
    standard:   { run: handleFillGrid,       can: canShapeFill },
    glitch:     { run: handleGlitchFill,     can: canShapeFill },
    strip:      { run: handleStripFill,      can: canShapeFill },
    multiStrip: { run: handleMultiStripFill, can: canShapeFill },
    edge:       { run: handleEdgeFill,       can: canShapeFill && !!imagePixels },
    brightness: { run: handleBrightnessFill, can: canShapeFill && !!imagePixels },
    noise:      { run: handleNoiseFill,      can: canShapeFill },
    geometric:  { run: handleGeometricFill,  can: canShapeFill },
    halftone:   { run: handleHalftoneFill,   can: canShapeFill },
    voronoi:    { run: handleVoronoiFill,    can: canShapeFill },
    spiral:     { run: handleSpiralFill,     can: canShapeFill },
    flowField:  { run: handleFlowFieldFill,  can: canShapeFill },
    fractal:    { run: handleFractalFill,    can: canShapeFill },
    mondrian:   { run: handleMondrianFill,   can: canShapeFill },
    golden:     { run: handleGoldenFill,     can: canShapeFill },
  }), [canShapeFill, imagePixels, handleFillGrid, handleGlitchFill, handleStripFill, handleMultiStripFill, handleEdgeFill, handleBrightnessFill, handleNoiseFill, handleGeometricFill, handleHalftoneFill, handleVoronoiFill, handleSpiralFill, handleFlowFieldFill, handleFractalFill, handleMondrianFill, handleGoldenFill]);

  // ── Layers ─────────────────────────────────────────────────────────────────
  // Blocks to outline on the canvas while a Layers row is hovered.
  const [layerHighlight, setLayerHighlight] = useState(null);

  // What the colour modes need to resolve any block's colours — the Layers
  // panel uses it to group blocks by what's actually on screen.
  const colourCtx = useMemo(() => ({
    colorMode, palette: activePalette, bgOptions: activeBgColors, gridComputed,
    gradientSettings: activeGradientSettings, meshSettings, randomReverseEnabled, swatchMap,
  }), [colorMode, activePalette, activeBgColors, gridComputed, activeGradientSettings, meshSettings, randomReverseEnabled, swatchMap]);

  // Applies `fn` to the given blocks as one undoable step.
  const updateBlocks = useCallback((ids, fn) => {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.map(b => (idSet.has(b.id) ? fn(b) : b)));
    syncHistorySize();
  }, [placedBlocks, pushHistory, setPlacedBlocks, syncHistorySize]);

  const deselect = useCallback((ids) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next.size === prev.size ? prev : next;
    });
  }, [setSelectedIds]);

  // A document swatch id for `hex`, creating one if needed. New swatches are
  // added outside the palette (enabled: false) so pinning a colour never
  // changes how the palette-based modes colour everything else.
  const ensureSwatch = useCallback((hex) => {
    const found = [...shapeColors, ...bgColors].find(c => c.hex.toLowerCase() === hex.toLowerCase());
    if (found) return found.id;
    const id = crypto.randomUUID();
    setShapeColors(prev => [...prev, { id, hex, enabled: false, source: 'custom' }]);
    return id;
  }, [shapeColors, bgColors, setShapeColors]);

  const layerActions = useMemo(() => ({
    highlight: setLayerHighlight,
    select: (ids) => setSelectedIds(new Set(placedBlocks.filter(b => ids.includes(b.id) && !b.hidden && !b.locked).map(b => b.id))),
    setHidden: (ids, hidden) => { updateBlocks(ids, b => ({ ...b, hidden })); if (hidden) deselect(ids); },
    setLocked: (ids, locked) => { updateBlocks(ids, b => ({ ...b, locked })); if (locked) deselect(ids); },
    // Pin every visible part of these blocks that's currently `fromHex` to a
    // swatch (an id, or a hex to find/create one for).
    pinColour: (ids, fromHex, swatch) => {
      const swatchId = swatch.startsWith('#') ? ensureSwatch(swatch) : swatch;
      const from = fromHex.toLowerCase();
      updateBlocks(ids, b => {
        const entry = blockColourBreakdown(b, colourCtx).find(e => e.hex.toLowerCase() === from);
        if (!entry) return b;
        const slotPins = { ...(b.slotPins ?? {}) };
        for (const s of entry.slots) slotPins[s] = swatchId;
        return { ...b, slotPins };
      });
    },
    clearPins: (ids) => updateBlocks(ids, b => {
      if (!b.slotPins) return b;
      const next = { ...b };
      delete next.slotPins;
      return next;
    }),
    // Meander: replace one colour throughout the generated design. Lasts
    // until the design is regenerated.
    replaceDesignColour: (fromHex, toHex) => {
      const target = placedBlocks.find(b => b.type === 'image' && b.imageSrc?.startsWith('data:image/svg+xml'));
      if (!target) return;
      const comma = target.imageSrc.indexOf(',');
      const svg = decodeURIComponent(target.imageSrc.slice(comma + 1));
      const next = svg.replace(new RegExp(`="${fromHex}"`, 'gi'), `="${toHex}"`);
      if (next === svg) return;
      updateBlocks([target.id], b => ({ ...b, imageSrc: `${b.imageSrc.slice(0, comma + 1)}${encodeURIComponent(next)}` }));
    },
  }), [placedBlocks, setSelectedIds, updateBlocks, deselect, ensureSwatch, colourCtx]);

  // ── Editing tools ──────────────────────────────────────────────────────────
  // Canvas reports clicks/drags for every non-navigation tool here, in
  // artboard coordinates (Canvas → onToolPointer).
  const toolOptions = useAppStore(s => s.toolOptions);
  const setToolOption = useAppStore(s => s.setToolOption);
  const showToast = useAppStore(s => s.showToast);
  const toolDrag = useRef(null);

  // Cell under an artboard point, and the visible block covering it with the
  // point's position (u, v) inside that block.
  const hitTest = useCallback((pt, blocks) => {
    if (!pt || !gridComputed) return null;
    const { cellSize, gridOriginX, gridOriginY, cols, rows } = gridComputed;
    const col = Math.floor((pt.x - gridOriginX) / cellSize);
    const row = Math.floor((pt.y - gridOriginY) / cellSize);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    const block = blocks.find(b => !b.hidden && b.type !== 'wireframe'
      && col >= b.gridCol && col < b.gridCol + b.cols && row >= b.gridRow && row < b.gridRow + b.rows) ?? null;
    const u = block ? (pt.x - (gridOriginX + block.gridCol * cellSize)) / (block.cols * cellSize) : 0;
    const v = block ? (pt.y - (gridOriginY + block.gridRow * cellSize)) / (block.rows * cellSize) : 0;
    return { col, row, block, u, v };
  }, [gridComputed]);

  // The colour slot of `block` under (u, v), accounting for rotate/reflect.
  const slotUnder = useCallback(async (block, u, v) => {
    const [su, sv] = unTransformUV(block, u, v);
    return slotAt(block.svgContent, su, sv);
  }, []);

  // Places the Stamp tool's shape at the hit cell (or, replacing, swaps the
  // shape under it for one of the same footprint). Returns the new block
  // list, or null when nothing fits there.
  const stampAt = useCallback((blocks, hit, replace) => {
    if (!gridComputed) return null;
    const pool = toolOptions.stampAsset === 'random'
      ? activeAssets
      : ALL_BUILTIN_ASSETS.filter(a => a.id === toolOptions.stampAsset);
    if (!pool.length) return null;
    const target = replace && hit.block && !hit.block.locked && !hit.block.type ? hit.block : null;
    const col = target ? target.gridCol : hit.col;
    const row = target ? target.gridRow : hit.row;
    const covered = (c, r) => blocks.some(b => b.gridCol < col + c && b.gridCol + b.cols > col && b.gridRow < row + r && b.gridRow + b.rows > row);
    const fits = pool.filter(a => {
      const c = a.cols ?? 1, r = a.rows ?? 1;
      if (target) return c === target.cols && r === target.rows;
      return col + c <= gridComputed.cols && row + r <= gridComputed.rows && !covered(c, r);
    });
    if (!fits.length) return null;
    const asset = fits[Math.floor(Math.random() * fits.length)];
    const block = {
      id: crypto.randomUUID(), assetId: asset.id, name: asset.name, svgContent: asset.svgContent,
      cols: asset.cols ?? 1, rows: asset.rows ?? 1, gridCol: col, gridRow: row,
      colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0,
    };
    return target ? blocks.map(b => (b.id === target.id ? block : b)) : [...blocks, block];
  }, [gridComputed, toolOptions.stampAsset, activeAssets]);

  const handleToolPointer = useCallback(async (phase, pt) => {
    const { toolOverride, activeTool: chosen } = useAppStore.getState();
    const tool = toolOverride ?? chosen;
    const blocks = placedBlocksRef.current;

    if (phase === 'up') { toolDrag.current = null; return; }
    const hit = hitTest(pt, blocks);

    // Drag tools: Stamp and Eraser paint across cells, one undo step per drag.
    if (tool === 'stamp' || tool === 'eraser') {
      if (phase === 'down') toolDrag.current = { visited: new Set(), pushed: false };
      const drag = toolDrag.current;
      if (!drag || !hit) return;
      const key = `${hit.col},${hit.row}`;
      if (drag.visited.has(key)) return;
      drag.visited.add(key);
      let next = null;
      if (tool === 'stamp') next = stampAt(blocks, hit, pt.altKey);
      else if (hit.block && !hit.block.locked) next = blocks.filter(b => b.id !== hit.block.id);
      if (!next) return;
      if (!drag.pushed) { pushHistory(blocks); drag.pushed = true; }
      placedBlocksRef.current = next;
      setPlacedBlocks(next);
      syncHistorySize();
      return;
    }

    if (phase !== 'down') return;
    const block = hit?.block;

    if (tool === 'wand') {
      if (!block) { if (!pt.shiftKey) setSelectedIds(new Set()); return; }
      const { wandMatch, wandAdd } = toolOptions;
      const keyOf = (b) => {
        if (wandMatch === 'shape') return b.assetId ?? b.type;
        if (wandMatch === 'size') return `${b.cols}x${b.rows}`;
        return b.type ? `type:${b.type}` : dominantColour(blockColourBreakdown(b, colourCtx));
      };
      const target = keyOf(block);
      const ids = blocks.filter(b => !b.hidden && !b.locked && keyOf(b) === target).map(b => b.id);
      setSelectedIds(prev => (pt.shiftKey || wandAdd ? new Set([...prev, ...ids]) : new Set(ids)));
      return;
    }

    if (!block || block.type) return;

    if (tool === 'eyedropper') {
      const slot = await slotUnder(block, hit.u, hit.v);
      const colours = blockSlotColours(block, colourCtx);
      const hex = (slot >= 0 && colours?.[slot]) || dominantColour(blockColourBreakdown(block, colourCtx));
      if (hex) { setToolOption({ paintHex: hex }); showToast(`Picked ${hex}`); }
      return;
    }

    if (block.locked) { showToast('That shape is locked (Layers panel)'); return; }

    if (tool === 'bucket') {
      const slot = await slotUnder(block, hit.u, hit.v);
      if (slot < 0) return;
      const from = blockSlotColours(block, colourCtx)?.[slot]?.toLowerCase();
      const swatchId = ensureSwatch(toolOptions.paintHex);
      const wholeColour = pt.altKey || toolOptions.bucketScope === 'colour';
      // Shift: paint that colour in every unlocked shape, like recolouring a Layers group.
      const targets = pt.shiftKey ? blocks.filter(b => !b.locked && !b.type).map(b => b.id) : [block.id];
      updateBlocks(targets, b => {
        const slotPins = { ...(b.slotPins ?? {}) };
        if (b.id === block.id && !wholeColour && !pt.shiftKey) {
          slotPins[slot] = swatchId;
        } else {
          const entry = blockColourBreakdown(b, colourCtx).find(e => e.hex.toLowerCase() === from);
          if (!entry) return b;
          for (const s of entry.slots) slotPins[s] = swatchId;
        }
        return { ...b, slotPins };
      });
      return;
    }

    if (tool === 'rotate') { updateBlocks([block.id], b => rotateBlock(b, !pt.altKey)); return; }
    if (tool === 'reflect') {
      updateBlocks([block.id], b => (pt.altKey ? { ...b, flipY: !b.flipY } : { ...b, flipX: !b.flipX }));
    }
  }, [hitTest, stampAt, pushHistory, setPlacedBlocks, syncHistorySize, toolOptions, colourCtx, setSelectedIds, slotUnder, setToolOption, showToast, ensureSwatch, updateBlocks]);

  // Actions on the current selection, shared by the task bar, the right-click
  // menu and the Object / Select menus. Locked shapes are never edited.
  const selectionActions = useMemo(() => {
    const editable = () => placedBlocks.filter(b => selectedIds.has(b.id) && !b.locked).map(b => b.id);
    const selectMatching = (keyOf) => {
      const keys = new Set(placedBlocks.filter(b => selectedIds.has(b.id)).map(keyOf));
      setSelectedIds(new Set(placedBlocks.filter(b => !b.hidden && !b.locked && keys.has(keyOf(b))).map(b => b.id)));
    };
    const colourKey = (b) => (b.type ? `type:${b.type}` : dominantColour(blockColourBreakdown(b, colourCtx)));
    return {
      selectSameColour: () => selectMatching(colourKey),
      selectSameShape: () => selectMatching(b => b.assetId ?? b.type),
      paint: () => {
        const swatchId = ensureSwatch(toolOptions.paintHex);
        updateBlocks(editable(), b => {
          if (b.type) return b;
          const breakdown = blockColourBreakdown(b, colourCtx);
          const main = breakdown.find(e => e.hex === dominantColour(breakdown));
          if (!main) return b;
          const slotPins = { ...(b.slotPins ?? {}) };
          for (const s of main.slots) slotPins[s] = swatchId;
          return { ...b, slotPins };
        });
      },
      rotate: (clockwise = true) => updateBlocks(editable(), b => (b.type ? b : rotateBlock(b, clockwise))),
      reflect: (vertical = false) => updateBlocks(editable(), b => (b.type ? b : vertical ? { ...b, flipY: !b.flipY } : { ...b, flipX: !b.flipX })),
      hide: () => layerActions.setHidden(editable(), true),
      lock: () => layerActions.setLocked(editable(), true),
      unpin: () => layerActions.clearPins(editable()),
    };
  }, [placedBlocks, selectedIds, setSelectedIds, colourCtx, ensureSwatch, toolOptions.paintHex, updateBlocks, layerActions]);

  // Hold Space for the Hand tool, whatever tool is active (as in Illustrator).
  useEffect(() => {
    const { setToolOverride } = useAppStore.getState();
    const down = (e) => {
      if (e.code !== 'Space' || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      setToolOverride('hand');
    };
    const up = (e) => { if (e.code === 'Space') setToolOverride(null); };
    const blur = () => setToolOverride(null);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      setToolOverride(null);
    };
  }, []);

  const editorContext = useMemo(() => ({
    mode: appMode,
    gridComputed, validCols, workArea, assetUsageCounts,
    knotworkThemeColors,
    audioFileSrc, setAudioFileSrc,
    fillActions,
    colourCtx, layerActions, selectedIds,
    actions: {
      fillGaps: handleFillGaps,
      flipH: handleFlipH,
      flipV: handleFlipV,
      openExport,
      randomReverse: handleRandomReverse,
      randomRerun: handleRandomRerun,
      applyExtractedToShapes: handleApplyExtractedToShapes,
      applyExtractedToBg: handleApplyExtractedToBg,
      applyLayout: handleApplyLayout,
      clearLayout: handleClearLayout,
      knotworkFill: handleKnotworkFill,
      knotworkRecolour: handleKnotworkRecolour,
      knotworkCanvasBgChange: handleKnotworkCanvasBgChange,
    },
    extracted: {
      palette: extractedPalette,
      canFromImage: !!imagePixels,
      canFromBackdrop: !!backdropPixels,
    },
    status: {
      hasBlocks: placedBlocks.length > 0,
      canFillGaps: canShapeFill && placedBlocks.length > 0,
      hasImage: !!imagePixels,
      imageProgress,
      canKnotworkFill: gridComputed !== null,
    },
  }), [appMode, gridComputed, validCols, workArea, assetUsageCounts, knotworkThemeColors, audioFileSrc, fillActions, colourCtx, layerActions, selectedIds, handleFillGaps, handleFlipH, handleFlipV, openExport, handleRandomReverse, handleRandomRerun, handleApplyExtractedToShapes, handleApplyExtractedToBg, handleApplyLayout, handleClearLayout, handleKnotworkFill, handleKnotworkRecolour, handleKnotworkCanvasBgChange, extractedPalette, imagePixels, backdropPixels, placedBlocks.length, canShapeFill, imageProgress]);

  // ── Shell bridge ───────────────────────────────────────────────────────────
  // Menu bar, status bar and app-level shortcuts reach this editor through
  // the app store rather than props, since they live outside the editor.
  const setEditorBridge = useAppStore(s => s.setEditorBridge);
  const editorCommands = useMemo(() => ({
    openExport,
    selection: selectionActions,
    showAll: () => layerActions.setHidden(placedBlocks.filter(b => b.hidden).map(b => b.id), false),
    unlockAll: () => layerActions.setLocked(placedBlocks.filter(b => b.locked).map(b => b.id), false),
    undo: handleUndo,
    redo: handleRedo,
    zoomIn: () => handleZoom(1),
    zoomOut: () => handleZoom(-1),
    setZoom: handleSetZoom,
    fitView: handleResetView,
    selectAll: () => setSelectedIds(new Set(placedBlocks.map(b => b.id))),
    deselectAll: handleDeselectAll,
    deleteSelection: handleDeleteSelected,
    exportSvg: () => handleExport({ format: 'svg' }),
    toggleShortcuts: () => setShowShortcuts(s => !s),
    buildThumbnail,
  }), [openExport, selectionActions, layerActions, handleUndo, handleRedo, handleZoom, handleSetZoom, handleResetView, setSelectedIds, placedBlocks, handleDeselectAll, handleDeleteSelected, handleExport, buildThumbnail]);
  const editorStatus = useMemo(() => ({
    zoom: viewTransform.scale,
    cols: gridComputed?.cols ?? 0,
    rows: gridComputed?.rows ?? 0,
    width: workArea.width,
    height: workArea.height,
    blockCount: placedBlocks.length,
    selectedCount: selectedIds.size,
    canUndo: historySize.undo > 0,
    canRedo: historySize.redo > 0,
    canExport: placedBlocks.length > 0,
  }), [viewTransform.scale, gridComputed, workArea.width, workArea.height, placedBlocks.length, selectedIds.size, historySize]);
  useEffect(() => { setEditorBridge(editorCommands, editorStatus); }, [setEditorBridge, editorCommands, editorStatus]);
  useEffect(() => () => setEditorBridge(null, null), [setEditorBridge]);

  return (
    <EditorContext.Provider value={editorContext}>
    <div className={styles.editor}>
      <div className={styles.canvasArea}>
        <Canvas
          viewTransform={viewTransform}
          needsFit={storedView == null}
          setViewTransform={setViewTransform}
          activeTool={activeTool}
          bgColor={bgColor}
          canvasBg={canvasBg}
          workArea={workArea}
          onDeselectAll={handleDeselectAll}
          onMarqueeSelect={handleMarqueeSelect}
          onToolPointer={handleToolPointer}
          onViewportResize={setViewportSize}
          overlay={
            <>
              {appMode === 'gridBuilder' && (
                <SelectionToolbar
                  selectedBlocks={selectedBlocks}
                  viewTransform={viewTransform}
                  gridComputed={gridComputed}
                  colorMode={colorMode}
                  paintHex={toolOptions.paintHex}
                  onDelete={handleDeleteSelected}
                  onRefresh={handleRefreshSelected}
                  onRandomise={handleRandomiseSelected}
                  onSwap={handleSwapSelected}
                  onToggleLock={handleToggleLockSelected}
                  onRotate={() => selectionActions.rotate(true)}
                  onReflect={() => selectionActions.reflect(false)}
                  onSelectSame={selectionActions.selectSameColour}
                  onPaint={selectionActions.paint}
                  onHide={selectionActions.hide}
                  onLock={selectionActions.lock}
                  onUnpin={selectionActions.unpin}
                />
              )}
              {tilePreviewDataUri && (
                <div className={styles.tilePreview}>
                  <div className={styles.tilePreviewGrid}>
                    {Array.from({ length: 9 }).map((_, i) => (
                      <img key={i} src={tilePreviewDataUri} alt="" draggable={false} />
                    ))}
                  </div>
                  {gridSettings.borderPct === 0 && (
                    <div className={styles.tilePreviewHint}>
                      Increase Border % so the pattern doesn't touch the tile edge
                    </div>
                  )}
                </div>
              )}
            </>
          }
        >
          {backdropSrc && (
            <>
              <image
                href={backdropSrc}
                x={0} y={0}
                width={workArea.width}
                height={workArea.height}
                preserveAspectRatio={
                  backdropSettings.fit === 'cover' ? 'xMidYMid slice'
                  : backdropSettings.fit === 'stretch' ? 'none'
                  : 'xMidYMid meet'
                }
                opacity={backdropSettings.opacity}
              />
              {backdropSettings.tintOpacity > 0 && (
                <rect
                  x={0} y={0}
                  width={workArea.width}
                  height={workArea.height}
                  fill={backdropSettings.tintColour}
                  opacity={backdropSettings.tintOpacity}
                />
              )}
            </>
          )}
          <Grid workArea={workArea} gridSettings={gridSettings} />
          <PlacedBlocks
            placedBlocks={placedBlocks}
            visibleRect={visibleRect}
            shapeLibrary={shapeLibrary}
            gridComputed={gridComputed}
            activeTool={activeTool}
selectedIds={selectedIds}
            onSelect={handleSelectBlock}
            onContextMenu={handleOpenContextMenu}
            colorMode={colorMode}
            effectivePalette={activePalette}
            bgOptions={activeBgColors}
            gradientSettings={activeGradientSettings}
            meshSettings={meshSettings}
            imageDataUrls={imageDataUrls}
            randomReverseEnabled={randomReverseEnabled}
            filterUrl={
              animSettings.enabled && ANIM_FILTER_ID[animSettings.type]
                ? `url(#${ANIM_FILTER_ID[animSettings.type]})`
                : undefined
            }
            imageRefsMap={imageRefsMap}
            animSettings={animSettings}
            slotRefsMap={slotRefsMap}
            blendMode={blendMode}
            swatchMap={swatchMap}
            highlightIds={layerHighlight}
          />
          <AnimationLayer
            animSettings={animSettings}
            gridCells={gridCells}
            gridComputed={gridComputed}
            palette={activePalette}
            workArea={workArea}
            shapeLibrary={shapeLibrary}
            imageRefsMap={imageRefsMap}
            slotRefsMap={slotRefsMap}
            audioSettings={audioSettings}
            audioDataRef={audioDataRef}
            canvasBg={canvasBg}
          />
        </Canvas>

        {audioSettings.enabled && audioSettings.inputSource === 'file' && (
          <audio
            ref={audioFileElRef}
            src={audioFileSrc || undefined}
            loop
            style={{ display: 'none' }}
          />
        )}

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={[
              { label: 'Select Same Colour', action: selectionActions.selectSameColour },
              { label: 'Select Same Shape', action: selectionActions.selectSameShape },
              null,
              { label: `Paint with ${toolOptions.paintHex}`, shortcut: 'K', action: selectionActions.paint },
              colorMode !== 'none' && { label: 'Shuffle Colours', action: handleContextRefresh },
              { label: contextMenu.block.colorLocked ? 'Unfreeze Colours' : 'Freeze Colours', action: handleContextToggleLock },
              contextMenu.block.slotPins && { label: 'Unpin Colours', action: selectionActions.unpin },
              null,
              { label: 'Rotate 90° Clockwise', shortcut: 'R', action: () => selectionActions.rotate(true) },
              { label: 'Rotate 90° Anticlockwise', action: () => selectionActions.rotate(false) },
              { label: 'Reflect Horizontal', shortcut: 'O', action: () => selectionActions.reflect(false) },
              { label: 'Reflect Vertical', action: () => selectionActions.reflect(true) },
              { label: 'Random Shape', action: handleContextRandomise },
              null,
              { label: 'Hide', action: selectionActions.hide },
              { label: 'Lock', action: selectionActions.lock },
              null,
              { label: 'Delete', shortcut: 'Del', action: handleContextDelete, danger: true },
            ].filter(item => item !== false && item !== undefined)}
          />
        )}

      </div>

      <Dock groups={MODE_REGISTRY[appMode].dock} />

      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          onExport={handleExport}
          workArea={workArea}
          hasBackdrop={!!backdropSrc}
          hasLayout={!!activeLayoutId}
          defaultScale={appMode === 'knotwork' ? 2 : 1}
        />
      )}
      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </div>
    </EditorContext.Provider>
  );
}

