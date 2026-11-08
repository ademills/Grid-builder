import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { Stepper, Toggle, InfoTip, Section, Segmented } from './controls';
import { SwatchColourField } from './SwatchColourField';
import { SettingsForm } from './schema';
import { LINEWORK_GRID_SCHEMA, LINEWORK_LINES_SCHEMA } from '../modes/linework/schema';
import { evalNumber } from '../utils/numberExpr';
import { UNITS, UNIT_KEYS, fromArt, toArt, typedToUnit, formatLength } from '../utils/units';
import styles from './Panel.module.css';

// Document setup, like Illustrator's Properties panel with nothing selected:
// artboard, canvas colours and grid. Shared by every mode; mode-specific rows
// are switched on `mode` (Linework adds its orientation, cell shape and
// lines, which every layer shares). Actions (fill gaps, flip, export) live in the
// menus and the inspector's Generate bar, and the artboard size in the
// status bar.
// The width Linework's base-layer lines are drawn at, at the artboard's
// size: a cell / lines per cell × line ratio × the layer's scale.
function lineWidthInfo(mode, cellSize, lw, units) {
  if (mode === 'linework' && lw) {
    const base = lw.layers?.[0];
    const n = Math.max(1, lw.linesPerCell ?? 3), ratio = Math.min(0.95, Math.max(0.05, lw.lineRatio ?? 0.5));
    const w = (cellSize * (base?.scale ?? 1) / n) * ratio;
    return <> · lines {formatLength(w, units, { fine: true })}</>;
  }
  return null;
}

export function PropertiesPanel() {
  const { mode, gridComputed, validCols, actions, linework } = useEditor();
  const [presetKey, setPresetKey] = useDocField('presetKey');
  const [customSize, setCustomSize] = useDocField('customSize');
  const [units = 'px', setUnits] = useDocField('units');
  const [radialRepeat = { count: 1, mirror: true }, setRadialRepeat] = useDocField('radialRepeat');
  const [gridSettings, setGridSettings] = useDocSettings('gridSettings');
  const [maxScale, setMaxScale] = useDocField('maxScale');
  const [scaleFreq, setScaleFreq] = useDocField('scaleFreq');
  const [autoFill, setAutoFill] = useDocField('autoFill');
  const [fillOpacity, setFillOpacity] = useDocSettings('fillOpacity');
  const [shapeStroke, setShapeStroke] = useDocSettings('shapeStroke');
  const [canvasBg, setCanvasBg] = useDocField('canvasBg');
  const [showTilePreview, setShowTilePreview] = useDocField('showTilePreview');
  const isGrid = mode === 'gridBuilder';
  const isMeander = mode === 'knotwork';
  const lw = mode === 'linework' && linework
    ? { values: linework.settings, set: changes => linework.update(changes), ctx: {
      diamondCells: linework.diamondCells, platesFromSvg: linework.plates?.fromShapes, plateCount: linework.settings.layers.length - 1,
      refreshShapes: linework.plates?.refreshShapes, layers: linework.settings.layers,
    } }
    : null;

  // Typed-but-uncommitted width/height, in the document's unit; reset
  // whenever the stored size or the unit changes. A size can be a sum or
  // carry its own unit (210mm, 8.5in, 1080px).
  const shownDim = (v) => (v == null ? '' : formatLength(v, units, { suffix: false }));
  const [rawWidth, setRawWidth] = useState(shownDim(customSize?.width));
  const [rawHeight, setRawHeight] = useState(shownDim(customSize?.height));
  const [sizeSource, setSizeSource] = useState([customSize, units]);
  if (sizeSource[0] !== customSize || sizeSource[1] !== units) {
    setSizeSource([customSize, units]);
    setRawWidth(shownDim(customSize?.width));
    setRawHeight(shownDim(customSize?.height));
  }
  const commitDim = (axis, raw) => {
    const typed = evalNumber(raw, { current: fromArt(customSize?.[axis] ?? 0, units), toUnit: typedToUnit(units) });
    const n = typed == null ? customSize?.[axis] ?? 50 : Math.round(toArt(typed, units));
    const clamped = Math.min(10000, Math.max(50, n));
    setCustomSize({ ...customSize, [axis]: clamped });
    // The same size can come back (or be clamped to it): show it again.
    (axis === 'width' ? setRawWidth : setRawHeight)(shownDim(clamped));
  };
  // ↑ ↓ nudge a size by one unit (Shift: ten), as the steppers do.
  const nudgeDim = (axis, e) => {
    if (e.key === 'Enter') { commitDim(axis, e.currentTarget.value); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur = evalNumber(e.currentTarget.value, { toUnit: typedToUnit(units) }) ?? fromArt(customSize?.[axis] ?? 0, units);
    const by = (units === 'px' ? 1 : units === 'mm' ? 1 : 0.1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
    commitDim(axis, String(+(cur + by).toFixed(4)));
  };
  const size = presetKey === 'custom' ? customSize : PRESETS.find(p => p.key === presetKey);

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
            <input type="text" inputMode="decimal" className={styles.dimInput} value={rawWidth} aria-label="Width"
              title="Type a size, a sum (210*2) or another unit (8.5in, 297mm, 1080px)"
              onChange={e => setRawWidth(e.target.value)}
              onBlur={() => commitDim('width', rawWidth)}
              onKeyDown={e => nudgeDim('width', e)} />
            <span className={styles.dimX}>×</span>
            <input type="text" inputMode="decimal" className={styles.dimInput} value={rawHeight} aria-label="Height"
              title="Type a size, a sum (210*2) or another unit (8.5in, 297mm, 1080px)"
              onChange={e => setRawHeight(e.target.value)}
              onBlur={() => commitDim('height', rawHeight)}
              onKeyDown={e => nudgeDim('height', e)} />
            <span className={styles.dimUnit}>{UNITS[units]?.label ?? 'px'}</span>
          </div>
        </div>
      )}
      {presetKey !== 'custom' && size?.width && (
        <div className={styles.gridInfo}>{formatLength(size.width, units, { suffix: false })} × {formatLength(size.height, units)}</div>
      )}
      <div className={styles.formRow}>
        <span className={styles.label}>Units</span>
        <Segmented value={units} onChange={setUnits}
          options={UNIT_KEYS.map(k => ({ key: k, label: UNITS[k].label, title: 'What sizes, rulers and the pointer are shown in. SVGs are exported at their size in mm or inches.' }))} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Canvas</span>
        <SwatchColourField value={canvasBg} onChange={onCanvasBg} title="Canvas colour — a document swatch or any colour" />
      </div>
      </Section>

      <Section id="properties.radial" title="Radial repeat"
        info="The design inside one wedge (dashed on the canvas, pointing up from the centre) drawn round the artboard's centre, in every mode. The background isn't repeated.">
        <div className={styles.formRow}>
          <span className={styles.label}>Copies</span>
          <Stepper value={radialRepeat.count ?? 1} min={1} max={24} format={v => (v > 1 ? `${v}` : 'Off')}
            onChange={v => setRadialRepeat({ ...radialRepeat, count: v })} />
        </div>
        {(radialRepeat.count ?? 1) > 1 && (
          <div className={styles.formRow}>
            <span className={styles.label}>Mirror</span>
            <Toggle value={!!radialRepeat.mirror} onChange={v => setRadialRepeat({ ...radialRepeat, mirror: v })}
              title="Every other copy mirrored, like a kaleidoscope, so wedges meet seamlessly (best with an even number)" />
          </div>
        )}
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
          {gridComputed.cols} × {gridComputed.rows} cells · {formatLength(gridComputed.cellSize, units, { fine: true })} each
          {lineWidthInfo(mode, gridComputed.cellSize, linework?.settings, units)}
          {validCols && !validCols.includes(gridSettings.cols) && <span className={styles.snapNote} title="This count doesn't divide the artboard into whole rows of squares, so the grid is fitted inside the border with a gap. Step Columns to pick one that fits."> (not an even fit)</span>}
        </div>
      )}
      {validCols === null && <div className={styles.gridNote}>Any column count is valid for this layout.</div>}
      {lw && <SettingsForm schema={LINEWORK_GRID_SCHEMA} {...lw} />}
      {isMeander && (
        <div className={styles.formRow}>
          <span className={styles.label}>Tile preview</span>
          <Toggle value={showTilePreview} onChange={setShowTilePreview} title="Preview the current design repeated as a seamless single-motif tile" />
        </div>
      )}
      </Section>

      {lw && <SettingsForm schema={LINEWORK_LINES_SCHEMA} {...lw} />}

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

      {isGrid && shapeStroke && (
        <Section id="properties.outline" title="Outline" info="An outline on every shape. Selected shapes can have their own (Info panel).">
          <div className={styles.formRow}>
            <span className={styles.label}>Outline</span>
            <Toggle value={shapeStroke.enabled} onChange={v => setShapeStroke({ enabled: v })} />
          </div>
          {shapeStroke.enabled && (
            <>
              <div className={styles.formRow}>
                <span className={styles.label}>Width<InfoTip text="As a percentage of one grid cell" /></span>
                <div className={styles.sliderRow}>
                  <input type="range" className={styles.slider} min={0.5} max={15} step={0.5}
                    value={shapeStroke.width} onChange={e => setShapeStroke({ width: +e.target.value })} />
                  <span className={styles.sliderVal}>{shapeStroke.width}%</span>
                </div>
              </div>
              <div className={styles.formRow}>
                <span className={styles.label}>Colour</span>
                <SwatchColourField value={shapeStroke.hex} title="Outline colour"
                  onChange={(hex, swatch) => setShapeStroke({ hex, swatch: swatch ?? null })} />
              </div>
              <div className={styles.formRow}>
                <span className={styles.label}>Fill<InfoTip text="Off: shapes are drawn as outlines only (line art)" /></span>
                <Toggle value={shapeStroke.fill !== false} onChange={v => setShapeStroke({ fill: v })} />
              </div>
              {shapeStroke.fill !== false && (
                <div className={styles.formRow}>
                  <span className={styles.label}>Align</span>
                  <Segmented value={shapeStroke.align} onChange={v => setShapeStroke({ align: v })} options={[
                    { key: 'inside', label: 'Inside' }, { key: 'centre', label: 'Centre' }, { key: 'outside', label: 'Outside' },
                  ]} />
                </div>
              )}
            </>
          )}
        </Section>
      )}
    </div>
  );
}
