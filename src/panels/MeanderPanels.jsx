import { useEditor, useDocSettings } from '../editor/EditorContext';
import { SettingsForm } from './schema';
import { MEANDER_SCHEMA } from '../modes/meander/schema';
import styles from './Panel.module.css';

// Meander generator: walker, symmetry, strand shape, word seeding — drawn
// from MEANDER_SCHEMA, which the control bar and Surprise Me also use.
export function MeanderPanel() {
  const { knotworkThemeColors } = useEditor();
  const [knotworkSettings, setKnotworkSettings] = useDocSettings('knotworkSettings');

  return (
    <>
      <div className={styles.sectionContent}>
        <SettingsForm schema={MEANDER_SCHEMA} values={knotworkSettings} set={setKnotworkSettings} ctx={{ theme: knotworkThemeColors }} />
      </div>
    </>
  );
}
