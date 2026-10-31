import { useAppStore } from '../store/appStore';
import { NumberField, Toggle, Segmented, SymmetrySelect, SeedField, Section, InfoTip, Chips } from './controls';
import { symmetryOptions, normaliseSymmetry } from '../utils/symmetry';
import { visible, changesFor, resolve } from './schemaUtils';
import styles from './Panel.module.css';

// Settings described as data. A mode lists its settings once, and the
// inspector, the control bar and Surprise Me are all built from that list,
// so a new setting is one entry and shows up everywhere it should.
// Non-component helpers (range, oneOf, surpriseValues) are in schemaUtils.js.
//
// schema = [section]
// section = { id, title, info?, defaultOpen?, showIf?(values, ctx), fields: [field] }
// field = {
//   key, label, type: 'slider' | 'number' | 'toggle' | 'segmented' | 'select'
//                     | 'chips' | 'symmetry' | 'seed' | 'text' | 'custom',
//   min, max, step, format?(v)       — slider / number
//   options: [{ key, label }]        — segmented / select (symmetry: `keys`;
//                                      chips: [[key, label]], value a list)
//   value?(values) — the control's value when it isn't values[key]
//   help?    — tooltip on the row; info? — an ⓘ beside the label
//   showIf?(values, ctx) — only shown (and only randomised) when true
//   bar?     — also in the control bar; the inspector layout then leaves
//              it out of the panel, so it's in one place at a time
//   surprise?(r, values) — Surprise Me's value for it (r: random 0–1)
//   onChange?(v, values) — changes to apply instead of { [key]: v }
//   render?: Component   — custom: ({ values, set, ctx }) => …
// }
// Section title / info / defaultOpen and field label / help / min / max
// may also be functions of (values, ctx).

function FieldRow({ field, values, set, ctx }) {
  const v = field.value ? field.value(values) : values[field.key];
  const min = resolve(field.min, values, ctx), max = resolve(field.max, values, ctx);
  const label = resolve(field.label, values, ctx);
  const change = (nv) => set(changesFor(field, nv, values));
  if (field.type === 'custom') { const C = field.render; return <C values={values} set={set} ctx={ctx} />; }
  if (field.type === 'seed') return <SeedField value={v} onChange={change} />;

  let control;
  switch (field.type) {
    case 'slider':
      control = (
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={min} max={max} step={field.step ?? 0.01}
            value={v ?? min} onChange={e => change(+e.target.value)} />
          <span className={styles.sliderVal}>{field.format ? field.format(v ?? min) : v}</span>
        </div>
      );
      break;
    case 'number':
      control = <NumberField value={v} onChange={change} min={min} max={max} format={field.format} />;
      break;
    case 'toggle':
      control = <Toggle value={!!v} onChange={change} />;
      break;
    case 'segmented':
      control = <Segmented value={v} onChange={change} options={field.options} />;
      break;
    case 'select':
      control = (
        <select className={styles.select} value={v} onChange={e => change(e.target.value)}>
          {field.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      );
      break;
    case 'symmetry':
      control = <SymmetrySelect value={v} keys={field.keys} onChange={change} />;
      break;
    case 'chips':
      return (
        <>
          <div className={styles.formRow} title={resolve(field.help, values, ctx)}>
            <span className={styles.label}>{label}{field.info && <InfoTip text={field.info} />}</span>
          </div>
          <Chips options={field.options} value={v ?? []} onChange={change} />
        </>
      );
    case 'text':
      control = (
        <input type="text" className={styles.numberInput} style={{ flex: 1 }} placeholder={field.placeholder}
          value={v ?? ''} onChange={e => change(e.target.value)} />
      );
      break;
    default:
      return null;
  }
  return (
    <div className={styles.formRow} title={resolve(field.help, values, ctx)}>
      <span className={styles.label}>{label}{field.info && <InfoTip text={field.info} />}</span>
      {control}
    </div>
  );
}

// The fields the panel shows: visible ones, minus those the control bar
// carries while the inspector layout is on.
function panelFields(fields, values, ctx, inBar) {
  return fields.filter(f => visible(f, values, ctx) && !(inBar && f.bar));
}

// Renders a schema's sections into a panel. `set(changes)` merges changes.
export function SettingsForm({ schema, values, set, ctx = {} }) {
  const inBar = useAppStore(s => s.dock.layout) === 'inspector';
  return schema.map(sec => {
    if (!visible(sec, values, ctx)) return null;
    const fields = panelFields(sec.fields, values, ctx, inBar);
    if (!fields.length) return null;
    const body = fields.map(f => <FieldRow key={f.key ?? f.label} field={f} values={values} set={set} ctx={ctx} />);
    if (!sec.title) return <div key={sec.id}>{body}</div>;
    return (
      <Section key={sec.id} id={sec.id} title={resolve(sec.title, values, ctx)}
        info={resolve(sec.info, values, ctx)} defaultOpen={resolve(sec.defaultOpen, values, ctx)}>
        {body}
      </Section>
    );
  });
}

// The control bar's share of a schema: compact controls for `bar` fields.
// `ui` supplies the bar's own Label / Select / Segment / Seed components.
export function BarFields({ schema, values, set, ctx = {}, ui }) {
  const fields = schema.flatMap(sec => (visible(sec, values, ctx) ? sec.fields : []))
    .filter(f => f.bar && visible(f, values, ctx));
  return fields.map(f => {
    const change = (v) => set(changesFor(f, v, values));
    const v = f.value ? f.value(values) : values[f.key];
    let control = null;
    if (f.type === 'seed') control = <ui.Seed value={v} onChange={change} />;
    else if (f.type === 'symmetry') {
      control = <ui.Select value={normaliseSymmetry(v)} onChange={change}
        options={symmetryOptions(f.keys).map(m => ({ key: m.key, label: m.key === 'none' ? m.label : `${m.icon}  ${m.label}` }))} />;
    } else if (f.type === 'segmented') control = <ui.Segment value={v} onChange={change} options={f.barOptions ?? f.options} />;
    else if (f.type === 'select') control = <ui.Select value={v} onChange={change} options={f.options} />;
    if (!control) return null;
    return <ui.Group key={f.key} label={f.barLabel ?? resolve(f.label, values, ctx)}>{control}</ui.Group>;
  });
}
