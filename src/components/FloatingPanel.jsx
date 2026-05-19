import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_KEYS } from '../utils/colorize';
import styles from './FloatingPanel.module.css';

/**
 * Stepper control.
 * When `validValues` is provided the +/− buttons jump to the
 * next/previous entry in that list instead of ±1.
 */
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
      <button
        className={styles.stepBtn}
        onClick={() => prevVal != null && onChange(prevVal)}
        disabled={prevVal == null}
      >−</button>
      <span className={styles.stepVal}>{format ? format(value) : value}</span>
      <button
        className={styles.stepBtn}
        onClick={() => nextVal != null && onChange(nextVal)}
        disabled={nextVal == null}
      >+</button>
    </div>
  );
}

function PaletteSelect({ value, onChange }) {
  const [open, setOpen]       = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef  = useRef(null);
  const dropdownRef = useRef(null);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (!triggerRef.current?.contains(e.target) && !dropdownRef.current?.contains(e.target))
        setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div className={styles.paletteSelect} ref={triggerRef}>
      <button className={styles.paletteSelectBtn} onClick={toggle}>
        <span className={styles.paletteBtnName}>{value}</span>
        <span className={styles.paletteBtnSwatches}>
          {PALETTES[value]?.map((c, i) => (
            <span key={i} className={styles.paletteBtnSwatch} style={{ background: c }} />
          ))}
        </span>
        <span className={styles.paletteBtnArrow}>{open ? '▲' : '▼'}</span>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className={styles.paletteDropdown}
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
        >
          {PALETTE_KEYS.map(k => (
            <button
              key={k}
              className={`${styles.paletteOption} ${k === value ? styles.paletteOptionActive : ''}`}
              onClick={() => { onChange(k); setOpen(false); }}
            >
              <span className={styles.paletteOptionName}>{k}</span>
              <span className={styles.paletteOptionSwatches}>
                {PALETTES[k].map((c, i) => (
                  <span key={i} className={styles.paletteOptionSwatch} style={{ background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function FloatingPanel({
  activeTool, onToolChange,
  bgColor, onBgColorChange,
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

  // Build asset summary: "12 SVGs  ·  1×1: 8  ·  2×2: 4"
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

  const zoomPct = Math.round((viewTransform?.scale ?? 1) * 100);
  const isCustom = presetKey === 'custom';

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
              <select
                className={styles.select}
                value={presetKey}
                onChange={e => onPresetChange(e.target.value)}
              >
                {PRESETS.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>

            {isCustom && (
              <div className={styles.formRow}>
                <span className={styles.label}>Size</span>
                <div className={styles.dimRow}>
                  <input
                    type="number"
                    className={styles.dimInput}
                    value={customSize.width}
                    min={50} max={10000}
                    onChange={e => onCustomSizeChange({ ...customSize, width: Math.max(50, +e.target.value) })}
                  />
                  <span className={styles.dimX}>×</span>
                  <input
                    type="number"
                    className={styles.dimInput}
                    value={customSize.height}
                    min={50} max={10000}
                    onChange={e => onCustomSizeChange({ ...customSize, height: Math.max(50, +e.target.value) })}
                  />
                  <span className={styles.dimUnit}>px</span>
                </div>
              </div>
            )}

            <div className={styles.formRow}>
              <span className={styles.label}>Columns</span>
              <Stepper
                value={gridSettings.cols}
                onChange={v => onGridSettingsChange({ cols: v })}
                min={1}
                max={80}
                validValues={validCols}
              />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Border</span>
              <Stepper
                value={gridSettings.borderPct}
                onChange={v => onGridSettingsChange({ borderPct: v })}
                min={0}
                max={40}
                format={v => `${v}%`}
              />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Max scale</span>
              <div className={styles.sliderRow}>
                <input
                  type="range"
                  className={styles.slider}
                  min={1} max={4} step={1}
                  value={maxScale}
                  onChange={e => onMaxScaleChange(+e.target.value)}
                />
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
                <span className={styles.sliderVal}>{scaleFreq}%</span>
              </div>
            </div>

            {gridComputed && (
              <div className={styles.gridInfo}>
                {gridComputed.rows} rows · {gridComputed.totalCells} cells · {gridComputed.cellSize.toFixed(1)}px
                {validCols && !validCols.includes(gridSettings.cols) && (
                  <span className={styles.snapNote}> (snapped)</span>
                )}
              </div>
            )}
            {validCols === null && (
              <div className={styles.gridNote}>Any column count is valid for this layout</div>
            )}
          </div>

          {/* Background */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Background</div>
            <div className={styles.colorRow}>
              <input
                type="color"
                value={bgColor}
                onChange={e => onBgColorChange(e.target.value)}
                className={styles.colorInput}
              />
              <span className={styles.colorLabel}>{bgColor}</span>
            </div>
          </div>

          {/* Colour Palette */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Colour Palette</div>

            {/* Mode */}
            <div className={styles.formRow}>
              <span className={styles.label}>Mode</span>
              <div className={styles.modeToggle}>
                {['none', 'uniform', 'random'].map(m => (
                  <button
                    key={m}
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
                {/* Palette selector with inline colour preview */}
                <div className={styles.formRow}>
                  <span className={styles.label}>Palette</span>
                  <PaletteSelect value={paletteKey} onChange={onPaletteKeyChange} />
                </div>

                {/* Custom white / black — hex inputs with optional include toggles for random */}
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
                    <input
                      type="text"
                      className={styles.hexInput}
                      value={value}
                      onChange={e => onChange(e.target.value)}
                      placeholder={label === 'White' ? '#ffffff' : '#000000'}
                      maxLength={7}
                      spellCheck={false}
                    />
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
            {/* Hidden file input — webkitdirectory set via ref */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".svg"
              style={{ display: 'none' }}
              onChange={onIngestAssets}
            />
            <button
              className={styles.ingestBtn}
              onClick={() => {
                // Ensure the browser attribute is set before opening
                fileInputRef.current.setAttribute('webkitdirectory', '');
                fileInputRef.current.setAttribute('directory', '');
                fileInputRef.current.click();
              }}
            >
              ↑ Select Folder
            </button>
            {assetSummary && (
              <div className={styles.assetInfo}>{assetSummary}</div>
            )}
          </div>

          {/* Actions */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Actions</div>
            <div className={styles.actionBtns}>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={onFillGrid}
                disabled={!canFill}
              >▶ Fill Grid</button>
              <button
                className={styles.actionBtn}
                onClick={onExport}
                disabled={!canExport}
              >↓ Export SVG</button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
