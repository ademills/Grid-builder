import { useEditor, useDocSettings } from '../editor/EditorContext';
import { SettingsForm } from './schema';
import { MEANDER_SCHEMA } from '../modes/meander/schema';
import styles from './Panel.module.css';

// Meander generator: walker, symmetry, strand shape, word seeding — drawn
// from MEANDER_SCHEMA, which the control bar and Surprise Me also use.
export function MeanderPanel() {
  const { actions, status, knotworkThemeColors } = useEditor();
  const [knotworkSettings, setKnotworkSettings] = useDocSettings('knotworkSettings');

  return (
    <>
      <div className={styles.sectionContent}>
        <SettingsForm schema={MEANDER_SCHEMA} values={knotworkSettings} set={setKnotworkSettings} ctx={{ theme: knotworkThemeColors }} />
      </div>

      <div className={styles.fillBar}>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={actions.knotworkFill}
          disabled={!status.canKnotworkFill}
          title="Generate a new design (keeps the seed when a word is set)"
        >▶ Generate Meander</button>
        <button
          className={styles.actionBtn}
          onClick={actions.knotworkRecolour}
          disabled={!status.hasBlocks}
          title="Reassign colours to the current design without changing its layout"
        >Recolour</button>
      </div>
    </>
  );
}
