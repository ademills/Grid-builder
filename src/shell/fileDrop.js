import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { readFile } from '@tauri-apps/plugin-fs';
import { useAppStore } from '../store/appStore';
import { useDocumentStore } from '../store/documentStore';
import { useLibraryStore } from '../store/libraryStore';
import { parseSwatchFile } from '../utils/swatchFiles';
import { isTauri } from './fileIO';
import { newDocument, openProjectText } from './documentActions';

// Files dropped onto the window:
//   project (.json)        → opens in a new tab
//   image                  → reference image of the active document (Image panel)
//   swatches (.ase / .gpl) → added to the swatch libraries
//   .svg                   → not supported yet (custom shape import is planned)

const IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

const app = () => useAppStore.getState();
const extOf = name => (name.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase();

// Adds the libraries in a swatch file. Returns how many were added.
export function importSwatchBuffer(fileName, buffer) {
  let libs;
  try {
    libs = parseSwatchFile(fileName, buffer).filter(l => l.swatches.length);
  } catch (err) {
    app().showToast(`Could not read swatches from ${fileName}: ${err.message ?? err}`);
    return 0;
  }
  if (!libs.length) { app().showToast(`No swatches found in ${fileName}`); return 0; }
  const base = fileName.replace(/\.[^.]+$/, '');
  useLibraryStore.getState().addLibraries(libs.map(l => ({ ...l, name: libs.length === 1 && /^Imported/.test(l.name) ? base : l.name })));
  app().showToast(`Imported ${libs.length} swatch ${libs.length === 1 ? 'library' : 'libraries'} from ${fileName}`);
  return libs.length;
}

function bytesToDataUrl(bytes, mime) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes], { type: mime }));
  });
}

// One dropped file: { name, path (desktop only), read: () => ArrayBuffer }.
async function handleFile(file) {
  const ext = extOf(file.name);

  if (ext === 'svg') {
    app().showToast('SVG files can’t be imported as shapes yet');
    return;
  }

  if (IMAGE_TYPES[ext]) {
    const docs = useDocumentStore.getState();
    const id = docs.activeId ?? newDocument('gridBuilder');
    const src = await bytesToDataUrl(await file.read(), IMAGE_TYPES[ext]);
    useDocumentStore.getState().setField(id, 'backdropSrc', src);
    app().showDockTab('image', 'image');
    app().showToast(`${file.name} set as the reference image`);
    return;
  }

  if (ext === 'ase' || ext === 'gpl') {
    importSwatchBuffer(file.name, await file.read());
    return;
  }

  if (ext === 'json') {
    const buffer = await file.read();
    const text = new TextDecoder().decode(buffer);
    // A .json can be a project or a swatch library.
    let isProject = false;
    try { isProject = JSON.parse(text)?.version != null; } catch { /* reported below */ }
    if (isProject) openProjectText(text, { path: file.path ?? null, fileName: file.name });
    else importSwatchBuffer(file.name, buffer);
    return;
  }

  app().showToast(`Can’t open ${file.name}`);
}

async function handleFiles(files) {
  for (const f of files) {
    try {
      await handleFile(f);
    } catch (err) {
      app().showToast(`Could not open ${f.name}: ${err.message ?? err}`);
    }
  }
}

// Listens for files dragged onto the window. Returns true while a drag is
// over it (the shell shows a drop overlay).
export function useFileDrop() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (isTauri) {
      // The desktop window intercepts file drags itself and reports paths.
      let unlisten;
      let cancelled = false;
      getCurrentWebview().onDragDropEvent(({ payload }) => {
        if (payload.type === 'enter' || payload.type === 'over') setOver(true);
        else if (payload.type === 'leave') setOver(false);
        else if (payload.type === 'drop') {
          setOver(false);
          handleFiles(payload.paths.map(path => ({
            name: path.split(/[\\/]/).pop(),
            path,
            read: async () => {
              const bytes = await readFile(path);
              return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            },
          })));
        }
      }).then(fn => { if (cancelled) fn(); else unlisten = fn; });
      return () => { cancelled = true; unlisten?.(); };
    }

    // Browser: only react to files, so dragging swatches between panels
    // still works normally.
    const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files');
    let depth = 0;
    const onEnter = (e) => { if (!hasFiles(e)) return; depth++; setOver(true); };
    const onLeave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setOver(false); };
    const onOver = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const onDrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      handleFiles([...e.dataTransfer.files].map(f => ({ name: f.name, read: () => f.arrayBuffer() })));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return over;
}
