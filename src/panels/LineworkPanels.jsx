import { useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { SettingsForm } from './schema';
import { LINEWORK_PRESETS } from '../modes/linework/settings';
import { LINEWORK_GRID_SCHEMA, LINEWORK_LAYER_SCHEMA } from '../modes/linework/schema';
import { DiceIcon } from '../shell/icons';
import styles from './Panel.module.css';

// Design settings: the document's grid and lines, then the layer being
// edited — the base or a plate (picked in the Layers panel, where plates
// are added and reordered, or the control bar). Every change rebuilds the
// design at once, keeping each layer's edits. Drawn from the Linework
// schemas, which the control bar also uses.
export function LineworkPanel() {
  const { linework, actions, gridComputed } = useEditor();
  const [preset, setPreset] = useState('');
  const s = linework.settings;
  const set = (changes) => linework.update(changes);
  const L = s.layers.find(l => l.id === linework.editLayer) ?? s.layers[0];
  const setLayer = (changes) => linework.update(prev => ({
    ...prev, layers: prev.layers.map(l => (l.id === L.id ? { ...l, ...changes } : l)),
  }));
  const ctx = {
    plate: L.id !== 'base',
    tiling: s.tiling ?? 'square',
    layers: s.layers,
    layerCount: s.layers.length,
    setEditLayer: linework.setEditLayer,
    maxCells: Math.max(4, gridComputed?.cols ?? 20, gridComputed?.rows ?? 20),
    grid: linework.diamondCells ? { w: linework.diamondCells, h: linework.diamondCells } : { w: gridComputed?.cols ?? 1, h: gridComputed?.rows ?? 1 },
    diamondCells: linework.diamondCells,
    word: s.word,
    setWord: w => set({ word: { ...s.word, ...w } }),
  };

  return (
    <>
      <div className={styles.sectionContent}>
        <div className={styles.formRow}>
          <span className={styles.label}>Preset</span>
          <select className={styles.select} value={preset}
            onChange={e => { if (e.target.value) actions.lineworkPreset(e.target.value); setPreset(''); }}>
            <option value="">Load a preset…</option>
            {LINEWORK_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <SettingsForm schema={LINEWORK_GRID_SCHEMA} values={s} set={set} ctx={ctx} />
        <SettingsForm schema={LINEWORK_LAYER_SCHEMA} values={L} set={setLayer} ctx={ctx} />
      </div>

      <div className={styles.fillBar}>
        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={actions.lineworkReseed}
          title="New seeds for every layer">▶ New Design</button>
        <button className={styles.actionBtn} onClick={actions.lineworkSurprise} title="Random preset colours, design and seeds">
          <DiceIcon size={14} /> Surprise
        </button>
      </div>
    </>
  );
}
