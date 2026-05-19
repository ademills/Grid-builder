import { useState, useRef, useEffect, useCallback } from 'react';
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

export function FloatingPanel({
  activeTool, onToolChange,
  bgColor, onBgColorChange,
  viewTransform, onZoom, onResetView,
  presetKey, onPresetChange,
  customSize, onCustomSizeChange,
  gridSettings, onGridSettingsChange, gridComputed, validCols,
  assets, onIngestAssets,
  onFillGrid, onExport, canFill, canExport,
  colorMode, onColorModeChange,
  paletteKey, onPaletteKeyChange,
  bgChoice, onBgChoiceChange,
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

            {colorMode === 'uniform' && (
              <>
                {/* Palette selector */}
                <div className={styles.formRow}>
                  <span className={styles.label}>Palette</span>
                  <select
                    className={styles.select}
                    value={paletteKey}
                    onChange={e => onPaletteKeyChange(e.target.value)}
                  >
                    {PALETTE_KEYS.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>

                {/* Colour swatches */}
                <div className={styles.swatchRow}>
                  {PALETTES[paletteKey].map((color, i) => (
                    <span
                      key={i}
                      className={styles.swatch}
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>

                {/* Background layer colour */}
                <div className={styles.formRow} style={{ marginTop: 8 }}>
                  <span className={styles.label}>BG</span>
                  <div className={styles.modeToggle}>
                    {['white', 'black', 'primary'].map(c => (
                      <button
                        key={c}
                        className={`${styles.modeBtn} ${bgChoice === c ? styles.modeBtnActive : ''}`}
                        onClick={() => onBgChoiceChange(c)}
                      >
                        {c === 'white' ? 'White' : c === 'black' ? 'Black' : 'Primary'}
                      </button>
                    ))}
                  </div>
                </div>
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
