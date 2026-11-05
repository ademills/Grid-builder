import { useEditor } from '../../editor/EditorContext';
import { useDocField } from '../../store/useDocField';
import { Segmented } from '../../panels/controls';
import { ColorPicker } from '../../panels/ColorPicker';
import { useAnchoredPopover } from '../../panels/anchoredPopover';
import styles from '../../panels/Panel.module.css';
import bar from '../../shell/ControlBar.module.css';

// A plate's outlines (settings `outlines`, `outlinePos`): a stack from the
// plate's edge on, each its own colour and width in line widths. A new one
// takes the last one's width and starts where it ends.
const POSITIONS = [{ key: 'outside', label: 'Outside' }, { key: 'centre', label: 'Centre' }, { key: 'inside', label: 'Inside' }];
const times = v => `${+v.toFixed(2)}×`;

export function OutlinesField({ values: L, set }) {
  const { linework } = useEditor();
  const [shapeColors] = useDocField('shapeColors');
  const [bgColors] = useDocField('bgColors');
  const swatches = [...(shapeColors ?? []), ...(bgColors ?? [])];
  const list = L.outlines ?? [];
  const put = (i, change) => set({ outlines: list.map((o, j) => (j === i ? { ...o, ...change } : o)) });
  const add = () => set({ outlines: [...list, { weight: list[list.length - 1]?.weight ?? 1, colour: 'ink' }] });
  const remove = i => set({ outlines: list.filter((_, j) => j !== i) });
  // Swatch and role colours for the chips.
  const look = (c) => {
    if (c === 'ink') return { hex: linework.roles?.ink, label: 'Ink' };
    if (c === 'ground') return { hex: linework.roles?.ground, label: 'Ground' };
    if (c === 'none') return { hex: null, label: 'Gap' };
    if (c?.startsWith('swatch:')) {
      const s = swatches.find(w => w.id === c.slice(7));
      return { hex: s?.hex ?? linework.roles?.ink, label: s ? (s.name || s.hex) : 'Ink' };
    }
    return { hex: c, label: c };
  };
  return (
    <>
      <div className={styles.formRow} title="Outlines round the plate's edge, the first one on it and each next one beyond the last">
        <span className={styles.label}>Outlines</span>
        {list.length > 0 && <Segmented value={L.outlinePos ?? 'outside'} onChange={v => set({ outlinePos: v })} options={POSITIONS} />}
      </div>
      {list.map((o, i) => (
        // The colour chip sits in the label column, so the widths line up.
        <div key={i} className={styles.formRow} title={`Outline ${i + 1}`}>
          <OutlineColour value={o.colour ?? 'ink'} look={look} swatches={swatches} roles={linework.roles ?? {}} onChange={colour => put(i, { colour })} />
          <div className={styles.sliderRow} title="Width, in line widths">
            <input type="range" className={styles.slider} min={0.25} max={8} step={0.25} value={o.weight}
              onChange={e => put(i, { weight: +e.target.value })} />
            <span className={styles.sliderVal}>{times(o.weight)}</span>
          </div>
          <button className={styles.stepBtn} style={{ flex: 'none', height: 24 }} onClick={() => remove(i)} title="Remove this outline" aria-label={`Remove outline ${i + 1}`}>×</button>
        </div>
      ))}
      <button className={styles.actionBtn} style={{ width: '100%', margin: '2px 0 6px' }} onClick={add}
        title="Another outline, starting where the last one ends">Add outline</button>
    </>
  );
}

// One outline's colour: Ink, Ground or Gap (room, nothing drawn), a
// document swatch (kept by id, so it follows the swatch) or any colour.
function OutlineColour({ value, look, swatches, roles, onChange }) {
  const { anchor, toggle, close, portal } = useAnchoredPopover();
  const { hex, label } = look(value);
  const pick = (v) => { onChange(v); close(); };
  const role = (key, name, h) => (
    <button key={key} className={`${bar.popAuto} ${value === key ? bar.popAutoActive : ''}`} onClick={() => pick(key)}>
      <span style={h ? { background: h } : { background: 'repeating-linear-gradient(45deg, #888 0 2px, transparent 2px 5px)' }} /> {name}
    </button>
  );
  return (
    <span ref={anchor} className={bar.popAnchor} style={{ flex: '0 0 var(--label-w, 100px)', display: 'flex', minWidth: 0 }}>
      <button className={`${bar.colourChip} ${bar.roleChip}`} onClick={toggle} title="Outline colour" style={{ minWidth: 0 }}>
        <span style={hex ? { background: hex } : { background: 'repeating-linear-gradient(45deg, #888 0 2px, transparent 2px 5px)' }} />
        <span style={{ width: 'auto', height: 'auto', border: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {portal(
        <>
          {role('ink', 'Ink', roles.ink)}
          {role('ground', 'Ground', roles.ground)}
          {role('none', 'Gap (nothing drawn)', null)}
          <div className={bar.popLabel}>Document swatches</div>
          <div className={bar.popSwatches}>
            {swatches.map(s => (
              <button key={s.id} className={`${bar.popSwatch} ${value === `swatch:${s.id}` ? bar.popSwatchActive : ''}`}
                style={{ background: s.hex }} title={s.name || s.hex} onClick={() => pick(`swatch:${s.id}`)} />
            ))}
          </div>
          <ColorPicker value={value?.startsWith('#') ? value : hex ?? '#000000'} onChange={h => onChange(h)} />
        </>,
        230,
      )}
    </span>
  );
}
