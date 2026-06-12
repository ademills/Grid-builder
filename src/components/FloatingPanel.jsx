import { useState, useRef, useEffect, useCallback } from 'react';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_GROUPS, colorizeSvg } from '../utils/colorize';
import { ASSET_FOLDER_TREE } from '../builtinAssets';
import styles from './FloatingPanel.module.css';

const FILL_MODE_LABELS = {
  standard:   'Standard',
  glitch:     'Glitch',
  strip:      'Strip',
  multiStrip: 'Multi-Strip',
  edge:       'Edge Trace',
  brightness: 'Brightness',
  noise:      'Noise Field',
  geometric:  'Geometric Pattern',
};

const FILL_MODES = Object.keys(FILL_MODE_LABELS);

// A single row in the main menu — shows a label, an optional live-state
// preview (swatches, current mode name, status dot), and a '›' arrow.
function MenuRow({ label, preview, onClick, className = '' }) {
  return (
    <button className={`${styles.menuRow} ${className}`} onClick={onClick}>
      <span className={styles.menuRowLabel}>{label}</span>
      {preview && <span className={styles.menuRowPreview}>{preview}</span>}
      <span className={styles.menuRowArrow}>›</span>
    </button>
  );
}

// Sticky back bar shown at the top of every drilled-in sub-view.
function SubViewHeader({ title, onBack }) {
  return (
    <div className={styles.subViewBack}>
      <button className={styles.subViewBackBtn} onClick={onBack}>← Back</button>
      <span className={styles.subViewBackLabel}>{title}</span>
    </div>
  );
}

// Generates a vivid hex colour from a hue (0-360), used to seed new mesh points
// with a colour distinct from white (so the colour swatch isn't blank-looking).
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const c = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${c(f(0))}${c(f(8))}${c(f(4))}`;
}

function Stepper({ value, onChange, min = 0, max = Infinity, format, validValues }) {
  let prevVal, nextVal;
  if (validValues) {
    prevVal = [...validValues].reverse().find(v => v < value) ?? null;
    nextVal = validValues.find(v => v > value) ?? null;
  } else {
    prevVal = value > min ? value - 1 : null;
    nextVal = value < max ? value + 1 : null;
  }
  return (
    <div className={styles.stepper}>
      <button className={styles.stepBtn} onClick={() => prevVal != null && onChange(prevVal)} disabled={prevVal == null}>−</button>
      <span className={styles.stepVal}>{format ? format(value) : value}</span>
      <button className={styles.stepBtn} onClick={() => nextVal != null && onChange(nextVal)} disabled={nextVal == null}>+</button>
    </div>
  );
}

function collectAllIds(node) {
  const ids = [];
  for (const assets of Object.values(node.sizes)) {
    for (const a of assets) ids.push(a.id);
  }
  for (const child of Object.values(node.children)) {
    ids.push(...collectAllIds(child));
  }
  return ids;
}

function collectAllPaths(node, prefix = '') {
  const paths = [];
  for (const [name, child] of Object.entries(node.children)) {
    const p = prefix ? `${prefix}/${name}` : name;
    paths.push(p);
    paths.push(...collectAllPaths(child, p));
  }
  for (const sz of Object.keys(node.sizes)) {
    paths.push(prefix ? `${prefix}/${sz}` : sz);
  }
  return paths;
}

export function FloatingPanel({
  activeTool, onToolChange,
  bgColor, onBgColorChange,
  canvasBg, onCanvasBgChange,
  viewTransform, onZoom, onResetView,
  presetKey, onPresetChange,
  customSize, onCustomSizeChange,
  gridSettings, onGridSettingsChange, gridComputed, validCols,
  enabledAssetIds, onEnableAssets, onDisableAssets,
  onFillGrid, onFillGaps, onExport, workArea, onSaveProject, onLoadProject, canFill, canFillGaps, canExport,
  onGlitchFill, canGlitchFill, glitchSettings, onGlitchSettingsChange, hasImage,
  onStripFill, canStripFill, stripSettings, onStripSettingsChange,
  onMultiStripFill, canMultiStripFill, multiStripSettings, onMultiStripSettingsChange,
  audioSettings, onAudioSettingsChange, audioFileSrc, onAudioFileChange,
  backdropSrc, onBackdropSrcChange, backdropSettings, onBackdropSettingsChange,
  paletteExtractSettings, onPaletteExtractSettingsChange, extractedPalette,
  onApplyExtractedToShapes, onApplyExtractedToBg, canExtractFromBackdrop, canExtractFromImage,
  onEdgeFill, canEdgeFill, edgeSettings, onEdgeSettingsChange,
  onBrightnessFill, canBrightnessFill, brightnessSettings, onBrightnessSettingsChange,
  onNoiseFill, canNoiseFill, noiseSettings, onNoiseSettingsChange,
  onGeometricFill, canGeometricFill, geometricSettings, onGeometricSettingsChange,
  onUndo, onRedo, canUndo, canRedo,
  maxScale, onMaxScaleChange,
  scaleFreq, onScaleFreqChange,
  colorMode, onColorModeChange,
  paletteKey, onPaletteKeyChange,
  shapeColors, onShapeColorsChange,
  bgColors, onBgColorsChange,
  customPalettes, onSaveCustomPalette, onDeleteCustomPalette, onApplyCustomPalette,
  autoFill, onAutoFillChange,
  uniformReverse, onUniformReverseChange,
  colorTempShift, onColorTempShiftChange,
  blendMode, onBlendModeChange,
  randomReverseEnabled, onRandomReverseEnabledChange, randomReversePct, onRandomReversePctChange, onRandomReverse,
  onRandomRerun,
  gradientSettings, onGradientSettingsChange,
  meshSettings, onMeshSettingsChange,
  imageSrc, onImageSrcChange, imageProgress, imageColourTolerance, onImageColourToleranceChange,
  animSettings, onAnimSettingsChange,
  showShortcuts, onToggleShortcuts,
  assetUsageCounts,
  onFlipH, onFlipV, canFlip,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [fillMode, setFillMode] = useState('standard');
  const [bgType, setBgType] = useState(() => backdropSrc ? 'image' : 'solid');
  const [assetBrowserView, setAssetBrowserView] = useState('grid');

  // Export As dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState('svg');
  const [exportScale, setExportScale] = useState(1);
  const [exportTransparent, setExportTransparent] = useState(true);
  const [exportPhotoComposite, setExportPhotoComposite] = useState(false);
  const [exportJpegQuality, setExportJpegQuality] = useState(0.92);

  // Navigation stack — [] means the main menu; pushing a view name drills in,
  // popView() goes back one level, resetView() returns straight to the main menu.
  const [viewStack, setViewStack] = useState([]);
  const view = viewStack[viewStack.length - 1] ?? 'main';
  const pushView = (name) => setViewStack(prev => [...prev, name]);
  const popView = () => setViewStack(prev => prev.slice(0, -1));
  const resetView = () => setViewStack([]);

  const THUMB_PALETTE = ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];
  const THUMB_BG = ['#27272a'];

  const [openGroups, setOpenGroups] = useState(new Set());
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  // Asset browser collapse state — all open by default
  const [openFolders, setOpenFolders] = useState(() => new Set());
  const toggleFolder = path => setOpenFolders(p => {
    const n = new Set(p);
    n.has(path) ? n.delete(path) : n.add(path);
    return n;
  });

  const groupState = ids => {
    const on = ids.filter(id => enabledAssetIds?.has(id)).length;
    return on === 0 ? 'off' : on === ids.length ? 'on' : 'partial';
  };

  const toggleIds = (ids, currentState) => {
    if (currentState === 'off') onEnableAssets(ids);
    else onDisableAssets(ids);
  };

  const projectInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onImageSrcChange(evt.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const backdropInputRef = useRef(null);

  const handleBackdropUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onBackdropSrcChange(evt.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [rawCustomHex, setRawCustomHex] = useState('');
  const [rawBgHex,     setRawBgHex]     = useState('');
  const [rawGradBgHex, setRawGradBgHex] = useState('');

  // Mesh colour points: dragging a colour/position slider fires onChange
  // continuously, and committing every tick to App state recolours every
  // placed block — locally track a "draft" for instant UI feedback and
  // debounce the expensive commit until the user pauses.
  const [meshDraft, setMeshDraft] = useState(meshSettings);
  const meshCommitTimer = useRef(null);
  useEffect(() => {
    setMeshDraft(meshSettings);
  }, [meshSettings]);
  useEffect(() => () => clearTimeout(meshCommitTimer.current), []);
  const updateMesh = useCallback((next) => {
    setMeshDraft(next);
    clearTimeout(meshCommitTimer.current);
    meshCommitTimer.current = setTimeout(() => onMeshSettingsChange(next), 80);
  }, [onMeshSettingsChange]);
  const applyMeshPalette = useCallback((colors) => {
    updateMesh({
      ...meshDraft,
      points: colors.slice(0, 8).map(hex => ({
        id: crypto.randomUUID(),
        x: Math.random(),
        y: Math.random(),
        hex,
      })),
    });
    resetView();
  }, [meshDraft, updateMesh]);

  // Native colour pickers fire onChange dozens of times per second while
  // dragging — coalesce those into at most one state update per animation
  // frame so the picker itself doesn't stutter fighting React re-renders.
  const meshHexPending = useRef({});
  const meshHexRaf = useRef(null);
  useEffect(() => () => { if (meshHexRaf.current) cancelAnimationFrame(meshHexRaf.current); }, []);
  const updateMeshHex = useCallback((pointId, hex) => {
    meshHexPending.current[pointId] = hex;
    if (meshHexRaf.current) return;
    meshHexRaf.current = requestAnimationFrame(() => {
      meshHexRaf.current = null;
      const pending = meshHexPending.current;
      meshHexPending.current = {};
      setMeshDraft(prev => {
        const next = {
          ...prev,
          points: prev.points.map(x => pending[x.id] !== undefined ? { ...x, hex: pending[x.id] } : x),
        };
        clearTimeout(meshCommitTimer.current);
        meshCommitTimer.current = setTimeout(() => onMeshSettingsChange(next), 80);
        return next;
      });
    });
  }, [onMeshSettingsChange]);
  const [savePaletteName, setSavePaletteName] = useState('');

  const [shapeOrder, setShapeOrder] = useState(null);
  const [bgOrder,    setBgOrder]    = useState(null);
  const shapeDragId = useRef(null);
  const bgDragId    = useRef(null);

  const displayShapeColors = shapeOrder ?? shapeColors ?? [];
  const displayBgColors    = bgOrder    ?? bgColors    ?? [];

  useEffect(() => {
    if (colorMode === 'mesh' && (view === 'colours' || view === 'palette')) {
      resetView();
    }
    if (colorMode !== 'mesh' && view === 'meshPalette') {
      resetView();
    }
    if (colorMode === 'none' && (view === 'colours' || view === 'palette' || view === 'meshPalette')) {
      resetView();
    }
  }, [colorMode, view]);

  const colourPreview = (shapeColors ?? []).filter(c => c.enabled).map(c => c.hex).slice(0, 12);

  const normalizeHex = (raw) => {
    const s = raw.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`;
    if (/^[0-9a-f]{3}$/i.test(s)) {
      const [r, g, b] = s;
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
  };

  const addCustomShapeColor = (hex) => {
    const h = normalizeHex(hex);
    if (!h) return;
    onShapeColorsChange(prev => [...prev, { id: crypto.randomUUID(), hex: h, enabled: true, source: 'custom' }]);
    setRawCustomHex('');
  };

  const toggleShapeColor = (id) =>
    onShapeColorsChange(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));

  const removeShapeColor = (id) =>
    onShapeColorsChange(prev => prev.filter(c => c.id !== id));

  const onShapeDragStart = (id) => {
    shapeDragId.current = id;
    setShapeOrder([...(shapeColors ?? [])]);
  };
  const onShapeDragOver = (e, id) => {
    e.preventDefault();
    if (!shapeDragId.current || shapeDragId.current === id) return;
    setShapeOrder(prev => {
      const arr  = prev ?? shapeColors ?? [];
      const from = arr.findIndex(c => c.id === shapeDragId.current);
      const to   = arr.findIndex(c => c.id === id);
      if (from < 0 || to < 0) return arr;
      const next = [...arr];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const onShapeDragEnd = () => {
    if (shapeOrder) onShapeColorsChange(shapeOrder);
    shapeDragId.current = null;
    setShapeOrder(null);
  };

  const addBgColor = (hex) => {
    const h = normalizeHex(hex);
    if (!h) return;
    onBgColorsChange(prev => [...prev, { id: crypto.randomUUID(), hex: h, enabled: true }]);
    setRawBgHex('');
  };

  const toggleBgColor = (id) =>
    onBgColorsChange(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));

  const removeBgColor = (id) =>
    onBgColorsChange(prev => prev.filter(c => c.id !== id));

  const onBgDragStart = (id) => {
    bgDragId.current = id;
    setBgOrder([...(bgColors ?? [])]);
  };
  const onBgDragOver = (e, id) => {
    e.preventDefault();
    if (!bgDragId.current || bgDragId.current === id) return;
    setBgOrder(prev => {
      const arr  = prev ?? bgColors ?? [];
      const from = arr.findIndex(c => c.id === bgDragId.current);
      const to   = arr.findIndex(c => c.id === id);
      if (from < 0 || to < 0) return arr;
      const next = [...arr];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const onBgDragEnd = () => {
    if (bgOrder) onBgColorsChange(bgOrder);
    bgDragId.current = null;
    setBgOrder(null);
  };

  const zoomPct  = Math.round((viewTransform?.scale ?? 1) * 100);
  const isCustom = presetKey === 'custom';

  // Maps the active fill mode to its fill handler/availability — used by the
  // single, always-present Fill button.
  const FILL_ACTIONS = {
    standard:   { onFill: onFillGrid,       canFill: canFill },
    glitch:     { onFill: onGlitchFill,     canFill: canGlitchFill },
    strip:      { onFill: onStripFill,      canFill: canStripFill },
    multiStrip: { onFill: onMultiStripFill, canFill: canMultiStripFill },
    edge:       { onFill: onEdgeFill,       canFill: canEdgeFill },
    brightness: { onFill: onBrightnessFill, canFill: canBrightnessFill },
    noise:      { onFill: onNoiseFill,      canFill: canNoiseFill },
    geometric:  { onFill: onGeometricFill,  canFill: canGeometricFill },
  };
  const activeFillAction = FILL_ACTIONS[fillMode];

  const [rawWidth,  setRawWidth]  = useState(String(customSize?.width  ?? ''));
  const [rawHeight, setRawHeight] = useState(String(customSize?.height ?? ''));

  useEffect(() => {
    setRawWidth(String(customSize?.width  ?? ''));
    setRawHeight(String(customSize?.height ?? ''));
  }, [customSize?.width, customSize?.height]);

  const commitDim = (axis, raw) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? 50 : Math.min(10000, Math.max(50, n));
    onCustomSizeChange({ ...customSize, [axis]: clamped });
  };

  const handleScaleFreqInput = (raw) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) onScaleFreqChange(Math.min(100, Math.max(0, n)));
  };

  const SHORTCUTS = [
    { keys: 'Arrow keys',     desc: 'Nudge selected blocks one cell' },
    { keys: 'Delete / ⌫',    desc: 'Delete selected blocks' },
    { keys: 'Ctrl + Z',       desc: 'Undo' },
    { keys: 'Ctrl + Y',       desc: 'Redo' },
    { keys: 'Ctrl + Shift+Z', desc: 'Redo (alternate)' },
    { keys: 'Shift + click',  desc: 'Add block to selection' },
    { keys: 'Drag canvas',    desc: 'Marquee select blocks' },
    { keys: 'Scroll wheel',   desc: 'Zoom in / out' },
    { keys: '?',              desc: 'Toggle this shortcut list' },
  ];

  return (
    <>
      {showExportDialog && (
        <div className={styles.shortcutsOverlay} onClick={() => setShowExportDialog(false)}>
          <div className={styles.exportPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.shortcutsHeader}>
              <span>Export As</span>
              <button className={styles.shortcutsClose} onClick={() => setShowExportDialog(false)}>×</button>
            </div>
            <div className={styles.sectionContent}>
              <div className={styles.formRow}>
                <span className={styles.label}>Format</span>
                <div className={styles.modeToggle}>
                  {['svg', 'png', 'jpeg'].map(f => (
                    <button key={f}
                      className={`${styles.modeBtn} ${exportFormat === f ? styles.modeBtnActive : ''}`}
                      onClick={() => setExportFormat(f)}
                    >{f.toUpperCase()}</button>
                  ))}
                </div>
              </div>

              {exportFormat !== 'svg' && (
                <div className={styles.formRow}>
                  <span className={styles.label}>Scale</span>
                  <div className={styles.modeToggle}>
                    {[1, 2, 4].map(s => (
                      <button key={s}
                        className={`${styles.modeBtn} ${exportScale === s ? styles.modeBtnActive : ''}`}
                        onClick={() => setExportScale(s)}
                      >{s}×</button>
                    ))}
                  </div>
                </div>
              )}

              {workArea && (
                <div className={styles.gridNote}>
                  Output size: {Math.round(workArea.width * (exportFormat === 'svg' ? 1 : exportScale))} × {Math.round(workArea.height * (exportFormat === 'svg' ? 1 : exportScale))} px
                </div>
              )}

              {exportFormat === 'png' && (
                <label className={styles.formRow} style={{ cursor: 'pointer' }}>
                  <span className={styles.label}>Transparent Background</span>
                  <input type="checkbox" checked={exportTransparent} onChange={e => setExportTransparent(e.target.checked)} />
                </label>
              )}

              {exportFormat === 'jpeg' && (
                <div className={styles.sliderRow}>
                  <span className={styles.label}>Quality</span>
                  <input type="range" className={styles.slider} min="0.5" max="1" step="0.01"
                    value={exportJpegQuality}
                    onChange={e => setExportJpegQuality(+e.target.value)} />
                  <span className={styles.sliderVal}>{Math.round(exportJpegQuality * 100)}%</span>
                </div>
              )}

              {!!backdropSrc && (
                <label className={styles.formRow} style={{ cursor: 'pointer' }}>
                  <span className={styles.label}>Composite Over Photo</span>
                  <input type="checkbox" checked={exportPhotoComposite} onChange={e => setExportPhotoComposite(e.target.checked)} />
                </label>
              )}

              <div className={styles.actionBtns} style={{ marginTop: 12 }}>
                <button className={styles.actionBtn} onClick={() => {
                  onExport({
                    format: exportFormat,
                    scale: exportScale,
                    transparentBackground: exportFormat === 'png' && exportTransparent,
                    jpegQuality: exportJpegQuality,
                    photoComposite: exportPhotoComposite,
                  });
                  setShowExportDialog(false);
                }}>↓ Export</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className={styles.shortcutsOverlay} onClick={onToggleShortcuts}>
          <div className={styles.shortcutsPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.shortcutsHeader}>
              <span>Keyboard Shortcuts</span>
              <button className={styles.shortcutsClose} onClick={onToggleShortcuts}>×</button>
            </div>
            <div className={styles.shortcutsList}>
              {SHORTCUTS.map(s => (
                <div key={s.keys} className={styles.shortcutRow}>
                  <kbd className={styles.shortcutKey}>{s.keys}</kbd>
                  <span className={styles.shortcutDesc}>{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <div className={styles.dot} />
            {!collapsed && <span className={styles.title}>Grid Builder</span>}
          </div>
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {!collapsed && (
          <div className={styles.body}>

            {/* ── Asset browser view ──────────────────────── */}
            {view === 'assets' && (
              <>
                <div className={styles.subViewBack}>
                  <button className={styles.subViewBackBtn} onClick={popView}>← Back</button>
                  <span className={styles.subViewBackLabel}>Assets</span>
                  <button
                    className={styles.assetViewToggleBtn}
                    onClick={() => setAssetBrowserView(v => v === 'list' ? 'grid' : 'list')}
                    title={assetBrowserView === 'list' ? 'Switch to thumbnail view' : 'Switch to list view'}
                  >{assetBrowserView === 'list' ? '⊞' : '☰'}</button>
                </div>

                {(() => {
                  const INDENT = 16;

                  const renderSizes = (node, path, depth) =>
                    Object.entries(node.sizes).map(([sz, szAssets]) => {
                      const sizeIds = szAssets.map(a => a.id);
                      const sizeKey = `${path}/${sz}`;
                      const sizeState = groupState(sizeIds);
                      const sizePadLeft = 30 + depth * INDENT;
                      const itemPadLeft = 48 + depth * INDENT;
                      return (
                        <div key={sizeKey}>
                          <div className={styles.assetThemeRow} style={{ paddingLeft: sizePadLeft }}>
                            <button
                              className={`${styles.assetToggle} ${styles[`assetToggle_${sizeState}`]}`}
                              onClick={() => toggleIds(sizeIds, sizeState)}
                              title={sizeState === 'off' ? 'Enable all' : 'Disable all'}
                            />
                            <button className={styles.assetGroupLabel} onClick={() => toggleFolder(sizeKey)}>
                              <span>{sz}</span>
                              <span className={styles.assetGroupCount}>{sizeIds.length}</span>
                              <span className={styles.assetGroupArrow}>{openFolders.has(sizeKey) ? '▼' : '▶'}</span>
                            </button>
                          </div>

                          {openFolders.has(sizeKey) && assetBrowserView === 'list' && szAssets.map(asset => {
                            const on    = enabledAssetIds?.has(asset.id);
                            const count = assetUsageCounts?.[asset.id];
                            return (
                              <div key={asset.id} className={styles.assetItemRow} style={{ paddingLeft: itemPadLeft }}>
                                <button
                                  className={`${styles.assetToggle} ${styles[on ? 'assetToggle_on' : 'assetToggle_off']}`}
                                  onClick={() => on ? onDisableAssets([asset.id]) : onEnableAssets([asset.id])}
                                />
                                <span className={`${styles.assetItemName} ${!on ? styles.assetItemDisabled : ''}`}>
                                  {asset.name}
                                </span>
                                {count > 0 && <span className={styles.usageBadge}>{count}</span>}
                              </div>
                            );
                          })}

                          {openFolders.has(sizeKey) && assetBrowserView === 'grid' && (
                            <div className={styles.assetThumbGrid}>
                              {szAssets.map(asset => {
                                const on    = enabledAssetIds?.has(asset.id);
                                const count = assetUsageCounts?.[asset.id];
                                const colorized = colorizeSvg(asset.svgContent, 'uniform', THUMB_PALETTE, 0, 0, THUMB_BG);
                                const clean = colorized
                                  .replace(/^<\?xml[^>]*\?>\s*/i, '')
                                  .replace(/<!DOCTYPE[^>]*>\s*/gi, '');
                                const thumbUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
                                return (
                                  <button
                                    key={asset.id}
                                    className={`${styles.assetThumbItem} ${!on ? styles.assetThumbItemOff : ''}`}
                                    onClick={() => on ? onDisableAssets([asset.id]) : onEnableAssets([asset.id])}
                                    title={`${asset.name} — click to ${on ? 'disable' : 'enable'}`}
                                  >
                                    <img src={thumbUrl} alt={asset.name} className={styles.assetThumbImg} />
                                    <span className={styles.assetThumbName}>{asset.name}</span>
                                    {count > 0 && <span className={styles.usageBadge}>{count}</span>}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });

                  const renderFolderNode = (node, name, path, depth) => {
                    const allIds = collectAllIds(node);
                    const nodeState = groupState(allIds);
                    const isOpen = openFolders.has(path);
                    const folderPadLeft = depth === 0 ? 14 : 30 + (depth - 1) * INDENT;
                    const childNames = Object.keys(node.children).sort((a, b) => a.localeCompare(b));
                    return (
                      <div key={path}>
                        <div
                          className={depth === 0 ? styles.assetSizeRow : styles.assetThemeRow}
                          style={{ paddingLeft: folderPadLeft }}
                        >
                          <button
                            className={`${styles.assetToggle} ${styles[`assetToggle_${nodeState}`]}`}
                            onClick={() => toggleIds(allIds, nodeState)}
                            title={nodeState === 'off' ? 'Enable all' : 'Disable all'}
                          />
                          <button className={styles.assetGroupLabel} onClick={() => toggleFolder(path)}>
                            <span>{name}</span>
                            <span className={styles.assetGroupCount}>{allIds.length}</span>
                            <span className={styles.assetGroupArrow}>{isOpen ? '▼' : '▶'}</span>
                          </button>
                        </div>
                        {isOpen && (
                          <>
                            {childNames.map(childName =>
                              renderFolderNode(node.children[childName], childName, `${path}/${childName}`, depth + 1)
                            )}
                            {renderSizes(node, path, depth)}
                          </>
                        )}
                      </div>
                    );
                  };

                  return Object.entries(ASSET_FOLDER_TREE.children)
                    .sort(([a], [b]) => {
                      if (a === 'Default') return -1;
                      if (b === 'Default') return 1;
                      return a.localeCompare(b);
                    })
                    .map(([name, node]) => renderFolderNode(node, name, name, 0));
                })()}
              </>
            )}

            {/* ── Palette picker view ─────────────────────── */}
            {view === 'palette' && (
              <>
                <div className={styles.subViewBack}>
                  <button className={styles.subViewBackBtn} onClick={popView}>← Back</button>
                  <span className={styles.subViewBackLabel}>Choose palette</span>
                </div>

                {(customPalettes ?? []).length > 0 && (
                  <div>
                    <button className={styles.paletteGroupHeader} onClick={() => toggleGroup('__custom__')}>
                      <span className={styles.paletteGroupArrow}>{openGroups.has('__custom__') ? '▼' : '▶'}</span>
                      <span className={styles.paletteGroupName}>My Palettes</span>
                      <span className={styles.paletteGroupCount}>{customPalettes.length}</span>
                    </button>

                    {openGroups.has('__custom__') && (customPalettes ?? []).map(p => (
                      <div key={p.name} className={styles.palettePickerItem} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          className={styles.palettePickerItem}
                          style={{ flex: 1, border: 'none', background: 'transparent', padding: 0 }}
                          onClick={() => onApplyCustomPalette(p)}
                        >
                          <span className={styles.palettePickerName}>{p.name}</span>
                          <span className={styles.palettePickerSwatches}>
                            {p.colors.map((c, i) => (
                              <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />
                            ))}
                          </span>
                        </button>
                        <button
                          className={styles.customSwatchRemove}
                          onClick={() => onDeleteCustomPalette(p.name)}
                          title="Delete palette"
                          style={{ flexShrink: 0 }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                {PALETTE_GROUPS.map(group => (
                  <div key={group.name}>
                    <button className={styles.paletteGroupHeader} onClick={() => toggleGroup(group.name)}>
                      <span className={styles.paletteGroupArrow}>{openGroups.has(group.name) ? '▼' : '▶'}</span>
                      <span className={styles.paletteGroupName}>{group.name}</span>
                      <span className={styles.paletteGroupCount}>{group.keys.length}</span>
                    </button>

                    {openGroups.has(group.name) && group.keys.map(k => (
                      <button
                        key={k}
                        className={`${styles.palettePickerItem} ${k === paletteKey ? styles.palettePickerItemActive : ''}`}
                        onClick={() => onPaletteKeyChange(k)}
                      >
                        <span className={styles.palettePickerName}>{k}</span>
                        <span className={styles.palettePickerSwatches}>
                          {PALETTES[k]?.map((c, i) => (
                            <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />
                          ))}
                        </span>
                        {k === paletteKey && <span className={styles.palettePickerTick}>✓</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* ── Mesh: generate from palette picker view ───── */}
            {view === 'meshPalette' && (
              <>
                <div className={styles.subViewBack}>
                  <button className={styles.subViewBackBtn} onClick={popView}>← Back</button>
                  <span className={styles.subViewBackLabel}>Choose palette</span>
                </div>

                {(customPalettes ?? []).length > 0 && (
                  <div>
                    <button className={styles.paletteGroupHeader} onClick={() => toggleGroup('__custom__')}>
                      <span className={styles.paletteGroupArrow}>{openGroups.has('__custom__') ? '▼' : '▶'}</span>
                      <span className={styles.paletteGroupName}>My Palettes</span>
                      <span className={styles.paletteGroupCount}>{customPalettes.length}</span>
                    </button>

                    {openGroups.has('__custom__') && (customPalettes ?? []).map(p => (
                      <button
                        key={p.name}
                        className={styles.palettePickerItem}
                        onClick={() => applyMeshPalette(p.colors)}
                      >
                        <span className={styles.palettePickerName}>{p.name}</span>
                        <span className={styles.palettePickerSwatches}>
                          {p.colors.map((c, i) => (
                            <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {PALETTE_GROUPS.map(group => (
                  <div key={group.name}>
                    <button className={styles.paletteGroupHeader} onClick={() => toggleGroup(group.name)}>
                      <span className={styles.paletteGroupArrow}>{openGroups.has(group.name) ? '▼' : '▶'}</span>
                      <span className={styles.paletteGroupName}>{group.name}</span>
                      <span className={styles.paletteGroupCount}>{group.keys.length}</span>
                    </button>

                    {openGroups.has(group.name) && group.keys.map(k => (
                      <button
                        key={k}
                        className={styles.palettePickerItem}
                        onClick={() => applyMeshPalette(PALETTES[k])}
                      >
                        <span className={styles.palettePickerName}>{k}</span>
                        <span className={styles.palettePickerSwatches}>
                          {PALETTES[k]?.map((c, i) => (
                            <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* ── Colour editor view ──────────────────────── */}
            {view === 'colours' && (
              <>
                <div className={styles.subViewBack}>
                  <button className={styles.subViewBackBtn} onClick={popView}>← Back</button>
                  <span className={styles.subViewBackLabel}>Colours</span>
                </div>

                <div className={styles.colourEditorSection}>
                  <div className={styles.colourEditorLabel}>Shape colours</div>

                  <button className={styles.paletteChooserBtn} onClick={() => pushView('palette')} style={{ width: '100%' }}>
                    <span className={styles.paletteChooserName}>{paletteKey}</span>
                    <span className={styles.paletteChooserSwatches}>
                      {PALETTES[paletteKey]?.map((c, i) => (
                        <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} />
                      ))}
                    </span>
                    <span className={styles.paletteChooserArrow}>›</span>
                  </button>

                  <div className={styles.paletteSwatchToggles}>
                    {displayShapeColors.map(c => (
                      <div
                        key={c.id}
                        className={styles.customSwatchWrapper}
                        draggable
                        onDragStart={() => onShapeDragStart(c.id)}
                        onDragOver={e => onShapeDragOver(e, c.id)}
                        onDragEnd={onShapeDragEnd}
                      >
                        <button
                          className={`${styles.paletteSwatchToggle} ${!c.enabled ? styles.paletteSwatchToggleOff : ''}`}
                          style={{ background: c.hex, width: '100%' }}
                          onClick={() => toggleShapeColor(c.id)}
                          title={`${c.hex} — click to ${c.enabled ? 'disable' : 'enable'}`}
                        />
                        {c.source === 'custom' && (
                          <button
                            className={styles.customSwatchRemove}
                            onClick={e => { e.stopPropagation(); removeShapeColor(c.id); }}
                            title="Remove"
                          >×</button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className={styles.addColourRow}>
                    <button className={styles.addQuickBtn} onClick={() => addCustomShapeColor('#ffffff')} title="Add white">W</button>
                    <button className={styles.addQuickBtn} onClick={() => addCustomShapeColor('#000000')} title="Add black">B</button>
                    <input
                      type="text"
                      className={styles.hexInput}
                      value={rawCustomHex}
                      onChange={e => setRawCustomHex(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCustomShapeColor(rawCustomHex)}
                      placeholder="#hex"
                      maxLength={7}
                      spellCheck={false}
                    />
                    <button
                      className={styles.addHexBtn}
                      onClick={() => addCustomShapeColor(rawCustomHex)}
                      disabled={!normalizeHex(rawCustomHex)}
                      title="Add colour"
                    >+</button>
                  </div>

                  {(shapeColors ?? []).some(c => c.source === 'custom') && (
                    <button className={styles.clearCustomBtn} onClick={() => onShapeColorsChange(prev => prev.filter(c => c.source === 'palette'))}>
                      Clear custom
                    </button>
                  )}

                  <div className={styles.addColourRow} style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      className={styles.hexInput}
                      style={{ flex: 1 }}
                      value={savePaletteName}
                      onChange={e => setSavePaletteName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && savePaletteName.trim()) { onSaveCustomPalette(savePaletteName); setSavePaletteName(''); } }}
                      placeholder="Palette name…"
                      maxLength={32}
                      spellCheck={false}
                    />
                    <button
                      className={styles.addHexBtn}
                      onClick={() => { onSaveCustomPalette(savePaletteName); setSavePaletteName(''); }}
                      disabled={!savePaletteName.trim()}
                      title="Save current colours as palette"
                    >Save</button>
                  </div>
                </div>

                {colorMode === 'uniform' && (
                  <div className={styles.colourEditorSection}>
                    <div className={styles.colourEditorLabel}>Background colours</div>

                    <div className={styles.paletteSwatchToggles}>
                      {displayBgColors.map(c => (
                        <div
                          key={c.id}
                          className={styles.customSwatchWrapper}
                          draggable
                          onDragStart={() => onBgDragStart(c.id)}
                          onDragOver={e => onBgDragOver(e, c.id)}
                          onDragEnd={onBgDragEnd}
                        >
                          <button
                            className={`${styles.paletteSwatchToggle} ${!c.enabled ? styles.paletteSwatchToggleOff : ''}`}
                            style={{ background: c.hex, width: '100%' }}
                            onClick={() => toggleBgColor(c.id)}
                            title={`${c.hex} — click to ${c.enabled ? 'disable' : 'enable'}`}
                          />
                          <button
                            className={styles.customSwatchRemove}
                            onClick={e => { e.stopPropagation(); removeBgColor(c.id); }}
                            title="Remove"
                          >×</button>
                        </div>
                      ))}
                    </div>

                    <div className={styles.addColourRow}>
                      <button className={styles.addQuickBtn} onClick={() => addBgColor('#ffffff')} title="Add white">W</button>
                      <button className={styles.addQuickBtn} onClick={() => addBgColor('#000000')} title="Add black">B</button>
                      <input
                        type="text"
                        className={styles.hexInput}
                        value={rawBgHex}
                        onChange={e => setRawBgHex(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addBgColor(rawBgHex)}
                        placeholder="#hex"
                        maxLength={7}
                        spellCheck={false}
                      />
                      <button
                        className={styles.addHexBtn}
                        onClick={() => addBgColor(rawBgHex)}
                        disabled={!normalizeHex(rawBgHex)}
                        title="Add colour"
                      >+</button>
                    </div>

                    <div className={styles.fromPaletteRow}>
                      <span className={styles.fromPaletteLabel}>From colours</span>
                      {(shapeColors ?? []).map(c => (
                        <button
                          key={c.id}
                          className={`${styles.fromPaletteSwatch} ${c.source === 'custom' ? styles.fromPaletteSwatchCustom : ''}`}
                          style={{ background: c.hex }}
                          onClick={() => addBgColor(c.hex)}
                          title={`Add ${c.hex}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Pinned header — always visible, every view ─── */}
            {/* Tool + View — always-visible toolbar */}
            <div className={`${styles.section} ${styles.toolbarSection}`}>
              <div className={styles.toolbarContent}>
                <div className={styles.toolToggle}>
                  <button
                    className={`${styles.toolBtn} ${activeTool === 'select' ? styles.active : ''}`}
                    onClick={() => onToolChange('select')}
                    title="Select tool"
                  >↖ Select</button>
                  <button
                    className={`${styles.toolBtn} ${activeTool === 'hand' ? styles.active : ''}`}
                    onClick={() => onToolChange('hand')}
                    title="Hand tool"
                  >✋ Hand</button>
                </div>
                <div className={styles.zoomRow}>
                  <button className={styles.zoomBtn} onClick={() => onZoom(-1)} title="Zoom out">−</button>
                  <span className={styles.zoomLabel}>{zoomPct}%</span>
                  <button className={styles.zoomBtn} onClick={() => onZoom(1)} title="Zoom in">+</button>
                  <button className={`${styles.zoomBtn} ${styles.resetBtn}`} onClick={onResetView} title="Fit to view">Fit</button>
                  <button className={styles.zoomBtn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
                  <button className={styles.zoomBtn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
                  <button className={`${styles.zoomBtn} ${showShortcuts ? styles.active : ''}`} onClick={onToggleShortcuts} title="Keyboard shortcuts (?)">?</button>
                </div>
              </div>
            </div>

            {/* Grid Settings — core, always expanded */}
            <div className={styles.section}>
              <div className={styles.staticHeader}>
                <span className={styles.sectionTitle}>Grid Settings</span>
              </div>
              <div className={styles.sectionContent}>
                  <div className={styles.formRow}>
                    <span className={styles.label}>Area</span>
                    <select className={styles.select} value={presetKey} onChange={e => onPresetChange(e.target.value)}>
                      {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                  </div>

                  {isCustom && (
                    <div className={styles.formRow}>
                      <span className={styles.label}>Size</span>
                      <div className={styles.dimRow}>
                        <input type="number" className={styles.dimInput} value={rawWidth}
                          onChange={e => setRawWidth(e.target.value)}
                          onBlur={() => commitDim('width', rawWidth)} />
                        <span className={styles.dimX}>×</span>
                        <input type="number" className={styles.dimInput} value={rawHeight}
                          onChange={e => setRawHeight(e.target.value)}
                          onBlur={() => commitDim('height', rawHeight)} />
                        <span className={styles.dimUnit}>px</span>
                      </div>
                    </div>
                  )}

                  <div className={styles.formRowPair}>
                    <div className={styles.stackedField}>
                      <span className={styles.label}>Columns</span>
                      <Stepper value={gridSettings.cols} onChange={v => onGridSettingsChange({ cols: v })} min={1} max={80} validValues={validCols} />
                    </div>
                    <div className={styles.stackedField}>
                      <span className={styles.label}>Border</span>
                      <Stepper value={gridSettings.borderPct} onChange={v => onGridSettingsChange({ borderPct: v })} min={0} max={40} format={v => `${v}%`} />
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Max scale</span>
                    <div className={styles.sliderRow}>
                      <input type="range" className={styles.slider} min={1} max={4} step={1}
                        value={maxScale} onChange={e => onMaxScaleChange(+e.target.value)} />
                      <span className={styles.sliderVal}>{maxScale}×</span>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Scale freq</span>
                    <div className={styles.sliderRow}>
                      <input
                        type="range"
                        className={`${styles.slider} ${maxScale === 1 ? styles.sliderDisabled : ''}`}
                        min={0} max={100} step={5}
                        value={scaleFreq}
                        disabled={maxScale === 1}
                        onChange={e => onScaleFreqChange(+e.target.value)}
                      />
                      <input
                        type="number"
                        className={`${styles.sliderNumInput} ${maxScale === 1 ? styles.sliderDisabled : ''}`}
                        min={0} max={100}
                        value={scaleFreq}
                        disabled={maxScale === 1}
                        onChange={e => handleScaleFreqInput(e.target.value)}
                      />
                      <span className={styles.sliderUnit}>%</span>
                    </div>
                  </div>

                  {gridComputed && (
                    <div className={styles.gridInfo}>
                      {gridComputed.rows} rows · {gridComputed.totalCells} cells · {gridComputed.cellSize.toFixed(1)}px
                      {validCols && !validCols.includes(gridSettings.cols) && <span className={styles.snapNote}> (snapped)</span>}
                    </div>
                  )}
                  {validCols === null && <div className={styles.gridNote}>Any column count is valid for this layout</div>}

                  <div className={styles.formRow} style={{ marginTop: 8 }}>
                    <span className={styles.label}>Auto-fill</span>
                    <button
                      className={`${styles.modeBtn} ${autoFill ? styles.modeBtnActive : ''}`}
                      onClick={() => onAutoFillChange(!autoFill)}
                      title="Re-fill grid automatically whenever settings change"
                    >{autoFill ? 'On' : 'Off'}</button>
                  </div>
              </div>
            </div>

            {/* Unified Fill button — always triggers whichever fill mode is active */}
            <div className={styles.fillBtnRow}>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                style={{ width: '100%' }}
                onClick={activeFillAction.onFill}
                disabled={!activeFillAction.canFill}
              >▶ Fill — {FILL_MODE_LABELS[fillMode]}</button>
            </div>

            {/* ── Main menu ──────────────────────────────────── */}
            {view === 'main' && (
              <div className={styles.menuList}>
                <MenuRow
                  label="Fill"
                  preview={<span>{FILL_MODE_LABELS[fillMode]}</span>}
                  onClick={() => pushView('fill')}
                />
                <MenuRow
                  label="Background"
                  preview={bgType === 'solid' ? (
                    <>
                      <span className={styles.menuRowSwatch} style={{ background: canvasBg }} />
                      <span className={styles.menuRowSwatch} style={{ background: bgColor }} />
                      <span>Solid</span>
                    </>
                  ) : <span>Image</span>}
                  onClick={() => pushView('background')}
                />
                <MenuRow
                  label="Colour"
                  preview={colourPreview.length ? (
                    <>{colourPreview.slice(0, 6).map((c, i) => (
                      <span key={i} className={styles.menuRowSwatch} style={{ background: c }} />
                    ))}</>
                  ) : <span>{colorMode === 'none' ? 'None' : colorMode}</span>}
                  onClick={() => pushView('colour')}
                />
                <MenuRow label="Palette Extractor" onClick={() => pushView('paletteExtractor')} />
                <MenuRow label="Assets" onClick={() => pushView('assets')} />
                {animSettings && onAnimSettingsChange && (
                  <MenuRow
                    label="Animation"
                    preview={<>
                      {animSettings.enabled && <span className={styles.menuRowDot} />}
                      <span>{animSettings.enabled ? 'Playing' : 'Paused'}</span>
                    </>}
                    onClick={() => pushView('animation')}
                  />
                )}
                <MenuRow
                  label="Audio Reactive"
                  preview={<span>{audioSettings?.enabled ? 'On' : 'Off'}</span>}
                  onClick={() => pushView('audio')}
                />
                <MenuRow label="Actions" onClick={() => pushView('actions')} />
              </div>
            )}

            {/* Background */}
            {view === 'background' && (
              <>
                <SubViewHeader title="Background" onBack={popView} />
                <div className={styles.sectionContent}>
                  <div className={styles.formRow}>
                    <span className={styles.label}>Type</span>
                    <div className={styles.modeToggle}>
                      {[
                        { key: 'solid', label: 'Solid' },
                        { key: 'image', label: 'Image' },
                      ].map(({ key, label }) => (
                        <button key={key}
                          className={`${styles.modeBtn} ${bgType === key ? styles.modeBtnActive : ''}`}
                          onClick={() => setBgType(key)}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {bgType === 'solid' && (
                  <div className={styles.formRowPair}>
                    <div className={styles.stackedField}>
                      <span className={styles.label}>Canvas</span>
                      <div className={styles.colorRow}>
                        <input type="color" value={canvasBg} onChange={e => onCanvasBgChange(e.target.value)} className={styles.colorInput} />
                        <span className={styles.colorLabel}>{canvasBg}</span>
                      </div>
                    </div>
                    <div className={styles.stackedField}>
                      <span className={styles.label}>Outer</span>
                      <div className={styles.colorRow}>
                        <input type="color" value={bgColor} onChange={e => onBgColorChange(e.target.value)} className={styles.colorInput} />
                        <span className={styles.colorLabel}>{bgColor}</span>
                      </div>
                    </div>
                  </div>
                  )}

                  {bgType === 'image' && backdropSettings && (<>
                  <div className={styles.imageUploadArea}>
                    <input
                      ref={backdropInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleBackdropUpload}
                    />
                    {backdropSrc ? (
                      <div className={styles.imageThumbnailWrapper}>
                        <img src={backdropSrc} className={styles.imageThumbnail} alt="Backdrop" />
                        <div className={styles.imageThumbnailActions}>
                          <button className={styles.imageReplaceBtn} onClick={() => backdropInputRef.current?.click()}>
                            Replace
                          </button>
                          <button className={styles.imageRemoveBtn} onClick={() => onBackdropSrcChange(null)}>
                            ×
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className={styles.ingestBtn} onClick={() => backdropInputRef.current?.click()}>
                        Upload image…
                      </button>
                    )}
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Mode</span>
                    <div className={styles.modeToggle}>
                      {[
                        { key: 'reference', label: 'Reference' },
                        { key: 'backdrop',  label: 'Backdrop' },
                      ].map(({ key, label }) => (
                        <button key={key}
                          className={`${styles.modeBtn} ${backdropSettings.mode === key ? styles.modeBtnActive : ''}`}
                          onClick={() => onBackdropSettingsChange({ mode: key })}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Fit</span>
                    <div className={styles.modeToggle}>
                      {[
                        { key: 'contain', label: 'Contain' },
                        { key: 'cover',   label: 'Cover' },
                        { key: 'stretch', label: 'Stretch' },
                      ].map(({ key, label }) => (
                        <button key={key}
                          className={`${styles.modeBtn} ${backdropSettings.fit === key ? styles.modeBtnActive : ''}`}
                          onClick={() => onBackdropSettingsChange({ fit: key })}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Opacity</span>
                    <div className={styles.sliderRow}>
                      <input type="range" className={styles.slider} min="0" max="1" step="0.05"
                        value={backdropSettings.opacity}
                        onChange={e => onBackdropSettingsChange({ opacity: +e.target.value })} />
                      <span className={styles.sliderVal}>{Math.round(backdropSettings.opacity * 100)}%</span>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Tint</span>
                    <div className={styles.colorRow}>
                      <input type="color" value={backdropSettings.tintColour} onChange={e => onBackdropSettingsChange({ tintColour: e.target.value })} className={styles.colorInput} />
                      <span className={styles.colorLabel}>{backdropSettings.tintColour}</span>
                    </div>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.label}>Tint Opacity</span>
                    <div className={styles.sliderRow}>
                      <input type="range" className={styles.slider} min="0" max="1" step="0.05"
                        value={backdropSettings.tintOpacity}
                        onChange={e => onBackdropSettingsChange({ tintOpacity: +e.target.value })} />
                      <span className={styles.sliderVal}>{Math.round(backdropSettings.tintOpacity * 100)}%</span>
                    </div>
                  </div>
                  </>)}
                </div>
              </>
            )}

            {/* Palette Extractor */}
            {view === 'paletteExtractor' && (
              <>
                <SubViewHeader title="Palette Extractor" onBack={popView} />
                {paletteExtractSettings && (
                    <div className={styles.sectionContent}>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Extract From</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'image',    label: 'Colour Image', enabled: canExtractFromImage },
                            { key: 'backdrop', label: 'Background',   enabled: canExtractFromBackdrop },
                          ].map(({ key, label, enabled }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${paletteExtractSettings.extractFrom === key ? styles.modeBtnActive : ''}`}
                              disabled={!enabled}
                              title={enabled ? '' : 'No image loaded for this source'}
                              onClick={() => onPaletteExtractSettingsChange({ extractFrom: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Colours</span>
                        <Stepper value={paletteExtractSettings.numColours} onChange={v => onPaletteExtractSettingsChange({ numColours: v })} min={4} max={16} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Extracted</span>
                        {extractedPalette.length ? (
                          <div className={styles.paletteChooserSwatches}>
                            {extractedPalette.map((c, i) => (
                              <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} title={c} />
                            ))}
                          </div>
                        ) : (
                          <span className={styles.gridNote}>No image available — load an image first.</span>
                        )}
                      </div>

                      <div className={styles.formRow}>
                        <button className={styles.actionBtn} disabled={!extractedPalette.length} onClick={onApplyExtractedToShapes}>
                          Apply to Shape Colours
                        </button>
                        <button className={styles.actionBtn} disabled={!extractedPalette.length} onClick={onApplyExtractedToBg}>
                          Apply to Background Colours
                        </button>
                      </div>
                    </div>
                )}
              </>
            )}

            {/* Colour */}
            {view === 'colour' && (
              <>
                <SubViewHeader title="Colour" onBack={popView} />
                <div className={styles.sectionContent}>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Mode</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'none',     label: 'None' },
                            { key: 'uniform',  label: 'Uniform' },
                            { key: 'random',   label: 'Random' },
                            { key: 'gradient', label: 'Gradient' },
                            { key: 'mesh',     label: 'Mesh' },
                            { key: 'image',    label: 'Image' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${colorMode === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onColorModeChange(key)}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {colorMode === 'uniform' && (
                        <>
                          <div className={styles.formRow} style={{ marginTop: 6 }}>
                            <span className={styles.label}>Reverse</span>
                            <button
                              className={`${styles.modeBtn} ${uniformReverse ? styles.modeBtnActive : ''}`}
                              style={{ flex: 'none', padding: '3px 8px', fontSize: 10 }}
                              onClick={() => onUniformReverseChange(!uniformReverse)}
                              title="Apply palette colours in reverse order for all blocks"
                            >Reverse</button>
                          </div>

                          <div className={styles.formRow} style={{ marginTop: 4 }}>
                            <span className={styles.label}>Rnd Rev</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                className={`${styles.modeBtn} ${randomReverseEnabled ? styles.modeBtnActive : ''}`}
                                style={{ flex: 'none', padding: '3px 8px', fontSize: 10 }}
                                onClick={() => {
                                  if (!randomReverseEnabled) {
                                    onRandomReverseEnabledChange(true);
                                    onRandomReverse();
                                  } else {
                                    onRandomReverseEnabledChange(false);
                                  }
                                }}
                                title="Randomly reverse palette colours on a percentage of blocks"
                              >{randomReverseEnabled ? 'On' : 'Off'}</button>
                              {randomReverseEnabled && (
                                <button
                                  className={styles.modeBtn}
                                  style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                                  onClick={onRandomReverse}
                                  title="Re-randomise"
                                >↺</button>
                              )}
                            </div>
                          </div>

                          {randomReverseEnabled && (
                            <div className={styles.formRow} style={{ marginTop: 2 }}>
                              <span className={styles.label}>{randomReversePct}%</span>
                              <div className={styles.sliderRow}>
                                <input
                                  type="range" min={0} max={100} step={5}
                                  value={randomReversePct}
                                  onChange={e => onRandomReversePctChange(+e.target.value)}
                                  className={styles.slider}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {colorMode === 'random' && (
                        <div className={styles.formRow} style={{ marginTop: 6 }}>
                          <span className={styles.label}>Re-run</span>
                          <button
                            className={styles.modeBtn}
                            style={{ flex: 'none', padding: '3px 12px', fontSize: 12 }}
                            onClick={onRandomRerun}
                            title="Re-randomise all block colour seeds"
                          >↺ Shuffle</button>
                        </div>
                      )}

                      <div className={styles.formRow} style={{ marginTop: 6 }}>
                        <span className={styles.label}>Temperature</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={-100} max={100} step={1}
                            value={colorTempShift}
                            onChange={e => onColorTempShiftChange(+e.target.value)} />
                          <span className={styles.sliderVal}>{colorTempShift}</span>
                        </div>
                      </div>

                      <div className={styles.formRow} style={{ marginTop: 4 }}>
                        <span className={styles.label}>Blend mode</span>
                        <select
                          className={styles.select}
                          value={blendMode}
                          onChange={e => onBlendModeChange(e.target.value)}
                        >
                          {['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
                            'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion',
                          ].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {colorMode !== 'none' && colorMode !== 'image' && colorMode !== 'mesh' && (
                        <button className={styles.assetsBrowserBtn} onClick={() => pushView('colours')}>
                          <span className={styles.coloursBrowserContent}>
                            <span className={styles.coloursBrowserLabel}>Edit colours</span>
                            <span className={styles.coloursBrowserSwatches}>
                              {colourPreview.map((c, i) => (
                                <span key={i} className={styles.coloursBrowserSwatch} style={{ background: c }} />
                              ))}
                            </span>
                          </span>
                          <span className={styles.assetsBrowserArrow}>›</span>
                        </button>
                      )}

                      {colorMode === 'image' && (
                        <div className={styles.imageUploadArea}>
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                          />
                          {imageSrc ? (
                            <div className={styles.imageThumbnailWrapper}>
                              <img src={imageSrc} className={styles.imageThumbnail} alt="Source" />
                              <div className={styles.imageThumbnailActions}>
                                <button className={styles.imageReplaceBtn} onClick={() => imageInputRef.current?.click()}>
                                  Replace
                                </button>
                                <button className={styles.imageRemoveBtn} onClick={() => onImageSrcChange(null)}>
                                  ×
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button className={styles.ingestBtn} onClick={() => imageInputRef.current?.click()}>
                              Upload image…
                            </button>
                          )}
                          {imageProgress !== null && (
                            <div className={styles.imageProgressBar}>
                              <div
                                className={styles.imageProgressFill}
                                style={{ width: `${imageProgress}%` }}
                              />
                            </div>
                          )}
                          <div className={styles.formRow} style={{ marginTop: 8 }}>
                            <span className={styles.label}>Colour tolerance</span>
                            <span className={styles.stepVal}>{imageColourTolerance}</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={50}
                            step={1}
                            value={imageColourTolerance}
                            onChange={e => onImageColourToleranceChange(Number(e.target.value))}
                            className={styles.slider}
                            style={{ width: '100%', marginTop: 4 }}
                          />
                        </div>
                      )}

                      {colorMode === 'gradient' && gradientSettings && (
                        <div className={styles.gradientControls}>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Style</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'linear', label: 'Linear' },
                                { key: 'radial', label: 'Radial' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${gradientSettings.gradMode === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onGradientSettingsChange({ ...gradientSettings, gradMode: key })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          {gradientSettings.gradMode === 'linear' && (
                            <>
                              <div className={styles.gradDirGrid}>
                                {[
                                  { angle: 0,   label: '→' },
                                  { angle: 90,  label: '↓' },
                                  { angle: 180, label: '←' },
                                  { angle: 270, label: '↑' },
                                  { angle: 45,  label: '↘' },
                                  { angle: 135, label: '↙' },
                                  { angle: 225, label: '↖' },
                                  { angle: 315, label: '↗' },
                                ].map(({ angle, label }) => (
                                  <button
                                    key={angle}
                                    className={`${styles.gradDirBtn} ${gradientSettings.angle === angle ? styles.gradDirBtnActive : ''}`}
                                    onClick={() => onGradientSettingsChange({ ...gradientSettings, angle })}
                                  >{label}</button>
                                ))}
                              </div>
                              <div className={styles.formRow} style={{ marginTop: 6 }}>
                                <span className={styles.label}>Angle</span>
                                <div className={styles.sliderRow}>
                                  <input
                                    type="range" min={0} max={359} step={1}
                                    value={gradientSettings.angle}
                                    onChange={e => onGradientSettingsChange({ ...gradientSettings, angle: +e.target.value })}
                                    className={styles.slider}
                                  />
                                  <span className={styles.sliderVal}>{gradientSettings.angle}°</span>
                                </div>
                              </div>
                            </>
                          )}

                          {gradientSettings.gradMode === 'radial' && (
                            <>
                              <div className={styles.gradDirGrid}>
                                {[
                                  { cx: 0,   cy: 0,   label: '↖' },
                                  { cx: 0.5, cy: 0,   label: '↑' },
                                  { cx: 1,   cy: 0,   label: '↗' },
                                  { cx: 0,   cy: 0.5, label: '←' },
                                  { cx: 0.5, cy: 0.5, label: '·' },
                                  { cx: 1,   cy: 0.5, label: '→' },
                                  { cx: 0,   cy: 1,   label: '↙' },
                                  { cx: 0.5, cy: 1,   label: '↓' },
                                  { cx: 1,   cy: 1,   label: '↘' },
                                ].map(({ cx, cy, label }) => (
                                  <button
                                    key={`${cx}-${cy}`}
                                    className={`${styles.gradDirBtn} ${gradientSettings.centerX === cx && gradientSettings.centerY === cy ? styles.gradDirBtnActive : ''}`}
                                    onClick={() => onGradientSettingsChange({ ...gradientSettings, centerX: cx, centerY: cy })}
                                  >{label}</button>
                                ))}
                              </div>
                              <div className={styles.formRow} style={{ marginTop: 6 }}>
                                <span className={styles.label}>Center X</span>
                                <div className={styles.sliderRow}>
                                  <input
                                    type="range" min={0} max={100} step={5}
                                    value={Math.round((gradientSettings.centerX ?? 0.5) * 100)}
                                    onChange={e => onGradientSettingsChange({ ...gradientSettings, centerX: +e.target.value / 100 })}
                                    className={styles.slider}
                                  />
                                  <span className={styles.sliderVal}>{Math.round((gradientSettings.centerX ?? 0.5) * 100)}%</span>
                                </div>
                              </div>
                              <div className={styles.formRow}>
                                <span className={styles.label}>Center Y</span>
                                <div className={styles.sliderRow}>
                                  <input
                                    type="range" min={0} max={100} step={5}
                                    value={Math.round((gradientSettings.centerY ?? 0.5) * 100)}
                                    onChange={e => onGradientSettingsChange({ ...gradientSettings, centerY: +e.target.value / 100 })}
                                    className={styles.slider}
                                  />
                                  <span className={styles.sliderVal}>{Math.round((gradientSettings.centerY ?? 0.5) * 100)}%</span>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Scale — applies to both linear and radial */}
                          <div className={styles.formRow} style={{ marginTop: 6 }}>
                            <span className={styles.label}>Scale</span>
                            <div className={styles.sliderRow}>
                              <input
                                type="range" min={0.1} max={4} step={0.1}
                                value={gradientSettings.gradScale ?? 1}
                                onChange={e => onGradientSettingsChange({ ...gradientSettings, gradScale: +e.target.value })}
                                className={styles.slider}
                              />
                              <span className={styles.sliderVal}>×{(gradientSettings.gradScale ?? 1).toFixed(1)}</span>
                            </div>
                          </div>

                          {/* Repeat */}
                          <div className={styles.formRow} style={{ marginTop: 6 }}>
                            <span className={styles.label}>Repeat</span>
                            <div className={styles.sliderRow}>
                              <input
                                type="range" min={1} max={8} step={1}
                                value={gradientSettings.repeat ?? 1}
                                onChange={e => onGradientSettingsChange({ ...gradientSettings, repeat: +e.target.value })}
                                className={styles.slider}
                              />
                              <span className={styles.sliderVal}>×{gradientSettings.repeat ?? 1}</span>
                            </div>
                          </div>

                          {(gradientSettings.repeat ?? 1) > 1 && (
                            <div className={styles.formRow} style={{ marginTop: 2 }}>
                              <span className={styles.label}>Mode</span>
                              <div className={styles.modeToggle}>
                                {[{ key: 'tile', label: 'Tile' }, { key: 'mirror', label: 'Mirror' }].map(({ key, label }) => (
                                  <button key={key}
                                    className={`${styles.modeBtn} ${(gradientSettings.repeatMode ?? 'tile') === key ? styles.modeBtnActive : ''}`}
                                    onClick={() => onGradientSettingsChange({ ...gradientSettings, repeatMode: key })}
                                  >{label}</button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Jitter */}
                          <div className={styles.formRow} style={{ marginTop: 6 }}>
                            <span className={styles.label}>Jitter</span>
                            <div className={styles.sliderRow}>
                              <input
                                type="range" min={0} max={100} step={5}
                                value={Math.round((gradientSettings.jitter ?? 0) * 100)}
                                onChange={e => onGradientSettingsChange({ ...gradientSettings, jitter: +e.target.value / 100 })}
                                className={styles.slider}
                              />
                              <span className={styles.sliderVal}>{Math.round((gradientSettings.jitter ?? 0) * 100)}%</span>
                            </div>
                          </div>

                          {/* Block background colours for gradient mode */}
                          <div style={{ marginTop: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                              <span className={styles.gradBgLabel} style={{ marginBottom: 0 }}>Block backgrounds</span>
                              <button
                                className={`${styles.modeBtn} ${gradientSettings.reverseBg ? styles.modeBtnActive : ''}`}
                                style={{ flex: 'none', padding: '3px 8px', fontSize: 10 }}
                                onClick={() => onGradientSettingsChange({ ...gradientSettings, reverseBg: !gradientSettings.reverseBg })}
                                title="Use the mirror palette position as the background colour"
                              >Reverse</button>
                            </div>
                            {!gradientSettings.reverseBg && <div className={styles.gradBgSwatches}>
                              {(gradientSettings.gradBgColors ?? []).map(c => (
                                <div key={c.id} className={styles.gradBgSwatch}>
                                  <button
                                    className={`${styles.gradBgSwatchBtn} ${!c.enabled ? styles.gradBgSwatchOff : ''}`}
                                    style={{ background: c.hex }}
                                    onClick={() => onGradientSettingsChange({
                                      ...gradientSettings,
                                      gradBgColors: gradientSettings.gradBgColors.map(x => x.id === c.id ? { ...x, enabled: !x.enabled } : x),
                                    })}
                                    title={`${c.hex} — click to ${c.enabled ? 'disable' : 'enable'}`}
                                  />
                                  <button
                                    className={styles.gradBgRemove}
                                    onClick={() => onGradientSettingsChange({
                                      ...gradientSettings,
                                      gradBgColors: gradientSettings.gradBgColors.filter(x => x.id !== c.id),
                                    })}
                                    title="Remove"
                                  >×</button>
                                </div>
                              ))}
                            </div>}
                            {!gradientSettings.reverseBg && <div className={styles.addColourRow}>
                              <button className={styles.addQuickBtn}
                                onClick={() => onGradientSettingsChange({
                                  ...gradientSettings,
                                  gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: '#ffffff', enabled: true }],
                                })}
                                title="Add white">W</button>
                              <button className={styles.addQuickBtn}
                                onClick={() => onGradientSettingsChange({
                                  ...gradientSettings,
                                  gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: '#000000', enabled: true }],
                                })}
                                title="Add black">B</button>
                              <input
                                type="text"
                                className={styles.hexInput}
                                value={rawGradBgHex}
                                onChange={e => setRawGradBgHex(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    const h = normalizeHex(rawGradBgHex);
                                    if (h) {
                                      onGradientSettingsChange({
                                        ...gradientSettings,
                                        gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: h, enabled: true }],
                                      });
                                      setRawGradBgHex('');
                                    }
                                  }
                                }}
                                placeholder="#hex"
                                maxLength={7}
                                spellCheck={false}
                              />
                              <button
                                className={styles.addHexBtn}
                                onClick={() => {
                                  const h = normalizeHex(rawGradBgHex);
                                  if (h) {
                                    onGradientSettingsChange({
                                      ...gradientSettings,
                                      gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: h, enabled: true }],
                                    });
                                    setRawGradBgHex('');
                                  }
                                }}
                                disabled={!normalizeHex(rawGradBgHex)}
                                title="Add colour"
                              >+</button>
                            </div>}
                          </div>
                        </div>
                      )}

                      {colorMode === 'mesh' && meshDraft && (
                        <div className={styles.gradientControls}>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Power</span>
                            <div className={styles.sliderRow}>
                              <input
                                type="range" min={0.5} max={6} step={0.5}
                                value={meshDraft.weightPower ?? 2}
                                onChange={e => updateMesh({ ...meshDraft, weightPower: +e.target.value })}
                                className={styles.slider}
                              />
                              <span className={styles.sliderVal}>×{(meshDraft.weightPower ?? 2).toFixed(1)}</span>
                            </div>
                          </div>

                          <div style={{ marginTop: 10 }}>
                            <span className={styles.gradBgLabel}>Colour points</span>
                            {(meshDraft.points ?? []).map(p => (
                              <div key={p.id} className={styles.meshPointCard}>
                                <div className={styles.meshPointRow}>
                                  <input
                                    type="color"
                                    value={p.hex}
                                    onChange={e => updateMeshHex(p.id, e.target.value)}
                                    className={styles.colorInput}
                                  />
                                  <div className={styles.meshPointSliders}>
                                    <div className={styles.sliderRow}>
                                      <span className={styles.sliderVal} style={{ minWidth: 12, textAlign: 'left' }}>X</span>
                                      <input
                                        type="range" min={0} max={100} step={1}
                                        value={Math.round(p.x * 100)}
                                        onChange={e => updateMesh({
                                          ...meshDraft,
                                          points: meshDraft.points.map(x => x.id === p.id ? { ...x, x: +e.target.value / 100 } : x),
                                        })}
                                        className={styles.slider}
                                      />
                                      <span className={styles.sliderVal}>{Math.round(p.x * 100)}%</span>
                                    </div>
                                    <div className={styles.sliderRow}>
                                      <span className={styles.sliderVal} style={{ minWidth: 12, textAlign: 'left' }}>Y</span>
                                      <input
                                        type="range" min={0} max={100} step={1}
                                        value={Math.round(p.y * 100)}
                                        onChange={e => updateMesh({
                                          ...meshDraft,
                                          points: meshDraft.points.map(x => x.id === p.id ? { ...x, y: +e.target.value / 100 } : x),
                                        })}
                                        className={styles.slider}
                                      />
                                      <span className={styles.sliderVal}>{Math.round(p.y * 100)}%</span>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  className={styles.meshRemoveBtn}
                                  onClick={() => updateMesh({
                                    ...meshDraft,
                                    points: meshDraft.points.filter(x => x.id !== p.id),
                                  })}
                                  disabled={(meshDraft.points?.length ?? 0) <= 2}
                                  title="Remove point"
                                >Remove point</button>
                              </div>
                            ))}
                            <div className={styles.addColourRow} style={{ marginTop: 6 }}>
                              <button
                                className={styles.modeBtn}
                                style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                                onClick={() => pushView('meshPalette')}
                              >From palette</button>
                              <button
                                className={styles.modeBtn}
                                style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                                onClick={() => updateMesh({
                                  ...meshDraft,
                                  points: (meshDraft.points ?? []).map(p => ({ ...p, x: Math.random(), y: Math.random() })),
                                })}
                              >Randomise points</button>
                              <button
                                className={styles.modeBtn}
                                style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                                onClick={() => updateMesh({
                                  ...meshDraft,
                                  points: [...(meshDraft.points ?? []), {
                                    id: crypto.randomUUID(),
                                    x: 0.5, y: 0.5,
                                    hex: hslToHex((meshDraft.points?.length ?? 0) * 137.5 % 360, 70, 60),
                                  }],
                                })}
                                disabled={(meshDraft.points?.length ?? 0) >= 8}
                              >+ Add point</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
              </>
            )}

            {/* Animation */}
            {view === 'animation' && animSettings && onAnimSettingsChange && (
              <>
                <SubViewHeader title="Animation" onBack={popView} />
                <div className={styles.sectionContent}>

                      {/* Play / Pause */}
                      <div className={styles.animPlayRow}>
                        <button
                          className={`${styles.actionBtn} ${animSettings.enabled ? styles.actionBtnPrimary : ''}`}
                          onClick={() => onAnimSettingsChange({ enabled: !animSettings.enabled })}
                        >
                          {animSettings.enabled ? '⏸ Pause' : '▶ Play'}
                        </button>
                      </div>

                      {/* Type selector */}
                      <div className={styles.animTypeGrid}>
                        {[
                          { key: 'noise',         label: 'Noise'    },
                          { key: 'gradientSweep', label: 'Gradient' },
                          { key: 'paletteWave',   label: 'Wave'     },
                          { key: 'hueDrift',      label: 'Hue'      },
                          { key: 'warp',          label: 'Warp'     },
                          { key: 'flicker',       label: 'Flicker'  },
                          { key: 'pixelSort',     label: 'Pixel Sort' },
                          { key: 'stripScan',     label: 'Strip Scan' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            className={`${styles.animTypeBtn} ${animSettings.type === key ? styles.active : ''}`}
                            onClick={() => onAnimSettingsChange({ type: key })}
                          >{label}</button>
                        ))}
                      </div>

                      {/* Speed */}
                      <div className={styles.formRow}>
                        <span className={styles.label}>Speed</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider}
                            min={0.05} max={3} step={0.05}
                            value={animSettings.speed}
                            onChange={e => onAnimSettingsChange({ speed: parseFloat(e.target.value) })}
                          />
                          <span className={styles.sliderVal}>{animSettings.speed.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Intensity */}
                      <div className={styles.formRow}>
                        <span className={styles.label}>Intensity</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider}
                            min={0.05} max={1} step={0.05}
                            value={animSettings.intensity}
                            onChange={e => onAnimSettingsChange({ intensity: parseFloat(e.target.value) })}
                          />
                          <span className={styles.sliderVal}>{Math.round(animSettings.intensity * 100)}%</span>
                        </div>
                      </div>

                      {/* ── Per-type controls ── */}
                      {animSettings.type === 'noise' && (
                        <>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Scale</span>
                            <div className={styles.sliderRow}>
                              <input type="range" className={styles.slider}
                                min={0.02} max={0.6} step={0.01}
                                value={animSettings.noise?.scale ?? 0.18}
                                onChange={e => onAnimSettingsChange({ noise: { ...animSettings.noise, scale: parseFloat(e.target.value) } })}
                              />
                              <span className={styles.sliderVal}>{(animSettings.noise?.scale ?? 0.18).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Octaves</span>
                            <div className={styles.animTypeGrid} style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                              {[1,2,3,4].map(n => (
                                <button key={n}
                                  className={`${styles.animTypeBtn} ${(animSettings.noise?.octaves ?? 3) === n ? styles.active : ''}`}
                                  onClick={() => onAnimSettingsChange({ noise: { ...animSettings.noise, octaves: n } })}
                                >{n}</button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {animSettings.type === 'paletteWave' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>Wavelength</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider}
                              min={1} max={12} step={0.5}
                              value={animSettings.paletteWave?.wavelength ?? 4}
                              onChange={e => onAnimSettingsChange({ paletteWave: { ...animSettings.paletteWave, wavelength: parseFloat(e.target.value) } })}
                            />
                            <span className={styles.sliderVal}>{(animSettings.paletteWave?.wavelength ?? 4).toFixed(1)}</span>
                          </div>
                        </div>
                      )}

                      {animSettings.type === 'hueDrift' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>Range</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider}
                              min={15} max={360} step={5}
                              value={animSettings.hueDrift?.range ?? 120}
                              onChange={e => onAnimSettingsChange({ hueDrift: { ...animSettings.hueDrift, range: parseInt(e.target.value) } })}
                            />
                            <span className={styles.sliderVal}>{animSettings.hueDrift?.range ?? 120}°</span>
                          </div>
                        </div>
                      )}

                      {animSettings.type === 'warp' && (
                        <>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Scale</span>
                            <div className={styles.sliderRow}>
                              <input type="range" className={styles.slider}
                                min={2} max={60} step={1}
                                value={animSettings.warp?.scale ?? 18}
                                onChange={e => onAnimSettingsChange({ warp: { ...animSettings.warp, scale: parseInt(e.target.value) } })}
                              />
                              <span className={styles.sliderVal}>{animSettings.warp?.scale ?? 18}</span>
                            </div>
                          </div>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Frequency</span>
                            <div className={styles.sliderRow}>
                              <input type="range" className={styles.slider}
                                min={0.001} max={0.025} step={0.001}
                                value={animSettings.warp?.frequency ?? 0.006}
                                onChange={e => onAnimSettingsChange({ warp: { ...animSettings.warp, frequency: parseFloat(e.target.value) } })}
                              />
                              <span className={styles.sliderVal}>{(animSettings.warp?.frequency ?? 0.006).toFixed(3)}</span>
                            </div>
                          </div>
                        </>
                      )}

                      {animSettings.type === 'flicker' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>Density</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider}
                              min={0.01} max={0.5} step={0.01}
                              value={animSettings.flicker?.density ?? 0.07}
                              onChange={e => onAnimSettingsChange({ flicker: { ...animSettings.flicker, density: parseFloat(e.target.value) } })}
                            />
                            <span className={styles.sliderVal}>{Math.round((animSettings.flicker?.density ?? 0.07) * 100)}%</span>
                          </div>
                        </div>
                      )}

                      {animSettings.type === 'pixelSort' && (
                        <>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Sort Axis</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'row',      label: 'Rows' },
                                { key: 'column',   label: 'Columns' },
                                { key: 'diagonal', label: 'Diagonal' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortAxis ?? 'row') === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onAnimSettingsChange({ pixelSort: { ...animSettings.pixelSort, sortAxis: key } })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Sort By</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'brightness', label: 'Brightness' },
                                { key: 'hue',        label: 'Hue' },
                                { key: 'saturation', label: 'Saturation' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortBy ?? 'brightness') === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onAnimSettingsChange({ pixelSort: { ...animSettings.pixelSort, sortBy: key } })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Direction</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'ascending',  label: 'Ascending' },
                                { key: 'descending', label: 'Descending' },
                                { key: 'oscillate',  label: 'Oscillate' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortDirection ?? 'ascending') === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onAnimSettingsChange({ pixelSort: { ...animSettings.pixelSort, sortDirection: key } })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Sort Width</span>
                            <Stepper value={animSettings.pixelSort?.sortWidth ?? 8} onChange={v => onAnimSettingsChange({ pixelSort: { ...animSettings.pixelSort, sortWidth: v } })} min={1} max={40} format={v => `${v} cells`} />
                          </div>
                        </>
                      )}

                      {animSettings.type === 'stripScan' && (
                        <>
                          <div className={styles.formRow}>
                            <span className={styles.label}>Sweep Axis</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'h', label: 'Horizontal' },
                                { key: 'v', label: 'Vertical' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${(animSettings.stripScan?.sweepAxis ?? 'h') === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onAnimSettingsChange({ stripScan: { ...animSettings.stripScan, sweepAxis: key } })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Beam Width</span>
                            <Stepper value={animSettings.stripScan?.beamWidth ?? 4} onChange={v => onAnimSettingsChange({ stripScan: { ...animSettings.stripScan, beamWidth: v } })} min={1} max={20} format={v => `${v} cells`} />
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Motion</span>
                            <div className={styles.modeToggle}>
                              {[
                                { key: 'pingpong', label: 'Ping-pong' },
                                { key: 'scroll',   label: 'Scroll' },
                              ].map(({ key, label }) => (
                                <button key={key}
                                  className={`${styles.modeBtn} ${(animSettings.stripScan?.motionMode ?? 'pingpong') === key ? styles.modeBtnActive : ''}`}
                                  onClick={() => onAnimSettingsChange({ stripScan: { ...animSettings.stripScan, motionMode: key } })}
                                >{label}</button>
                              ))}
                            </div>
                          </div>

                          <div className={styles.formRow}>
                            <span className={styles.label}>Dim Strength</span>
                            <div className={styles.sliderRow}>
                              <input type="range" className={styles.slider}
                                min={0} max={1} step={0.05}
                                value={animSettings.stripScan?.dimStrength ?? 0.7}
                                onChange={e => onAnimSettingsChange({ stripScan: { ...animSettings.stripScan, dimStrength: parseFloat(e.target.value) } })}
                              />
                              <span className={styles.sliderVal}>{Math.round((animSettings.stripScan?.dimStrength ?? 0.7) * 100)}%</span>
                            </div>
                          </div>
                        </>
                      )}

                    </div>
              </>
            )}

            {/* Actions */}
            {view === 'actions' && (
              <>
                <SubViewHeader title="Actions" onBack={popView} />
                <div className={styles.sectionContent}>
                      <div className={styles.actionBtns}>
                        <button className={styles.actionBtn} onClick={onFillGaps} disabled={!canFillGaps}>⊞ Fill Gaps</button>
                        <button className={styles.actionBtn} onClick={() => setShowExportDialog(true)} disabled={!canExport}>↓ Export As…</button>
                      </div>
                      <div className={styles.actionBtns} style={{ marginTop: 6 }}>
                        <button className={styles.actionBtn} onClick={onSaveProject} disabled={!canExport}>↓ Save Project</button>
                        <input ref={projectInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onLoadProject} />
                        <button className={styles.actionBtn} onClick={() => projectInputRef.current.click()}>↑ Load Project</button>
                        <button className={styles.actionBtn} onClick={onFlipH} disabled={!canFlip} title="Flip horizontally">⇔ Flip H</button>
                        <button className={styles.actionBtn} onClick={onFlipV} disabled={!canFlip} title="Flip vertically">⇕ Flip V</button>
                      </div>
                </div>
              </>
            )}

            {/* Fill — mode picker + per-mode settings */}
            {view === 'fill' && (
              <>
                <SubViewHeader title="Fill" onBack={popView} />
                <div className={styles.sectionContent}>
                  <div className={styles.modeGrid2col}>
                    {FILL_MODES.map(key => (
                      <button key={key}
                        className={`${styles.modeBtn} ${fillMode === key ? styles.modeBtnActive : ''}`}
                        onClick={() => setFillMode(key)}
                      >{FILL_MODE_LABELS[key]}</button>
                    ))}
                  </div>
                  {fillMode !== 'standard' && (
                    <div className={styles.subHeading} style={{ marginTop: 12 }}>{FILL_MODE_LABELS[fillMode]} Settings</div>
                  )}
                  <>
                      {fillMode === 'glitch' && (<>
                      {!hasImage && (
                        <div className={styles.gridNote}>Works best with Image colour mode active.</div>
                      )}
                      {glitchSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Direction</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'h', label: 'H' },
                            { key: 'v', label: 'V' },
                            { key: 'both', label: 'Both' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${glitchSettings.direction === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onGlitchSettingsChange({ direction: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>H Bars</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={60} step={1}
                            value={glitchSettings.hBars}
                            onChange={e => onGlitchSettingsChange({ hBars: +e.target.value })} />
                          <span className={styles.sliderVal}>{glitchSettings.hBars}</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>V Bars</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={60} step={1}
                            value={glitchSettings.vBars}
                            onChange={e => onGlitchSettingsChange({ vBars: +e.target.value })} />
                          <span className={styles.sliderVal}>{glitchSettings.vBars}</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Force</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={100} step={1}
                            value={Math.round(glitchSettings.force * 100)}
                            onChange={e => onGlitchSettingsChange({ force: +e.target.value / 100 })} />
                          <span className={styles.sliderVal}>{Math.round(glitchSettings.force * 100)}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Active ratio</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={100} step={1}
                            value={Math.round(glitchSettings.activeRatio * 100)}
                            onChange={e => onGlitchSettingsChange({ activeRatio: +e.target.value / 100 })} />
                          <span className={styles.sliderVal}>{Math.round(glitchSettings.activeRatio * 100)}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Bar variance</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={100} step={1}
                            value={Math.round(glitchSettings.barSizeVariance * 100)}
                            onChange={e => onGlitchSettingsChange({ barSizeVariance: +e.target.value / 100 })} />
                          <span className={styles.sliderVal}>{Math.round(glitchSettings.barSizeVariance * 100)}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Min shift</span>
                        <Stepper value={glitchSettings.minDisplacement} onChange={v => onGlitchSettingsChange({ minDisplacement: v })} min={1} max={10} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Bidirectional</span>
                        <button
                          className={`${styles.modeBtn} ${glitchSettings.bidirectional ? styles.modeBtnActive : ''}`}
                          onClick={() => onGlitchSettingsChange({ bidirectional: !glitchSettings.bidirectional })}
                        >{glitchSettings.bidirectional ? 'On' : 'Off'}</button>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Max scale</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={1} max={4} step={1}
                            value={glitchSettings.maxScale}
                            onChange={e => onGlitchSettingsChange({ maxScale: +e.target.value })} />
                          <span className={styles.sliderVal}>{glitchSettings.maxScale}×</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Scale freq</span>
                        <div className={styles.sliderRow}>
                          <input type="range"
                            className={`${styles.slider} ${glitchSettings.maxScale === 1 ? styles.sliderDisabled : ''}`}
                            min={0} max={100} step={5}
                            value={glitchSettings.scaleFreq}
                            disabled={glitchSettings.maxScale === 1}
                            onChange={e => onGlitchSettingsChange({ scaleFreq: +e.target.value })} />
                          <span className={styles.sliderVal}>{glitchSettings.scaleFreq}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Seed</span>
                        <div className={styles.sliderRow}>
                          <input type="number" className={styles.sliderNumInput} style={{ width: 110 }}
                            value={glitchSettings.seed}
                            onChange={e => onGlitchSettingsChange({ seed: +e.target.value || 0 })} />
                          <button className={styles.actionBtn} title="Randomise seed and fill"
                            onClick={() => onGlitchSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                          >⟳</button>
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'strip' && (<>
                      {!hasImage && (
                        <div className={styles.gridNote}>Works best with Image colour mode active.</div>
                      )}
                      {stripSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Axis</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'h', label: 'Horizontal' },
                            { key: 'v', label: 'Vertical' },
                            { key: 'angle', label: 'Angle' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${stripSettings.axis === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onStripSettingsChange({ axis: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {stripSettings.axis === 'angle' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>Angle</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={180} step={1}
                              value={stripSettings.angle}
                              onChange={e => onStripSettingsChange({ angle: +e.target.value })} />
                            <span className={styles.sliderVal}>{stripSettings.angle}°</span>
                          </div>
                        </div>
                      )}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Position</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={100} step={1}
                            value={Math.round(stripSettings.position * 100)}
                            onChange={e => onStripSettingsChange({ position: +e.target.value / 100 })} />
                          <span className={styles.sliderVal}>{Math.round(stripSettings.position * 100)}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Width</span>
                        <Stepper value={stripSettings.width} onChange={v => onStripSettingsChange({ width: v })} min={1} max={20} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Feather</span>
                        <Stepper value={stripSettings.feather} onChange={v => onStripSettingsChange({ feather: v })} min={0} max={5} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Seed</span>
                        <div className={styles.sliderRow}>
                          <input type="number" className={styles.sliderNumInput} style={{ width: 110 }}
                            value={stripSettings.seed}
                            onChange={e => onStripSettingsChange({ seed: +e.target.value || 0 })} />
                          <button className={styles.actionBtn} title="Randomise seed"
                            onClick={() => onStripSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                          >⟳</button>
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'edge' && (<>
                      {!hasImage && (
                        <div className={styles.gridNote}>Requires Image colour mode with an image loaded.</div>
                      )}
                      {edgeSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Edge Threshold</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={edgeSettings.edgeThreshold}
                            onChange={e => onEdgeSettingsChange({ edgeThreshold: +e.target.value })} />
                          <span className={styles.sliderVal}>{edgeSettings.edgeThreshold.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Trace Width</span>
                        <Stepper value={edgeSettings.traceWidth} onChange={v => onEdgeSettingsChange({ traceWidth: v })} min={1} max={4} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Min Edge Length</span>
                        <Stepper value={edgeSettings.minEdgeLength} onChange={v => onEdgeSettingsChange({ minEdgeLength: v })} min={1} max={20} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Direction</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'all', label: 'All' },
                            { key: 'h',   label: 'Horizontal' },
                            { key: 'v',   label: 'Vertical' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${edgeSettings.direction === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onEdgeSettingsChange({ direction: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'multiStrip' && (<>
                      {!hasImage && (
                        <div className={styles.gridNote}>Works best with Image colour mode active.</div>
                      )}
                      {multiStripSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Axis</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'h', label: 'Horizontal' },
                            { key: 'v', label: 'Vertical' },
                            { key: 'angle', label: 'Angle' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${multiStripSettings.axis === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onMultiStripSettingsChange({ axis: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {multiStripSettings.axis === 'angle' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>Angle</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={180} step={1}
                              value={multiStripSettings.angle}
                              onChange={e => onMultiStripSettingsChange({ angle: +e.target.value })} />
                            <span className={styles.sliderVal}>{multiStripSettings.angle}°</span>
                          </div>
                        </div>
                      )}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Strip count</span>
                        <Stepper value={multiStripSettings.numStrips} onChange={v => onMultiStripSettingsChange({ numStrips: v })} min={2} max={12} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Strip width</span>
                        <Stepper value={multiStripSettings.stripWidth} onChange={v => onMultiStripSettingsChange({ stripWidth: v })} min={1} max={10} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Spacing</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'even', label: 'Even' },
                            { key: 'manual', label: 'Manual' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${(multiStripSettings.spacing ?? 'even') === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onMultiStripSettingsChange({ spacing: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {multiStripSettings.spacing === 'manual' && (
                        Array.from({ length: multiStripSettings.numStrips }, (_, i) => {
                          const positions = multiStripSettings.positions ?? [];
                          const value = positions[i] ?? (i + 1) / (multiStripSettings.numStrips + 1);
                          return (
                            <div className={styles.formRow} key={i}>
                              <span className={styles.label}>Strip {i + 1}</span>
                              <div className={styles.sliderRow}>
                                <input type="range" className={styles.slider} min={0} max={100} step={1}
                                  value={Math.round(value * 100)}
                                  onChange={e => {
                                    const next = [...positions];
                                    next[i] = +e.target.value / 100;
                                    onMultiStripSettingsChange({ positions: next });
                                  }} />
                                <span className={styles.sliderVal}>{Math.round(value * 100)}%</span>
                              </div>
                            </div>
                          );
                        })
                      )}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Stagger</span>
                        <button
                          className={`${styles.modeBtn} ${multiStripSettings.stagger ? styles.modeBtnActive : ''}`}
                          onClick={() => onMultiStripSettingsChange({ stagger: !multiStripSettings.stagger })}
                        >{multiStripSettings.stagger ? 'On' : 'Off'}</button>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Feather</span>
                        <Stepper value={multiStripSettings.feather} onChange={v => onMultiStripSettingsChange({ feather: v })} min={0} max={5} format={v => `${v} cells`} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Seed</span>
                        <div className={styles.sliderRow}>
                          <input type="number" className={styles.sliderNumInput} style={{ width: 110 }}
                            value={multiStripSettings.seed}
                            onChange={e => onMultiStripSettingsChange({ seed: +e.target.value || 0 })} />
                          <button className={styles.actionBtn} title="Randomise seed"
                            onClick={() => onMultiStripSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                          >⟳</button>
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'brightness' && (<>
                      {!hasImage && (
                        <div className={styles.gridNote}>Requires Image colour mode with an image loaded.</div>
                      )}
                      {brightnessSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Target zone</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'darks', label: 'Darks' },
                            { key: 'midtones', label: 'Mid' },
                            { key: 'lights', label: 'Lights' },
                            { key: 'custom', label: 'Custom' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${brightnessSettings.targetZone === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onBrightnessSettingsChange({ targetZone: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {(brightnessSettings.targetZone === 'custom') && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Low point</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={brightnessSettings.lowPoint}
                            onChange={e => onBrightnessSettingsChange({ lowPoint: +e.target.value })} />
                          <span className={styles.sliderVal}>{brightnessSettings.lowPoint.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>High point</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={brightnessSettings.highPoint}
                            onChange={e => onBrightnessSettingsChange({ highPoint: +e.target.value })} />
                          <span className={styles.sliderVal}>{brightnessSettings.highPoint.toFixed(2)}</span>
                        </div>
                      </div>
                      </>)}

                      {(brightnessSettings.targetZone === 'midtones') && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Low point</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={brightnessSettings.lowPoint}
                            onChange={e => onBrightnessSettingsChange({ lowPoint: +e.target.value })} />
                          <span className={styles.sliderVal}>{brightnessSettings.lowPoint.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>High point</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={brightnessSettings.highPoint}
                            onChange={e => onBrightnessSettingsChange({ highPoint: +e.target.value })} />
                          <span className={styles.sliderVal}>{brightnessSettings.highPoint.toFixed(2)}</span>
                        </div>
                      </div>
                      </>)}

                      {(brightnessSettings.targetZone === 'darks' || brightnessSettings.targetZone === 'lights') && (
                      <div className={styles.formRow}>
                        <span className={styles.label}>Boundary</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={brightnessSettings.targetZone === 'darks' ? brightnessSettings.lowPoint : brightnessSettings.highPoint}
                            onChange={e => onBrightnessSettingsChange(
                              brightnessSettings.targetZone === 'darks' ? { lowPoint: +e.target.value } : { highPoint: +e.target.value }
                            )} />
                          <span className={styles.sliderVal}>
                            {(brightnessSettings.targetZone === 'darks' ? brightnessSettings.lowPoint : brightnessSettings.highPoint).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      )}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Soft edge</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={0.3} step={0.01}
                            value={brightnessSettings.softEdge}
                            onChange={e => onBrightnessSettingsChange({ softEdge: +e.target.value })} />
                          <span className={styles.sliderVal}>{brightnessSettings.softEdge.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Invert</span>
                        <button
                          className={`${styles.modeBtn} ${brightnessSettings.invert ? styles.modeBtnActive : ''}`}
                          onClick={() => onBrightnessSettingsChange({ invert: !brightnessSettings.invert })}
                        >{brightnessSettings.invert ? 'On' : 'Off'}</button>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Seed</span>
                        <div className={styles.sliderRow}>
                          <input type="number" className={styles.sliderNumInput} style={{ width: 110 }}
                            value={brightnessSettings.seed}
                            onChange={e => onBrightnessSettingsChange({ seed: +e.target.value || 0 })} />
                          <button className={styles.actionBtn} title="Randomise seed"
                            onClick={() => onBrightnessSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                          >⟳</button>
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'noise' && (<>
                      {noiseSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Scale</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0.05} max={2} step={0.01}
                            value={noiseSettings.scale}
                            onChange={e => onNoiseSettingsChange({ scale: +e.target.value })} />
                          <span className={styles.sliderVal}>{noiseSettings.scale.toFixed(2)}</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Threshold</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={noiseSettings.threshold}
                            onChange={e => onNoiseSettingsChange({ threshold: +e.target.value })} />
                          <span className={styles.sliderVal}>{Math.round(noiseSettings.threshold * 100)}%</span>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Octaves</span>
                        <Stepper value={noiseSettings.octaves} onChange={v => onNoiseSettingsChange({ octaves: v })} min={1} max={4} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Invert</span>
                        <button
                          className={`${styles.modeBtn} ${noiseSettings.invert ? styles.modeBtnActive : ''}`}
                          onClick={() => onNoiseSettingsChange({ invert: !noiseSettings.invert })}
                        >{noiseSettings.invert ? 'On' : 'Off'}</button>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Seed</span>
                        <div className={styles.sliderRow}>
                          <input type="number" className={styles.sliderNumInput} style={{ width: 110 }}
                            value={noiseSettings.seed}
                            onChange={e => onNoiseSettingsChange({ seed: +e.target.value || 0 })} />
                          <button className={styles.actionBtn} title="Randomise seed"
                            onClick={() => onNoiseSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                          >⟳</button>
                        </div>
                      </div>
                      </>)}
                      </>)}

                      {fillMode === 'geometric' && (<>
                      {geometricSettings && (<>
                      <div className={styles.formRow} style={{ marginTop: 8 }}>
                        <span className={styles.label}>Pattern</span>
                        <div className={styles.modeGrid2col}>
                          {[
                            { key: 'stripes', label: 'Stripes' },
                            { key: 'rings', label: 'Rings' },
                            { key: 'checkerboard', label: 'Checkerboard' },
                            { key: 'sunburst', label: 'Sunburst' },
                            { key: 'dots', label: 'Dot Grid' },
                            { key: 'hex', label: 'Hex Grid' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${geometricSettings.patternType === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onGeometricSettingsChange({ patternType: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {geometricSettings.patternType === 'stripes' && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Angle</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={180} step={1}
                            value={geometricSettings.angle}
                            onChange={e => onGeometricSettingsChange({ angle: +e.target.value })} />
                          <span className={styles.sliderVal}>{geometricSettings.angle}°</span>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Stripe width</span>
                        <Stepper value={geometricSettings.stripeWidth} onChange={v => onGeometricSettingsChange({ stripeWidth: v })} min={1} max={20} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Gap width</span>
                        <Stepper value={geometricSettings.gapWidth} onChange={v => onGeometricSettingsChange({ gapWidth: v })} min={0} max={20} format={v => `${v} cells`} />
                      </div>
                      </>)}

                      {geometricSettings.patternType === 'rings' && (<>
                      <div className={styles.formRowPair}>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Centre X</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                              value={geometricSettings.centerX}
                              onChange={e => onGeometricSettingsChange({ centerX: +e.target.value })} />
                            <span className={styles.sliderVal}>{geometricSettings.centerX.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Centre Y</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                              value={geometricSettings.centerY}
                              onChange={e => onGeometricSettingsChange({ centerY: +e.target.value })} />
                            <span className={styles.sliderVal}>{geometricSettings.centerY.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Ring width</span>
                        <Stepper value={geometricSettings.ringWidth} onChange={v => onGeometricSettingsChange({ ringWidth: v })} min={1} max={20} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Gap</span>
                        <Stepper value={geometricSettings.gap} onChange={v => onGeometricSettingsChange({ gap: v })} min={0} max={20} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Inner radius</span>
                        <Stepper value={geometricSettings.innerRadius} onChange={v => onGeometricSettingsChange({ innerRadius: v })} min={0} max={40} format={v => `${v} cells`} />
                      </div>
                      </>)}

                      {geometricSettings.patternType === 'checkerboard' && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Tile size</span>
                        <Stepper value={geometricSettings.tileSize} onChange={v => onGeometricSettingsChange({ tileSize: v })} min={1} max={20} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRowPair}>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Offset X</span>
                          <Stepper value={geometricSettings.offsetX} onChange={v => onGeometricSettingsChange({ offsetX: v })} min={0} max={20} />
                        </div>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Offset Y</span>
                          <Stepper value={geometricSettings.offsetY} onChange={v => onGeometricSettingsChange({ offsetY: v })} min={0} max={20} />
                        </div>
                      </div>
                      </>)}

                      {geometricSettings.patternType === 'sunburst' && (<>
                      <div className={styles.formRowPair}>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Centre X</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                              value={geometricSettings.centerX}
                              onChange={e => onGeometricSettingsChange({ centerX: +e.target.value })} />
                            <span className={styles.sliderVal}>{geometricSettings.centerX.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Centre Y</span>
                          <div className={styles.sliderRow}>
                            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                              value={geometricSettings.centerY}
                              onChange={e => onGeometricSettingsChange({ centerY: +e.target.value })} />
                            <span className={styles.sliderVal}>{geometricSettings.centerY.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Spokes</span>
                        <Stepper value={geometricSettings.numSpokes} onChange={v => onGeometricSettingsChange({ numSpokes: v })} min={2} max={48} />
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Spoke width</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={1} max={45} step={1}
                            value={geometricSettings.spokeWidth}
                            onChange={e => onGeometricSettingsChange({ spokeWidth: +e.target.value })} />
                          <span className={styles.sliderVal}>{geometricSettings.spokeWidth}°</span>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Inner radius</span>
                        <Stepper value={geometricSettings.innerRadius} onChange={v => onGeometricSettingsChange({ innerRadius: v })} min={0} max={40} format={v => `${v} cells`} />
                      </div>
                      </>)}

                      {geometricSettings.patternType === 'dots' && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Dot radius</span>
                        <Stepper value={geometricSettings.dotRadius} onChange={v => onGeometricSettingsChange({ dotRadius: v })} min={0.5} max={5} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRowPair}>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Spacing X</span>
                          <Stepper value={geometricSettings.spacingX} onChange={v => onGeometricSettingsChange({ spacingX: v })} min={1} max={20} />
                        </div>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Spacing Y</span>
                          <Stepper value={geometricSettings.spacingY} onChange={v => onGeometricSettingsChange({ spacingY: v })} min={1} max={20} />
                        </div>
                      </div>
                      <div className={styles.formRowPair}>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Offset X</span>
                          <Stepper value={geometricSettings.offsetX} onChange={v => onGeometricSettingsChange({ offsetX: v })} min={0} max={20} />
                        </div>
                        <div className={styles.stackedField}>
                          <span className={styles.label}>Offset Y</span>
                          <Stepper value={geometricSettings.offsetY} onChange={v => onGeometricSettingsChange({ offsetY: v })} min={0} max={20} />
                        </div>
                      </div>
                      </>)}

                      {geometricSettings.patternType === 'hex' && (<>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Cell radius</span>
                        <Stepper value={geometricSettings.cellRadius} onChange={v => onGeometricSettingsChange({ cellRadius: v })} min={1} max={10} format={v => `${v} cells`} />
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Row offset</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
                            value={geometricSettings.rowOffset}
                            onChange={e => onGeometricSettingsChange({ rowOffset: +e.target.value })} />
                          <span className={styles.sliderVal}>{geometricSettings.rowOffset.toFixed(2)}</span>
                        </div>
                      </div>
                      </>)}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Phase</span>
                        <div className={styles.sliderRow}>
                          <input type="range" className={styles.slider} min={0} max={20} step={0.5}
                            value={geometricSettings.phase}
                            onChange={e => onGeometricSettingsChange({ phase: +e.target.value })} />
                          <span className={styles.sliderVal}>{geometricSettings.phase}</span>
                        </div>
                      </div>
                      </>)}
                      </>)}
                  </>
                </div>
              </>
            )}

            {/* Audio Reactive */}
            {view === 'audio' && audioSettings && (
              <>
                <SubViewHeader title="Audio Reactive" onBack={popView} />
                <div className={styles.sectionContent}>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Enabled</span>
                        <button
                          className={`${styles.modeBtn} ${audioSettings.enabled ? styles.modeBtnActive : ''}`}
                          onClick={() => onAudioSettingsChange({ enabled: !audioSettings.enabled })}
                        >{audioSettings.enabled ? 'On' : 'Off'}</button>
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Input Source</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'mic', label: 'Microphone' },
                            { key: 'file', label: 'Audio File' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${audioSettings.inputSource === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onAudioSettingsChange({ inputSource: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      {audioSettings.inputSource === 'file' && (
                        <div className={styles.formRow}>
                          <span className={styles.label}>File</span>
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (audioFileSrc) URL.revokeObjectURL(audioFileSrc);
                              onAudioFileChange(URL.createObjectURL(file));
                            }}
                          />
                        </div>
                      )}

                      <div className={styles.formRow}>
                        <span className={styles.label}>Amplitude Mapping</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'linear', label: 'Linear' },
                            { key: 'logarithmic', label: 'Log' },
                            { key: 'exponential', label: 'Exp' },
                          ].map(({ key, label }) => (
                            <button key={key}
                              className={`${styles.modeBtn} ${audioSettings.ampMapping === key ? styles.modeBtnActive : ''}`}
                              onClick={() => onAudioSettingsChange({ ampMapping: key })}
                            >{label}</button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.sliderRow}>
                        <span className={styles.label}>Beat Sensitivity</span>
                        <input type="range" className={styles.slider} min="0" max="1" step="0.01"
                          value={audioSettings.beatSensitivity}
                          onChange={e => onAudioSettingsChange({ beatSensitivity: +e.target.value })} />
                        <span className={styles.sliderVal}>{audioSettings.beatSensitivity.toFixed(2)}</span>
                      </div>
                </div>
              </>
            )}

          </div>
        )}
      </div>
    </>
  );
}
