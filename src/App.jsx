import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { ContextMenu } from './components/ContextMenu';
import { FloatingPanel } from './components/FloatingPanel';
import { AnimationLayer, ANIM_DEFAULTS, ANIM_FILTER_ID } from './components/AnimationLayer';
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
import { colorizeSvg, colorizeSvgByImage, buildColourRemap, applyColorTemperatureShift } from './utils/colorize';
import { save as tauriSaveDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { buildGridCells, renderImageFrame, sampleFrameColours, loadShapeLibrary, warmShapeCache } from './utils/shapeLibraryRender';
import { ALL_BUILTIN_ASSETS, DEFAULT_ENABLED_IDS } from './builtinAssets';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useHistory } from './hooks/useHistory';
import { useColorPalette } from './hooks/useColorPalette';
import { useSelection } from './hooks/useSelection';
import './App.css';
import styles from './App.module.css';

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

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
  backdropSrc, backdropSettings, blendMode, layer = 'all',
}) {
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

    const blockPalette = (randomReverseEnabled && block.reverseColor) ? [...palette].reverse() : palette;
    let svgText;
    if (colorMode === 'image') {
      svgText = colorizeSvgByImage(block.svgContent, imgBx, imgBy, imgBw, imgBh, imagePixels);
      if (colourRemap) svgText = applyFillRemap(svgText, colourRemap);
    } else if (colorMode !== 'none') {
      svgText = colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, activeBgColors,
        colorMode === 'gradient' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...activeGradientSettings } : null,
        colorMode === 'mesh' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...meshSettings } : null);
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
    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
    for (const child of [...blockRoot.childNodes]) g.appendChild(document.importNode(child, true));
    blocksGroup.appendChild(g);
  });

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

function App() {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [viewportSize, setViewportSize] = useState(null);
  const [activeTool, setActiveTool] = useState('select');
  const [bgColor, setBgColor] = useState('#2d2d2d');
  const [canvasBg, setCanvasBg] = useState('#ffffff');
  const [maxScale, setMaxScale] = useState(1);
  const [scaleFreq, setScaleFreq] = useState(0);

  // Check for app updates on launch (no-op outside the Tauri shell)
  useEffect(() => {
    checkForUpdate().then(update => {
      if (!update) return;
      if (!confirm(`Version ${update.version} is available. Download and install now?`)) return;
      update.downloadAndInstall().then(relaunch);
    }).catch(() => {});
  }, []);

  // Work area
  const [presetKey, setPresetKey] = useState('a4-portrait');
  const [customSize, setCustomSize] = useState({ width: 800, height: 600 });

  const presetData = PRESETS.find(p => p.key === presetKey);
  const workArea = presetKey === 'custom'
    ? customSize
    : { width: presetData.width, height: presetData.height };

  // Grid settings
  const [gridSettings, setGridSettings] = useState({ cols: 8, borderPct: 5 });
  const handleGridSettingsChange = useCallback((changes) => {
    setGridSettings(prev => ({ ...prev, ...changes }));
  }, []);

  const validCols = useMemo(
    () => getValidCols(workArea, gridSettings.borderPct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workArea.width, workArea.height, gridSettings.borderPct]
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
    colorMode, setColorMode,
    paletteKey, setPaletteKey, handlePaletteKeyChange,
    shapeColors, setShapeColors,
    bgColors, setBgColors,
    effectivePalette,
    activeBgColors,
    customPalettes,
    handleSaveCustomPalette,
    handleDeleteCustomPalette,
    handleApplyCustomPalette,
  } = useColorPalette();

  // Uniform reverse
  const [uniformReverse, setUniformReverse] = useState(false);
  const [randomReverseEnabled, setRandomReverseEnabled] = useState(false);
  const [randomReversePct, setRandomReversePct] = useState(50);

  // Colour temperature shift: -100 (cool) .. 0 (off) .. 100 (warm)
  const [colorTempShift, setColorTempShift] = useState(0);

  // Global block blend mode (CSS/SVG mix-blend-mode on the placed-blocks layer)
  const [blendMode, setBlendMode] = useState('normal');

  const activePalette = useMemo(() => {
    const base = uniformReverse && colorMode === 'uniform' ? [...effectivePalette].reverse() : effectivePalette;
    return applyColorTemperatureShift(base, colorTempShift);
  }, [uniformReverse, colorMode, effectivePalette, colorTempShift]);

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
  const [gradientSettings, setGradientSettings] = useState({
    angle: 45,
    gradMode: 'linear',
    centerX: 0.5,
    centerY: 0.5,
    gradScale: 1,
    reverseBg: false,
    gradBgColors: [{ id: 'grad-bg-1', hex: '#ffffff', enabled: true }],
    jitter: 0,
    repeat: 1,
    repeatMode: 'tile',
  });

  const activeGradientSettings = useMemo(() => ({
    ...gradientSettings,
    gradBgColors: (gradientSettings.gradBgColors ?? []).filter(c => c.enabled).map(c => c.hex),
  }), [gradientSettings]);

  // Gradient mesh
  const [meshSettings, setMeshSettings] = useState({
    points: [
      { id: 'mesh-1', x: 0.15, y: 0.15, hex: '#ff5e5e' },
      { id: 'mesh-2', x: 0.85, y: 0.25, hex: '#5ee0ff' },
      { id: 'mesh-3', x: 0.5,  y: 0.9,  hex: '#ffe35e' },
    ],
    weightPower: 2,
  });

  // Glitch fill
  const [glitchSettings, setGlitchSettings] = useState({
    hBars: 12,
    vBars: 0,
    force: 0.35,
    activeRatio: 0.4,
    barSizeVariance: 0.5,
    direction: 'h',
    bidirectional: true,
    seed: Math.floor(Math.random() * 0x80000000),
    minDisplacement: 1,
    maxScale: 1,
    scaleFreq: 0,
  });
  const handleGlitchSettingsChange = useCallback((changes) => {
    setGlitchSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Strip fill
  const [stripSettings, setStripSettings] = useState({
    axis: 'h',
    angle: 0,
    position: 0.5,
    width: 4,
    feather: 0,
    seed: Math.floor(Math.random() * 0x80000000),
  });
  const handleStripSettingsChange = useCallback((changes) => {
    setStripSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Multi-strip / slash fill
  const [multiStripSettings, setMultiStripSettings] = useState({
    axis: 'angle',
    angle: 45,
    numStrips: 4,
    stripWidth: 3,
    spacing: 'even',
    positions: [],
    stagger: false,
    feather: 0,
    seed: Math.floor(Math.random() * 0x80000000),
  });
  const handleMultiStripSettingsChange = useCallback((changes) => {
    setMultiStripSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Edge Trace fill
  const [edgeSettings, setEdgeSettings] = useState({
    edgeThreshold: 0.2, traceWidth: 1, minEdgeLength: 1, direction: 'all',
  });
  const handleEdgeSettingsChange = useCallback((changes) => {
    setEdgeSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Brightness fill
  const [brightnessSettings, setBrightnessSettings] = useState({
    targetZone: 'lights', lowPoint: 0.33, highPoint: 0.66, invert: false, softEdge: 0,
    seed: Math.floor(Math.random() * 0x80000000),
  });
  const handleBrightnessSettingsChange = useCallback((changes) => {
    setBrightnessSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Noise Field fill
  const [noiseSettings, setNoiseSettings] = useState({
    scale: 0.2, threshold: 0.5, octaves: 1, invert: false,
    seed: Math.floor(Math.random() * 0x80000000),
  });
  const handleNoiseSettingsChange = useCallback((changes) => {
    setNoiseSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Geometric Pattern fill
  const [geometricSettings, setGeometricSettings] = useState({
    patternType: 'stripes', phase: 0,
    angle: 45, stripeWidth: 2, gapWidth: 2,
    centerX: 0.5, centerY: 0.5, ringWidth: 2, gap: 2, innerRadius: 0,
    tileSize: 2, offsetX: 0, offsetY: 0,
    numSpokes: 8, spokeWidth: 15,
    dotRadius: 1, spacingX: 3, spacingY: 3,
    cellRadius: 2, rowOffset: 0.5,
  });
  const handleGeometricSettingsChange = useCallback((changes) => {
    setGeometricSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Built-in asset enable/disable
  const [enabledAssetIds, setEnabledAssetIds] = useState(DEFAULT_ENABLED_IDS);

  const handleEnableAssets = useCallback((ids) => {
    setEnabledAssetIds(prev => new Set([...prev, ...ids]));
  }, []);

  const handleDisableAssets = useCallback((ids) => {
    setEnabledAssetIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const activeAssets = useMemo(
    () => ALL_BUILTIN_ASSETS.filter(a => enabledAssetIds.has(a.id)),
    [enabledAssetIds]
  );

  const [placedBlocks, setPlacedBlocks] = useState([]);
const [autoFill, setAutoFill] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Background image layer (reference / backdrop)
  const [backdropSrc, setBackdropSrc] = useState(null);
  const [backdropSettings, setBackdropSettings] = useState({
    mode: 'reference', opacity: 0.5, fit: 'contain', tintColour: '#000000', tintOpacity: 0,
  });
  const handleBackdropSettingsChange = useCallback((changes) => {
    setBackdropSettings(prev => ({ ...prev, ...changes }));
  }, []);

  // Pixel buffer for the backdrop image, used by the Palette Extractor.
  const [backdropPixels, setBackdropPixels] = useState(null);
  useEffect(() => {
    if (!backdropSrc) { setBackdropPixels(null); return; }
    let cancelled = false;
    loadImagePixels(backdropSrc).then(px => { if (!cancelled) setBackdropPixels(px); }).catch(() => {});
    return () => { cancelled = true; };
  }, [backdropSrc]);

  // Image colour mode
  const [imageSrc, setImageSrc] = useState(null);
  const [imagePixels, setImagePixels] = useState(null);
  const [imageDataUrls, setImageDataUrls] = useState({});
  const [imageProgress, setImageProgress] = useState(null);
  const [imageColourTolerance, setImageColourTolerance] = useState(0);

  // Palette Extractor
  const [paletteExtractSettings, setPaletteExtractSettings] = useState({
    numColours: 6, extractFrom: 'image',
  });
  const handlePaletteExtractSettingsChange = useCallback((changes) => {
    setPaletteExtractSettings(prev => ({ ...prev, ...changes }));
  }, []);
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
  const [animSettings, setAnimSettings] = useState(ANIM_DEFAULTS);
  const handleAnimSettingsChange = useCallback(
    updates => setAnimSettings(prev => ({ ...prev, ...updates })),
    []
  );
  const imageRefsMap = useRef({});
  const slotRefsMap = useRef({});

  // Audio Reactive Mode
  const [audioSettings, setAudioSettings] = useState({
    enabled: false,
    inputSource: 'mic',
    ampMapping: 'linear',
    beatSensitivity: 0.5,
  });
  const [audioFileSrc, setAudioFileSrc] = useState(null);
  const handleAudioSettingsChange = useCallback(
    updates => setAudioSettings(prev => ({ ...prev, ...updates })),
    []
  );
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

  const skipNextClear = useRef(false);

  // ── History ────────────────────────────────────────────────────────────────
  const {
    pushHistory,
    handleUndo: _handleUndo,
    handleRedo: _handleRedo,
    historySize,
    syncHistorySize,
    clearHistory,
  } = useHistory(placedBlocks, setPlacedBlocks);

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
    if (skipNextClear.current) { skipNextClear.current = false; prevGridRef.current = gridComputed; return; }

    const prev = prevGridRef.current;
    prevGridRef.current = gridComputed;

    if (!gridComputed) { setPlacedBlocks([]); return; }
    if (!prev || !placedBlocksRef.current.length) return;

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

  useEffect(() => {
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
    setViewTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.05), 20);
      const sf = newScale / prev.scale;
      const cx = prev.x + (workArea.width * prev.scale) / 2;
      const cy = prev.y + (workArea.height * prev.scale) / 2;
      return { scale: newScale, x: cx - (cx - prev.x) * sf, y: cy - (cy - prev.y) * sf };
    });
  }, [workArea]);

  const handleResetView = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const padding = 80;
    const scale = Math.min((vw - padding * 2) / workArea.width, (vh - padding * 2) / workArea.height, 1);
    setViewTransform({
      x: (vw - workArea.width * scale) / 2,
      y: (vh - workArea.height * scale) / 2,
      scale,
    });
  }, [workArea]);

  // ── Fill ───────────────────────────────────────────────────────────────────
  const assetUsageCounts = useMemo(() => {
    const counts = {};
    for (const b of placedBlocks) counts[b.assetId] = (counts[b.assetId] ?? 0) + 1;
    return counts;
  }, [placedBlocks]);

  const handleFillGrid = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    const blocks = fillGrid(activeAssets, gridComputed, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
    syncHistorySize();
  }, [activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

  const handleFillGaps = useCallback(() => {
    if (!activeAssets.length || !gridComputed) return;
    pushHistory(placedBlocks);
    const newBlocks = fillGrid(activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(prev => [...prev, ...newBlocks]);
    syncHistorySize();
  }, [activeAssets, gridComputed, maxScale, scaleFreq, placedBlocks, pushHistory, syncHistorySize]);

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

  // ── Save / Load / Export ───────────────────────────────────────────────────
  const handleLoadProject = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const state = JSON.parse(evt.target.result);
        if (state.version !== 1 && state.version !== 2) return;
        skipNextClear.current = true;
        if (state.presetKey)    setPresetKey(state.presetKey);
        if (state.customSize)   setCustomSize(state.customSize);
        if (state.gridSettings) setGridSettings(state.gridSettings);
        if (state.maxScale != null)  setMaxScale(state.maxScale);
        if (state.scaleFreq != null) setScaleFreq(state.scaleFreq);
        if (state.bgColor)    setBgColor(state.bgColor);
        if (state.canvasBg)   setCanvasBg(state.canvasBg);
        if (state.colorMode)  setColorMode(state.colorMode);
        if (state.paletteKey) setPaletteKey(state.paletteKey);
        if (state.shapeColors) setShapeColors(state.shapeColors);
        if (state.bgColors)    setBgColors(state.bgColors);
        if (state.gradientSettings) setGradientSettings(prev => ({ ...prev, ...state.gradientSettings }));
        if (state.meshSettings) setMeshSettings(prev => ({ ...prev, ...state.meshSettings }));
        if (state.glitchSettings) setGlitchSettings(prev => ({ ...prev, ...state.glitchSettings }));
        if (state.stripSettings) setStripSettings(prev => ({ ...prev, ...state.stripSettings }));
        if (state.multiStripSettings) setMultiStripSettings(prev => ({ ...prev, ...state.multiStripSettings }));
        if (state.audioSettings) setAudioSettings(prev => ({ ...prev, ...state.audioSettings, enabled: false }));
        if (state.backdropSrc !== undefined) setBackdropSrc(state.backdropSrc);
        if (state.backdropSettings) setBackdropSettings(prev => ({ ...prev, ...state.backdropSettings }));
        if (state.edgeSettings) setEdgeSettings(prev => ({ ...prev, ...state.edgeSettings }));
        if (state.brightnessSettings) setBrightnessSettings(prev => ({ ...prev, ...state.brightnessSettings }));
        if (state.noiseSettings) setNoiseSettings(prev => ({ ...prev, ...state.noiseSettings }));
        if (state.geometricSettings) setGeometricSettings(prev => ({ ...prev, ...state.geometricSettings }));
        if (state.enabledAssetIds) setEnabledAssetIds(new Set(state.enabledAssetIds));
        if (state.placedBlocks)  setPlacedBlocks(state.placedBlocks);
        setSelectedIds(new Set());
      } catch {
        // silently ignore malformed files
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setColorMode, setPaletteKey, setShapeColors, setBgColors, setSelectedIds]);

  const handleSaveProject = useCallback(() => {
    const state = {
      version: 2,
      presetKey,
      customSize,
      gridSettings,
      maxScale,
      scaleFreq,
      bgColor,
      canvasBg,
      colorMode,
      paletteKey,
      shapeColors,
      bgColors,
      gradientSettings,
      meshSettings,
      glitchSettings,
      stripSettings,
      multiStripSettings,
      audioSettings,
      backdropSrc,
      backdropSettings,
      edgeSettings,
      brightnessSettings,
      noiseSettings,
      geometricSettings,
      enabledAssetIds: [...enabledAssetIds],
      placedBlocks,
    };
    const json = JSON.stringify(state, null, 2);
    if (isTauri) {
      (async () => {
        try {
          const path = await tauriSaveDialog({
            title: 'Save Project',
            defaultPath: 'grid-project.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
          });
          if (!path) return;
          await writeTextFile(path, json);
        } catch (err) {
          alert('Save failed: ' + err.message);
        }
      })();
      return;
    }
    downloadBlob(new Blob([json], { type: 'application/json' }), 'grid-project.json');
  }, [presetKey, customSize, gridSettings, maxScale, scaleFreq, bgColor, canvasBg, colorMode, paletteKey, shapeColors, bgColors, gradientSettings, meshSettings, glitchSettings, stripSettings, multiStripSettings, audioSettings, backdropSrc, backdropSettings, edgeSettings, brightnessSettings, noiseSettings, geometricSettings, enabledAssetIds, placedBlocks]);

  const handleExport = useCallback(async (options = {}) => {
    const {
      format = 'svg',
      scale = 1,
      transparentBackground = false,
      jpegQuality = 0.92,
      photoComposite = false,
    } = options;
    if (!placedBlocks.length || !gridComputed) return;

    const effectiveBackdropSettings = (photoComposite && backdropSrc)
      ? { ...backdropSettings, mode: 'backdrop' }
      : backdropSettings;

    const commonBuildArgs = {
      placedBlocks, workArea, gridComputed, colorMode, activePalette, activeBgColors,
      canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled,
      colourRemap: imageColourRemap,
      backdropSrc, backdropSettings: effectiveBackdropSettings, blendMode,
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
  }, [placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, activeGradientSettings, meshSettings, randomReverseEnabled, imageColourRemap, backdropSrc, backdropSettings, blendMode]);

  return (
    <div className={styles.app}>
        <Canvas
          viewTransform={viewTransform}
          setViewTransform={setViewTransform}
          activeTool={activeTool}
          bgColor={bgColor}
          canvasBg={canvasBg}
          workArea={workArea}
          onDeselectAll={handleDeselectAll}
          onMarqueeSelect={handleMarqueeSelect}
          onViewportResize={setViewportSize}
          overlay={
            <SelectionToolbar
              selectedBlocks={selectedBlocks}
              viewTransform={viewTransform}
              gridComputed={gridComputed}
              colorMode={colorMode}
              effectivePalette={activePalette}
              bgOptions={activeBgColors}
              onDelete={handleDeleteSelected}
              onRefresh={handleRefreshSelected}
              onRandomise={handleRandomiseSelected}
              onSwap={handleSwapSelected}
              onToggleLock={handleToggleLockSelected}
            />
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
            block={contextMenu.block}
            colorMode={colorMode}
            onClose={() => setContextMenu(null)}
            onDelete={handleContextDelete}
            onToggleLock={handleContextToggleLock}
            onRefresh={handleContextRefresh}
            onRandomise={handleContextRandomise}
          />
        )}

        <FloatingPanel
          activeTool={activeTool}
          onToolChange={setActiveTool}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
          canvasBg={canvasBg}
          onCanvasBgChange={setCanvasBg}
          viewTransform={viewTransform}
          onZoom={handleZoom}
          onResetView={handleResetView}
          presetKey={presetKey}
          onPresetChange={setPresetKey}
          customSize={customSize}
          onCustomSizeChange={setCustomSize}
          gridSettings={gridSettings}
          onGridSettingsChange={handleGridSettingsChange}
          gridComputed={gridComputed}
          validCols={validCols}
          enabledAssetIds={enabledAssetIds}
          onEnableAssets={handleEnableAssets}
          onDisableAssets={handleDisableAssets}
          onFillGrid={handleFillGrid}
          onFillGaps={handleFillGaps}
          onGlitchFill={handleGlitchFill}
          canGlitchFill={activeAssets.length > 0 && gridComputed !== null}
          glitchSettings={glitchSettings}
          onGlitchSettingsChange={handleGlitchSettingsChange}
          hasImage={!!imagePixels}
          onStripFill={handleStripFill}
          canStripFill={activeAssets.length > 0 && gridComputed !== null}
          stripSettings={stripSettings}
          onStripSettingsChange={handleStripSettingsChange}
          onMultiStripFill={handleMultiStripFill}
          canMultiStripFill={activeAssets.length > 0 && gridComputed !== null}
          multiStripSettings={multiStripSettings}
          onMultiStripSettingsChange={handleMultiStripSettingsChange}
          audioSettings={audioSettings}
          onAudioSettingsChange={handleAudioSettingsChange}
          audioFileSrc={audioFileSrc}
          onAudioFileChange={setAudioFileSrc}
          backdropSrc={backdropSrc}
          onBackdropSrcChange={setBackdropSrc}
          backdropSettings={backdropSettings}
          onBackdropSettingsChange={handleBackdropSettingsChange}
          paletteExtractSettings={paletteExtractSettings}
          onPaletteExtractSettingsChange={handlePaletteExtractSettingsChange}
          extractedPalette={extractedPalette}
          onApplyExtractedToShapes={handleApplyExtractedToShapes}
          onApplyExtractedToBg={handleApplyExtractedToBg}
          canExtractFromBackdrop={!!backdropPixels}
          canExtractFromImage={!!imagePixels}
          onEdgeFill={handleEdgeFill}
          canEdgeFill={activeAssets.length > 0 && gridComputed !== null && !!imagePixels}
          edgeSettings={edgeSettings}
          onEdgeSettingsChange={handleEdgeSettingsChange}
          onBrightnessFill={handleBrightnessFill}
          canBrightnessFill={activeAssets.length > 0 && gridComputed !== null && !!imagePixels}
          brightnessSettings={brightnessSettings}
          onBrightnessSettingsChange={handleBrightnessSettingsChange}
          onNoiseFill={handleNoiseFill}
          canNoiseFill={activeAssets.length > 0 && gridComputed !== null}
          noiseSettings={noiseSettings}
          onNoiseSettingsChange={handleNoiseSettingsChange}
          onGeometricFill={handleGeometricFill}
          canGeometricFill={activeAssets.length > 0 && gridComputed !== null}
          geometricSettings={geometricSettings}
          onGeometricSettingsChange={handleGeometricSettingsChange}
          onExport={handleExport}
          workArea={workArea}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historySize.undo > 0}
          canRedo={historySize.redo > 0}
          canFill={activeAssets.length > 0 && gridComputed !== null}
          canFillGaps={activeAssets.length > 0 && gridComputed !== null && placedBlocks.length > 0}
          canExport={placedBlocks.length > 0}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          paletteKey={paletteKey}
          onPaletteKeyChange={handlePaletteKeyChange}
          shapeColors={shapeColors}
          onShapeColorsChange={setShapeColors}
          bgColors={bgColors}
          onBgColorsChange={setBgColors}
          customPalettes={customPalettes}
          onSaveCustomPalette={handleSaveCustomPalette}
          onDeleteCustomPalette={handleDeleteCustomPalette}
          onApplyCustomPalette={handleApplyCustomPalette}
          maxScale={maxScale}
          onMaxScaleChange={setMaxScale}
          scaleFreq={scaleFreq}
          onScaleFreqChange={setScaleFreq}
          autoFill={autoFill}
          onAutoFillChange={setAutoFill}
          uniformReverse={uniformReverse}
          onUniformReverseChange={setUniformReverse}
          colorTempShift={colorTempShift}
          onColorTempShiftChange={setColorTempShift}
          blendMode={blendMode}
          onBlendModeChange={setBlendMode}
          randomReverseEnabled={randomReverseEnabled}
          onRandomReverseEnabledChange={setRandomReverseEnabled}
          randomReversePct={randomReversePct}
          onRandomReversePctChange={setRandomReversePct}
          onRandomReverse={handleRandomReverse}
          onRandomRerun={handleRandomRerun}
          gradientSettings={gradientSettings}
          onGradientSettingsChange={setGradientSettings}
          meshSettings={meshSettings}
          onMeshSettingsChange={setMeshSettings}
          imageSrc={imageSrc}
          onImageSrcChange={setImageSrc}
          imageProgress={imageProgress}
          imageColourTolerance={imageColourTolerance}
          onImageColourToleranceChange={setImageColourTolerance}
          animSettings={animSettings}
          onAnimSettingsChange={handleAnimSettingsChange}
          showShortcuts={showShortcuts}
          onToggleShortcuts={() => setShowShortcuts(s => !s)}
          assetUsageCounts={assetUsageCounts}
          onFlipH={handleFlipH}
          onFlipV={handleFlipV}
          canFlip={placedBlocks.length > 0}
        />
    </div>
  );
}

export default App;
