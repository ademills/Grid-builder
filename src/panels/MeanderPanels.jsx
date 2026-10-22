import { PALETTES } from '../utils/colorize';
import { hashSeed } from '../utils/textSeed';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { useAppStore } from '../store/appStore';
import { Stepper } from './controls';
import styles from './Panel.module.css';
import { meanderCornerSettings } from '../utils/knotworkCompose';

// Strand corner radii (see meanderCornerSettings): end caps as a share of
// a full semicircle, bends as a share of the cell. While linked, the outer
// bend follows the inner one plus the strand width, so bends keep an even
// thickness; dragging either slider moves both.
function CornerControls({ settings, onChange }) {
  const { capRoundness, innerRadius, outerRadius, bendLinked } = meanderCornerSettings(settings);
  const width = settings.strandWidthRatio;
  const outer = bendLinked ? innerRadius + width : outerRadius;
  const pct = v => `${Math.round(v * 100)}%`;
  const slider = (label, value, max, set, title) => (
    <div className={styles.formRow} title={title}>
      <span className={styles.label}>{label}</span>
      <div className={styles.sliderRow}>
        <input type="range" className={styles.slider} min={0} max={max} step={0.01} value={value}
          onChange={e => set(+e.target.value)} />
        <span className={styles.sliderVal}>{pct(value)}</span>
      </div>
    </div>
  );
  // Every change writes all four fields, so a pre-v1.4.1 document's single
  // roundness is replaced by the equivalent explicit values on first edit.
  const commit = patch => onChange({ capRoundness, innerRadius, outerRadius: outer, bendLinked, ...patch });
  return (
    <>
      {slider('End caps', capRoundness, 1, v => commit({ capRoundness: v }), '100% = semicircle, 0% = square')}
      {slider('Inner bend', innerRadius, 1, v => commit(bendLinked ? { innerRadius: v, outerRadius: v + width } : { innerRadius: v }), 'Radius on the inside of each bend, as a share of the cell')}
      {slider('Outer bend', outer, 2, v => commit(bendLinked ? { innerRadius: Math.max(0, v - width), outerRadius: Math.max(v, width) } : { outerRadius: v }), 'Radius on the outside of each bend, as a share of the cell')}
      <div className={styles.formRow}>
        <span className={styles.label}>Link bends</span>
        <button
          className={`${styles.modeBtn} ${bendLinked ? styles.modeBtnActive : ''}`}
          onClick={() => commit({ bendLinked: !bendLinked })}
          title="Keep outer = inner + strand width, so bends stay an even width"
        >{bendLinked ? 'On' : 'Off'}</button>
      </div>
    </>
  );
}

// Meander generator: walker, symmetry, strand shape, word seeding. Markup
// carried over from the original Meander sidebar.
export function MeanderPanel() {
  const { actions, status, knotworkThemeColors: themePreview } = useEditor();
  const [knotworkSettings, onKnotworkSettingsChange] = useDocSettings('knotworkSettings');
  const onKnotworkFill = actions.knotworkFill;
  const onKnotworkRecolour = actions.knotworkRecolour;
  const canKnotworkFill = status.canKnotworkFill;
  const canKnotworkRecolour = status.hasBlocks;

  return (
    <>
    <div className={styles.sectionContent}>
      <div className={styles.formRow}>
        <span className={styles.label}>Meander density</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.1} max={1} step={0.05}
            value={knotworkSettings.density}
            onChange={e => onKnotworkSettingsChange({ density: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(knotworkSettings.density * 100)}%</span>
        </div>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Straight bias</span>
        <Stepper value={knotworkSettings.straightBias} onChange={v => onKnotworkSettingsChange({ straightBias: v })} min={1} max={15} />
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Wall density</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={0.3} step={0.01}
            value={knotworkSettings.wallDensity}
            onChange={e => onKnotworkSettingsChange({ wallDensity: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(knotworkSettings.wallDensity * 100)}%</span>
        </div>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Symmetry</span>
        <select className={styles.select} value={knotworkSettings.symmetryMode}
          onChange={e => onKnotworkSettingsChange({ symmetryMode: e.target.value })}>
          <option value="none">None</option>
          <option value="mirror-x">Mirror X</option>
          <option value="mirror-y">Mirror Y</option>
          <option value="mirror-both">Mirror Both</option>
          <option value="rotate2">Rotate 2</option>
          <option value="rotate4">Rotate 4</option>
          <option value="kaleidoscope">Kaleidoscope</option>
        </select>
      </div>

      {knotworkSettings.symmetryMode === 'kaleidoscope' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Kaleidoscope fold</span>
          <Stepper value={knotworkSettings.kaleidoscopeFold} onChange={v => onKnotworkSettingsChange({ kaleidoscopeFold: v })} min={2} max={12} />
        </div>
      )}

      <div className={styles.formRow}>
        <span className={styles.label}>Strand width</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.3} max={1} step={0.02}
            value={knotworkSettings.strandWidthRatio}
            onChange={e => onKnotworkSettingsChange({ strandWidthRatio: +e.target.value })} />
          <span className={styles.sliderVal}>{knotworkSettings.strandWidthRatio.toFixed(2)}</span>
        </div>
      </div>

      <CornerControls settings={knotworkSettings} onChange={onKnotworkSettingsChange} />

      <div className={styles.formRow}>
        <span className={styles.label}>Width jitter</span>
        <div className={styles.sliderRow}>
          <input type="range" className={`${styles.slider} ${styles.sliderDisabled}`} min={0} max={1} step={0.05} disabled title="Coming back soon"
            value={knotworkSettings.widthJitter}
            onChange={e => onKnotworkSettingsChange({ widthJitter: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(knotworkSettings.widthJitter * 100)}%</span>
        </div>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Tension</span>
        <div className={styles.sliderRow}>
          <input type="range" className={`${styles.slider} ${styles.sliderDisabled}`} min={0} max={1} step={0.05} disabled title="Coming back soon"
            value={knotworkSettings.tension}
            onChange={e => onKnotworkSettingsChange({ tension: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(knotworkSettings.tension * 100)}%</span>
        </div>
      </div>


      <div className={styles.formRow}>
        <span className={styles.label}>Terminal dots</span>
        <button
          className={`${styles.modeBtn} ${knotworkSettings.showTerminalDots ? styles.modeBtnActive : ''}`}
          onClick={() => onKnotworkSettingsChange({ showTerminalDots: !knotworkSettings.showTerminalDots })}
        >{knotworkSettings.showTerminalDots ? 'On' : 'Off'}</button>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Name / word</span>
        <input type="text" className={styles.numberInput} style={{ flex: 1 }}
          placeholder="Type a word..."
          value={knotworkSettings.seedWord}
          onChange={e => {
            const seedWord = e.target.value;
            onKnotworkSettingsChange({ seedWord, seed: hashSeed(seedWord) });
          }} />
      </div>

      {knotworkSettings.seedWord && (
      <div className={styles.formRow}>
        <span className={styles.label}>Weave as letters</span>
        <button
          className={`${styles.modeBtn} ${knotworkSettings.weaveAsLetters ? styles.modeBtnActive : ''}`}
          onClick={() => onKnotworkSettingsChange({ weaveAsLetters: !knotworkSettings.weaveAsLetters })}
          title="Fill the word's letterforms first, then the rest of the grid as usual"
        >{knotworkSettings.weaveAsLetters ? 'On' : 'Off'}</button>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && (
      <div className={styles.formRow}>
        <span className={styles.label}>Layout</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'scatter', label: 'Scattered' },
            { key: 'line',    label: 'Line' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${knotworkSettings.letterLayout === key ? styles.modeBtnActive : ''}`}
              onClick={() => onKnotworkSettingsChange({ letterLayout: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && knotworkSettings.letterLayout === 'scatter' && (
      <div className={styles.formRow}>
        <span className={styles.label}>Random size</span>
        <button
          className={`${styles.modeBtn} ${knotworkSettings.letterRandomSize ? styles.modeBtnActive : ''}`}
          onClick={() => onKnotworkSettingsChange({ letterRandomSize: !knotworkSettings.letterRandomSize })}
          title="Each letter draws its own random size, or off for one shared size"
        >{knotworkSettings.letterRandomSize ? 'On' : 'Off'}</button>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && knotworkSettings.letterLayout === 'scatter' && (
      <div className={styles.formRow}>
        <span className={styles.label}>Random placement</span>
        <button
          className={`${styles.modeBtn} ${knotworkSettings.letterRandomPlacement ? styles.modeBtnActive : ''}`}
          onClick={() => onKnotworkSettingsChange({ letterRandomPlacement: !knotworkSettings.letterRandomPlacement })}
          title="Each letter lands on a random row, or off to centre them all on one row"
        >{knotworkSettings.letterRandomPlacement ? 'On' : 'Off'}</button>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && knotworkSettings.letterLayout === 'scatter' && (
      <div className={styles.formRow}>
        <span className={styles.label}>Alignment</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'left',   label: 'Left' },
            { key: 'center', label: 'Centre' },
            { key: 'right',  label: 'Right' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${knotworkSettings.letterAlign === key ? styles.modeBtnActive : ''}`}
              onClick={() => onKnotworkSettingsChange({ letterAlign: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && (
      <div className={styles.formRow}>
        <span className={styles.label}>Letter size</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.2} max={1} step={0.05}
            value={knotworkSettings.letterSize}
            onChange={e => onKnotworkSettingsChange({ letterSize: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(knotworkSettings.letterSize * 100)}%</span>
        </div>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && (
      <div className={styles.formRow}>
        <span className={styles.label}>Word colour</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {(themePreview?.palette ?? []).map((c, i) => (
            <button key={i}
              onClick={() => onKnotworkSettingsChange({ letterColour: c })}
              title={c}
              className={`${styles.wordColour} ${(knotworkSettings.letterColour || themePreview?.fg) === c ? styles.wordColourActive : ''}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
      )}

      {knotworkSettings.seedWord && knotworkSettings.weaveAsLetters && (
      <div className={styles.formRow}>
        <span className={styles.label}>Colour exclusive to word</span>
        <button
          className={`${styles.modeBtn} ${knotworkSettings.letterColourExclusive ? styles.modeBtnActive : ''}`}
          onClick={() => onKnotworkSettingsChange({ letterColourExclusive: !knotworkSettings.letterColourExclusive })}
          title="Keep this colour only on the word's strands, or let the rest of the fill use it too"
        >{knotworkSettings.letterColourExclusive ? 'On' : 'Off'}</button>
      </div>
      )}


      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.numberInput} style={{ flex: 1 }}
            value={knotworkSettings.seed}
            onChange={e => onKnotworkSettingsChange({ seed: +e.target.value || 0, seedWord: '' })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => onKnotworkSettingsChange({ seed: Math.floor(Math.random() * 0x80000000), seedWord: '' })}
          >⟳</button>
        </div>
      </div>
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

// Meander colour theme: which palette the strands cycle through, and the
// ink/paper pair it resolves to.
export function MeanderThemePanel() {
  const { actions, status, knotworkThemeColors } = useEditor();
  const [paletteKey] = useDocField('paletteKey');
  const showDockTab = useAppStore(s => s.showDockTab);
  return (
    <div className={styles.sectionContent}>
      <div className={styles.subHeading}>Theme</div>
      <button className={styles.paletteChooserBtn} onClick={() => showDockTab('colour', 'swatches')} title="Edit swatches or pick a library in the Swatches tab">
        <span className={styles.paletteChooserName}>{paletteKey}</span>
        <span className={styles.paletteChooserSwatches}>
          {(PALETTES[paletteKey] ?? knotworkThemeColors.palette).map((c, i) => (
            <span key={i} className={styles.paletteChooserSwatch} style={{ background: c }} />
          ))}
        </span>
        <span className={styles.paletteChooserArrow}>›</span>
      </button>
      <div className={styles.formRow} style={{ marginTop: 10 }}>
        <span className={styles.label}>Ink / paper</span>
        <div className={styles.sliderRow}>
          <span className={styles.swatchInline} style={{ background: knotworkThemeColors.fg }} />
          <span className={styles.swatchInline} style={{ background: knotworkThemeColors.bg }} />
          <span className={styles.gridNote} style={{ margin: 0 }}>first palette colour on the canvas colour</span>
        </div>
      </div>
      <button className={styles.actionBtn} style={{ width: '100%', marginTop: 6 }}
        onClick={actions.knotworkRecolour} disabled={!status.hasBlocks}
        title="Reassign colours to the current design without changing its layout">
        Shuffle colours
      </button>
    </div>
  );
}
