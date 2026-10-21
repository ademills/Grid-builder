import { save as tauriSaveDialog, open as tauriOpenDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { PROJECT_EXTENSION } from '../store/projectFormat';

// Tauri 2 always injects __TAURI_INTERNALS__; the __TAURI__ global only
// exists when app.withGlobalTauri is on, which this app doesn't use.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Generic binary open/save, used for swatch files (.ase / .gpl / .json).
// filters = [{ name, extensions: ['ase', …] }]

export async function pickAndReadBinary({ title, filters }) {
  if (isTauri) {
    const path = await tauriOpenDialog({ title, multiple: false, directory: false, filters });
    if (!path) return null;
    const bytes = await readFile(path);
    return { buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), fileName: path.split(/[\\/]/).pop() };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = filters.flatMap(f => f.extensions.map(e => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { buffer: await file.arrayBuffer(), fileName: file.name } : null);
    };
    input.click();
  });
}

// data: Uint8Array or string. Resolves true when written / downloaded.
export async function saveBinary(data, { title, defaultName, filters, mime = 'application/octet-stream' }) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  if (isTauri) {
    const path = await tauriSaveDialog({ title, defaultPath: defaultName, filters });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = defaultName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

const PROJECT_FILTERS = [
  { name: 'Mills Pattern Studio Project', extensions: ['json'] },
];

// Prompts for a project file. Resolves to { text, path } or null if
// cancelled. In the browser there's no real path, so `path` is null and
// the next Save will ask where to save.
export async function pickAndReadProject() {
  if (isTauri) {
    const path = await tauriOpenDialog({ title: 'Open Project', multiple: false, directory: false, filters: PROJECT_FILTERS });
    if (!path) return null;
    return { text: await readTextFile(path), path, fileName: path };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      resolve({ text: await file.text(), path: null, fileName: file.name });
    };
    // Some browsers never fire change on cancel; a later open just replaces this.
    input.click();
  });
}

export async function readProjectAt(path) {
  return readTextFile(path);
}

// Writes project JSON. With a path, saves in place; without one, asks where.
// Resolves to the saved path, '' for a browser download, or null if cancelled.
export async function writeProject(text, { path, suggestedName }) {
  const defaultName = `${(suggestedName || 'Untitled').replace(/[\\/:*?"<>|]/g, '-')}.${PROJECT_EXTENSION}`;
  if (isTauri) {
    let target = path;
    if (!target) {
      target = await tauriSaveDialog({ title: 'Save Project', defaultPath: defaultName, filters: PROJECT_FILTERS });
      if (!target) return null;
    }
    await writeTextFile(target, text);
    return target;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = defaultName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return '';
}
