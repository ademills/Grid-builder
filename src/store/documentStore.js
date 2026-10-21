import { create } from 'zustand';
import { createDefaultDocState, NON_DIRTY_FIELDS, MODES } from './docDefaults';
import { PRESETS, getValidCols } from '../gridPresets';

// Open documents (one per tab) plus which one is active.
//
// docs[id] = { id, mode, name, filePath, dirty, state }
// `state` is the per-document field bag from createDefaultDocState(); the
// editor reads/writes it field-by-field through useDocField().

let untitledCounter = { gridBuilder: 0, knotwork: 0 };

// Mirrors the validCols snapping in DocumentEditor (same column ceilings).
function snapGridCols(state, mode) {
  const preset = PRESETS.find(p => p.key === state.presetKey);
  const workArea = state.presetKey === 'custom' || !preset ? state.customSize : preset;
  const valid = getValidCols(workArea, state.gridSettings.borderPct, mode === 'knotwork' ? 160 : 80);
  const cols = state.gridSettings.cols;
  if (!valid || valid.includes(cols)) return state.gridSettings;
  const nearest = valid.reduce((a, b) => (Math.abs(b - cols) < Math.abs(a - cols) ? b : a));
  return { ...state.gridSettings, cols: nearest };
}

export const useDocumentStore = create((set, get) => ({
  docs: {},
  order: [],
  activeId: null,

  createDocument(mode, overrides = {}) {
    untitledCounter[mode] = (untitledCounter[mode] ?? 0) + 1;
    const id = crypto.randomUUID();
    const state = { ...createDefaultDocState(mode), ...(overrides.state ?? {}) };
    // Snap the column count to one that tiles this artboard now, so the
    // editor's own snapping doesn't flag a brand-new document as modified.
    state.gridSettings = snapGridCols(state, mode);
    const doc = {
      id, mode,
      name: overrides.name ?? `Untitled ${MODES[mode].shortLabel} ${untitledCounter[mode]}`,
      filePath: overrides.filePath ?? null,
      dirty: false,
      state,
    };
    set(s => ({ docs: { ...s.docs, [id]: doc }, order: [...s.order, id], activeId: id }));
    return id;
  },

  closeDocument(id) {
    set(s => {
      if (!s.docs[id]) return s;
      const docs = { ...s.docs };
      delete docs[id];
      const idx = s.order.indexOf(id);
      const order = s.order.filter(x => x !== id);
      const activeId = s.activeId === id
        ? (order[Math.min(idx, order.length - 1)] ?? null)
        : s.activeId;
      return { docs, order, activeId };
    });
  },

  setActive(id) {
    if (get().docs[id]) set({ activeId: id });
  },

  // Show the home screen without closing any tabs.
  showHome() {
    set({ activeId: null });
  },

  moveDocument(id, toIndex) {
    set(s => {
      const order = s.order.filter(x => x !== id);
      order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, id);
      return { order };
    });
  },

  // `updater` is a value or a (prev) => next function, like a useState setter.
  setField(id, key, updater) {
    const doc = get().docs[id];
    if (!doc) return;
    const prev = doc.state[key];
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (Object.is(next, prev)) return;
    set(s => ({
      docs: {
        ...s.docs,
        [id]: {
          ...doc,
          dirty: doc.dirty || !NON_DIRTY_FIELDS.has(key),
          state: { ...doc.state, [key]: next },
        },
      },
    }));
  },

  markSaved(id, { filePath, name }) {
    set(s => {
      const doc = s.docs[id];
      if (!doc) return s;
      return { docs: { ...s.docs, [id]: { ...doc, dirty: false, savedAt: Date.now(), filePath: filePath ?? doc.filePath, name: name ?? doc.name } } };
    });
  },
}));

export const selectActiveDoc = s => (s.activeId ? s.docs[s.activeId] : null);
