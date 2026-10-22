import { useDocSettings } from '../editor/EditorContext';
import { EFFECTS, effectsActive } from '../effects/effectDefs';
import { Toggle } from './controls';
import styles from './Panel.module.css';

const fmt = (p, v) => (p.pct ? `${Math.round(v * 100)}%` : `${Number.isInteger(v) ? v : v.toFixed(1)}${p.unit ?? ''}`);

// Raster effects (grain, halftone, riso…): shown live on the canvas and
// applied to PNG / JPEG exports, in the order listed.
export function EffectsPanel() {
  const [fx, setFx] = useDocSettings('effects');
  if (!fx) return null;
  const setEffect = (id, changes) => setFx({ [id]: { ...fx[id], ...changes } });
  const anyOn = effectsActive(fx);

  return (
    <div className={styles.sectionContent}>
      <div className={styles.formRow}>
        <span className={styles.label}>Show on canvas</span>
        <Toggle value={fx.preview} onChange={v => setFx({ preview: v })} title="Preview the effects while you work (they're always applied to PNG / JPEG export)" />
      </div>
      <div className={styles.gridNote}>
        Applied to PNG and JPEG exports. SVG stays vector, without effects.
      </div>

      {EFFECTS.map(e => {
        const s = fx[e.id];
        return (
          <div key={e.id} className={`${styles.effectBlock} ${s.on ? styles.effectBlockOn : ''}`}>
            <label className={styles.effectHeader}>
              <input type="checkbox" checked={s.on} onChange={ev => setEffect(e.id, { on: ev.target.checked })} />
              <span>{e.label}</span>
            </label>
            {s.on && e.params.map(p => (
              <div key={p.key} className={styles.formRow}>
                <span className={styles.label}>{p.label}</span>
                {p.type === 'toggle' ? (
                  <Toggle value={!!s[p.key]} onChange={v => setEffect(e.id, { [p.key]: v })} />
                ) : (
                  <div className={styles.sliderRow}>
                    <input type="range" className={styles.slider} min={p.min} max={p.max} step={p.step}
                      value={s[p.key]} onChange={ev => setEffect(e.id, { [p.key]: +ev.target.value })} />
                    <span className={styles.sliderVal}>{fmt(p, s[p.key])}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {anyOn && (
        <div className={styles.fillBar} style={{ margin: '10px -12px -12px' }}>
          <button className={styles.actionBtn} onClick={() => setFx({ seed: 1 + Math.floor(Math.random() * 9999) })}
            title="New random pattern for grain, toner and ink texture">⟳ Reseed noise</button>
          <button className={styles.actionBtn}
            onClick={() => setFx(Object.fromEntries(EFFECTS.map(e => [e.id, { ...fx[e.id], on: false }])))}>
            All off
          </button>
        </div>
      )}
    </div>
  );
}
