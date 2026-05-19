import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Canvas } from './components/Canvas';
import { FloatingPanel } from './components/FloatingPanel';
import { Grid } from './components/Grid';
import { PlacedBlocks } from './components/PlacedBlocks';
import { PRESETS, computeGrid, getValidCols } from './gridPresets';
import { fillGrid } from './utils/binPack';
import { PALETTE_KEYS, PALETTES, colorizeSvg } from './utils/colorize';
import './App.css';
import styles from './App.module.css';

function App() {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState('select');
  const [bgColor, setBgColor] = useState('#2d2d2d');

  // Colour palette
  const [colorMode, setColorMode] = useState('none'); // 'none' | 'uniform' | 'random'
  const [paletteKey, setPaletteKey] = useState(PALETTE_KEYS[0]);

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

  // Assets & layout state
  const [assets, setAssets] = useState([]);
  const [placedBlocks, setPlacedBlocks] = useState([]);
  const [dragShadow, setDragShadow] = useState(null);

  // Clear layout when the grid geometry changes
  useEffect(() => {
    setPlacedBlocks([]);
  }, [gridComputed?.cols, gridComputed?.rows, gridComputed?.cellSize]);

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
    if (!assets.length || !gridComputed) return;
    const blocks = fillGrid(assets, gridComputed).map(b => ({
      ...b,
      colorSeed: Math.floor(Math.random() * 0x80000000),
    }));
    setPlacedBlocks(blocks);
  }, [assets, gridComputed]);

  const handleDeleteBlock = useCallback((id) => {
    setPlacedBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

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

    setPlacedBlocks(prev => {
      const others = prev.filter(b => b.id !== active.id);

      // Find any blocks whose bounding boxes overlap the target area
      const overlapping = others.filter(b =>
        b.gridCol < targetCol + dragged.cols && b.gridCol + b.cols > targetCol &&
        b.gridRow < targetRow + dragged.rows && b.gridRow + b.rows > targetRow
      );

      if (overlapping.length === 0) {
        // Empty target — move
        return prev.map(b =>
          b.id === active.id ? { ...b, gridCol: targetCol, gridRow: targetRow } : b
        );
      }

      if (overlapping.length === 1) {
        const other = overlapping[0];
        // Same-size block — swap positions
        if (other.cols === dragged.cols && other.rows === dragged.rows) {
          return prev.map(b => {
            if (b.id === dragged.id) return { ...b, gridCol: targetCol, gridRow: targetRow };
            if (b.id === other.id)   return { ...b, gridCol: dragged.gridCol, gridRow: dragged.gridRow };
            return b;
          });
        }
      }

      // Target occupied by differently-sized block(s) — snap back
      return prev;
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

  const handleExport = useCallback(() => {
    if (!placedBlocks.length || !gridComputed) return;

    const { width, height } = workArea;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const palette = PALETTES[paletteKey] ?? PALETTES[PALETTE_KEYS[0]];
    const svgNS = 'http://www.w3.org/2000/svg';
    const parser = new DOMParser();

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
    bgRect.setAttribute('fill', 'white');
    out.appendChild(bgRect);

    placedBlocks.forEach(block => {
      const bx = gridOriginX + block.gridCol * cellSize;
      const by = gridOriginY + block.gridRow * cellSize;
      const bw = block.cols * cellSize;
      const bh = block.rows * cellSize;

      // Apply the same colorisation used in the live preview
      const svgText = colorMode !== 'none'
        ? colorizeSvg(block.svgContent, colorMode, palette, block.colorSeed ?? 0)
        : block.svgContent;

      const blockDoc = parser.parseFromString(svgText, 'image/svg+xml');
      if (blockDoc.querySelector('parsererror')) return;
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
  }, [placedBlocks, gridComputed, workArea, colorMode, paletteKey]);

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
          workArea={workArea}
        >
          <Grid workArea={workArea} gridSettings={gridSettings} />
          <PlacedBlocks
            placedBlocks={placedBlocks}
            gridComputed={gridComputed}
            viewTransform={viewTransform}
            activeTool={activeTool}
            onDelete={handleDeleteBlock}
            dragShadow={dragShadow}
            colorMode={colorMode}
            paletteKey={paletteKey}
          />
        </Canvas>

        <FloatingPanel
          activeTool={activeTool}
          onToolChange={setActiveTool}
          bgColor={bgColor}
          onBgColorChange={setBgColor}
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
          onFillGrid={handleFillGrid}
          onExport={handleExport}
          canFill={assets.length > 0 && gridComputed !== null}
          canExport={placedBlocks.length > 0}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
          paletteKey={paletteKey}
          onPaletteKeyChange={setPaletteKey}
        />
      </div>
    </DndContext>
  );
}

export default App;
