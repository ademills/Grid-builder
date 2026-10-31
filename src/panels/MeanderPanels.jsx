import { hashSeed } from '../utils/textSeed';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { useAppStore } from '../store/appStore';
import { Stepper, SeedField, SymmetrySelect, Toggle, Section, Segmented } from './controls';
import { MEANDER_SYMMETRY } from '../utils/symmetry';
import styles from './Panel.module.css';
import { meanderCornerSettings } from '../utils/knotworkCompose';

const pct = v => `${Math.round(v * 100)}%`;

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

// Strand corner radii (see meanderCornerSettings): end caps as a share of
// a full semicircle, bends as a share of the cell. While linked, the outer
// bend follows the inner one plus the strand width, so bends keep an even
// thickness; dragging either slider moves both.
function CornerControls({ settings, onChange }) {
  const { capRoundness, innerRadius, outerRadius, bendLinked } = meanderCornerSettings(settings);
  const width = settings.strandWidthRatio;
  const outer = bendLinked ? innerRadius + width : outerRadius;
  // Every change writes all four fields, so a pre-v1.4.1 document's single
  // roundness is replaced by the equivalent explicit values on first edit.
  const commit = patch => onChange({ capRoundness, innerRadius, outerRadius: outer, bendLinked, ...patch });
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

// Meander generator: walker, symmetry, strand shape, word seeding. Markup
// carried over from the original Meander sidebar. In the inspector layout
// Symmetry and Seed are left to the control bar.
export function MeanderPanel() {
  const { actions, status, knotworkThemeColors: themePreview } = useEditor();
  const inControlBar = useAppStore(s => s.dock.layout) === 'inspector';
  const [knotworkSettings, onKnotworkSettingsChange] = useDocSettings('knotworkSettings');
  const set = onKnotworkSettingsChange;
  const letters = knotworkSettings.seedWord && knotworkSettings.weaveAsLetters;
  const onKnotworkFill = actions.knotworkFill;
  const onKnotworkRecolour = actions.knotworkRecolour;
  const canKnotworkFill = status.canKnotworkFill;
  const canKnotworkRecolour = status.hasBlocks;

  return (
    <>
    <div className={styles.sectionContent}>
      <Section id="meander.layout" title="Layout">
        <Slider label="Density" value={knotworkSettings.density} min={0.1} max={1} step={0.05} format={pct}
          onChange={v => set({ density: v })} title="How much of the grid the strands fill" />
        <Slider label="Straight bias" value={knotworkSettings.straightBias} min={1} max={15} step={1}
          onChange={v => set({ straightBias: v })} title="Higher keeps strands running straight for longer before turning" />
        <Slider label="Wall density" value={knotworkSettings.wallDensity} min={0} max={0.3} step={0.01} format={pct}
          onChange={v => set({ wallDensity: v })} />
        {!inControlBar && (
          <div className={styles.formRow}>
            <span className={styles.label}>Symmetry</span>
            <SymmetrySelect value={knotworkSettings.symmetryMode} keys={MEANDER_SYMMETRY} onChange={v => set({ symmetryMode: v })} />
          </div>
        )}
        {knotworkSettings.symmetryMode === 'kaleidoscope' && (
          <div className={styles.formRow}>
            <span className={styles.label}>Kaleidoscope fold</span>
            <Stepper value={knotworkSettings.kaleidoscopeFold} onChange={v => set({ kaleidoscopeFold: v })} min={2} max={12} />
          </div>
        )}
        {!inControlBar && <SeedField value={knotworkSettings.seed} onChange={seed => set({ seed, seedWord: '' })} />}
      </Section>

      <Section id="meander.strands" title="Strands">
        <Slider label="Width" value={knotworkSettings.strandWidthRatio} min={0.3} max={1} step={0.02} format={v => v.toFixed(2)}
          onChange={v => set({ strandWidthRatio: v })} title="Strand width as a share of the cell" />
        <CornerControls settings={knotworkSettings} onChange={onKnotworkSettingsChange} />
        <div className={styles.formRow}>
          <span className={styles.label}>Terminal dots</span>
          <Toggle value={knotworkSettings.showTerminalDots} onChange={v => set({ showTerminalDots: v })} />
        </div>
      </Section>

      <Section id="meander.word" title="Word" info="Type a name or word to seed the design: the same word always gives the same layout. Weave as letters draws its letterforms into the strands.">
        <div className={styles.formRow}>
          <span className={styles.label}>Name / word</span>
          <input type="text" className={styles.numberInput} style={{ flex: 1 }}
            placeholder="Type a word…"
            value={knotworkSettings.seedWord}
            onChange={e => {
              const seedWord = e.target.value;
              set({ seedWord, seed: hashSeed(seedWord) });
            }} />
        </div>

        {knotworkSettings.seedWord && (
          <div className={styles.formRow}>
            <span className={styles.label}>Weave as letters</span>
            <Toggle value={knotworkSettings.weaveAsLetters} onChange={v => set({ weaveAsLetters: v })} title="Fill the word's letterforms first, then the rest of the grid as usual" />
          </div>
        )}

        {letters && (
          <>
            <div className={styles.formRow}>
              <span className={styles.label}>Layout</span>
              <Segmented value={knotworkSettings.letterLayout} onChange={v => set({ letterLayout: v })} options={[
                { key: 'scatter', label: 'Scattered' }, { key: 'line', label: 'Line' },
              ]} />
            </div>
            {knotworkSettings.letterLayout === 'scatter' && (
              <>
                <div className={styles.formRow}>
                  <span className={styles.label}>Random size</span>
                  <Toggle value={knotworkSettings.letterRandomSize} onChange={v => set({ letterRandomSize: v })} title="Each letter draws its own random size, or off for one shared size" />
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Random placement</span>
                  <Toggle value={knotworkSettings.letterRandomPlacement} onChange={v => set({ letterRandomPlacement: v })} title="Each letter lands on a random row, or off to centre them all on one row" />
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Alignment</span>
                  <Segmented value={knotworkSettings.letterAlign} onChange={v => set({ letterAlign: v })} options={[
                    { key: 'left', label: 'Left' }, { key: 'center', label: 'Centre' }, { key: 'right', label: 'Right' },
                  ]} />
                </div>
              </>
            )}
            <Slider label="Letter size" value={knotworkSettings.letterSize} min={0.2} max={1} step={0.05} format={pct}
              onChange={v => set({ letterSize: v })} />
            <div className={styles.formRow}>
              <span className={styles.label}>Word colour</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                {(themePreview?.palette ?? []).map((c, i) => (
                  <button key={i}
                    onClick={() => set({ letterColour: c })}
                    title={c}
                    className={`${styles.wordColour} ${(knotworkSettings.letterColour || themePreview?.fg) === c ? styles.wordColourActive : ''}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className={styles.formRow}>
              <span className={styles.label}>Word colour only</span>
              <Toggle value={knotworkSettings.letterColourExclusive} onChange={v => set({ letterColourExclusive: v })} title="Keep this colour only on the word's strands, or let the rest of the fill use it too" />
            </div>
          </>
        )}
      </Section>
    </div>

    <div className={styles.fillBar}>
      <button
        className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
        onClick={onKnotworkFill}
        disabled={!canKnotworkFill}
        title="Generate a new design (keeps the seed when a word is set)"
      >▶ Generate Meander</button>
      <button
        className={styles.actionBtn}
        onClick={onKnotworkRecolour}
        disabled={!canKnotworkRecolour}
        title="Reassign colours to the current design without changing its layout"
      >Recolour</button>
    </div>
    </>
  );
}
