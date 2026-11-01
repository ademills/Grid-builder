import pkg from '../../package.json';
import { useDocumentStore } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { saveBinary, isTauri } from './fileIO';

// Help › Export Diagnostics: a plain-text report of the app version, the
// open documents (sizes and settings only, no artwork) and the most recent
// errors. Written to a file you choose; nothing is ever sent anywhere.

const MAX_ERRORS = 50;
const errors = [];

export function recordError(error, context = '') {
  const e = error instanceof Error ? error : new Error(String(error?.message ?? error));
  errors.push({ at: new Date().toISOString(), context, message: e.message, stack: e.stack ?? '' });
  if (errors.length > MAX_ERRORS) errors.shift();
}

export function installErrorLog() {
  window.addEventListener('error', (e) => recordError(e.error ?? e.message, 'window'));
  window.addEventListener('unhandledrejection', (e) => recordError(e.reason, 'promise'));
}

function describeDoc(doc) {
  const s = doc.state;
  return {
    mode: doc.mode,
    name: doc.name,
    saved: !!doc.filePath,
    unsaved: doc.dirty,
    artboard: s.presetKey === 'custom' ? s.customSize : s.presetKey,
    cols: s.gridSettings?.cols,
    blocks: s.placedBlocks?.length ?? 0,
    activeFill: s.activeFill,
    effects: Object.entries(s.effects ?? {}).filter(([, v]) => v?.enabled).map(([k]) => k),
  };
}

export function diagnosticsReport() {
  const { docs, order } = useDocumentStore.getState();
  const app = useAppStore.getState();
  const lines = [
    `Mills Pattern Studio ${pkg.version}`,
    `Generated ${new Date().toISOString()}`,
    `Runtime: ${isTauri ? 'desktop app' : 'browser'} · ${navigator.userAgent}`,
    `Screen: ${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}x`,
    `Panel layout: ${app.dock?.layout ?? 'unknown'}`,
    '',
    `Open documents (${order.length}):`,
    ...order.map(id => `  ${JSON.stringify(describeDoc(docs[id]))}`),
    '',
    `Recent errors (${errors.length}):`,
    ...(errors.length ? errors.flatMap(e => [`  [${e.at}] ${e.context}: ${e.message}`, ...e.stack.split('\n').slice(1, 8).map(l => `      ${l.trim()}`)]) : ['  none']),
  ];
  return lines.join('\n') + '\n';
}

export async function exportDiagnostics() {
  const stamp = new Date().toISOString().slice(0, 10);
  const ok = await saveBinary(diagnosticsReport(), {
    title: 'Export Diagnostics',
    defaultName: `mills-pattern-studio-diagnostics-${stamp}.txt`,
    filters: [{ name: 'Text', extensions: ['txt'] }],
    mime: 'text/plain',
  });
  if (ok) useAppStore.getState().showToast('Diagnostics exported');
}
