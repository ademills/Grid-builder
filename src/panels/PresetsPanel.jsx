import { useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { usePresetStore } from '../store/presetStore';
import { LINEWORK_PRESETS } from '../modes/linework/settings';
import styles from './Panel.module.css';

// Presets (4.23): the designs you've saved for this mode, as thumbnails.
// Click one to apply it (one undo step); double-click its name to rename.
// Linework's built-in presets are listed too.
export function PresetsPanel() {
  const { mode, actions } = useEditor();
  const presets = usePresetStore(s => s.presets).filter(p => p.mode === mode);
  const { renamePreset, deletePreset } = usePresetStore.getState();
  const [renaming, setRenaming] = useState(null);

  return (
    <div className={styles.sectionContent}>
      <div className={styles.actionBtns} style={{ marginBottom: 8 }}>
        <button className={styles.actionBtn} onClick={actions.savePreset} title="Save this design's settings and colours as a preset">
          Save design as preset…
        </button>
      </div>
      {!presets.length && (
        <div className={styles.gridNote}>Presets you save show here, for every {mode === 'gridBuilder' ? 'Grid Pattern' : mode === 'knotwork' ? 'Meander' : 'Linework'} document.</div>
      )}
      <div className={styles.presetGrid}>
        {presets.map(p => (
          <div key={p.id} className={styles.presetItem}>
            <button className={styles.presetThumb} onClick={() => actions.applyPreset(p)} title={`Apply “${p.name}”`}>
              {p.thumb ? <img src={p.thumb} alt="" /> : <span>{p.name.slice(0, 1)}</span>}
            </button>
            {renaming === p.id ? (
              <input className={styles.hexInput} style={{ fontFamily: 'inherit', width: '100%' }} autoFocus defaultValue={p.name}
                onBlur={e => { if (e.target.value.trim()) renamePreset(p.id, e.target.value.trim()); setRenaming(null); }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
            ) : (
              <span className={styles.presetName} onDoubleClick={() => setRenaming(p.id)} title="Double-click to rename">{p.name}</span>
            )}
            <button className={styles.presetDelete} onClick={() => { if (confirm(`Delete the preset “${p.name}”?`)) deletePreset(p.id); }} title="Delete preset">✕</button>
          </div>
        ))}
      </div>
      {mode === 'linework' && (
        <>
          <div className={styles.subHeading}>Built in</div>
          <div className={styles.tagChipsInline}>
            {LINEWORK_PRESETS.map(p => (
              <button key={p.name} className={styles.addQuickBtn} onClick={() => actions.lineworkPreset(p.name)}>{p.name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
