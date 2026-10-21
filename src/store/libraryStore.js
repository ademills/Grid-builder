import { create } from 'zustand';

// The user's own swatch libraries, shared by every document and kept
// between sessions (app-local storage). Built-in palettes live in
// utils/colorize.js and are read-only.
//
// library = { id, name, swatches: [{ hex, name? }], createdAt }

const KEY = 'mps-swatch-libraries';
const LEGACY_KEY = 'gb-custom-palettes'; // { name, colors: [hex] }[] from before libraries

function load() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return JSON.parse(stored);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return legacy.map(p => ({
      id: crypto.randomUUID(),
      name: p.name,
      swatches: (p.colors ?? []).map(hex => ({ hex })),
      createdAt: Date.now(),
    }));
  } catch {
    return [];
  }
}

function persist(libraries) {
  try { localStorage.setItem(KEY, JSON.stringify(libraries)); } catch { /* storage full or blocked */ }
}

const uniqueName = (name, libraries, exceptId) => {
  const taken = new Set(libraries.filter(l => l.id !== exceptId).map(l => l.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
};

export const useLibraryStore = create((set, get) => {
  const commit = (libraries) => { persist(libraries); set({ libraries }); };
  return {
    libraries: load(),

    addLibrary(name, swatches) {
      const lib = { id: crypto.randomUUID(), name: uniqueName(name.trim() || 'Untitled', get().libraries), swatches, createdAt: Date.now() };
      commit([...get().libraries, lib]);
      return lib.id;
    },
    addLibraries(libs) {
      let all = get().libraries;
      for (const l of libs) {
        all = [...all, { id: crypto.randomUUID(), name: uniqueName(l.name.trim() || 'Imported', all), swatches: l.swatches, createdAt: Date.now() }];
      }
      commit(all);
    },
    renameLibrary(id, name) {
      const all = get().libraries;
      commit(all.map(l => (l.id === id ? { ...l, name: uniqueName(name.trim() || l.name, all, id) } : l)));
    },
    replaceSwatches(id, swatches) {
      commit(get().libraries.map(l => (l.id === id ? { ...l, swatches } : l)));
    },
    deleteLibrary(id) {
      commit(get().libraries.filter(l => l.id !== id));
    },
  };
});
