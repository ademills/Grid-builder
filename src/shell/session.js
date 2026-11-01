import { create } from 'zustand';
import {
  BaseDirectory, mkdir, readDir, readTextFile, writeTextFile, remove, exists,
} from '@tauri-apps/plugin-fs';
import { useDocumentStore } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { serializeProject, parseProject } from '../store/projectFormat';
import { readProjectAt, isTauri } from './fileIO';
import { recordError } from './diagnostics';

// Session restore and crash recovery.
//
// Every open document that has something worth keeping (unsaved changes, or
// never saved at all) is autosaved to the app's data folder every two
// minutes, plus a small session file listing the open tabs. Quitting writes
// both one last time and marks the session clean. On launch the tabs come
// back as they were: saved documents are re-read from their files, the rest
// from their autosaves (still marked unsaved). If the last session didn't
// close cleanly, a toast says the documents were recovered.
//
// Autosaves that no open tab owns (e.g. a session file that was lost) are
// offered on the home screen for seven days, then deleted.

export const AUTOSAVE_MS = 2 * 60 * 1000;
const ORPHAN_DAYS = 7;
const DIR = 'autosave';
const SESSION = 'session.json';

// ---- storage: the app data folder natively, localStorage in a browser ----

const LS = 'mps:';
const opts = { baseDir: BaseDirectory.AppData };
let dirReady = null;

const store = isTauri ? {
  async read(name) {
    if (!(await exists(name, opts))) return null;
    return readTextFile(name, opts);
  },
  async write(name, text) {
    dirReady ??= mkdir(DIR, { ...opts, recursive: true });
    await dirReady;
    await writeTextFile(name, text, opts);
  },
  async remove(name) {
    if (await exists(name, opts)) await remove(name, opts);
  },
  async list() {
    if (!(await exists(DIR, opts))) return [];
    return (await readDir(DIR, opts)).filter(e => e.isFile && e.name.endsWith('.json')).map(e => `${DIR}/${e.name}`);
  },
} : {
  async read(name) { try { return localStorage.getItem(LS + name); } catch { return null; } },
  async write(name, text) { localStorage.setItem(LS + name, text); },
  async remove(name) { try { localStorage.removeItem(LS + name); } catch { /* ignore */ } },
  async list() {
    try { return Object.keys(localStorage).filter(k => k.startsWith(`${LS}${DIR}/`)).map(k => k.slice(LS.length)); } catch { return []; }
  },
};

const docFile = id => `${DIR}/${id}.json`;

// ---- autosave ------------------------------------------------------------

// The doc.state object each autosave was written from. setField replaces
// the state object on every change, so a different reference means there's
// something new to write.
const written = new Map();
let lastSession = '';
let running = false;

// A document needs its content kept when closing the app would lose it.
const needsContent = doc => doc.dirty || !doc.filePath;

function sessionData(clean) {
  const { docs, order, activeId } = useDocumentStore.getState();
  return {
    version: 1,
    clean,
    activeId,
    order,
    docs: Object.fromEntries(order.map(id => {
      const d = docs[id];
      return [id, { mode: d.mode, name: d.name, filePath: d.filePath, dirty: d.dirty }];
    })),
  };
}

async function writeDoc(doc) {
  written.set(doc.id, doc.state);
  await store.write(docFile(doc.id), JSON.stringify({
    id: doc.id, mode: doc.mode, name: doc.name, filePath: doc.filePath, dirty: doc.dirty,
    at: Date.now(), project: serializeProject(doc),
  }));
}

// Writes what changed. With contentChanged false (a tab opened, closed or
// was saved), only content that has never been autosaved is written, so a
// new tab is covered straight away without rewriting the others.
async function writeChanges({ clean, contentChanged }) {
  const { docs, order } = useDocumentStore.getState();
  for (const id of order) {
    const doc = docs[id];
    if (needsContent(doc)) {
      const due = contentChanged ? written.get(id) !== doc.state : !written.has(id);
      if (due) await writeDoc(doc);
    } else if (written.has(id)) {
      // Saved to its file since the last autosave: the file is the copy now.
      written.delete(id);
      await store.remove(docFile(id));
    }
  }
  const session = JSON.stringify(sessionData(clean));
  if (session !== lastSession) {
    await store.write(SESSION, session);
    lastSession = session;
  }
}

// Saves run one after another, so the interval, a tab change and quitting
// never write the same files at once.
let queue = Promise.resolve();
function save({ clean = false, contentChanged = true } = {}) {
  const run = queue.then(() => writeChanges({ clean, contentChanged }));
  queue = run.catch(() => {});
  return run;
}

function safely(promise) {
  return promise.catch(err => recordError(err, 'autosave'));
}

// Called before the window closes. Throws if anything couldn't be written,
// so the caller can fall back to asking about unsaved changes.
export async function flushSession() {
  await save({ clean: true });
}

// ---- restore -------------------------------------------------------------

async function readAutosave(id) {
  const text = await store.read(docFile(id));
  return text ? JSON.parse(text) : null;
}

async function restoreDoc(id, meta) {
  const { createDocument } = useDocumentStore.getState();
  if (meta.filePath && !meta.dirty) {
    try {
      const { mode, state } = parseProject(await readProjectAt(meta.filePath));
      return createDocument(mode, { id, state, name: meta.name, filePath: meta.filePath });
    } catch { /* file moved or unreadable — fall back to the autosave */ }
  }
  const saved = await readAutosave(id);
  if (!saved) return null;
  const { mode, state } = parseProject(saved.project);
  const docId = createDocument(mode, { id, state, name: meta.name, filePath: meta.filePath, dirty: meta.dirty });
  written.set(docId, useDocumentStore.getState().docs[docId].state);
  return docId;
}

// Autosaves that no restored tab owns, offered on the home screen.
export const useRecoveryStore = create(set => ({
  items: [],
  setItems: items => set({ items }),
  drop: id => set(s => ({ items: s.items.filter(i => i.id !== id) })),
}));

async function collectOrphans(restored) {
  const items = [];
  for (const name of await store.list()) {
    const id = name.slice(DIR.length + 1, -'.json'.length);
    if (restored.has(id)) continue;
    let saved = null;
    try { saved = JSON.parse(await store.read(name)); } catch { /* unreadable */ }
    if (!saved || Date.now() - saved.at > ORPHAN_DAYS * 86400000) { await store.remove(name); continue; }
    items.push({ id, mode: saved.mode, name: saved.name, at: saved.at });
  }
  useRecoveryStore.getState().setItems(items.sort((a, b) => b.at - a.at));
}

export async function openRecovered(id) {
  try {
    const saved = await readAutosave(id);
    if (!saved) throw new Error('The autosave is no longer there.');
    const { mode, state } = parseProject(saved.project);
    const docs = useDocumentStore.getState();
    const docId = docs.createDocument(mode, { id: docs.docs[id] ? undefined : id, state, name: saved.name, filePath: saved.filePath, dirty: true });
    if (docId !== id) await store.remove(docFile(id));
    useRecoveryStore.getState().drop(id);
  } catch (err) {
    useAppStore.getState().showToast(`Could not recover this document: ${err.message ?? err}`);
  }
}

export async function discardRecovered(id) {
  await safely(store.remove(docFile(id)));
  useRecoveryStore.getState().drop(id);
}

async function restore() {
  let session = null;
  try { session = JSON.parse((await store.read(SESSION)) ?? 'null'); } catch { /* corrupt: start fresh */ }
  const restored = new Set();
  if (session?.order?.length) {
    for (const id of session.order) {
      const meta = session.docs?.[id];
      if (!meta) continue;
      try {
        const docId = await restoreDoc(id, meta);
        if (docId) restored.add(docId);
      } catch (err) { recordError(err, `restore ${meta.name}`); }
    }
    const docs = useDocumentStore.getState();
    if (session.activeId && docs.docs[session.activeId]) docs.setActive(session.activeId);
    else if (!session.activeId) docs.showHome();
    if (!session.clean && restored.size) {
      useAppStore.getState().showToast(`Recovered ${restored.size} ${restored.size === 1 ? 'document' : 'documents'} after an unexpected exit`);
    }
  }
  await collectOrphans(restored);
}

// ---- lifecycle -----------------------------------------------------------

let started = false;

// Restores the last session, then keeps autosaving. Safe to call twice
// (React StrictMode); only the first call does anything.
export function startSession() {
  if (started) return;
  started = true;
  safely((async () => {
    await restore();
    running = true;
    await save();
  })());

  setInterval(() => { if (running) safely(save()); }, AUTOSAVE_MS);

  // Tabs opening, closing, reordering or being saved update the session
  // file straight away; their content waits for the next interval.
  let prev = useDocumentStore.getState();
  useDocumentStore.subscribe(next => {
    if (!running) { prev = next; return; }
    const structural = next.order !== prev.order || next.activeId !== prev.activeId
      || next.order.some(id => {
        const a = next.docs[id], b = prev.docs[id];
        return !b || a.name !== b.name || a.filePath !== b.filePath || a.dirty !== b.dirty;
      });
    for (const id of prev.order) {
      if (!next.docs[id]) { written.delete(id); safely(store.remove(docFile(id))); }
    }
    prev = next;
    if (structural) safely(save({ contentChanged: false }));
  });
}
