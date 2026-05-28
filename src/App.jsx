import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Canvas } from './components/Canvas';
import { ContextMenu } from './components/ContextMenu';
import { FloatingPanel } from './components/FloatingPanel';
import { Grid } from './components/Grid';
import { PlacedBlocks } from './components/PlacedBlocks';
import { SelectionToolbar } from './components/SelectionToolbar';
import { PRESETS, computeGrid, getValidCols } from './gridPresets';
import { fillGrid } from './utils/binPack';
import { PALETTE_KEYS, PALETTES, colorizeSvg, colorizeSvgByImage, getSvgTemplate, colorizeSvgFromTemplate } from './utils/colorize';
import { ALL_BUILTIN_ASSETS, DEFAULT_ENABLED_IDS } from './builtinAssets';
import './App.css';
import styles from './App.module.css';

function App() {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState('select');
  const [bgColor, setBgColor] = useState('#2d2d2d');
  const [canvasBg, setCanvasBg] = useState('#ffffff');

  // Scale placement
  const [maxScale, setMaxScale] = useState(1);       // 1 | 2 | 3 | 4
  const [scaleFreq, setScaleFreq] = useState(0);     // 0-100 %

  // Colour palette
  const [colorMode, setColorMode] = useState('none'); // 'none' | 'uniform' | 'random'
  const [paletteKey, setPaletteKey] = useState(PALETTE_KEYS[0]);
  const [shapeColors, setShapeColors] = useState(
    () => PALETTES[PALETTE_KEYS[0]].map((hex, i) => ({ id: `p-${i}`, hex, enabled: true, source: 'palette' }))
  );
  const [bgColors, setBgColors] = useState([
    { id: 'bg-white', hex: '#ffffff', enabled: true  },
    { id: 'bg-black', hex: '#000000', enabled: false },
  ]);

  // Custom saved palettes — persisted to localStorage
  const [customPalettes, setCustomPalettes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gb-custom-palettes') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('gb-custom-palettes', JSON.stringify(customPalettes));
  }, [customPalettes]);

  const handleSaveCustomPalette = useCallback((name) => {
    if (!name.trim()) return;
    const colors = shapeColors.filter(c => c.enabled).map(c => c.hex);
    if (!colors.length) return;
    setCustomPalettes(prev => [...prev.filter(p => p.name !== name.trim()), { name: name.trim(), colors }]);
  }, [shapeColors]);

  const handleDeleteCustomPalette = useCallback((name) => {
    setCustomPalettes(prev => prev.filter(p => p.name !== name));
  }, []);

  const handleApplyCustomPalette = useCallback((palette) => {
    setShapeColors(palette.colors.map((hex, i) => ({ id: `cp-${palette.name}-${i}`, hex, enabled: true, source: 'palette' })));
  }, []);

  // When the palette theme changes: replace palette entries, keep custom colours in place
  const handlePaletteKeyChange = useCallback((key) => {
    setPaletteKey(key);
    setShapeColors(prev => {
      const custom  = prev.filter(c => c.source === 'custom');
      const palette = (PALETTES[key] ?? []).map((hex, i) => ({ id: `p-${key}-${i}`, hex, enabled: true, source: 'palette' }));
      return [...palette, ...custom];
    });
  }, []);

  const effectivePalette = useMemo(() => {
    const active = shapeColors.filter(c => c.enabled).map(c => c.hex);
    return active.length ? active : shapeColors.map(c => c.hex);
  }, [shapeColors]);

  const activeBgColors = useMemo(
    () => bgColors.filter(c => c.enabled).map(c => c.hex),
    [bgColors]
  );

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

  // Valid column counts for the current work area + border
  const validCols = useMemo(
    () => getValidCols(workArea, gridSettings.borderPct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workArea.width, workArea.height, gridSettings.borderPct]
  );

  // When the valid-col list changes, snap to the nearest valid value
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

  // Uploaded custom assets (supplementary)
  const [assets, setAssets] = useState([]);

  // All assets available for fill = enabled builtins + custom uploads
  const activeAssets = useMemo(
    () => [...ALL_BUILTIN_ASSETS.filter(a => enabledAssetIds.has(a.id)), ...assets],
    [enabledAssetIds, assets]
  );

  const [placedBlocks, setPlacedBlocks] = useState([]);
  const [dragShadow, setDragShadow] = useState(null);
  const [autoFill, setAutoFill] = useState(false);
  const [gradientSettings, setGradientSettings] = useState({
    angle: 45,
    gradMode: 'linear',
    centerX: 0.5,
    centerY: 0.5,
    gradScale: 1,
    reverseBg: false,
    gradBgColors: [{ id: 'grad-bg-1', hex: '#ffffff', enabled: true }],
  });

  // Resolve gradBgColors to active-only hex array so colorizeSvg receives plain strings
  const activeGradientSettings = useMemo(() => ({
    ...gradientSettings,
    gradBgColors: (gradientSettings.gradBgColors ?? []).filter(c => c.enabled).map(c => c.hex),
  }), [gradientSettings]);

  // Image colour mode
  const [imageSrc, setImageSrc] = useState(null);
  const [imagePixels, setImagePixels] = useState(null); // { data: Uint8ClampedArray, width, height }
  const [imageDataUrls, setImageDataUrls] = useState({}); // blockId → pre-computed data URL
  // Cache: keyed by (position + svgContent fingerprint), invalidated when imagePixels changes
  const imageUrlCacheRef = useRef({ pixels: null, map: new Map() });
  // Level-1 template cache: keyed by svgContent fingerprint, image-independent, survives image changes
  const svgTemplateCacheRef = useRef(new Map());
  const [imageProgress, setImageProgress] = useState(null); // null = idle, 0-100 = computing

  // Step 1: when the image or work area changes, extract the pixel buffer once
  useEffect(() => {
    if (colorMode !== 'image' || !imageSrc) {
      setImagePixels(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      const cw = workArea.width;
      const ch = workArea.height;
      const cv = document.createElement('canvas');
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext('2d');
      // Cover scaling: fill the canvas, preserve aspect ratio, centre
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = cw / ch;
      let dw, dh, dx, dy;
      if (imgAspect > canvasAspect) {
        dh = ch; dw = dh * imgAspect;
        dx = (cw - dw) / 2; dy = 0;
      } else {
        dw = cw; dh = dw / imgAspect;
        dx = 0; dy = (ch - dh) / 2;
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      const { data } = ctx.getImageData(0, 0, cw, ch);
      setImagePixels({ data, width: cw, height: ch });
    };
    img.src = imageSrc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, imageSrc, workArea.width, workArea.height]);

  // Step 2: compute coloured URLs in two phases so the browser never freezes.
  // Phase 1 builds image-independent SVG templates (DOMParser+serialize, once per unique SVG).
  // Phase 2 colorizes using those templates (no DOMParser — just pixel sampling + string replace).
  // On a refill with the same assets at new positions, phase 1 is entirely skipped.
  useEffect(() => {
    if (colorMode !== 'image' || !imagePixels || !gridComputed || !placedBlocks.length) {
      setImageDataUrls({});
      setImageProgress(null);
      return;
    }

    if (imageUrlCacheRef.current.pixels !== imagePixels) {
      imageUrlCacheRef.current = { pixels: imagePixels, map: new Map() };
    }
    const urlCache = imageUrlCacheRef.current.map;
    const tplCache = svgTemplateCacheRef.current;

    const makeSvgKey = (b) => `${b.svgContent.length}:${b.svgContent.slice(0, 256)}`;
    const makeUrlKey = (b) =>
      `${b.gridCol},${b.gridRow},${b.cols},${b.rows}:${makeSvgKey(b)}`;

    const { cellSize, gridOriginX, gridOriginY } = gridComputed;

    const fromCache = {};
    const toCompute = [];
    for (const block of placedBlocks) {
      const urlKey = makeUrlKey(block);
      const hit = urlCache.get(urlKey);
      if (hit) fromCache[block.id] = hit;
      else toCompute.push({ block, urlKey, svgKey: makeSvgKey(block) });
    }
    setImageDataUrls(fromCache);

    if (!toCompute.length) { setImageProgress(null); return; }

    // Unique SVGs that need a template built
    const svgContentByKey = {};
    for (const { block, svgKey } of toCompute) {
      if (!svgContentByKey[svgKey]) svgContentByKey[svgKey] = block.svgContent;
    }
    const missingTpls = Object.keys(svgContentByKey).filter(k => !tplCache.has(k));

    setImageProgress(0);
    let cancelled = false, timerId;

    // Phase 1: build missing templates (DOMParser + serialize, ~5-8ms each)
    let tplIdx = 0;
    const CHUNK_TPL = 4;
    const tickTemplates = () => {
      if (cancelled) return;
      const end = Math.min(tplIdx + CHUNK_TPL, missingTpls.length);
      for (; tplIdx < end; tplIdx++) {
        const key = missingTpls[tplIdx];
        const tpl = getSvgTemplate(svgContentByKey[key]);
        if (tpl) {
          if (tplCache.size >= 500) tplCache.clear();
          tplCache.set(key, tpl);
        }
      }
      setImageProgress(Math.round((tplIdx / missingTpls.length) * 30));
      if (tplIdx < missingTpls.length) {
        timerId = setTimeout(tickTemplates, 0);
      } else {
        timerId = setTimeout(tickColorize, 0);
      }
    };

    // Phase 2: colorize all toCompute blocks using templates (fast string replace)
    let clrIdx = 0;
    const CHUNK_CLR = 15;
    const tickColorize = () => {
      if (cancelled) return;
      const end = Math.min(clrIdx + CHUNK_CLR, toCompute.length);
      const chunk = {};
      for (; clrIdx < end; clrIdx++) {
        const { block, urlKey, svgKey } = toCompute[clrIdx];
        const bx = gridOriginX + block.gridCol * cellSize;
        const by = gridOriginY + block.gridRow * cellSize;
        const bw = block.cols * cellSize;
        const bh = block.rows * cellSize;
        const tpl = tplCache.get(svgKey);
        let svgStr = tpl ? colorizeSvgFromTemplate(tpl, bx, by, bw, bh, imagePixels) : null;
        if (!svgStr) {
          const raw = colorizeSvgByImage(block.svgContent, bx, by, bw, bh, imagePixels);
          svgStr = raw.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/gi, '');
        }
        const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
        chunk[block.id] = url;
        if (urlCache.size >= 300) urlCache.clear();
        urlCache.set(urlKey, url);
      }
      setImageDataUrls(prev => ({ ...prev, ...chunk }));
      setImageProgress(30 + Math.round((clrIdx / toCompute.length) * 70));
      if (clrIdx < toCompute.length) {
        timerId = setTimeout(tickColorize, 0);
      } else {
        timerId = setTimeout(() => { if (!cancelled) setImageProgress(null); }, 800);
      }
    };

    timerId = setTimeout(missingTpls.length ? tickTemplates : tickColorize, 0);
    return () => { cancelled = true; clearTimeout(timerId); setImageProgress(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode, imagePixels, placedBlocks, gridComputed]);

  const skipNextClear = useRef(false);

  // Undo/redo history — each entry is a snapshot of placedBlocks
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  const pushHistory = useCallback((snapshot) => {
    undoStack.current = [...undoStack.current, snapshot].slice(-50);
    redoStack.current = [];
  }, []);

  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });
  const syncHistorySize = useCallback(() => {
    setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [placedBlocks, ...redoStack.current].slice(0, 50);
    setPlacedBlocks(prev);
    setSelectedIds(new Set());
    syncHistorySize();
  }, [placedBlocks, syncHistorySize]);

  const handleRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, placedBlocks].slice(-50);
    setPlacedBlocks(next);
    setSelectedIds(new Set());
    syncHistorySize();
  }, [placedBlocks, syncHistorySize]);

  // When grid geometry changes: attempt proportional rescale, clear only if incompatible.
  // Suppressed during project load via skipNextClear.
  const prevGridRef = useRef(null);
  useEffect(() => {
    if (skipNextClear.current) { skipNextClear.current = false; prevGridRef.current = gridComputed; return; }

    const prev = prevGridRef.current;
    prevGridRef.current = gridComputed;

    if (!gridComputed) { setPlacedBlocks([]); return; }
    if (!prev || !placedBlocksRef.current.length) return; // nothing to rescale

    // Only attempt rescale when col/row count changed but block sizes stay compatible
    const scaleC = gridComputed.cols / prev.cols;
    const scaleR = gridComputed.rows / prev.rows;

    const rescaled = placedBlocksRef.current.map(b => ({
      ...b,
      gridCol: Math.round(b.gridCol * scaleC),
      gridRow: Math.round(b.gridRow * scaleR),
    }));

    // Validate: all blocks must fit within new grid bounds without overlap
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
      undoStack.current = [];
      redoStack.current = [];
      syncHistorySize();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridComputed?.cols, gridComputed?.rows, gridComputed?.cellSize]);

  // Auto-fill when settings change (runs after the clear effect above)
  const autoFillRef = useRef(autoFill);
  useEffect(() => { autoFillRef.current = autoFill; }, [autoFill]);
  const activeAssetsRef = useRef(activeAssets);
  useEffect(() => { activeAssetsRef.current = activeAssets; }, [activeAssets]);

  useEffect(() => {
    if (!autoFillRef.current || !gridComputed || !activeAssetsRef.current.length) return;
    const blocks = fillGrid(activeAssetsRef.current, gridComputed, maxScale, scaleFreq).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
      colorOffset: 0,
    }));
    setPlacedBlocks(blocks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridComputed?.cols, gridComputed?.rows, gridComputed?.cellSize, maxScale, scaleFreq]);

  // Undo/redo + arrow nudge keyboard shortcuts
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
        const moving  = prev.filter(b => selectedIdsRef.current.has(b.id));
        const still   = prev.filter(b => !selectedIdsRef.current.has(b.id));

        // Bounds check — abort if any block would leave the grid
        for (const b of moving) {
          if (b.gridCol + dx < 0 || b.gridCol + b.cols + dx > cols) return prev;
          if (b.gridRow + dy < 0 || b.gridRow + b.rows + dy > rows) return prev;
        }

        // Occupied set of still blocks
        const occupiedByStill = new Set(
          still.flatMap(b =>
            Array.from({ length: b.rows }, (_, r) =>
              Array.from({ length: b.cols }, (_, c) => `${b.gridCol + c},${b.gridRow + r}`)
            ).flat()
          )
        );

        // Check none of the moved blocks land on a still block
        for (const b of moving) {
          for (let r = 0; r < b.rows; r++)
            for (let c = 0; c < b.cols; c++)
              if (occupiedByStill.has(`${b.gridCol + c + dx},${b.gridRow + r + dy}`)) return prev;
        }

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

  // ── Asset ingestion ─────────────────────────────────────────────────────
  const handleIngestAssets = useCallback((e) => {
    const files = Array.from(e.target.files).filter(f =>
      f.name.toLowerCase().endsWith('.svg')
    );
    const promises = files.map(file => new Promise(resolve => {
      const parts = file.webkitRelativePath.split('/');
      const folderName = parts[parts.length - 2];
      const match = folderName.match(/^(\d+)x(\d+)$/i);
      if (!match) { resolve(null); return; }
      const cols = parseInt(match[1], 10);
      const rows = parseInt(match[2], 10);
      if (cols < 1 || rows < 1) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = evt => resolve({
        id: crypto.randomUUID(), name: file.name, cols, rows, svgContent: evt.target.result,
      });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    }));
    Promise.all(promises).then(results => {
      setAssets(results.filter(Boolean));
      setPlacedBlocks([]);
    });
  }, []);

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

  // ── Selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { block, x, y }

  const assetUsageCounts = useMemo(() => {
    const counts = {};
    for (const b of placedBlocks) counts[b.assetId] = (counts[b.assetId] ?? 0) + 1;
    return counts;
  }, [placedBlocks]);

  const selectedBlocks = useMemo(
    () => placedBlocks.filter(b => selectedIds.has(b.id)),
    [placedBlocks, selectedIds]
  );

  const handleSelectBlock = useCallback((id, addToSelection) => {
    setSelectedIds(prev => {
      if (addToSelection) {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const handleDeselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleOpenContextMenu = useCallback((block, x, y) => {
    setSelectedIds(prev => prev.has(block.id) ? prev : new Set([block.id]));
    setContextMenu({ block, x, y });
  }, []);

  const handleContextRefresh = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    setPlacedBlocks(prev => prev.map(b => {
      if (b.id !== id || b.colorLocked) return b;
      if (colorMode === 'random') return { ...b, colorSeed: Math.floor(Math.random() * 0x80000000) };
      return { ...b, colorOffset: (b.colorOffset ?? 0) + 1 };
    }));
  }, [contextMenu, colorMode]);

  const handleContextRandomise = useCallback(() => {
    if (!contextMenu || !activeAssets.length) return;
    const id = contextMenu.block.id;
    const pick = activeAssets[Math.floor(Math.random() * activeAssets.length)];
    setPlacedBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, svgContent: pick.svgContent, name: pick.name, assetId: pick.id, colorSeed: Math.floor(Math.random() * 0x80000000), colorOffset: 0 } : b
    ));
  }, [contextMenu, activeAssets]);

  const handleContextToggleLock = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    setPlacedBlocks(prev => prev.map(b => b.id === id ? { ...b, colorLocked: !b.colorLocked } : b));
  }, [contextMenu]);

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    syncHistorySize();
  }, [contextMenu, placedBlocks, pushHistory, syncHistorySize]);

  const handleMarqueeSelect = useCallback(({ x1, y1, x2, y2 }) => {
    if (!gridComputed) return;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const { x: panX, y: panY, scale } = viewTransform;
    const svgX1 = (x1 - panX) / scale;
    const svgY1 = (y1 - panY) / scale;
    const svgX2 = (x2 - panX) / scale;
    const svgY2 = (y2 - panY) / scale;
    const hits = placedBlocks.filter(b => {
      const bx = gridOriginX + b.gridCol * cellSize;
      const by = gridOriginY + b.gridRow * cellSize;
      const bw = b.cols * cellSize;
      const bh = b.rows * cellSize;
      return bx < svgX2 && bx + bw > svgX1 && by < svgY2 && by + bh > svgY1;
    });
    setSelectedIds(new Set(hits.map(b => b.id)));
  }, [gridComputed, viewTransform, placedBlocks]);

  const handleDeleteSelected = useCallback(() => {
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.filter(b => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
    syncHistorySize();
  }, [selectedIds, placedBlocks, pushHistory, syncHistorySize]);

  const handleRefreshSelected = useCallback(() => {
    setPlacedBlocks(prev => prev.map(b => {
      if (!selectedIds.has(b.id) || b.colorLocked) return b;
      if (colorMode === 'random') return { ...b, colorSeed: Math.floor(Math.random() * 0x80000000) };
      return { ...b, colorOffset: (b.colorOffset ?? 0) + 1 };
    }));
  }, [selectedIds, colorMode]);

  const handleRandomiseSelected = useCallback(() => {
    if (!activeAssets.length) return;
    setPlacedBlocks(prev => prev.map(b => {
      if (!selectedIds.has(b.id) || b.colorLocked) return b;
      // Only substitute with a same-size asset so the grid layout is preserved
      const sameSize = activeAssets.filter(a => a.cols === b.cols && a.rows === b.rows);
      if (!sameSize.length) return b;
      const pick = sameSize[Math.floor(Math.random() * sameSize.length)];
      return {
        ...b,
        svgContent: pick.svgContent,
        name: pick.name,
        assetId: pick.id,
        colorSeed: Math.floor(Math.random() * 0x80000000),
        colorOffset: 0,
      };
    }));
  }, [selectedIds, activeAssets]);

  const handleFlipH = useCallback(() => {
    if (!gridComputed) return;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      gridCol: gridComputed.cols - b.gridCol - b.cols,
    })));
    syncHistorySize();
  }, [gridComputed, placedBlocks, pushHistory, syncHistorySize]);

  const handleFlipV = useCallback(() => {
    if (!gridComputed) return;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      gridRow: gridComputed.rows - b.gridRow - b.rows,
    })));
    syncHistorySize();
  }, [gridComputed, placedBlocks, pushHistory, syncHistorySize]);

  const handleToggleLockSelected = useCallback(() => {
    const allLocked = [...selectedIds].every(id => {
      const b = placedBlocks.find(bl => bl.id === id);
      return b?.colorLocked;
    });
    setPlacedBlocks(prev => prev.map(b =>
      selectedIds.has(b.id) ? { ...b, colorLocked: !allLocked } : b
    ));
  }, [selectedIds, placedBlocks]);

  const handleSwapSelected = useCallback((asset) => {
    setPlacedBlocks(prev => {
      let result = prev;
      for (const id of selectedIds) {
        const block = result.find(b => b.id === id);
        if (!block) continue;
        const newCols = asset.cols ?? block.cols;
        const newRows = asset.rows ?? block.rows;
        // Remove any blocks that would now be overlapped by the resized block
        const overlapIds = new Set(
          result
            .filter(b =>
              b.id !== id &&
              b.gridCol < block.gridCol + newCols && b.gridCol + b.cols > block.gridCol &&
              b.gridRow < block.gridRow + newRows && b.gridRow + b.rows > block.gridRow
            )
            .map(b => b.id)
        );
        result = result
          .filter(b => !overlapIds.has(b.id))
          .map(b => b.id === id ? {
            ...b,
            cols: newCols,
            rows: newRows,
            svgContent: asset.svgContent,
            name: asset.name,
            assetId: asset.id,
            colorSeed: Math.floor(Math.random() * 0x80000000),
            colorOffset: 0,
          } : b);
      }
      return result;
    });
  }, [selectedIds]);

  // ── Drag & drop ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    // 5px activation distance lets clicks still fire (for the delete button etc.)
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Refs so the drag callbacks always read the latest values without
  // needing them in their dependency arrays (avoids re-creating on every pan/zoom).
  const viewScaleRef = useRef(viewTransform.scale);
  useEffect(() => { viewScaleRef.current = viewTransform.scale; }, [viewTransform.scale]);

  const gridComputedRef = useRef(gridComputed);
  useEffect(() => { gridComputedRef.current = gridComputed; }, [gridComputed]);

  const handleDragMove = useCallback(({ active, delta }) => {
    const g = gridComputedRef.current;
    if (!g) { setDragShadow(null); return; }
    const { block } = active.data.current;
    const { gridOriginX, gridOriginY, cellSize, cols, rows } = g;
    const scale = viewScaleRef.current;

    const startX = gridOriginX + block.gridCol * cellSize;
    const startY = gridOriginY + block.gridRow * cellSize;
    const targetCol = Math.round((startX + delta.x / scale - gridOriginX) / cellSize);
    const targetRow = Math.round((startY + delta.y / scale - gridOriginY) / cellSize);

    setDragShadow({
      gridCol: Math.max(0, Math.min(targetCol, cols - block.cols)),
      gridRow: Math.max(0, Math.min(targetRow, rows - block.rows)),
      cols: block.cols,
      rows: block.rows,
    });
  }, []);

  const placedBlocksRef = useRef(placedBlocks);
  useEffect(() => { placedBlocksRef.current = placedBlocks; }, [placedBlocks]);

  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  const handleDragEnd = useCallback(({ active, delta }) => {
    setDragShadow(null);
    const g = gridComputedRef.current;
    if (!g) return;
    const { block: dragged } = active.data.current;
    const { gridOriginX, gridOriginY, cellSize, cols, rows } = g;
    const scale = viewScaleRef.current;

    const startX = gridOriginX + dragged.gridCol * cellSize;
    const startY = gridOriginY + dragged.gridRow * cellSize;
    const targetCol = Math.max(0, Math.min(
      Math.round((startX + delta.x / scale - gridOriginX) / cellSize),
      cols - dragged.cols
    ));
    const targetRow = Math.max(0, Math.min(
      Math.round((startY + delta.y / scale - gridOriginY) / cellSize),
      rows - dragged.rows
    ));

    // No-op if position didn't change
    if (targetCol === dragged.gridCol && targetRow === dragged.gridRow) return;

    pushHistory(placedBlocksRef.current);
    syncHistorySize();

    setPlacedBlocks(prev => {
      const others = prev.filter(b => b.id !== active.id);

      // Find any blocks whose bounding boxes overlap the target area
      const overlapping = others.filter(b =>
        b.gridCol < targetCol + dragged.cols && b.gridCol + b.cols > targetCol &&
        b.gridRow < targetRow + dragged.rows && b.gridRow + b.rows > targetRow
      );

      if (overlapping.length === 0) {
        // Empty target — simple move
        return prev.map(b =>
          b.id === active.id ? { ...b, gridCol: targetCol, gridRow: targetRow } : b
        );
      }

      if (overlapping.length === 1) {
        const other = overlapping[0];
        // Exact same size — swap positions
        if (other.cols === dragged.cols && other.rows === dragged.rows) {
          return prev.map(b => {
            if (b.id === dragged.id) return { ...b, gridCol: targetCol, gridRow: targetRow };
            if (b.id === other.id)   return { ...b, gridCol: dragged.gridCol, gridRow: dragged.gridRow };
            return b;
          });
        }
      }

      // Different sizes — remove all overlapping blocks and place dragged at target
      const overlapIds = new Set(overlapping.map(b => b.id));
      return prev
        .filter(b => !overlapIds.has(b.id))
        .map(b => b.id === active.id ? { ...b, gridCol: targetCol, gridRow: targetRow } : b);
    });
  }, []);

  const handleDragCancel = useCallback(() => setDragShadow(null), []);

  // ── View controls ────────────────────────────────────────────────────────
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
        if (state.assets)        setAssets(state.assets);
        if (state.placedBlocks)  setPlacedBlocks(state.placedBlocks);
        setSelectedIds(new Set());
      } catch {
        // silently ignore malformed files
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

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
      assets,
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
  }, [presetKey, customSize, gridSettings, maxScale, scaleFreq, bgColor, canvasBg, colorMode, paletteKey, shapeColors, bgColors, gradientSettings, enabledAssetIds, assets, placedBlocks]);

  const handleExport = useCallback(() => {
    if (!placedBlocks.length || !gridComputed) return;

    const { width, height } = workArea;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const palette = effectivePalette;
    const svgNS = 'http://www.w3.org/2000/svg';
    const parser = new DOMParser();

    // When multiple SVGs are inlined into one document their <style> blocks all
    // apply globally — a later block's `.cls-1 { fill: grey }` overwrites an
    // earlier block's `.cls-1 { fill: none }`, producing stray grey shapes.
    // Fix: convert every CSS class fill to an inline style attribute (inline
    // styles beat class rules), then remove the <style> elements entirely.
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
        // Only set if no inline fill already present (colorisation takes priority)
        if (!/\bfill\s*:/.test(style)) {
          el.setAttribute('style', `${style}${style ? ';' : ''}fill:${cssFill}`);
        }
      });
      root.querySelectorAll('style').forEach(s => s.remove());
    };

    // Build the output SVG from scratch — assets are inlined as real vectors,
    // no <image> links, so Illustrator imports them as editable paths/shapes.
    const out = document.createElementNS(svgNS, 'svg');
    out.setAttribute('xmlns', svgNS);
    out.setAttribute('width', String(width));
    out.setAttribute('height', String(height));
    out.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const bgRect = document.createElementNS(svgNS, 'rect');
    bgRect.setAttribute('width', String(width));
    bgRect.setAttribute('height', String(height));
    bgRect.setAttribute('fill', canvasBg);
    out.appendChild(bgRect);


    placedBlocks.forEach(block => {
      const bx = gridOriginX + block.gridCol * cellSize;
      const by = gridOriginY + block.gridRow * cellSize;
      const bw = block.cols * cellSize;
      const bh = block.rows * cellSize;

      // Apply the same colorisation used in the live preview
      let svgText;
      if (colorMode === 'image') {
        svgText = colorizeSvgByImage(block.svgContent, bx, by, bw, bh, imagePixels);
      } else if (colorMode !== 'none') {
        svgText = colorizeSvg(block.svgContent, colorMode, palette, block.colorSeed ?? 0, block.colorOffset ?? 0, activeBgColors,
          colorMode === 'gradient' ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows, ...activeGradientSettings } : null);
      } else {
        svgText = block.svgContent;
      }

      const blockDoc = parser.parseFromString(svgText, 'image/svg+xml');
      if (blockDoc.querySelector('parsererror')) return;
      flattenStyles(blockDoc);
      const blockRoot = blockDoc.documentElement;

      // Resolve the source coordinate space from viewBox or width/height attrs
      let vbX = 0, vbY = 0, vbW, vbH;
      const vbStr = blockRoot.getAttribute('viewBox');
      if (vbStr) {
        const p = vbStr.trim().split(/[\s,]+/).map(Number);
        [vbX, vbY, vbW, vbH] = p;
      } else {
        vbW = parseFloat(blockRoot.getAttribute('width')  || String(bw));
        vbH = parseFloat(blockRoot.getAttribute('height') || String(bh));
      }

      // Replicate <image preserveAspectRatio="xMidYMid meet"> scaling
      const scale = Math.min(bw / vbW, bh / vbH);
      const tx = bx + (bw - vbW * scale) / 2 - vbX * scale;
      const ty = by + (bh - vbH * scale) / 2 - vbY * scale;

      const g = document.createElementNS(svgNS, 'g');
      g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);

      for (const child of [...blockRoot.childNodes]) {
        g.appendChild(document.importNode(child, true));
      }

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
  }, [placedBlocks, gridComputed, workArea, colorMode, effectivePalette, activeBgColors, canvasBg, imagePixels, imageDataUrls, activeGradientSettings]);

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
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
              uploadedAssets={assets}
              colorMode={colorMode}
              effectivePalette={effectivePalette}
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
            viewTransform={viewTransform}
            activeTool={activeTool}
            dragShadow={dragShadow}
            selectedIds={selectedIds}
            onSelect={handleSelectBlock}
            onContextMenu={handleOpenContextMenu}
            colorMode={colorMode}
            effectivePalette={effectivePalette}
            bgOptions={activeBgColors}
            gradientSettings={activeGradientSettings}
            imageDataUrls={imageDataUrls}
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
          assets={assets}
          onIngestAssets={handleIngestAssets}
          enabledAssetIds={enabledAssetIds}
          onEnableAssets={handleEnableAssets}
          onDisableAssets={handleDisableAssets}
          onFillGrid={handleFillGrid}
          onFillGaps={handleFillGaps}
          onExport={handleExport}
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
          gradientSettings={gradientSettings}
          onGradientSettingsChange={setGradientSettings}
          imageSrc={imageSrc}
          onImageSrcChange={setImageSrc}
          imageProgress={imageProgress}
          showShortcuts={showShortcuts}
          onToggleShortcuts={() => setShowShortcuts(s => !s)}
          assetUsageCounts={assetUsageCounts}
          onFlipH={handleFlipH}
          onFlipV={handleFlipV}
          canFlip={placedBlocks.length > 0}
        />
      </div>
    </DndContext>
  );
}

export default App;
