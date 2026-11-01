import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { FILLS, FILLS_BY_ID } from '../modes/gridBuilder/fills';
import { LAYOUTS, LAYOUT_CATEGORIES } from '../utils/layouts';
import { LayoutThumb, InfoTip } from './controls';
import styles from './Panel.module.css';

const GROUPS = [...new Set(FILLS.map(f => f.group))];

// Changing a fill's seed (typing one or ⟳) re-runs that fill with it, for
// every seeded fill. Undo and Surprise Me change seeds without re-running.
function FillSettingsHost({ fill, run }) {
  const [settings, setSettings] = useDocSettings(fill.settingsKey);
  const { Settings } = fill;
  const set = (changes) => {
    setSettings(changes);
    if ('seed' in changes && run) run({ ...settings, ...changes });
  };
  return settings ? <Settings s={settings} set={set} /> : null;
}

// Grid Pattern fills: pick one, tune it, Fill. One dropdown (with the
// experimental fills in their own group), then that fill's settings.
export function GeneratePanel() {
  const { fillActions } = useEditor();
  const [activeFill, setActiveFill] = useDocField('activeFill');
  const fill = FILLS_BY_ID[activeFill] ?? FILLS[0];
  const action = fillActions[fill.id];

  return (
    <>
      <div className={styles.sectionContent}>
        <div className={styles.formRow}>
          <span className={styles.label}>
            Fill
            {!fill.Settings && <InfoTip text="Standard packs the enabled shapes across the whole grid (or the active layout's grid area). Shape sizes come from Max scale and Scale freq in Properties." />}
          </span>
          <select className={styles.select} value={fill.id} onChange={e => setActiveFill(e.target.value)}>
            {GROUPS.map(group => (
              <optgroup key={group} label={group}>
                {FILLS.filter(f => f.group === group).map(f => (
                  <option key={f.id} value={f.id}>{f.label}{f.image === 'required' ? ' (needs image)' : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {fill.image === 'required' && !status.hasImage && (
          <div className={styles.gridNote}>Needs Image colour mode with an image loaded (Colour panel).</div>
        )}
        {fill.image === 'suggested' && !status.hasImage && (
          <div className={styles.gridNote}>Works best with Image colour mode active.</div>
        )}
        {fill.group === 'Experimental' && (
          <div className={styles.gridNote}>Experimental — this fill may change or be removed.</div>
        )}
        {fill.Settings && <FillSettingsHost key={fill.id} fill={fill} run={action?.can ? action.run : null} />}
      </div>
    </>
  );
}

// Predetermined page layouts: wireframe placeholders plus a grid area that
// the Fill button fills.
export function LayoutsPanel() {
  const { actions, workArea, mode } = useEditor();
  const [activeLayoutId] = useDocField('activeLayoutId');
  const aspect = (workArea?.width && workArea?.height) ? workArea.width / workArea.height : 0.75;

  return (
    <div className={styles.sectionContent}>
      <div className={styles.gridNote}>
        Grey blocks are wireframe placeholders. {mode === 'linework'
          ? 'The Linework design fills the hatched grid areas.'
          : 'The hatched grid area fills with shapes when you press Fill.'}
      </div>
      {activeLayoutId && (
        <button className={styles.actionBtn} style={{ width: '100%', marginBottom: 10 }} onClick={actions.clearLayout}>
          Clear layout
        </button>
      )}
      {LAYOUT_CATEGORIES.map(cat => {
        const inCat = LAYOUTS.filter(l => l.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat}>
            <div className={styles.fillPickerGroup}>{cat}</div>
            <div className={styles.layoutGrid}>
              {inCat.map(layout => (
                <button key={layout.id}
                  className={`${styles.layoutBtn} ${activeLayoutId === layout.id ? styles.layoutBtnActive : ''}`}
                  onClick={() => actions.applyLayout(layout.id)}
                  title={layout.name}
                >
                  <LayoutThumb layout={layout} aspect={aspect} />
                  <span>{layout.name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
