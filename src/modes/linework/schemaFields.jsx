import { useDocSettings } from '../../editor/EditorContext';
import { Segmented, Toggle } from '../../panels/controls';
import { PLATE_ASPECTS, plateCells } from './settings';
import { MASK_SOURCES } from './masks';
import styles from '../../panels/Panel.module.css';

// Custom rows for the Linework settings schemas (schema.js). Each takes
// { values, set, ctx } — the layer (or document settings) being edited.

const pct = v => `${Math.round(v * 100)}%`;
const cells = v => `${+v.toFixed(2)}`;

function Row({ label, children, title }) {
  return (
    <div className={styles.formRow} title={title}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format = v => v, title }) {
  return (
    <Row label={label} title={title}>
      <div className={styles.sliderRow}>
        <input type="range" className={styles.slider} min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)} />
        <span className={styles.sliderVal}>{format(value)}</span>
      </div>
    </Row>
  );
}

// A plate's shape and size: equal sides, a width × height in grid cells, or
// an aspect ratio with its long side in cells. Switching keeps the plate's
// current dimensions as near as the new way allows.
export function PlateSize({ values: L, set, ctx }) {
  const { maxCells, grid } = ctx;
  const sizing = L.sizing ?? 'equal';
  const [w, h] = plateCells(L, grid);
  const half = v => Math.max(0.5, Math.round(v * 2) / 2);
  const setSizing = (v) => {
    if (v === 'cells') set({ sizing: v, w: half(w), h: half(h) });
    else set({ sizing: v, size: Math.max(w, h) });
  };
  const equal = Math.abs(w - h) < 1e-6;
  return (
    <>
      <Row label="Shape">
        <Segmented value={L.shape} onChange={v => set({ shape: v })} options={[
          { key: 'square', label: equal ? 'Square' : 'Upright' }, { key: 'diamond', label: 'Diamond' },
        ]} />
      </Row>
      <Row label="Sides" title="Equal sides, a width and height in grid cells, or an aspect ratio">
        <Segmented value={sizing} onChange={setSizing} options={[
          { key: 'equal', label: 'Equal' }, { key: 'cells', label: 'Grid cells' }, { key: 'ratio', label: 'Ratio' },
        ]} />
      </Row>
      {sizing === 'equal' && (
        <Slider label="Size" value={L.size} min={0.5} max={maxCells} step={0.1} format={cells} onChange={v => set({ size: v })} title="Plate size, in grid cells" />
      )}
      {sizing === 'cells' && (
        <>
          <Slider label="Width" value={w} min={0.5} max={maxCells} step={0.5} format={cells} onChange={v => set({ w: v })} title="Plate width, in grid cells" />
          <Slider label="Height" value={h} min={0.5} max={maxCells} step={0.5} format={cells} onChange={v => set({ h: v })} title="Plate height, in grid cells" />
        </>
      )}
      {sizing === 'ratio' && (
        <>
          <Row label="Ratio">
            <select className={styles.select} value={L.aspect ?? '3:2'} onChange={e => set({ aspect: e.target.value })}>
              {PLATE_ASPECTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Row>
          <Row label="Orientation">
            <Segmented value={L.portrait ? 'portrait' : 'landscape'} onChange={v => set({ portrait: v === 'portrait' })} options={[
              { key: 'landscape', label: 'Landscape' }, { key: 'portrait', label: 'Portrait' },
            ]} />
          </Row>
          <Slider label="Long side" value={L.size} min={0.5} max={maxCells} step={0.1} format={cells} onChange={v => set({ size: v })}
            title={`Plate is ${cells(w)} × ${cells(h)} cells`} />
        </>
      )}
    </>
  );
}

export function DiamondNote({ ctx }) {
  return <div className={styles.gridNote}>Diamond: {ctx.diamondCells} × {ctx.diamondCells} cells, set by the grid in Properties.</div>;
}

// The "word" mask's own settings (document-wide, in lineworkSettings.word).
export function MaskWord({ ctx }) {
  const { word, setWord } = ctx;
  return (
    <>
      <Row label="Word">
        <input type="text" className={styles.numberInput} style={{ flex: 1 }} placeholder="Type a word…"
          value={word.text} onChange={e => setWord({ text: e.target.value })} />
      </Row>
      <Slider label="Letter size" value={word.letterSize} min={0.2} max={1} step={0.05} format={pct} onChange={v => setWord({ letterSize: v })} />
      <Row label="Layout">
        <Segmented value={word.layout} onChange={v => setWord({ layout: v })} options={[
          { key: 'line', label: 'Line' }, { key: 'scatter', label: 'Scattered' },
        ]} />
      </Row>
      {word.layout === 'scatter' && (
        <>
          <Row label="Random size"><Toggle value={word.randomSize} onChange={v => setWord({ randomSize: v })} /></Row>
          <Row label="Random placement"><Toggle value={word.randomPlacement} onChange={v => setWord({ randomPlacement: v })} /></Row>
          <Row label="Alignment">
            <Segmented value={word.align} onChange={v => setWord({ align: v })} options={[
              { key: 'left', label: 'Left' }, { key: 'center', label: 'Centre' }, { key: 'right', label: 'Right' },
            ]} />
          </Row>
        </>
      )}
    </>
  );
}

// A mask fill's own settings, shared with Grid Pattern's fill of that name.
export function MaskFillSettings({ values }) {
  const fill = MASK_SOURCES.find(m => m.id === values.mask)?.fill;
  if (!fill) return null;
  return (
    <>
      {fill.image === 'required' && (
        <div className={styles.gridNote}>Needs Image colour mode with an image loaded (Colour panel).</div>
      )}
      {fill.Settings && <FillSettings fill={fill} />}
    </>
  );
}

function FillSettings({ fill }) {
  const [settings, setSettings] = useDocSettings(fill.settingsKey);
  const { Settings } = fill;
  return settings ? (
    <>
      <div className={styles.gridNote}>{fill.label} settings — shared with Grid Pattern&apos;s {fill.label} fill.</div>
      <Settings s={settings} set={setSettings} />
    </>
  ) : null;
}

// Which layer the panel edits (the control bar has its own picker).
export function EditLayer({ values: L, ctx }) {
  return (
    <Row label="Editing" title="Add, remove and reorder plates in the Layers panel">
      <select className={styles.select} value={L.id} onChange={e => ctx.setEditLayer(e.target.value)}>
        {[...ctx.layers].reverse().map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Row>
  );
}
