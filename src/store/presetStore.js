import { create } from 'zustand';
import { FILLS_BY_ID } from '../modes/gridBuilder/fills';

// The user's own presets (4.23): a design saved by name — its settings,
// palette and (Meander, Linework) plates — kept between sessions and shared
// by every document of its mode. Shown as thumbnails in the Presets panel.
//
// preset = { id, mode, name, fields: { docField: value }, packSeed?, thumb, createdAt }

const KEY = 'mps-presets';

// The document fields a preset keeps, by mode. Images aren't kept.
const COMMON = ['gridSettings', 'shapeColors', 'paletteKey', 'bgColors', 'canvasBg', 'colorMode',
  'gradientSettings', 'meshSettings', 'colorTempShift', 'blendMode'];
const BY_MODE = {
  gridBuilder: ['activeFill', 'maxScale', 'scaleFreq', 'fillOpacity', 'shapeStroke', 'enabledAssetIds', 'activeLayoutId'],
  knotwork: ['knotworkSettings'],
  linework: ['lineworkSettings'],
};

// The fields to save from a document's state.
export function presetFields(mode, state) {
  const keys = [...COMMON, ...BY_MODE[mode]];
  // Grid Pattern: the chosen fill's own settings too.
  const fillKey = mode === 'gridBuilder' ? FILLS_BY_ID[state.activeFill]?.settingsKey : null;
  if (fillKey) keys.push(fillKey);
  const fields = {};
  for (const k of keys) {
    if (state[k] === undefined) continue;
    fields[k] = state[k] instanceof Set ? [...state[k]] : state[k];
  }
  return fields;
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export const usePresetStore = create((set, get) => {
  const save = (presets) => {
    set({ presets });
    try {
      localStorage.setItem(KEY, JSON.stringify(presets));
    } catch {
      // Storage full: keep them for this session.
    }
  };
  return {
    presets: load(),
    addPreset(preset) {
      const p = { id: crypto.randomUUID(), createdAt: Date.now(), ...preset };
      save([...get().presets, p]);
      return p;
    },
    renamePreset(id, name) { save(get().presets.map(p => (p.id === id ? { ...p, name } : p))); },
    deletePreset(id) { save(get().presets.filter(p => p.id !== id)); },
  };
});
