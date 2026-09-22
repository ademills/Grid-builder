// Top-level sidebar for Knotwork/Kufic mode -- a peer of the FloatingPanel
// grid-builder sidebar, not a sub-view buried inside it. Shares the same
// CSS module (visual language stays consistent), the same appMode tab
// switcher, and the same collapsed-summary-button -> sub-page navigation
// pattern FloatingPanel uses for its palette picker. Canvas size, grid
// divisions, colour theme and export are the same underlying app-level
// settings Grid Builder mode uses (passed down from App.jsx) so switching
// tabs never loses access to them -- only the knotwork generator settings
// below are unique to this panel.

import { useState, useEffect, useRef } from 'react';
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
      <button className={styles.stepBtn} onClick={() => prevVal != null && onChange(prevVal)} disabled={prevVal == null}>-</button>
      <span className={styles.stepVal}>{format ? format(value) : value}</span>
      <button className={styles.stepBtn} onClick={() => nextVal != null && onChange(nextVal)} disabled={nextVal == null}>+</button>
    </div>
  );
}

export function KnotworkPanel({
  appMode, onAppModeChange,
  knotworkSettings, onKnotworkSettingsChange,
  onKnotworkFill, canKnotworkFill,
  onKnotworkRecolour, canKnotworkRecolour,
  themePreview,
  presetKey, onPresetChange,
  customSize, onCustomSizeChange,
  gridSettings, onGridSettingsChange, gridComputed, validCols,
  paletteKey, onPaletteKeyChange,
  customPalettes, onApplyCustomPalette, onDeleteCustomPalette,
  bgColor, onBgColorChange, canvasBg, onCanvasBgChange,
  backdropSrc, onBackdropSrcChange, backdropSettings, onBackdropSettingsChange,
  onExport, canExport, workArea,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState('main');
  const [openGroups, setOpenGroups] = useState(new Set());
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const isCustom = presetKey === 'custom';

  const [rawWidth, setRawWidth] = useState(String(customSize?.width ?? ''));
  const [rawHeight, setRawHeight] = useState(String(customSize?.height ?? ''));
  useEffect(() => {
    setRawWidth(String(customSize?.width ?? ''));
    setRawHeight(String(customSize?.height ?? ''));
  }, [customSize?.width, customSize?.height]);
  const commitDim = (axis, raw) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? 50 : Math.min(10000, Math.max(50, n));
    onCustomSizeChange({ ...customSize, [axis]: clamped });
  };

  const [exportFormat, setExportFormat] = useState('svg');
  const [exportScale, setExportScale] = useState(2);

  const [bgType, setBgType] = useState(() => backdropSrc ? 'image' : 'solid');
  const backdropInputRef = useRef(null);
  const handleBackdropUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onBackdropSrcChange(evt.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.dot} />
          {!collapsed && <span className={styles.title}>Knotwork</span>}
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>' : '<'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.appModeToggle} style={{ margin: '10px 12px 0' }}>
          <button
            className={`${styles.appModeBtn} ${appMode === 'gridBuilder' ? styles.appModeBtnActive : ''}`}
            onClick={() => onAppModeChange('gridBuilder')}
          >Grid Builder</button>
          <button
            className={`${styles.appModeBtn} ${appMode === 'knotwork' ? styles.appModeBtnActive : ''}`}
            onClick={() => onAppModeChange('knotwork')}
          >Knotwork</button>
        </div>
      )}

      {!collapsed && knotworkSettings && (
        <div className={styles.body}>
          {view === 'palette' ? (
            <>
              <div className={styles.subViewBack}>
                <button className={styles.subViewBackBtn} onClick={() => setView('main')}>&larr; Back</button>
                <span className={styles.subViewBackLabel}>Choose palette</span>
              </div>

              {(customPalettes ?? []).length > 0 && (
                <div>
                  <button className={styles.paletteGroupHeader} onClick={() => toggleGroup('__custom__')}>
                    <span className={styles.paletteGroupArrow}>{openGroups.has('__custom__') ? '▼' : '▶'}</span>
                    <span className={styles.paletteGroupName}>My Palettes</span>
                    <span className={styles.paletteGroupCount}>{customPalettes.length}</span>
                  </button>
                  {openGroups.has('__custom__') && customPalettes.map(p => (
                    <div key={p.name} className={styles.palettePickerItem} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        className={styles.palettePickerItem}
                        style={{ flex: 1, border: 'none', background: 'transparent', padding: 0 }}
                        onClick={() => onApplyCustomPalette(p)}
                      >
                        <span className={styles.palettePickerName}>{p.name}</span>
                        <span className={styles.palettePickerSwatches}>
                          {p.colors.map((c, i) => <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />)}
                        </span>
                      </button>
                      <button
                        className={styles.customSwatchRemove}
                        onClick={() => onDeleteCustomPalette(p.name)}
                        title="Delete palette"
                        style={{ flexShrink: 0 }}
                      >&#215;</button>
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
                        {PALETTES[k]?.map((c, i) => <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />)}
                      </span>
                      {k === paletteKey && <span className={styles.palettePickerTick}>&#10003;</span>}
                    </button>
                  ))}
                </div>
              ))}
            </>
          ) : (
          <div className={styles.sectionContent}>

            <div className={styles.subHeading}>Canvas</div>

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
                  <span className={styles.dimX}>x</span>
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

            {gridComputed && (
              <div className={styles.gridInfo}>
                {gridComputed.cols} x {gridComputed.rows} cells * {gridComputed.cellSize.toFixed(1)}px
              </div>
            )}

            <div className={styles.subHeading} style={{ marginTop: 12 }}>Colour theme</div>

            <button className={styles.paletteChooserBtn} onClick={() => setView('palette')} style={{ width: '100%' }}>
              <span className={styles.paletteChooserName}>{paletteKey}</span>
              <span className={styles.paletteChooserSwatches}>
                {PALETTES[paletteKey]?.map((c, i) => (
                  <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} />
                ))}
              </span>
              <span className={styles.paletteChooserArrow}>&rsaquo;</span>
            </button>

            <div className={styles.formRow}>
              <span className={styles.label}>Ink and paper</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {themePreview?.fg && <span className={styles.menuRowSwatch} style={{ background: themePreview.fg }} />}
                {themePreview?.bg && <span className={styles.menuRowSwatch} style={{ background: themePreview.bg }} />}
                <span style={{ color: '#888', fontSize: 12 }}>from palette and canvas background</span>
              </div>
            </div>

            <div className={styles.subHeading} style={{ marginTop: 12 }}>Background</div>

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
                      &#215;
                    </button>
                  </div>
                </div>
              ) : (
                <button className={styles.ingestBtn} onClick={() => backdropInputRef.current?.click()}>
                  Upload image&hellip;
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

            <div className={styles.subHeading} style={{ marginTop: 12 }}>Knot generator</div>

            <div className={styles.formRow}>
              <span className={styles.label}>Meander density</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0.1} max={1} step={0.05}
                  value={knotworkSettings.density}
                  onChange={e => onKnotworkSettingsChange({ density: +e.target.value })} />
                <span className={styles.sliderVal}>{Math.round(knotworkSettings.density * 100)}%</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Straight bias</span>
              <Stepper value={knotworkSettings.straightBias} onChange={v => onKnotworkSettingsChange({ straightBias: v })} min={1} max={15} />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Wall density</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0} max={0.3} step={0.01}
                  value={knotworkSettings.wallDensity}
                  onChange={e => onKnotworkSettingsChange({ wallDensity: +e.target.value })} />
                <span className={styles.sliderVal}>{Math.round(knotworkSettings.wallDensity * 100)}%</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Symmetry</span>
              <select className={styles.select} value={knotworkSettings.symmetryMode}
                onChange={e => onKnotworkSettingsChange({ symmetryMode: e.target.value })}>
                <option value="none">None</option>
                <option value="mirror-x">Mirror X</option>
                <option value="mirror-y">Mirror Y</option>
                <option value="mirror-both">Mirror Both</option>
                <option value="rotate2">Rotate 2</option>
                <option value="rotate4">Rotate 4</option>
                <option value="kaleidoscope">Kaleidoscope</option>
              </select>
            </div>

            {knotworkSettings.symmetryMode === 'kaleidoscope' && (
              <div className={styles.formRow}>
                <span className={styles.label}>Kaleidoscope fold</span>
                <Stepper value={knotworkSettings.kaleidoscopeFold} onChange={v => onKnotworkSettingsChange({ kaleidoscopeFold: v })} min={2} max={12} />
              </div>
            )}

            <div className={styles.formRow}>
              <span className={styles.label}>Strand width</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0.3} max={1} step={0.02}
                  value={knotworkSettings.strandWidthRatio}
                  onChange={e => onKnotworkSettingsChange({ strandWidthRatio: +e.target.value })} />
                <span className={styles.sliderVal}>{knotworkSettings.strandWidthRatio.toFixed(2)}</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Roundness</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0} max={1} step={0.05}
                  value={knotworkSettings.roundness}
                  onChange={e => onKnotworkSettingsChange({ roundness: +e.target.value })} />
                <span className={styles.sliderVal}>{Math.round(knotworkSettings.roundness * 100)}%</span>
              </div>
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Terminal dots</span>
              <button
                className={`${styles.modeBtn} ${knotworkSettings.showTerminalDots ? styles.modeBtnActive : ''}`}
                onClick={() => onKnotworkSettingsChange({ showTerminalDots: !knotworkSettings.showTerminalDots })}
              >{knotworkSettings.showTerminalDots ? 'On' : 'Off'}</button>
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Seed</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="number" className={styles.numberInput} style={{ width: 72 }}
                  value={knotworkSettings.seed}
                  onChange={e => onKnotworkSettingsChange({ seed: +e.target.value || 0 })} />
                <button className={styles.actionBtn} title="Randomise seed"
                  onClick={() => onKnotworkSettingsChange({ seed: Math.floor(Math.random() * 0x80000000) })}
                >&#8635;</button>
              </div>
            </div>

            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              style={{ width: '100%', marginTop: 12 }}
              onClick={onKnotworkFill}
              disabled={!canKnotworkFill}
            >Fill -- Knotwork</button>

            <button
              className={styles.actionBtn}
              style={{ width: '100%', marginTop: 8 }}
              onClick={onKnotworkRecolour}
              disabled={!canKnotworkRecolour}
              title="Reassign colours to the current design without changing its layout"
            >Recolour</button>

            <div className={styles.subHeading} style={{ marginTop: 16, borderTop: '1px dashed rgba(77,52,211,0.2)', paddingTop: 12 }}>Export</div>

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
                  {[1, 2, 4].map(sc => (
                    <button key={sc}
                      className={`${styles.modeBtn} ${exportScale === sc ? styles.modeBtnActive : ''}`}
                      onClick={() => setExportScale(sc)}
                    >{sc}x</button>
                  ))}
                </div>
              </div>
            )}

            {workArea && (
              <div className={styles.gridNote}>
                Output size: {Math.round(workArea.width * (exportFormat === 'svg' ? 1 : exportScale))} x {Math.round(workArea.height * (exportFormat === 'svg' ? 1 : exportScale))} px
              </div>
            )}

            <button
              className={styles.actionBtn}
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => onExport({ format: exportFormat, scale: exportScale })}
              disabled={!canExport}
            >Export</button>

          </div>
          )}
        </div>
      )}
    </div>
  );
}
