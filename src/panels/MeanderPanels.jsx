import { useEditor, useDocSettings } from '../editor/EditorContext';
import { SettingsForm } from './schema';
import { Section } from './controls';
import { MEANDER_SCHEMA, MEANDER_PLATE_SCHEMA } from '../modes/meander/schema';
import { newMeanderPlate } from '../utils/meanderPlates';
import styles from './Panel.module.css';

// Meander generator: walker, symmetry, strand shape, word seeding — drawn
// from MEANDER_SCHEMA, which the control bar and Surprise Me also use —
// then the plates stacked over the design.
export function MeanderPanel() {
  const { knotworkThemeColors } = useEditor();
  const [knotworkSettings, setKnotworkSettings] = useDocSettings('knotworkSettings');

  return (
    <div className={styles.sectionContent}>
      <SettingsForm schema={MEANDER_SCHEMA} values={knotworkSettings} set={setKnotworkSettings} ctx={{ theme: knotworkThemeColors }} />
      <MeanderPlates settings={knotworkSettings} set={setKnotworkSettings} />
    </div>
  );
}

// Plates: smaller Meanders on panels over the main design, each with its
// own seed, background, shadow and rim (utils/meanderPlates.js).
function MeanderPlates({ settings, set }) {
  const { gridComputed } = useEditor();
  const plates = settings.plates ?? [];
  const grid = { cols: gridComputed?.cols ?? 8, rows: gridComputed?.rows ?? 8 };
  const setPlates = (next) => set({ plates: next });
  const ctx = { grid, maxCells: Math.max(grid.cols, grid.rows), base: settings };
  return (
    <Section id="meander.plates" title="Plates" defaultOpen={plates.length > 0}
      info="Smaller Meanders on panels over the design, each with its own seed. Generate leaves them as they are; use a plate's seed to reroll it.">
      {plates.map((p, i) => (
        <Section key={p.id} id={`meander.plate.${p.id}`} title={p.name}>
          <SettingsForm schema={MEANDER_PLATE_SCHEMA} values={p} ctx={ctx}
            set={changes => setPlates(plates.map((q, j) => (j === i ? { ...q, ...changes } : q)))} />
          <div className={styles.formRow}>
            <span className={styles.label} />
            <button className={styles.actionBtn} onClick={() => setPlates(plates.filter((_, j) => j !== i))}>Delete Plate</button>
          </div>
        </Section>
      ))}
      <button className={styles.actionBtn} style={{ width: '100%' }} onClick={() => setPlates([...plates, newMeanderPlate(plates, grid)])}>
        + Add Plate
      </button>
    </Section>
  );
}
