import { useState, useRef, useEffect, useCallback } from 'react';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_GROUPS, colorizeSvg } from '../utils/colorize';
import { ASSET_FOLDER_TREE } from '../builtinAssets';
import styles from './FloatingPanel.module.css';

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
  onFillGrid, onFillGaps, onExport, onSaveProject, onLoadProject, canFill, canFillGaps, canExport,
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
  randomReverseEnabled, onRandomReverseEnabledChange, randomReversePct, onRandomReversePctChange, onRandomReverse,
  onRandomRerun,
  gradientSettings, onGradientSettingsChange,
  imageSrc, onImageSrcChange, imageProgress,
  animSettings, onAnimSettingsChange,
  showShortcuts, onToggleShortcuts,
  assetUsageCounts,
  onFlipH, onFlipV, canFlip,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState('main');
  const [assetBrowserView, setAssetBrowserView] = useState('grid');

  const THUMB_PALETTE = ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'];
  const THUMB_BG = ['#27272a'];

  const [openGroups, setOpenGroups] = useState(new Set());
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  // Sections — Actions open by default, all others closed
  const [openSections, setOpenSections] = useState(new Set(['Actions']));
  const toggleSection = name => setOpenSections(prev => {
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

  const [rawCustomHex, setRawCustomHex] = useState('');
  const [rawBgHex,     setRawBgHex]     = useState('');
  const [rawGradBgHex, setRawGradBgHex] = useState('');
  const [savePaletteName, setSavePaletteName] = useState('');

  const [shapeOrder, setShapeOrder] = useState(null);
  const [bgOrder,    setBgOrder]    = useState(null);
  const shapeDragId = useRef(null);
  const bgDragId    = useRef(null);

  const displayShapeColors = shapeOrder ?? shapeColors ?? [];
  const displayBgColors    = bgOrder    ?? bgColors    ?? [];

  useEffect(() => {
    if (colorMode === 'none' && (view === 'colours' || view === 'palette')) {
      setView('main');
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
                  <button className={styles.subViewBackBtn} onClick={() => setView('main')}>← Back</button>
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
                  <button className={styles.subViewBackBtn} onClick={() => setView('colours')}>← Back</button>
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

            {/* ── Colour editor view ──────────────────────── */}
            {view === 'colours' && (
              <>
                <div className={styles.subViewBack}>
                  <button className={styles.subViewBackBtn} onClick={() => setView('main')}>← Back</button>
                  <span className={styles.subViewBackLabel}>Colours</span>
                </div>

                <div className={styles.colourEditorSection}>
                  <div className={styles.colourEditorLabel}>Shape colours</div>

                  <button className={styles.paletteChooserBtn} onClick={() => setView('palette')} style={{ width: '100%' }}>
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

            {/* ── Main view ───────────────────────────────── */}
            {view === 'main' && (
              <>
                {/* Tool */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Tool')}>
                    <span className={styles.sectionTitle}>Tool</span>
                    <span className={styles.sectionArrow}>{openSections.has('Tool') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Tool') && (
                    <div className={styles.sectionContent}>
                      <div className={styles.toolToggle}>
                        <button
                          className={`${styles.toolBtn} ${activeTool === 'select' ? styles.active : ''}`}
                          onClick={() => onToolChange('select')}
                        >↖ Select</button>
                        <button
                          className={`${styles.toolBtn} ${activeTool === 'hand' ? styles.active : ''}`}
                          onClick={() => onToolChange('hand')}
                        >✋ Hand</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* View */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('View')}>
                    <span className={styles.sectionTitle}>View</span>
                    <span className={styles.sectionArrow}>{openSections.has('View') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('View') && (
                    <div className={styles.sectionContent}>
                      <div className={styles.zoomRow}>
                        <button className={styles.zoomBtn} onClick={() => onZoom(-1)} title="Zoom out">−</button>
                        <span className={styles.zoomLabel}>{zoomPct}%</span>
                        <button className={styles.zoomBtn} onClick={() => onZoom(1)} title="Zoom in">+</button>
                        <button className={`${styles.zoomBtn} ${styles.resetBtn}`} onClick={onResetView}>Fit</button>
                        <button className={styles.zoomBtn} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
                        <button className={styles.zoomBtn} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
                        <button className={`${styles.zoomBtn} ${showShortcuts ? styles.active : ''}`} onClick={onToggleShortcuts} title="Keyboard shortcuts (?)">?</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Grid Settings */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Grid Settings')}>
                    <span className={styles.sectionTitle}>Grid Settings</span>
                    <span className={styles.sectionArrow}>{openSections.has('Grid Settings') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Grid Settings') && (
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

                      <div className={styles.formRow}>
                        <span className={styles.label}>Columns</span>
                        <Stepper value={gridSettings.cols} onChange={v => onGridSettingsChange({ cols: v })} min={1} max={80} validValues={validCols} />
                      </div>

                      <div className={styles.formRow}>
                        <span className={styles.label}>Border</span>
                        <Stepper value={gridSettings.borderPct} onChange={v => onGridSettingsChange({ borderPct: v })} min={0} max={40} format={v => `${v}%`} />
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
                  )}
                </div>

                {/* Background */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Background')}>
                    <span className={styles.sectionTitle}>Background</span>
                    <span className={styles.sectionArrow}>{openSections.has('Background') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Background') && (
                    <div className={styles.sectionContent}>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Canvas</span>
                        <div className={styles.colorRow}>
                          <input type="color" value={canvasBg} onChange={e => onCanvasBgChange(e.target.value)} className={styles.colorInput} />
                          <span className={styles.colorLabel}>{canvasBg}</span>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Outer</span>
                        <div className={styles.colorRow}>
                          <input type="color" value={bgColor} onChange={e => onBgColorChange(e.target.value)} className={styles.colorInput} />
                          <span className={styles.colorLabel}>{bgColor}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Colour Palette */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Colour Palette')}>
                    <span className={styles.sectionTitle}>Colour Palette</span>
                    <span className={styles.sectionArrow}>{openSections.has('Colour Palette') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Colour Palette') && (
                    <div className={styles.sectionContent}>
                      <div className={styles.formRow}>
                        <span className={styles.label}>Mode</span>
                        <div className={styles.modeToggle}>
                          {[
                            { key: 'none',     label: 'None' },
                            { key: 'uniform',  label: 'Uniform' },
                            { key: 'random',   label: 'Random' },
                            { key: 'gradient', label: 'Gradient' },
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

                      {colorMode !== 'none' && colorMode !== 'image' && (
                        <button className={styles.assetsBrowserBtn} onClick={() => setView('colours')}>
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
                    </div>
                  )}
                </div>

                {/* Assets */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Assets')}>
                    <span className={styles.sectionTitle}>Assets</span>
                    <span className={styles.sectionArrow}>{openSections.has('Assets') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Assets') && (
                    <div className={styles.sectionContent}>
                      <button className={styles.assetsBrowserBtn} onClick={() => setView('assets')}>
                        <span>Browse &amp; toggle assets</span>
                        <span className={styles.assetsBrowserArrow}>›</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Animation */}
                {animSettings && onAnimSettingsChange && (
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Animation')}>
                    <span className={styles.sectionTitle}>
                      Animation
                      {animSettings.enabled && <span className={styles.animActiveDot} />}
                    </span>
                    <span className={styles.sectionArrow}>{openSections.has('Animation') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Animation') && (
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

                    </div>
                  )}
                </div>
                )}

                {/* Actions */}
                <div className={styles.section}>
                  <button className={styles.sectionHeader} onClick={() => toggleSection('Actions')}>
                    <span className={styles.sectionTitle}>Actions</span>
                    <span className={styles.sectionArrow}>{openSections.has('Actions') ? '▼' : '▶'}</span>
                  </button>
                  {openSections.has('Actions') && (
                    <div className={styles.sectionContent}>
                      <div className={styles.actionBtns}>
                        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onFillGrid} disabled={!canFill}>▶ Fill Grid</button>
                        <button className={styles.actionBtn} onClick={onFillGaps} disabled={!canFillGaps}>⊞ Fill Gaps</button>
                        <button className={styles.actionBtn} onClick={onExport} disabled={!canExport}>↓ Export SVG</button>
                      </div>
                      <div className={styles.actionBtns} style={{ marginTop: 6 }}>
                        <button className={styles.actionBtn} onClick={onSaveProject} disabled={!canExport}>↓ Save Project</button>
                        <input ref={projectInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onLoadProject} />
                        <button className={styles.actionBtn} onClick={() => projectInputRef.current.click()}>↑ Load Project</button>
                        <button className={styles.actionBtn} onClick={onFlipH} disabled={!canFlip} title="Flip horizontally">⇔ Flip H</button>
                        <button className={styles.actionBtn} onClick={onFlipV} disabled={!canFlip} title="Flip vertically">⇕ Flip V</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        )}
      </div>
    </>
  );
}
