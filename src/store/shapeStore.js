import { create } from 'zustand';

// The user's own shapes (imported SVGs, 5.1) and shape packs (5.3), shared by
// every document and kept between sessions (app-local storage), like the
// swatch libraries (libraryStore.js).
//
// shape = { id: 'user::<uuid>', name, cols, rows, svgContent, tags: [], createdAt }
// pack  = { id, name, assetIds: [] } — a named set of shapes (built-in or
//         user) that a document can switch on in one go.
// Built-in shapes can carry tags too: builtinTags[assetId] = [tag].

const KEY = 'mps-user-shapes';

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    return { shapes: stored?.shapes ?? [], packs: stored?.packs ?? [], builtinTags: stored?.builtinTags ?? {} };
  } catch {
    return { shapes: [], packs: [], builtinTags: {} };
  }
}

function persist({ shapes, packs, builtinTags }) {
  try { localStorage.setItem(KEY, JSON.stringify({ shapes, packs, builtinTags })); } catch { /* storage full or blocked */ }
}

export const isUserShape = id => typeof id === 'string' && id.startsWith('user::');

const cleanTags = tags => [...new Set((tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean))];

export const useShapeStore = create((set, get) => {
  const save = (changes) => {
    set(changes);
    persist(get());
  };
  return {
    ...load(),

    // shape: { name, cols, rows, svgContent, tags? } → the stored shape.
    addShape(shape) {
      const s = { id: `user::${crypto.randomUUID()}`, createdAt: Date.now(), ...shape, tags: cleanTags(shape.tags) };
      save({ shapes: [...get().shapes, s] });
      return s;
    },
    updateShape(id, changes) {
      save({ shapes: get().shapes.map(s => (s.id === id ? { ...s, ...changes, ...(changes.tags ? { tags: cleanTags(changes.tags) } : {}) } : s)) });
    },
    deleteShape(id) {
      save({
        shapes: get().shapes.filter(s => s.id !== id),
        packs: get().packs.map(p => ({ ...p, assetIds: p.assetIds.filter(a => a !== id) })),
      });
    },
    // Shapes a project file brought with it, added if this machine lacks them.
    adoptShapes(byId) {
      const have = new Set(get().shapes.map(s => s.id));
      const added = Object.entries(byId ?? {}).filter(([id]) => isUserShape(id) && !have.has(id))
        .map(([id, s]) => ({ tags: [], createdAt: Date.now(), ...s, id }));
      if (added.length) save({ shapes: [...get().shapes, ...added] });
    },

    // Tags on any shape, built-in or user.
    setTags(id, tags) {
      if (isUserShape(id)) get().updateShape(id, { tags });
      else save({ builtinTags: { ...get().builtinTags, [id]: cleanTags(tags) } });
    },

    addPack(name, assetIds = []) {
      const pack = { id: crypto.randomUUID(), name, assetIds: [...new Set(assetIds)] };
      save({ packs: [...get().packs, pack] });
      return pack;
    },
    updatePack(id, changes) {
      save({ packs: get().packs.map(p => (p.id === id ? { ...p, ...changes } : p)) });
    },
    deletePack(id) {
      save({ packs: get().packs.filter(p => p.id !== id) });
    },
  };
});
