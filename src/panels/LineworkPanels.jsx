import { useState } from 'react';
import { PALETTES } from '../utils/colorize';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { useAppStore } from '../store/appStore';
import { Stepper, Toggle, Segmented, SeedField, SymmetrySelect, InfoTip } from './controls';
import { LINEWORK_SYMMETRY } from '../utils/symmetry';
import { LINEWORK_PRESETS, PLATE_ASPECTS, plateCells } from '../modes/linework/settings';
import { MASK_SOURCES } from '../modes/linework/masks';
import { DiceIcon } from '../shell/icons';
import styles from './Panel.module.css';

// ── Shared bits ──────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange, format = v => v, title }) {
  return (
    <div className={styles.formRow} title={title}>
      <span className={styles.label}>{label}</span>
      <div className={styles.sliderRow}>
        <input type="range" className={styles.slider} min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)} />
        <span className={styles.sliderVal}>{format(value)}</span>
      </div>
    </div>
  );
}

function Row({ label, children, title }) {
  return (
    <div className={styles.formRow} title={title}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

// Toggle buttons for a multi-choice list (fills, hatch angles).
function Chips({ options, value, onChange }) {
  return (
    <div className={styles.fillPicker}>
      {options.map(([key, label]) => (
        <button key={key}
          className={`${styles.fillPickerBtn} ${value.includes(key) ? styles.fillPickerBtnActive : ''}`}
          onClick={() => onChange(value.includes(key) ? value.filter(v => v !== key) : options.map(o => o[0]).filter(k => k === key || value.includes(k)))}
        >{label}</button>
      ))}
    </div>
  );
}

const pct = v => `${Math.round(v * 100)}%`;
const cells = v => `${+v.toFixed(2)}`;

const FILL_OPTIONS = [
  ['spiral', 'Key spiral'], ['rings', 'Rings'], ['split2', '◩ 2 triangles'],
  ['split4', '⊠ 4 triangles'], ['hatch', 'Hatch'], ['chevron', 'Chevron'],
];
const ANGLE_OPTIONS = [['0', '0°'], ['45', '45°'], ['90', '90°'], ['135', '135°']];

// A plate's shape and size: equal sides, a width × height in grid cells, or
// an aspect ratio with its long side in cells. Switching keeps the plate's
// current dimensions as near as the new way allows.
function PlateSize({ L, setLayer, maxCells, grid }) {
  const sizing = L.sizing ?? 'equal';
  const [w, h] = plateCells(L, grid);
  const half = v => Math.max(0.5, Math.round(v * 2) / 2);
  const setSizing = (v) => {
    if (v === 'cells') setLayer({ sizing: v, w: half(w), h: half(h) });
    else setLayer({ sizing: v, size: Math.max(w, h) });
  };
  const equal = Math.abs(w - h) < 1e-6;
  return (
    <>
      <Row label="Shape">
        <Segmented value={L.shape} onChange={v => setLayer({ shape: v })} options={[
          { key: 'square', label: equal ? 'Square' : 'Upright' }, { key: 'diamond', label: 'Diamond' },
        ]} />
      </Row>
      <Row label="Sides" title="Equal sides, a width and height in grid cells, or an aspect ratio">
        <Segmented value={sizing} onChange={setSizing} options={[
          { key: 'equal', label: 'Equal' }, { key: 'cells', label: 'Grid cells' }, { key: 'ratio', label: 'Ratio' },
        ]} />
      </Row>
      {sizing === 'equal' && (
        <Slider label="Size" value={L.size} min={0.5} max={maxCells} step={0.1} format={cells} onChange={v => setLayer({ size: v })} title="Plate size, in grid cells" />
      )}
      {sizing === 'cells' && (
        <>
          <Slider label="Width" value={w} min={0.5} max={maxCells} step={0.5} format={cells} onChange={v => setLayer({ w: v })} title="Plate width, in grid cells" />
          <Slider label="Height" value={h} min={0.5} max={maxCells} step={0.5} format={cells} onChange={v => setLayer({ h: v })} title="Plate height, in grid cells" />
        </>
      )}
      {sizing === 'ratio' && (
        <>
          <Row label="Ratio">
            <select className={styles.select} value={L.aspect ?? '3:2'} onChange={e => setLayer({ aspect: e.target.value })}>
              {PLATE_ASPECTS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Row>
          <Row label="Orientation">
            <Segmented value={L.portrait ? 'portrait' : 'landscape'} onChange={v => setLayer({ portrait: v === 'portrait' })} options={[
              { key: 'landscape', label: 'Landscape' }, { key: 'portrait', label: 'Portrait' },
            ]} />
          </Row>
          <Slider label="Long side" value={L.size} min={0.5} max={maxCells} step={0.1} format={cells} onChange={v => setLayer({ size: v })}
            title={`Plate is ${cells(w)} × ${cells(h)} cells`} />
        </>
      )}
    </>
  );
}

// ── Linework generator panel ─────────────────────────────────────────────────

// Design settings for the layer being edited — the base or a plate (picked
// in the Layers panel, where plates are added and reordered, or the control
// bar). Every change rebuilds the design at once, keeping each layer's
// edits. In the inspector layout the layer, Style, Symmetry and Seed are
// left to the control bar.
export function LineworkPanel() {
  const { linework, actions, gridComputed } = useEditor();
  const inControlBar = useAppStore(s => s.dock.layout) === 'inspector';
  const [preset, setPreset] = useState('');
  const s = linework.settings;
  const set = (changes) => linework.update(changes);
  const L = s.layers.find(l => l.id === linework.editLayer) ?? s.layers[0];
  const setLayer = (changes) => linework.update(prev => ({
    ...prev, layers: prev.layers.map(l => (l.id === L.id ? { ...l, ...changes } : l)),
  }));
  const plate = L.id !== 'base';
  const maxCells = Math.max(4, gridComputed?.cols ?? 20, gridComputed?.rows ?? 20);

  return (
    <>
      <div className={styles.sectionContent}>
        <Row label="Preset">
          <select className={styles.select} value={preset}
            onChange={e => { if (e.target.value) actions.lineworkPreset(e.target.value); setPreset(''); }}>
            <option value="">Load a preset…</option>
            {LINEWORK_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </Row>

        <div className={styles.subHeading}>Grid &amp; lines</div>
        <Row label="Orientation">
          <Segmented value={s.orientation} onChange={v => set({ orientation: v })} options={[
            { key: 'square', label: 'Square' }, { key: 'diamond', label: 'Diamond 45°' },
          ]} />
        </Row>
        {linework.diamondCells && (
          <div className={styles.gridNote}>Diamond: {linework.diamondCells} × {linework.diamondCells} cells, set by the grid in Properties.</div>
        )}
        <Row label="Lines per cell" title="How many lines fit across one grid cell">
          <Stepper value={s.linesPerCell} onChange={v => set({ linesPerCell: v })} min={1} max={12} />
        </Row>
        <Slider label="Line weight" value={s.lineRatio} min={0.1} max={0.9} step={0.01} format={pct}
          onChange={v => set({ lineRatio: v })} title="Line width as a share of each line's pitch; the rest is the gap" />

        <div className={styles.subHeading}>
          Layer · {L.name}
          {s.layers.length > 1 && <InfoTip text="Pick the layer to edit in the Layers panel or the control bar. Add and reorder plates in Layers." />}
        </div>
        {!inControlBar && s.layers.length > 1 && (
          <Row label="Editing" title="Add, remove and reorder plates in the Layers panel">
            <select className={styles.select} value={L.id} onChange={e => linework.setEditLayer(e.target.value)}>
              {[...s.layers].reverse().map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Row>
        )}

        {plate && (
          <>
            <PlateSize L={L} setLayer={setLayer} maxCells={maxCells}
              grid={linework.diamondCells ? { w: linework.diamondCells, h: linework.diamondCells } : { w: gridComputed?.cols ?? 1, h: gridComputed?.rows ?? 1 }} />
            <Slider label="Offset X" value={L.ox} min={-maxCells / 2} max={maxCells / 2} step={0.5} format={cells} onChange={v => setLayer({ ox: v })} />
            <Slider label="Offset Y" value={L.oy} min={-maxCells / 2} max={maxCells / 2} step={0.5} format={cells} onChange={v => setLayer({ oy: v })} />
            <Row label="Shadow">
              <Segmented value={L.shadow} onChange={v => setLayer({ shadow: v })} options={[
                { key: 'none', label: 'None' }, { key: 'hard', label: 'Hard' }, { key: 'soft', label: 'Soft' },
              ]} />
            </Row>
            {L.shadow !== 'none' && (
              <Slider label="Depth" value={L.depth} min={0} max={1} step={0.01} format={cells} onChange={v => setLayer({ depth: v })} title="Shadow offset, in cells" />
            )}
            <Slider label="Rim" value={L.rim} min={0} max={0.5} step={0.01} format={cells} onChange={v => setLayer({ rim: v })} title="Edge band round the plate, in cells" />
            {L.rim > 0 && (
              <Row label="Rim colour">
                <Segmented value={L.rimInk ? 'ink' : 'ground'} onChange={v => setLayer({ rimInk: v === 'ink' })} options={[
                  { key: 'ground', label: 'Ground' }, { key: 'ink', label: 'Ink' },
                ]} />
              </Row>
            )}
          </>
        )}

        {!inControlBar && (
          <>
            <Row label="Style">
              <Segmented value={L.style} onChange={v => setLayer({ style: v })} options={[
                { key: 'angular', label: 'A · Angular' }, { key: 'circuit', label: 'B · Circuit' },
              ]} />
            </Row>
            <Row label="Symmetry">
              <SymmetrySelect value={L.sym} keys={LINEWORK_SYMMETRY} onChange={v => setLayer({ sym: v })} />
            </Row>
          </>
        )}
        <Slider label="Line scale" value={L.scale} min={0.2} max={2} step={0.05} format={v => `${v}×`} onChange={v => setLayer({ scale: v })}
          title="Scales this layer's cells and lines" />
        <Row label="Swap colours"><Toggle value={L.invert} onChange={v => setLayer({ invert: v })} title="Swap ink and ground on this layer" /></Row>
        {!plate && (
          <Slider label="Frame" value={L.frame} min={0} max={1} step={0.01} format={cells} onChange={v => setLayer({ frame: v })} title="An ink border round the canvas, in cells" />
        )}
        {!inControlBar && <SeedField value={L.seed} onChange={v => setLayer({ seed: v })} />}

        {L.style === 'angular' ? <AngularSettings L={L} setLayer={setLayer} maxCells={maxCells} /> : <CircuitSettings L={L} setLayer={setLayer} />}

        <RegionMask L={L} setLayer={setLayer} word={s.word} setWord={w => set({ word: { ...s.word, ...w } })} />
      </div>

      <div className={styles.fillBar}>
        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={actions.lineworkReseed}
          title="New seeds for every layer">▶ New Design</button>
        <button className={styles.actionBtn} onClick={actions.lineworkSurprise} title="Random preset colours, design and seeds">
          <DiceIcon size={14} /> Surprise
        </button>
      </div>
    </>
  );
}

function AngularSettings({ L, setLayer, maxCells }) {
  const hasTriangles = L.fills.includes('split2') || L.fills.includes('split4') || L.maskFills.includes('split2') || L.maskFills.includes('split4');
  const hasHatch = ['hatch', 'chevron'].some(k => L.fills.includes(k) || L.maskFills.includes(k));
  return (
    <>
      <div className={styles.subHeading}>A · Angular</div>
      <Row label="Tile size" title="Tile size in cells">
        <Stepper value={L.tile} onChange={v => setLayer({ tile: v })} min={1} max={maxCells} />
      </Row>
      <Slider label="Subdivide" value={L.subdiv} min={0} max={1} step={0.05} format={pct} onChange={v => setLayer({ subdiv: v })}
        title="Chance each tile splits into four smaller ones" />
      {L.subdiv > 0 && (
        <Slider label="Smallest tile" value={L.minTile} min={0.25} max={8} step={0.25} format={cells} onChange={v => setLayer({ minTile: v })} />
      )}
      <Row label="Fills" />
      <Chips options={FILL_OPTIONS} value={L.fills} onChange={v => setLayer({ fills: v })} />
      {hasTriangles && (
        <Row label="Triangle fill">
          <Segmented value={L.triFill} onChange={v => setLayer({ triFill: v })} options={[
            { key: 'spiral', label: 'Spiral' }, { key: 'rings', label: 'Rings' }, { key: 'mix', label: 'Mix' },
          ]} />
        </Row>
      )}
      {hasHatch && (
        <>
          <Row label="Hatch angles" />
          <Chips options={ANGLE_OPTIONS} value={L.angles} onChange={v => setLayer({ angles: v })} />
        </>
      )}
      <Row label="Orientation">
        <Segmented value={L.orient} onChange={v => setLayer({ orient: v })} options={[
          { key: 'random', label: 'Random' }, { key: 'uniform', label: 'Uniform' },
        ]} />
      </Row>
      <Row label="Tile outlines"><Toggle value={L.outline} onChange={v => setLayer({ outline: v })} /></Row>
      <Row label="Solid centres"><Toggle value={L.core} onChange={v => setLayer({ core: v })} title="Fill the last ring's middle" /></Row>
    </>
  );
}

function CircuitSettings({ L, setLayer }) {
  return (
    <>
      <div className={styles.subHeading}>B · Circuit</div>
      <Row label="Bundle size" title="Cells per bundle; a bundle carries Lines per cell × this many strands">
        <Stepper value={L.bundle} onChange={v => setLayer({ bundle: v })} min={1} max={8} />
      </Row>
      <Slider label="Straightness" value={L.straight} min={0} max={1} step={0.05} format={pct} onChange={v => setLayer({ straight: v })} />
      <Slider label="Max length" value={L.maxLen} min={1} max={200} step={1} onChange={v => setLayer({ maxLen: v })} title="Longest run, in bundles" />
      <Slider label="Density" value={L.density} min={0.05} max={1} step={0.05} format={pct} onChange={v => setLayer({ density: v })} />
      <Slider label="Run off edges" value={L.edgeExit} min={0} max={1} step={0.05} format={pct} onChange={v => setLayer({ edgeExit: v })}
        title="Chance a bundle runs off the edge instead of turning back (only when the grid holds whole bundles)" />
      <Row label="Over / under">
        <Segmented value={L.weave} onChange={v => setLayer({ weave: v })} options={[
          { key: 'off', label: 'Off' }, { key: 'alternate', label: 'Alternate' }, { key: 'random', label: 'Random' },
        ]} />
      </Row>
      <Row label="Single-cell eyes"><Toggle value={L.eyes} onChange={v => setLayer({ eyes: v })} /></Row>
    </>
  );
}

// A region mask: one of the Generate panel's mask fills (with its own
// settings, shared with Grid Pattern) or the seed word's letters. Angular
// tiles inside it take their own fills; circuit bundles route inside it first.
function RegionMask({ L, setLayer, word, setWord }) {
  const source = MASK_SOURCES.find(m => m.id === L.mask);
  return (
    <>
      <div className={styles.subHeading}>Region mask</div>
      <Row label="Mask">
        <select className={styles.select} value={L.mask} onChange={e => setLayer({ mask: e.target.value })}>
          <option value="none">None</option>
          {MASK_SOURCES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Row>
      {L.mask !== 'none' && (
        <>
          {L.style === 'angular' ? (
            <>
              <Row label="Inside fills" />
              <Chips options={FILL_OPTIONS} value={L.maskFills} onChange={v => setLayer({ maskFills: v })} />
              <Row label="Outside">
                <Segmented value={L.maskOutside} onChange={v => setLayer({ maskOutside: v })} options={[
                  { key: 'fill', label: 'Layer fills' }, { key: 'empty', label: 'Empty' },
                ]} />
              </Row>
            </>
          ) : (
            <Row label="Outside">
              <Segmented value={L.maskOutside} onChange={v => setLayer({ maskOutside: v })} options={[
                { key: 'fill', label: 'Route after' }, { key: 'empty', label: 'Empty' },
              ]} />
            </Row>
          )}
          {L.mask === 'word' && <WordSettings word={word} setWord={setWord} />}
          {source?.fill?.Settings && <MaskFillSettings fill={source.fill} />}
          {source?.fill?.image === 'required' && (
            <div className={styles.gridNote}>Needs Image colour mode with an image loaded (Colour panel).</div>
          )}
        </>
      )}
    </>
  );
}

function MaskFillSettings({ fill }) {
  const [settings, setSettings] = useDocSettings(fill.settingsKey);
  const { Settings } = fill;
  return settings ? (
    <>
      <div className={styles.gridNote}>{fill.label} settings — shared with Grid Pattern&apos;s {fill.label} fill.</div>
      <Settings s={settings} set={setSettings} />
    </>
  ) : null;
}

function WordSettings({ word, setWord }) {
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

// ── Theme: colour roles ──────────────────────────────────────────────────────

// Picks a swatch for a role; `auto` is the role's default (no swatch).
function RolePicker({ value, auto, autoLabel, swatches, onChange }) {
  return (
    <div className={styles.layerPickStrip} style={{ padding: 0, flex: 1 }}>
      <button className={`${styles.modeBtn} ${!value ? styles.modeBtnActive : ''}`} style={{ flex: 'none' }}
        onClick={() => onChange(null)} title={autoLabel}>
        <span className={styles.swatchInline} style={{ background: auto }} /> Auto
      </button>
      {swatches.map(sw => (
        <button key={sw.id} className={styles.layerPickSwatch} title={sw.name || sw.hex}
          style={{ background: sw.hex, outline: value === sw.id ? '2px solid var(--accent, #7b61ff)' : undefined, outlineOffset: 1 }}
          onClick={() => onChange(sw.id)} />
      ))}
    </div>
  );
}

// Linework colours: the palette, plus which swatch is the ink, the ground
// (the canvas colour unless split off) and the plate shadow. Individual line
// groups are recoloured with the Paint Bucket or the Layers panel.
export function LineworkThemePanel() {
  const { linework, actions } = useEditor();
  const [paletteKey] = useDocField('paletteKey');
  const [shapeColors] = useDocField('shapeColors');
  const [canvasBg] = useDocField('canvasBg');
  const showDockTab = useAppStore(s => s.showDockTab);
  const s = linework.settings;
  const roles = linework.roles;
  return (
    <div className={styles.sectionContent}>
      <button className={styles.paletteChooserBtn} onClick={() => showDockTab('colour', 'swatches')} title="Edit swatches or pick a library in the Swatches tab">
        <span className={styles.paletteChooserName}>{paletteKey}</span>
        <span className={styles.paletteChooserSwatches}>
          {(PALETTES[paletteKey] ?? shapeColors.filter(c => c.enabled).map(c => c.hex)).map((c, i) => (
            <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} />
          ))}
        </span>
        <span className={styles.paletteChooserArrow}>›</span>
      </button>

      <div className={styles.subHeading}>
        Roles
        <InfoTip text="Ground on Auto follows the canvas colour. Colour modes (Colour tab) spread the palette over the line groups; the Paint Bucket recolours single groups." />
      </div>
      <Row label="Ink">
        <RolePicker value={s.inkSwatch} auto={roles.ink} autoLabel="The first palette swatch"
          swatches={shapeColors} onChange={id => linework.update({ inkSwatch: id }, 'Ink Colour')} />
      </Row>
      <Row label="Ground">
        <RolePicker value={s.groundSwatch} auto={canvasBg} autoLabel="Same as the canvas colour (Properties)"
          swatches={shapeColors} onChange={id => linework.update({ groundSwatch: id }, 'Ground Colour')} />
      </Row>
      <Row label="Shadow">
        <RolePicker value={s.shadowSwatch} auto="#000000" autoLabel="Black"
          swatches={shapeColors} onChange={id => linework.update({ shadowSwatch: id }, 'Shadow Colour')} />
      </Row>
      <button className={styles.actionBtn} style={{ width: '100%', marginTop: 6 }} onClick={actions.lineworkRecolour}
        title="Reshuffle which palette colour each group gets (Random colour mode)">
        Shuffle colours
      </button>
    </div>
  );
}
