import { useState, useRef, useEffect, useCallback } from 'react';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
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

export function FloatingPanel({
  activeTool, onToolChange,
  bgColor, onBgColorChange,
  canvasBg, onCanvasBgChange,
  viewTransform, onZoom, onResetView,
  presetKey, onPresetChange,
  customSize, onCustomSizeChange,
  gridSettings, onGridSettingsChange, gridComputed, validCols,
  assets, onIngestAssets,
  onFillGrid, onExport, canFill, canExport,
  maxScale, onMaxScaleChange,
  scaleFreq, onScaleFreqChange,
  colorMode, onColorModeChange,
  paletteKey, onPaletteKeyChange,
  includeWhite, onIncludeWhiteChange,
  includeBlack, onIncludeBlackChange,
  customWhite, onCustomWhiteChange,
  customBlack, onCustomBlackChange,
}) {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState('main'); // 'main' | 'palette'
  // Groups open by default; others collapsed
  const [openGroups, setOpenGroups] = useState(new Set(['Design', 'NBA']));
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef(null);

  const handleHeaderMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onMouseUp = () => { isDragging.current = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const assetSummary = (() => {
    if (!assets || assets.length === 0) return null;
    const groups = assets.reduce((acc, a) => {
      const k = `${a.cols}×${a.rows}`;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const parts = Object.entries(groups).map(([k, n]) => `${k}: ${n}`);
    return `${assets.length} SVGs  ·  ${parts.join('  ·  ')}`;
  })();

  const zoomPct  = Math.round((viewTransform?.scale ?? 1) * 100);
  const isCustom = presetKey === 'custom';

  const handleScaleFreqInput = (raw) => {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) onScaleFreqChange(Math.min(100, Math.max(0, n)));
  };

  return (
    <div className={styles.panel} style={{ left: position.x, top: position.y }}>
      <div className={styles.header} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.titleRow}>
          <div className={styles.dot} />
          <span className={styles.title}>Grid Builder</span>
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.body}>

          {/* ── Palette picker view ─────────────────────── */}
          {view === 'palette' && (
            <>
              <div className={styles.palettePickerBack}>
                <button className={styles.palettePickerBackBtn} onClick={() => setView('main')}>
                  ← Back
                </button>
                <span className={styles.palettePickerBackLabel}>Choose palette</span>
              </div>

              {PALETTE_GROUPS.map(group => (
                <div key={group.name}>
                  <button
                    className={styles.paletteGroupHeader}
                    onClick={() => toggleGroup(group.name)}
                  >
                    <span className={styles.paletteGroupArrow}>
                      {openGroups.has(group.name) ? '▼' : '▶'}
                    </span>
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

          {/* ── Main view ───────────────────────────────── */}
          {view === 'main' && (
            <>
              {/* Tool */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Tool</div>
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

              {/* View */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>View</div>
                <div className={styles.zoomRow}>
                  <button className={styles.zoomBtn} onClick={() => onZoom(-1)} title="Zoom out">−</button>
                  <span className={styles.zoomLabel}>{zoomPct}%</span>
                  <button className={styles.zoomBtn} onClick={() => onZoom(1)} title="Zoom in">+</button>
                  <button className={`${styles.zoomBtn} ${styles.resetBtn}`} onClick={onResetView}>Fit</button>
                </div>
              </div>

              {/* Grid Settings */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Grid Settings</div>

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
                      <input type="number" className={styles.dimInput} value={customSize.width} min={50} max={10000}
                        onChange={e => onCustomSizeChange({ ...customSize, width: Math.max(50, +e.target.value) })} />
                      <span className={styles.dimX}>×</span>
                      <input type="number" className={styles.dimInput} value={customSize.height} min={50} max={10000}
                        onChange={e => onCustomSizeChange({ ...customSize, height: Math.max(50, +e.target.value) })} />
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
              </div>

              {/* Background */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Background</div>
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

              {/* Colour Palette */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Colour Palette</div>

                <div className={styles.formRow}>
                  <span className={styles.label}>Mode</span>
                  <div className={styles.modeToggle}>
                    {['none', 'uniform', 'random'].map(m => (
                      <button key={m}
                        className={`${styles.modeBtn} ${colorMode === m ? styles.modeBtnActive : ''}`}
                        onClick={() => onColorModeChange(m)}
                      >
                        {m === 'none' ? 'None' : m === 'uniform' ? 'Uniform' : 'Random'}
                      </button>
                    ))}
                  </div>
                </div>

                {colorMode !== 'none' && (
                  <>
                    {/* Palette chooser button */}
                    <div className={styles.formRow}>
                      <span className={styles.label}>Palette</span>
                      <button className={styles.paletteChooserBtn} onClick={() => setView('palette')}>
                        <span className={styles.paletteChooserName}>{paletteKey}</span>
                        <span className={styles.paletteChooserSwatches}>
                          {PALETTES[paletteKey]?.map((c, i) => (
                            <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} />
                          ))}
                        </span>
                        <span className={styles.paletteChooserArrow}>›</span>
                      </button>
                    </div>

                    {/* Custom white / black */}
                    {[
                      { label: 'White', value: customWhite, onChange: onCustomWhiteChange, included: includeWhite, onToggle: () => onIncludeWhiteChange(!includeWhite) },
                      { label: 'Black', value: customBlack, onChange: onCustomBlackChange, included: includeBlack, onToggle: () => onIncludeBlackChange(!includeBlack) },
                    ].map(({ label, value, onChange, included, onToggle }) => (
                      <div key={label} className={styles.customColourRow}>
                        {colorMode === 'random' && (
                          <button
                            className={`${styles.includeToggle} ${included ? styles.modeBtnActive : ''}`}
                            onClick={onToggle}
                            title={`${included ? 'Remove' : 'Add'} ${label.toLowerCase()} to palette`}
                          >{included ? '✓' : '+'}</button>
                        )}
                        <span className={styles.customColourLabel}>{label}</span>
                        <input type="text" className={styles.hexInput} value={value}
                          onChange={e => onChange(e.target.value)}
                          placeholder={label === 'White' ? '#ffffff' : '#000000'}
                          maxLength={7} spellCheck={false} />
                        <span className={styles.hexSwatch} style={{ background: value }} />
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Ingest Assets */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Ingest Assets</div>
                <p className={styles.ingestHint}>
                  Select a folder containing sub-folders named <strong>W×H</strong> (e.g. <code>2x1</code>, <code>2x2</code>) that hold SVG files.
                </p>
                <input ref={fileInputRef} type="file" multiple accept=".svg" style={{ display: 'none' }} onChange={onIngestAssets} />
                <button className={styles.ingestBtn} onClick={() => {
                  fileInputRef.current.setAttribute('webkitdirectory', '');
                  fileInputRef.current.setAttribute('directory', '');
                  fileInputRef.current.click();
                }}>↑ Select Folder</button>
                {assetSummary && <div className={styles.assetInfo}>{assetSummary}</div>}
              </div>

              {/* Actions */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Actions</div>
                <div className={styles.actionBtns}>
                  <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onFillGrid} disabled={!canFill}>▶ Fill Grid</button>
                  <button className={styles.actionBtn} onClick={onExport} disabled={!canExport}>↓ Export SVG</button>
                </div>
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}
