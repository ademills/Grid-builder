import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { FILLS, FILLS_BY_ID } from '../modes/gridBuilder/fills';
import { LAYOUTS, LAYOUT_CATEGORIES } from '../utils/layouts';
import { LayoutThumb } from './controls';
import styles from './Panel.module.css';

const GROUPS = [...new Set(FILLS.map(f => f.group))];

function FillSettingsHost({ fill }) {
  const [settings, setSettings] = useDocSettings(fill.settingsKey);
  const { Settings } = fill;
  return settings ? <Settings s={settings} set={setSettings} /> : null;
}

// Grid Pattern fills: pick one, tune it, Fill. Replaces the old Fill and
// Experimental sub-menus with a single picker.
export function GeneratePanel() {
  const { fillActions, actions, status } = useEditor();
  const [activeFill, setActiveFill] = useDocField('activeFill');
  const fill = FILLS_BY_ID[activeFill] ?? FILLS[0];
  const action = fillActions[fill.id];

  return (
    <>
      <div className={styles.sectionContent}>
        {GROUPS.map(group => (
          <div key={group}>
            <div className={styles.fillPickerGroup}>{group}</div>
            <div className={styles.fillPicker}>
              {FILLS.filter(f => f.group === group).map(f => (
                <button
                  key={f.id}
                  className={`${styles.fillPickerBtn} ${f.id === fill.id ? styles.fillPickerBtnActive : ''}`}
                  onClick={() => setActiveFill(f.id)}
                  title={f.image === 'required' ? 'Needs an image in Image colour mode' : undefined}
                >
                  {f.label}
                  {f.image === 'required' && <span className={styles.fillPickerTag}>Image</span>}
                </button>
              ))}
            </div>
          </div>
        ))}

        {fill.Settings && (
          <>
            <div className={styles.subHeading}>{fill.label} settings</div>
            {fill.image === 'required' && !status.hasImage && (
              <div className={styles.gridNote}>Needs Image colour mode with an image loaded (Colour panel).</div>
            )}
            {fill.image === 'suggested' && !status.hasImage && (
              <div className={styles.gridNote}>Works best with Image colour mode active.</div>
            )}
            {fill.group === 'Experimental' && (
              <div className={styles.gridNote}>Experimental — this fill may change or be removed.</div>
            )}
            <FillSettingsHost key={fill.id} fill={fill} />
          </>
        )}
        {!fill.Settings && (
          <div className={styles.gridNote} style={{ marginTop: 10 }}>
            Packs the enabled shapes across the whole grid (or the active layout&apos;s grid area).
            Shape sizes come from Max scale and Scale freq in Properties.
          </div>
        )}
      </div>

      <div className={styles.fillBar}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={action?.run}
          disabled={!action?.can}
        >▶ Fill — {fill.label}</button>
        <button className={styles.actionBtn} onClick={actions.fillGaps} disabled={!status.canFillGaps} title="Fill only the empty cells">
          Gaps
        </button>
      </div>
    </>
  );
}

// Predetermined page layouts: wireframe placeholders plus a grid area that
// the Fill button fills.
export function LayoutsPanel() {
  const { actions, workArea } = useEditor();
  const [activeLayoutId] = useDocField('activeLayoutId');
  const aspect = (workArea?.width && workArea?.height) ? workArea.width / workArea.height : 0.75;

  return (
    <div className={styles.sectionContent}>
      <div className={styles.gridNote}>
        Grey blocks are wireframe placeholders. The hatched grid area fills with shapes when you press Fill.
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
