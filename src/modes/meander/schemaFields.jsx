import { meanderCornerSettings } from '../../utils/knotworkCompose';
import { Toggle } from '../../panels/controls';
import styles from '../../panels/Panel.module.css';

// Custom rows for MEANDER_SCHEMA (schema.js).

const pct = v => `${Math.round(v * 100)}%`;

function Slider({ label, value, min, max, step, onChange, format, title }) {
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

// Strand corner radii (see meanderCornerSettings): end caps as a share of
// a full semicircle, bends as a share of the cell. While linked, the outer
// bend follows the inner one plus the strand width, so bends keep an even
// thickness; dragging either slider moves both. Every change writes all
// four fields, so a pre-v1.4.1 document's single roundness is replaced by
// the equivalent explicit values on first edit.
export function CornerControls({ values, set }) {
  const { capRoundness, innerRadius, outerRadius, bendLinked } = meanderCornerSettings(values);
  const width = values.strandWidthRatio;
  const outer = bendLinked ? innerRadius + width : outerRadius;
  const commit = patch => set({ capRoundness, innerRadius, outerRadius: outer, bendLinked, ...patch });
  return (
    <>
      <Slider label="End caps" value={capRoundness} min={0} max={1} step={0.01} format={pct}
        onChange={v => commit({ capRoundness: v })} title="100% = semicircle, 0% = square" />
      <Slider label="Inner bend" value={innerRadius} min={0} max={1} step={0.01} format={pct}
        onChange={v => commit(bendLinked ? { innerRadius: v, outerRadius: v + width } : { innerRadius: v })}
        title="Radius on the inside of each bend, as a share of the cell" />
      <Slider label="Outer bend" value={outer} min={0} max={2} step={0.01} format={pct}
        onChange={v => commit(bendLinked ? { innerRadius: Math.max(0, v - width), outerRadius: Math.max(v, width) } : { outerRadius: v })}
        title="Radius on the outside of each bend, as a share of the cell" />
      <div className={styles.formRow}>
        <span className={styles.label}>Link bends</span>
        <Toggle value={bendLinked} onChange={v => commit({ bendLinked: v })} title="Keep outer = inner + strand width, so bends stay an even width" />
      </div>
    </>
  );
}

export function WordColour({ values, set, ctx }) {
  const palette = ctx.theme?.palette ?? [];
  const current = values.letterColour || ctx.theme?.fg;
  return (
    <div className={styles.formRow}>
      <span className={styles.label}>Word colour</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
        {palette.map((c, i) => (
          <button key={i} onClick={() => set({ letterColour: c })} title={c}
            className={`${styles.wordColour} ${current === c ? styles.wordColourActive : ''}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}
