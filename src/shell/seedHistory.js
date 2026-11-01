import { create } from 'zustand';
import { useDocumentStore } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { FILLS_BY_ID } from '../modes/gridBuilder/fills';

// Seed history: the last dozen designs per document, so a good result is
// one click away after rerolling past it. Every seed change is recorded,
// whatever made it (the seed field, Generate, Surprise Me, a new Linework
// seed), with a thumbnail taken once the design has been drawn. Kept for
// the session only; restoring puts the seeds back and the design regenerates.

const MAX = 12;
const THUMB_DELAY = 1200;

// What identifies the current design's seeds in each mode, or null when
// there's no design yet or the mode has no seed (e.g. Grid Pattern's
// Standard fill).
function seedsOf(doc) {
  const s = doc.state;
  if (!s.placedBlocks?.length) return null;
  if (doc.mode === 'gridBuilder') {
    const fill = FILLS_BY_ID[s.activeFill];
    const seed = fill?.settingsKey ? s[fill.settingsKey]?.seed : undefined;
    return seed === undefined ? null : { fill: fill.id, label: fill.label, seed };
  }
  if (doc.mode === 'knotwork') return { seed: s.knotworkSettings?.seed ?? 0 };
  if (doc.mode === 'linework') {
    const layers = s.lineworkSettings?.layers ?? [];
    return layers.length ? { seed: layers[0].seed ?? 0, layers: layers.map(l => [l.id ?? 'base', l.seed ?? 0]) } : null;
  }
  return null;
}

const sigOf = v => (v ? JSON.stringify(v) : null);

export const useSeedHistory = create(() => ({ byDoc: {} }));

function update(docId, fn) {
  useSeedHistory.setState(s => ({ byDoc: { ...s.byDoc, [docId]: fn(s.byDoc[docId] ?? []) } }));
}

function record(doc, seeds) {
  const sig = sigOf(seeds);
  update(doc.id, list => [{ sig, seeds, at: Date.now(), thumb: list.find(e => e.sig === sig)?.thumb ?? null },
    ...list.filter(e => e.sig !== sig)].slice(0, MAX));
  setTimeout(async () => {
    const { activeId, docs } = useDocumentStore.getState();
    const now = docs[doc.id];
    if (activeId !== doc.id || !now || sigOf(seedsOf(now)) !== sig) return;
    let thumb = null;
    try { thumb = await useAppStore.getState().editorCommands?.buildThumbnail?.(96); } catch { return; }
    if (thumb) update(doc.id, list => list.map(e => (e.sig === sig ? { ...e, thumb } : e)));
  }, THUMB_DELAY);
}

// Puts an entry's seeds back on the document.
export function restoreSeeds(docId, entry) {
  const store = useDocumentStore.getState();
  const doc = store.docs[docId];
  if (!doc) return;
  const { seeds } = entry;
  if (doc.mode === 'gridBuilder') {
    const fill = FILLS_BY_ID[seeds.fill];
    if (!fill?.settingsKey) return;
    if (doc.state.activeFill !== fill.id) store.setField(docId, 'activeFill', fill.id);
    store.setField(docId, fill.settingsKey, s => ({ ...s, seed: seeds.seed }));
  } else if (doc.mode === 'knotwork') {
    store.setField(docId, 'knotworkSettings', s => ({ ...s, seed: seeds.seed }));
  } else if (doc.mode === 'linework') {
    const byId = new Map(seeds.layers);
    store.setField(docId, 'lineworkSettings', s => ({
      ...s, layers: s.layers.map(l => (byId.has(l.id ?? 'base') ? { ...l, seed: byId.get(l.id ?? 'base') } : l)),
    }));
  }
}

let started = false;
export function startSeedHistory() {
  if (started) return;
  started = true;
  const last = new Map();
  const scan = ({ docs, order }) => {
    for (const id of order) {
      const seeds = seedsOf(docs[id]);
      const sig = sigOf(seeds);
      if (last.get(id) === sig) continue;
      last.set(id, sig);
      if (seeds) record(docs[id], seeds);
    }
    for (const id of last.keys()) {
      if (!docs[id]) { last.delete(id); update(id, () => []); }
    }
  };
  scan(useDocumentStore.getState());
  useDocumentStore.subscribe(scan);
}
