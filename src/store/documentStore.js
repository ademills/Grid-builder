import { create } from 'zustand';
import { createDefaultDocState, NON_DIRTY_FIELDS, MODES } from './docDefaults';
import { PRESETS, getValidCols, snapCols } from '../gridPresets';

// Open documents (one per tab) plus which one is active.
//
// docs[id] = { id, mode, name, filePath, dirty, state }
// `state` is the per-document field bag from createDefaultDocState(); the
// editor reads/writes it field-by-field through useDocField().

let untitledCounter = { gridBuilder: 0, knotwork: 0, linework: 0 };

// Mirrors the validCols snapping in DocumentEditor (same column ceilings).
function snapGridCols(state, mode) {
  const preset = PRESETS.find(p => p.key === state.presetKey);
  const workArea = state.presetKey === 'custom' || !preset ? state.customSize : preset;
  const valid = getValidCols(workArea, state.gridSettings.borderPct, mode === 'knotwork' ? 160 : 80);
  const cols = snapCols(valid, state.gridSettings.cols);
  return cols === state.gridSettings.cols ? state.gridSettings : { ...state.gridSettings, cols };
}

export const useDocumentStore = create((set, get) => ({
  docs: {},
  order: [],
  activeId: null,

  // overrides: { id?, state?, name?, filePath?, dirty?, fresh? }. A restored
  // tab keeps its id (autosaves are keyed by it) and its unsaved flag. A
  // fresh document (File › New) generates a first design when it opens.
  createDocument(mode, overrides = {}) {
    untitledCounter[mode] = (untitledCounter[mode] ?? 0) + 1;
    // Restored "Untitled Grid 3" moves the count on, so new tabs don't repeat it.
    const n = overrides.name?.match(new RegExp(`^Untitled ${MODES[mode].shortLabel} (\\d+)$`))?.[1];
    if (n) untitledCounter[mode] = Math.max(untitledCounter[mode], +n);
    const id = overrides.id && !get().docs[overrides.id] ? overrides.id : crypto.randomUUID();
    const state = { ...createDefaultDocState(mode), ...(overrides.state ?? {}) };
    // A new document starts on a column count that fits its artboard. One
    // opened or restored keeps its own count, so its design doesn't move.
    if (!overrides.state) state.gridSettings = snapGridCols(state, mode);
    const doc = {
      id, mode,
      name: overrides.name ?? `Untitled ${MODES[mode].shortLabel} ${untitledCounter[mode]}`,
      filePath: overrides.filePath ?? null,
      dirty: !!overrides.dirty,
      fresh: !!overrides.fresh,
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

  // A fresh document's first design is in: it's no longer fresh, and the
  // design it opened with doesn't count as an unsaved change.
  settleFresh(id) {
    set(s => (s.docs[id] ? { docs: { ...s.docs, [id]: { ...s.docs[id], fresh: false, dirty: false } } } : s));
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
