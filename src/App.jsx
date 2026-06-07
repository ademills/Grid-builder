import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Canvas } from './components/Canvas';
import { ContextMenu } from './components/ContextMenu';
import { FloatingPanel } from './components/FloatingPanel';
import { AnimationLayer, ANIM_DEFAULTS, ANIM_FILTER_ID } from './components/AnimationLayer';
import { Grid } from './components/Grid';
import { PlacedBlocks } from './components/PlacedBlocks';
import { SelectionToolbar } from './components/SelectionToolbar';
import { PRESETS, computeGrid, getValidCols } from './gridPresets';
import { fillGrid } from './utils/binPack';
import { colorizeSvg, colorizeSvgByImage, buildColourRemap } from './utils/colorize';
import { separateByColourSVG, extractShapesAsPaths } from './utils/colourSeparation';
import { buildGridCells, renderImageFrame } from './utils/shapeLibraryRender';
import shapeLibraryData from './assets/shapeLibrary.json';
import { ALL_BUILTIN_ASSETS, DEFAULT_ENABLED_IDS } from './builtinAssets';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useHistory } from './hooks/useHistory';
import { useColorPalette } from './hooks/useColorPalette';
import { useSelection } from './hooks/useSelection';
import './App.css';
import styles from './App.module.css';


function App() {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
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

  const activePalette = useMemo(
    () => uniformReverse && colorMode === 'uniform' ? [...effectivePalette].reverse() : effectivePalette,
    [uniformReverse, colorMode, effectivePalette],
  );

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
  const [exportMode, setExportMode] = useState('current');
  const [separationProgress, setSeparationProgress] = useState(null);
  const separationWorkerRef = useRef(null);
const [autoFill, setAutoFill] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Image colour mode
  const [imageSrc, setImageSrc] = useState(null);
  const [imagePixels, setImagePixels] = useState(null);
  const [imageDataUrls, setImageDataUrls] = useState({});
  const [imageProgress, setImageProgress] = useState(null);
  const [imageColourTolerance, setImageColourTolerance] = useState(0);

  // Animation
  const [animSettings, setAnimSettings] = useState(ANIM_DEFAULTS);
  const handleAnimSettingsChange = useCallback(
    updates => setAnimSettings(prev => ({ ...prev, ...updates })),
    []
  );
  const imageRefsMap = useRef({});
  const slotRefsMap = useRef({});

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

  // Image colour mode — pure arithmetic pass against the pre-built shape library.
  // Pre-clears old URLs so the browser frees decoded SVG bitmaps before allocating new ones,
  // then defers the computation one rAF so it doesn't block the React render cycle.
  useEffect(() => {
    if (colorMode !== 'image' || !imagePixels || !gridCells.length) {
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
    const rafId = requestAnimationFrame(() => {
      setImageDataUrls(
        renderImageFrame(snapCells, shapeLibraryData.shapes, snapPixels, snapW, snapH)
      );
      setImageProgress(null);
    });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, imagePixels, gridCells, workArea.width, workArea.height]);

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

  // ── Save / Load / Export ───────────────────────────────────────────────────
  const handleLoadProject = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const state = JSON.parse(evt.target.result);
        if (state.version !== 1) return;
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
      version: 1,
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
      enabledAssetIds: [...enabledAssetIds],
      placedBlocks,
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grid-project.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [presetKey, customSize, gridSettings, maxScale, scaleFreq, bgColor, canvasBg, colorMode, paletteKey, shapeColors, bgColors, gradientSettings, enabledAssetIds, placedBlocks]);

  const handleExport = useCallback(() => {
    if (!placedBlocks.length || !gridComputed) return;

    const { width, height } = workArea;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const EXPORT_UNIT = 500;
    // Convert page and margin dimensions to the native 500-unit coordinate space.
    // This gives scale=1.0 for standard 500×500 blocks while preserving margins.
    const unitPerPx = EXPORT_UNIT / cellSize;
    const exportW = Math.round(width  * unitPerPx);
    const exportH = Math.round(height * unitPerPx);
    const exportMX = Math.round(gridOriginX * unitPerPx);
    const exportMY = Math.round(gridOriginY * unitPerPx);
    const palette = activePalette;
    const svgNS = 'http://www.w3.org/2000/svg';
    const parser = new DOMParser();

    const flattenStyles = (doc) => {
      const root = doc.documentElement;
      const map = {};
      root.querySelectorAll('style').forEach(s => {
        for (const [, cls, fill] of (s.textContent || '').matchAll(
          /\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs
        )) map[cls] = fill.trim();
      });
      if (!Object.keys(map).length) return;
      const sel = 'rect,circle,ellipse,path,polygon,polyline,line';
      root.querySelectorAll(sel).forEach(el => {
        const cls = (el.getAttribute('class') || '').trim().split(/\s+/);
        const cssFill = cls.map(c => map[c]).find(v => v !== undefined);
        if (cssFill === undefined) return;
        const style = el.getAttribute('style') || '';
        if (!/\bfill\s*:/.test(style)) {
          el.setAttribute('style', `${style}${style ? ';' : ''}fill:${cssFill}`);
        }
      });
      root.querySelectorAll('style').forEach(s => s.remove());
    };

    const out = document.createElementNS(svgNS, 'svg');
    out.setAttribute('xmlns', svgNS);
    out.setAttribute('width', String(width));
    out.setAttribute('height', String(height));
    out.setAttribute('viewBox', `0 0 ${exportW} ${exportH}`);

    const bgRect = document.createElementNS(svgNS, 'rect');
    bgRect.setAttribute('width', String(exportW));
    bgRect.setAttribute('height', String(exportH));
    bgRect.setAttribute('fill', canvasBg);
    out.appendChild(bgRect);

    placedBlocks.forEach(block => {
      // Screen-space coords used only for image-pixel sampling
      const imgBx = gridOriginX + block.gridCol * cellSize;
      const imgBy = gridOriginY + block.gridRow * cellSize;
      const imgBw = block.cols * cellSize;
      const imgBh = block.rows * cellSize;
      // Export-space coords: margin + integer block position (scale=1.0 for 500×500 blocks)
      const bx = exportMX + block.gridCol * EXPORT_UNIT;
      const by = exportMY + block.gridRow * EXPORT_UNIT;
      const bw = block.cols * EXPORT_UNIT;
      const bh = block.rows * EXPORT_UNIT;

      const blockPalette = (randomReverseEnabled && block.reverseColor) ? [...palette].reverse() : palette;
      let svgText;
      if (colorMode === 'image') {
        svgText = colorizeSvgByImage(block.svgContent, imgBx, imgBy, imgBw, imgBh, imagePixels);
      } else if (colorMode !== 'none') {
        svgText = colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, activeBgColors,
          colorMode === 'gradient' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...activeGradientSettings } : null);
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

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
      for (const child of [...blockRoot.childNodes]) g.appendChild(document.importNode(child, true));
      out.appendChild(g);
    });

    const blob = new Blob(
      [new XMLSerializer().serializeToString(out)],
      { type: 'image/svg+xml' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grid-layout.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, activeGradientSettings, randomReverseEnabled]);


  const handleExportSeparated = useCallback(() => {
    if (!placedBlocks.length || !gridComputed) return;

    const { width, height } = workArea;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const EXPORT_UNIT = 500;
    const unitPerPx = EXPORT_UNIT / cellSize;
    const exportW = Math.round(width  * unitPerPx);
    const exportH = Math.round(height * unitPerPx);
    const exportMX = Math.round(gridOriginX * unitPerPx);
    const exportMY = Math.round(gridOriginY * unitPerPx);
    const palette = activePalette;
    const svgNS = 'http://www.w3.org/2000/svg';
    const parser = new DOMParser();

    const flattenStyles = (doc) => {
      const root = doc.documentElement;
      const map = {};
      root.querySelectorAll('style').forEach(s => {
        for (const [, cls, fill] of (s.textContent || '').matchAll(
          /\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs
        )) map[cls] = fill.trim();
      });
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

    // Per-block shape extraction — each block is divided independently
    const blockShapesList = [];

    placedBlocks.forEach(block => {
      const imgBx = gridOriginX + block.gridCol * cellSize;
      const imgBy = gridOriginY + block.gridRow * cellSize;
      const imgBw = block.cols * cellSize;
      const imgBh = block.rows * cellSize;
      const bx = exportMX + block.gridCol * EXPORT_UNIT;
      const by = exportMY + block.gridRow * EXPORT_UNIT;
      const bw = block.cols * EXPORT_UNIT;
      const bh = block.rows * EXPORT_UNIT;

      const blockPalette = (randomReverseEnabled && block.reverseColor) ? [...palette].reverse() : palette;
      let svgText;
      if (colorMode === 'image') {
        svgText = colorizeSvgByImage(block.svgContent, imgBx, imgBy, imgBw, imgBh, imagePixels);
      } else if (colorMode !== 'none') {
        svgText = colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, activeBgColors,
          colorMode === 'gradient' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...activeGradientSettings } : null);
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
        vbW = parseFloat(blockRoot.getAttribute('width') || String(bw));
        vbH = parseFloat(blockRoot.getAttribute('height') || String(bh));
      }


      const scale = Math.min(bw / vbW, bh / vbH);
      const tx = bx + (bw - vbW * scale) / 2 - vbX * scale;
      const ty = by + (bh - vbH * scale) / 2 - vbY * scale;

      // translate(tx,ty) scale(scale) as a matrix [a,b,c,d,e,f]
      const placementMatrix = [scale, 0, 0, scale, tx, ty];
      const blockShapes = extractShapesAsPaths(blockRoot, placementMatrix);
      if (blockShapes.length) blockShapesList.push(blockShapes);
    });

    // Global colour aggregation across all blocks — must be cross-block so that
    // near-identical colours from different blocks collapse to the same layer
    if (colorMode === 'image' && imageColourTolerance > 0) {
      const allFills = blockShapesList.flatMap(bs => bs.map(s => s.fill));
      const remap = buildColourRemap(allFills, imageColourTolerance);
      if (remap) {
        for (const bs of blockShapesList)
          for (const s of bs)
            s.fill = remap[s.fill] ?? s.fill;
      }
    }

    if (separationWorkerRef.current) separationWorkerRef.current.terminate();
    const worker = new Worker(new URL('./workers/separationWorker.js', import.meta.url), { type: 'module' });
    separationWorkerRef.current = worker;
    setSeparationProgress(0);

    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        setSeparationProgress(data.value);
        return;
      }
      if (data.type === 'error') {
        setSeparationProgress(null);
        separationWorkerRef.current = null;
        alert('Separation failed: ' + data.message);
        return;
      }
      if (data.type !== 'done') return;

      setSeparationProgress(null);
      separationWorkerRef.current = null;

      const { order, united } = data.result;

      const out = document.createElementNS(svgNS, 'svg');
      out.setAttribute('xmlns', svgNS);
      out.setAttribute('width', String(width));
      out.setAttribute('height', String(height));
      out.setAttribute('viewBox', `0 0 ${exportW} ${exportH}`);

      const bgRect = document.createElementNS(svgNS, 'rect');
      bgRect.setAttribute('width', String(exportW));
      bgRect.setAttribute('height', String(exportH));
      bgRect.setAttribute('fill', canvasBg);
      out.appendChild(bgRect);

      for (const fill of order) {
        const d = united[fill];
        if (!d) continue;
        const layerG = document.createElementNS(svgNS, 'g');
        layerG.setAttribute('id', `layer_${fill.replace(/[^a-zA-Z0-9]/g, '_')}`);
        layerG.setAttribute('data-colour', fill);
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('fill', fill);
        p.setAttribute('fill-rule', 'nonzero');
        layerG.appendChild(p);
        out.appendChild(layerG);
      }

      const blob = new Blob([new XMLSerializer().serializeToString(out)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'grid-layout-separated.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    worker.postMessage({ type: 'separate', blockShapesList });
  }, [placedBlocks, gridComputed, workArea, colorMode, activePalette, activeBgColors, canvasBg, imagePixels, imageColourTolerance, activeGradientSettings, randomReverseEnabled]);

  const handleReprocessSvg = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(e.target.result, 'image/svg+xml');
        if (svgDoc.querySelector('parsererror')) { alert('Could not parse SVG file.'); return; }

        const svgEl = svgDoc.documentElement;
        const vbStr = svgEl.getAttribute('viewBox');
        let width, height;
        if (vbStr) {
          const p = vbStr.trim().split(/[\s,]+/).map(Number);
          width = p[2]; height = p[3];
        } else {
          width  = parseFloat(svgEl.getAttribute('width')  || '800');
          height = parseFloat(svgEl.getAttribute('height') || '600');
        }
        const bgFill = svgEl.querySelector('rect')?.getAttribute('fill') ?? '#ffffff';

        // Flatten CSS class fills to inline style attributes
        const map = {};
        svgEl.querySelectorAll('style').forEach(s => {
          for (const [, cls, fill] of (s.textContent || '').matchAll(
            /\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs
          )) map[cls] = fill.trim();
        });
        if (Object.keys(map).length) {
          svgEl.querySelectorAll('rect,circle,ellipse,path,polygon,polyline,line').forEach(el => {
            const cls = (el.getAttribute('class') || '').trim().split(/\s+/);
            const cssFill = cls.map(c => map[c]).find(v => v !== undefined);
            if (cssFill === undefined) return;
            const style = el.getAttribute('style') || '';
            if (!/\bfill\s*:/.test(style))
              el.setAttribute('style', `${style}${style ? ';' : ''}fill:${cssFill}`);
          });
        }

        const out = separateByColourSVG(svgEl, width, height, bgFill);
        const baseName = file.name.replace(/\.svg$/i, '');
        const blob = new Blob([new XMLSerializer().serializeToString(out)], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}-separated.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        alert('Error reading SVG: ' + err.message);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleExportDispatch = useCallback(() => {
    try {
      if (exportMode === 'separated') handleExportSeparated();
      else handleExport();
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }, [exportMode, handleExport, handleExportSeparated]);

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
          <Grid workArea={workArea} gridSettings={gridSettings} />
          <PlacedBlocks
            placedBlocks={placedBlocks}
            gridComputed={gridComputed}
            viewScale={viewTransform.scale}
            activeTool={activeTool}
selectedIds={selectedIds}
            onSelect={handleSelectBlock}
            onContextMenu={handleOpenContextMenu}
            colorMode={colorMode}
            effectivePalette={activePalette}
            bgOptions={activeBgColors}
            gradientSettings={activeGradientSettings}
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
          />
          <AnimationLayer
            animSettings={animSettings}
            gridCells={gridCells}
            gridComputed={gridComputed}
            palette={activePalette}
            workArea={workArea}
            imageRefsMap={imageRefsMap}
            slotRefsMap={slotRefsMap}
          />
        </Canvas>

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
          onExport={handleExportDispatch}
          exportMode={exportMode}
          onExportModeChange={setExportMode}
          separationProgress={separationProgress}
          onReprocessSvg={handleReprocessSvg}
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
          randomReverseEnabled={randomReverseEnabled}
          onRandomReverseEnabledChange={setRandomReverseEnabled}
          randomReversePct={randomReversePct}
          onRandomReversePctChange={setRandomReversePct}
          onRandomReverse={handleRandomReverse}
          onRandomRerun={handleRandomRerun}
          gradientSettings={gradientSettings}
          onGradientSettingsChange={setGradientSettings}
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
