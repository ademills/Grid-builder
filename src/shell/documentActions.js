import { useDocumentStore } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { serializeProject, parseProject, fileNameFromPath } from '../store/projectFormat';
import { forgetDocSetters } from '../store/useDocField';
import { forgetDocHistory } from '../hooks/useHistory';
import { pickAndReadProject, readProjectAt, writeProject, isTauri } from './fileIO';

// File-level actions shared by the menu bar, tab bar, home screen and
// keyboard shortcuts. They read the stores directly so they can be called
// from anywhere without threading props.

const docs = () => useDocumentStore.getState();
const app = () => useAppStore.getState();

// `state` overrides document defaults (e.g. a palette from the home screen).
export function newDocument(mode, { presetKey, state } = {}) {
  return docs().createDocument(mode, { state: { ...(presetKey ? { presetKey } : {}), ...state } });
}

function openParsed(text, path, fileName) {
  const { mode, name, state } = parseProject(text);
  return docs().createDocument(mode, {
    state,
    name: name || fileNameFromPath(fileName || path || 'Untitled'),
    filePath: path,
  });
}

function alreadyOpen(path) {
  if (!path) return null;
  const { docs: all, order } = docs();
  return order.find(id => all[id].filePath === path) ?? null;
}

// Opens project text that's already been read (e.g. a dropped file).
export function openProjectText(text, { path = null, fileName } = {}) {
  const existing = alreadyOpen(path);
  if (existing) { docs().setActive(existing); return existing; }
  try {
    const id = openParsed(text, path, fileName);
    rememberRecent(id);
    return id;
  } catch (err) {
    app().showToast(`Could not open ${fileName ?? 'project'}: ${err.message ?? err}`);
    return null;
  }
}

export async function openDocument() {
  try {
    const picked = await pickAndReadProject();
    if (!picked) return null;
    const existing = alreadyOpen(picked.path);
    if (existing) { docs().setActive(existing); return existing; }
    const id = openParsed(picked.text, picked.path, picked.fileName);
    rememberRecent(id);
    return id;
  } catch (err) {
    alert(`Could not open project.\n\n${err.message ?? err}`);
    return null;
  }
}

export async function openRecent(entry) {
  const existing = alreadyOpen(entry.path);
  if (existing) { docs().setActive(existing); return existing; }
  try {
    const text = await readProjectAt(entry.path);
    const id = openParsed(text, entry.path, entry.path);
    rememberRecent(id, entry.thumbnail);
    return id;
  } catch (err) {
    if (confirm(`Could not open "${entry.name}".\n\n${err.message ?? err}\n\nRemove it from recent files?`)) {
      app().removeRecentFile(entry.path);
    }
    return null;
  }
}

function rememberRecent(id, thumbnail) {
  const doc = docs().docs[id];
  if (!doc?.filePath || !isTauri) return;
  app().addRecentFile({ path: doc.filePath, name: doc.name, mode: doc.mode, thumbnail: thumbnail ?? null });
}

// Resolves to true when the document was written, false if cancelled/failed.
export async function saveDocument(id = docs().activeId, { saveAs = false } = {}) {
  const doc = docs().docs[id];
  if (!doc) return false;
  try {
    const path = await writeProject(serializeProject(doc), {
      path: saveAs ? null : doc.filePath,
      suggestedName: doc.name,
    });
    if (path === null) return false;
    const name = path ? fileNameFromPath(path) : doc.name;
    docs().markSaved(id, { filePath: path || doc.filePath, name });
    app().showToast(`Saved ${name}`);

    // Recent-file thumbnail comes from the mounted editor, so only the
    // active document gets a fresh one.
    if (path && isTauri) {
      let thumbnail = app().recentFiles.find(r => r.path === path)?.thumbnail ?? null;
      if (id === docs().activeId) {
        try { thumbnail = await app().editorCommands?.buildThumbnail?.() ?? thumbnail; } catch { /* keep old */ }
      }
      app().addRecentFile({ path, name, mode: doc.mode, thumbnail });
    }
    return true;
  } catch (err) {
    alert(`Save failed.\n\n${err.message ?? err}`);
    return false;
  }
}

// Closes a tab, asking to save first when it has unsaved changes.
// Resolves to true when the tab was closed.
export async function closeDocument(id = docs().activeId) {
  const doc = docs().docs[id];
  if (!doc) return false;
  if (doc.dirty) {
    docs().setActive(id);
    const choice = await app().ask('unsaved', { docName: doc.name });
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDocument(id))) return false;
  }
  docs().closeDocument(id);
  forgetDocSetters(id);
  forgetDocHistory(id);
  return true;
}

export function dirtyDocuments() {
  const { docs: all, order } = docs();
  return order.map(id => all[id]).filter(d => d.dirty);
}

export function cycleTab(step) {
  const { order, activeId, setActive } = docs();
  if (!order.length) return;
  const idx = order.indexOf(activeId);
  setActive(order[(idx + step + order.length) % order.length]);
}
