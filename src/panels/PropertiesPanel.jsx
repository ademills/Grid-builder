import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { Stepper, Toggle } from './controls';
import styles from './Panel.module.css';

// Document-level settings, like Illustrator's Properties panel with nothing
// selected: artboard, grid, background and quick actions. Shared by both
// modes; mode-specific rows are switched on `mode`.
export function PropertiesPanel() {
  const { mode, gridComputed, validCols, workArea, actions, status } = useEditor();
  const [presetKey, setPresetKey] = useDocField('presetKey');
  const [customSize, setCustomSize] = useDocField('customSize');
  const [gridSettings, setGridSettings] = useDocSettings('gridSettings');
  const [maxScale, setMaxScale] = useDocField('maxScale');
  const [scaleFreq, setScaleFreq] = useDocField('scaleFreq');
  const [autoFill, setAutoFill] = useDocField('autoFill');
  const [canvasBg, setCanvasBg] = useDocField('canvasBg');
  const [bgColor, setBgColor] = useDocField('bgColor');
  const [showTilePreview, setShowTilePreview] = useDocField('showTilePreview');
  const isGrid = mode === 'gridBuilder';

  // Typed-but-uncommitted width/height; reset whenever the stored size changes.
  const [rawWidth, setRawWidth] = useState(String(customSize?.width ?? ''));
  const [rawHeight, setRawHeight] = useState(String(customSize?.height ?? ''));
  const [sizeSource, setSizeSource] = useState(customSize);
  if (sizeSource !== customSize) {
    setSizeSource(customSize);
    setRawWidth(String(customSize?.width ?? ''));
    setRawHeight(String(customSize?.height ?? ''));
  }
  const commitDim = (axis, raw) => {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? 50 : Math.min(10000, Math.max(50, n));
    setCustomSize({ ...customSize, [axis]: clamped });
  };

  // Meander bakes the canvas colour into its generated block, so it needs
  // the editor's handler that regenerates; Grid mode just sets the field.
  const onCanvasBg = isGrid ? setCanvasBg : actions.knotworkCanvasBgChange;

  return (
    <div className={styles.sectionContent}>
      <div className={styles.subHeading}>Artboard</div>
      <div className={styles.formRow}>
        <span className={styles.label}>Size</span>
        <select className={styles.select} value={presetKey} onChange={e => setPresetKey(e.target.value)}>
          {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      {presetKey === 'custom' && (
        <div className={styles.formRow}>
          <span className={styles.label} />
          <div className={styles.dimRow}>
            <input type="number" className={styles.dimInput} value={rawWidth}
              onChange={e => setRawWidth(e.target.value)}
              onBlur={() => commitDim('width', rawWidth)}
              onKeyDown={e => e.key === 'Enter' && commitDim('width', rawWidth)} />
            <span className={styles.dimX}>×</span>
            <input type="number" className={styles.dimInput} value={rawHeight}
              onChange={e => setRawHeight(e.target.value)}
              onBlur={() => commitDim('height', rawHeight)}
              onKeyDown={e => e.key === 'Enter' && commitDim('height', rawHeight)} />
            <span className={styles.dimUnit}>px</span>
          </div>
        </div>
      )}
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Canvas</span>
          <div className={styles.colorRow}>
            <input type="color" value={canvasBg} onChange={e => onCanvasBg(e.target.value)} className={styles.colorInput} />
            <span className={styles.colorLabel}>{canvasBg}</span>
          </div>
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Pasteboard</span>
          <div className={styles.colorRow}>
            <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className={styles.colorInput} />
            <span className={styles.colorLabel}>{bgColor}</span>
          </div>
        </div>
      </div>

      <div className={styles.subHeading}>Grid</div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Columns</span>
          <Stepper value={gridSettings.cols} onChange={v => setGridSettings({ cols: v })} min={1} max={isGrid ? 80 : 160} validValues={validCols} />
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Border</span>
          <Stepper value={gridSettings.borderPct} onChange={v => setGridSettings({ borderPct: v })} min={0} max={40} format={v => `${v}%`} />
        </div>
      </div>
      {gridComputed && (
        <div className={styles.gridInfo}>
          {gridComputed.cols} × {gridComputed.rows} cells · {gridComputed.cellSize.toFixed(1)}px each
          {validCols && !validCols.includes(gridSettings.cols) && <span className={styles.snapNote}> (snapped)</span>}
        </div>
      )}
      {validCols === null && <div className={styles.gridNote}>Any column count is valid for this layout.</div>}

      {isGrid && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Max scale</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider} min={1} max={4} step={1}
                value={maxScale} onChange={e => setMaxScale(+e.target.value)} />
              <span className={styles.sliderVal}>{maxScale}×</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Scale freq</span>
            <div className={styles.sliderRow}>
              <input type="range"
                className={`${styles.slider} ${maxScale === 1 ? styles.sliderDisabled : ''}`}
                min={0} max={100} step={5}
                value={scaleFreq}
                disabled={maxScale === 1}
                onChange={e => setScaleFreq(+e.target.value)} />
              <span className={styles.sliderVal}>{scaleFreq}%</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Auto-fill</span>
            <Toggle value={autoFill} onChange={setAutoFill} title="Re-fill the grid automatically whenever grid settings change" />
          </div>
        </>
      )}

      {!isGrid && (
        <div className={styles.formRow}>
          <span className={styles.label}>Tile preview</span>
          <Toggle value={showTilePreview} onChange={setShowTilePreview} title="Preview the current design repeated as a seamless single-motif tile" />
        </div>
      )}

      <div className={styles.subHeading}>Quick actions</div>
      <div className={styles.actionBtns}>
        {isGrid && (
          <>
            <button className={styles.actionBtn} onClick={actions.fillGaps} disabled={!status.canFillGaps}>Fill Gaps</button>
            <button className={styles.actionBtn} onClick={actions.flipH} disabled={!status.hasBlocks} title="Flip horizontally">⇔ Flip H</button>
            <button className={styles.actionBtn} onClick={actions.flipV} disabled={!status.hasBlocks} title="Flip vertically">⇕ Flip V</button>
          </>
        )}
        <button className={styles.actionBtn} onClick={actions.openExport} disabled={!status.hasBlocks}>Export As…</button>
      </div>
      {workArea && (
        <div className={styles.gridNote} style={{ marginTop: 8 }}>
          Artboard {workArea.width} × {workArea.height}px
        </div>
      )}
    </div>
  );
}
