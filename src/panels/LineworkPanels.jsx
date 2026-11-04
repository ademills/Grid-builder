import { useState } from 'react';
import { useEditor } from '../editor/EditorContext';
import { SettingsForm } from './schema';
import { LINEWORK_PRESETS, updateLayers, differingKeys } from '../modes/linework/settings';
import { LINEWORK_LAYER_SCHEMA, layerFieldLabels } from '../modes/linework/schema';
import styles from './Panel.module.css';

// The layer being edited — the base or a plate (picked in the Layers panel,
// where plates are added and reordered, or the control bar). Every change
// rebuilds the design at once, keeping each layer's edits. The document's
// grid and lines are in Properties. Drawn from LINEWORK_LAYER_SCHEMA, which
// the control bar also uses.
export function LineworkPanel() {
  const { linework, actions, gridComputed } = useEditor();
  const [preset, setPreset] = useState('');
  const s = linework.settings;
  const L = s.layers.find(l => l.id === linework.editLayer) ?? s.layers[0];
  // Plates edited together (Ctrl+click in Layers): a change goes to all of them.
  const ids = linework.editLayers?.length ? linework.editLayers : [L.id];
  const setLayer = (changes) => linework.update(prev => updateLayers(prev, ids, changes));
  const labels = layerFieldLabels();
  const mixed = ids.length > 1
    ? differingKeys(s.layers.filter(l => ids.includes(l.id)), Object.keys(labels)).map(k => labels[k]) : [];
  const ctx = {
    plate: L.id !== 'base',
    groundSplit: !!s.groundSwatch,
    tiling: s.tiling ?? 'square',
    layers: s.layers,
    layerCount: s.layers.length,
    setEditLayer: linework.setEditLayer,
    maxCells: Math.max(4, gridComputed?.cols ?? 20, gridComputed?.rows ?? 20),
    grid: linework.diamondCells ? { w: linework.diamondCells, h: linework.diamondCells } : { w: gridComputed?.cols ?? 1, h: gridComputed?.rows ?? 1 },
    diamondCells: linework.diamondCells,
    word: s.word,
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
        {ids.length > 1 && (
          <div className={styles.gridNote}>
            Editing {ids.length} plates: {s.layers.filter(l => ids.includes(l.id)).map(l => l.name).join(', ')}. A change sets it on all of them; the values shown are {L.name}’s.
            {mixed.length > 0 && <> Different now: {mixed.slice(0, 8).join(', ')}{mixed.length > 8 ? ' and more' : ''}.</>}
          </div>
        )}
        <SettingsForm schema={LINEWORK_LAYER_SCHEMA} values={L} set={setLayer} ctx={ctx} />
      </div>
    </>
  );
}
