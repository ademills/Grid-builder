import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { Stepper, Toggle, InfoTip, Section } from './controls';
import { SwatchColourField } from './SwatchColourField';
import styles from './Panel.module.css';

// Document setup, like Illustrator's Properties panel with nothing selected:
// artboard, canvas colours and grid. Shared by every mode; mode-specific rows
// are switched on `mode`. Actions (fill gaps, flip, export) live in the
// menus and the inspector's Generate bar, and the artboard size in the
// status bar.
export function PropertiesPanel() {
  const { mode, gridComputed, validCols, actions } = useEditor();
  const [presetKey, setPresetKey] = useDocField('presetKey');
  const [customSize, setCustomSize] = useDocField('customSize');
  const [gridSettings, setGridSettings] = useDocSettings('gridSettings');
  const [maxScale, setMaxScale] = useDocField('maxScale');
  const [scaleFreq, setScaleFreq] = useDocField('scaleFreq');
  const [autoFill, setAutoFill] = useDocField('autoFill');
  const [fillOpacity, setFillOpacity] = useDocSettings('fillOpacity');
  const [canvasBg, setCanvasBg] = useDocField('canvasBg');
  const [bgColor, setBgColor] = useDocField('bgColor');
  const [showTilePreview, setShowTilePreview] = useDocField('showTilePreview');
  const isGrid = mode === 'gridBuilder';
  const isMeander = mode === 'knotwork';

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
  // the editor's handler that regenerates; the other modes just set the field.
  const onCanvasBg = isMeander ? actions.knotworkCanvasBgChange : setCanvasBg;

  return (
    <div className={styles.sectionContent}>
      <Section id="properties.artboard" title="Artboard">
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
          <SwatchColourField value={canvasBg} onChange={onCanvasBg} title="Canvas colour — a document swatch or any colour" />
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Pasteboard</span>
          <SwatchColourField value={bgColor} onChange={setBgColor} title="Pasteboard colour — a document swatch or any colour" />
        </div>
      </div>
      </Section>

      <Section id="properties.grid" title="Grid">
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Columns</span>
          <Stepper value={gridSettings.cols} onChange={v => setGridSettings({ cols: v })} min={1} max={isMeander ? 160 : 80} validValues={validCols} />
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
      {isMeander && (
        <div className={styles.formRow}>
          <span className={styles.label}>Tile preview</span>
          <Toggle value={showTilePreview} onChange={setShowTilePreview} title="Preview the current design repeated as a seamless single-motif tile" />
        </div>
      )}
      </Section>

      {isGrid && (
        <Section id="properties.shapes" title="Shapes" info="How Generate sizes and shades the shapes it places">
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
            <span className={styles.label}>Random opacity<InfoTip text="Give each shape a random opacity when you fill. Off: every shape is solid." /></span>
            <Toggle value={fillOpacity.random} onChange={v => setFillOpacity({ random: v })} />
          </div>
          {fillOpacity.random && (
            <div className={styles.formRow}>
              <span className={styles.label}>Range</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={5} max={100} step={5}
                  value={Math.round(fillOpacity.min * 100)}
                  onChange={e => { const min = +e.target.value / 100; setFillOpacity({ min, max: Math.max(min, fillOpacity.max) }); }}
                  title="Lowest opacity" />
                <input type="range" className={styles.slider} min={5} max={100} step={5}
                  value={Math.round(fillOpacity.max * 100)}
                  onChange={e => { const max = +e.target.value / 100; setFillOpacity({ max, min: Math.min(max, fillOpacity.min) }); }}
                  title="Highest opacity" />
                <span className={styles.sliderVal}>{Math.round(fillOpacity.min * 100)}–{Math.round(fillOpacity.max * 100)}%</span>
              </div>
            </div>
          )}
          <div className={styles.formRow}>
            <span className={styles.label}>Auto-fill<InfoTip text="Re-fill the grid automatically whenever grid settings change" /></span>
            <Toggle value={autoFill} onChange={setAutoFill} />
          </div>
        </Section>
      )}
    </div>
  );
}
