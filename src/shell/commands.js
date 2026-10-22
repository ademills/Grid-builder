import { useAppStore } from '../store/appStore';
import { useDocumentStore, selectActiveDoc } from '../store/documentStore';
import {
  newDocument, openDocument, saveDocument, closeDocument, cycleTab,
} from './documentActions';
import { pickAndReadBinary } from './fileIO';
import { importSwatchBuffer } from './fileDrop';

// Every command the app can run, in one place. The menu bar, keyboard
// shortcuts, right-click menu and panel ☰ menus all look commands up here by
// id, so a command's label, shortcut and enabled state are defined once.
//
// command = {
//   label,
//   shortcut?   — shown in menus and matched on keydown ('Ctrl+Shift+S')
//   keys?       — extra key combos that also run it (not shown)
//   inInputs?   — still fires while typing in a text field
//   enabled?(c) — c is the context from commandContext()
//   checked?(c) — shows a tick in menus
//   run(c)
// }

export function commandContext() {
  const app = useAppStore.getState();
  const activeDoc = selectActiveDoc(useDocumentStore.getState());
  const cmds = app.editorCommands;
  const status = app.editorStatus;
  const hasDoc = !!activeDoc && !!cmds;
  const gridDoc = hasDoc && activeDoc.mode === 'gridBuilder';
  return {
    app, activeDoc, cmds, status, hasDoc, gridDoc,
    hasSel: gridDoc && (status?.selectedCount ?? 0) > 0,
  };
}

const hasDoc = c => c.hasDoc;
const gridDoc = c => c.gridDoc;
const hasSel = c => c.hasSel;
const overlay = (id, label) => ({
  label,
  enabled: hasDoc,
  checked: c => c.app.overlays.includes(id),
  run: c => c.app.toggleOverlay(id),
});

export const COMMANDS = {
  // File
  'file.newGrid':   { label: 'New Grid Pattern', shortcut: 'Ctrl+N', inInputs: true, run: () => newDocument('gridBuilder') },
  'file.newMeander': { label: 'New Meander', shortcut: 'Ctrl+Shift+N', inInputs: true, run: () => newDocument('knotwork') },
  'file.open':      { label: 'Open…', shortcut: 'Ctrl+O', inInputs: true, run: () => openDocument() },
  'file.save':      { label: 'Save', shortcut: 'Ctrl+S', inInputs: true, enabled: c => !!c.activeDoc, run: c => saveDocument(c.activeDoc.id) },
  'file.saveAs':    { label: 'Save As…', shortcut: 'Ctrl+Shift+S', inInputs: true, enabled: c => !!c.activeDoc, run: c => saveDocument(c.activeDoc.id, { saveAs: true }) },
  'file.export':    { label: 'Export As…', shortcut: 'Ctrl+Shift+E', inInputs: true, enabled: c => c.hasDoc && !!c.status?.canExport, run: c => c.cmds.openExport() },
  'file.exportSvg': { label: 'Quick Export SVG…', enabled: c => c.hasDoc && !!c.status?.canExport, run: c => c.cmds.exportSvg() },
  'file.close':     { label: 'Close', shortcut: 'Ctrl+W', inInputs: true, enabled: c => !!c.activeDoc, run: c => closeDocument(c.activeDoc.id) },

  // Edit
  'edit.undo':      { label: 'Undo', shortcut: 'Ctrl+Z', enabled: c => c.hasDoc && !!c.status?.canUndo, run: c => c.cmds.undo() },
  'edit.redo':      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', keys: ['Ctrl+Y'], enabled: c => c.hasDoc && !!c.status?.canRedo, run: c => c.cmds.redo() },
  'edit.cut':       { label: 'Cut', shortcut: 'Ctrl+X', enabled: hasSel, run: c => c.cmds.clipboard.cut() },
  'edit.copy':      { label: 'Copy', shortcut: 'Ctrl+C', enabled: hasSel, run: c => c.cmds.clipboard.copy() },
  'edit.paste':     { label: 'Paste', shortcut: 'Ctrl+V', enabled: c => c.gridDoc && !!c.app.clipboard, run: c => c.cmds.clipboard.paste() },
  'edit.duplicate': { label: 'Duplicate', shortcut: 'Ctrl+D', enabled: hasSel, run: c => c.cmds.clipboard.duplicate() },
  'edit.delete':    { label: 'Delete', shortcut: 'Del', keys: ['Backspace'], enabled: hasSel, run: c => c.cmds.deleteSelection() },

  // Object
  'object.rotateCw':  { label: 'Rotate 90° Clockwise', enabled: hasSel, run: c => c.cmds.selection.rotate(true) },
  'object.rotateCcw': { label: 'Rotate 90° Anticlockwise', enabled: hasSel, run: c => c.cmds.selection.rotate(false) },
  'object.reflectH':  { label: 'Reflect Horizontal', enabled: hasSel, run: c => c.cmds.selection.reflect(false) },
  'object.reflectV':  { label: 'Reflect Vertical', enabled: hasSel, run: c => c.cmds.selection.reflect(true) },
  'object.group':     { label: 'Group', shortcut: 'Ctrl+G', enabled: hasSel, run: c => c.cmds.selection.group() },
  'object.ungroup':   { label: 'Ungroup', shortcut: 'Ctrl+Shift+G', enabled: hasSel, run: c => c.cmds.selection.ungroup() },
  'object.paint':     { label: 'Paint with Current Colour', enabled: hasSel, run: c => c.cmds.selection.paint() },
  'object.unpin':     { label: 'Unpin Colours', enabled: hasSel, run: c => c.cmds.selection.unpin() },
  'object.randomOpacity': { label: 'Random Opacity', enabled: hasSel, run: c => c.cmds.selection.randomOpacity() },
  'object.resetOpacity':  { label: 'Reset Opacity & Blend', enabled: hasSel, run: c => c.cmds.selection.resetAppearance() },
  'object.hide':      { label: 'Hide', enabled: hasSel, run: c => c.cmds.selection.hide() },
  'object.showAll':   { label: 'Show All', enabled: gridDoc, run: c => c.cmds.showAll() },
  'object.lock':      { label: 'Lock', enabled: hasSel, run: c => c.cmds.selection.lock() },
  'object.unlockAll': { label: 'Unlock All', enabled: gridDoc, run: c => c.cmds.unlockAll() },

  // Select
  'select.all':       { label: 'All', shortcut: 'Ctrl+A', enabled: hasDoc, run: c => c.cmds.selectAll() },
  'select.none':      { label: 'Deselect', shortcut: 'Ctrl+Shift+A', enabled: hasDoc, run: c => c.cmds.deselectAll() },
  'select.sameColour': { label: 'Same Colour', enabled: hasSel, run: c => c.cmds.selection.selectSameColour() },
  'select.sameShape': { label: 'Same Shape', enabled: hasSel, run: c => c.cmds.selection.selectSameShape() },

  // Generate
  'generate.fill':    { label: 'Fill', enabled: c => c.gridDoc && !!c.cmds.canFill, run: c => c.cmds.runActiveFill() },
  'generate.fillGaps': { label: 'Fill Gaps', enabled: c => c.gridDoc && !!c.cmds.canFillGaps, run: c => c.cmds.fillGaps() },
  'generate.surprise': { label: 'Surprise Me', shortcut: 'Ctrl+Shift+R', enabled: c => c.gridDoc && !!c.cmds.canFill, run: c => c.cmds.surpriseMe() },
  'generate.clear':   { label: 'Clear Canvas', enabled: c => c.gridDoc && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.clearCanvas() },
  'generate.flipH':   { label: 'Flip Layout Horizontally', enabled: c => c.gridDoc && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.flipLayout(false) },
  'generate.flipV':   { label: 'Flip Layout Vertically', enabled: c => c.gridDoc && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.flipLayout(true) },
  'generate.clearLayout': { label: 'Clear Layout', enabled: c => c.gridDoc && !!c.cmds.hasLayout, run: c => c.cmds.clearLayout() },

  // Colour
  'colour.shuffle':   { label: 'Shuffle Colours', enabled: c => c.gridDoc && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.shuffleColours() },
  'colour.importSwatches': { label: 'Import Swatch Library…', run: () => importSwatchLibrary() },
  'colour.saveSwatches': { label: 'Save Document Swatches as Library', enabled: hasDoc, run: c => c.cmds.saveSwatchesAsLibrary() },

  // Assets
  'assets.enableAll':  { label: 'Enable All Shapes', enabled: gridDoc, run: c => c.cmds.setAllAssets(true) },
  'assets.disableAll': { label: 'Disable All Shapes', enabled: gridDoc, run: c => c.cmds.setAllAssets(false) },
  'assets.enableUsed': { label: 'Enable Only Shapes in Use', enabled: c => c.gridDoc && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.enableUsedAssets() },

  // Meander
  'meander.fill':    { label: 'Generate', enabled: c => c.hasDoc && c.activeDoc.mode === 'knotwork', run: c => c.cmds.knotworkFill() },
  'meander.recolour': { label: 'Recolour Strands', enabled: c => c.hasDoc && c.activeDoc.mode === 'knotwork' && (c.status?.blockCount ?? 0) > 0, run: c => c.cmds.knotworkRecolour() },

  // View
  'view.zoomIn':   { label: 'Zoom In', shortcut: 'Ctrl++', keys: ['Ctrl+='], inInputs: true, enabled: hasDoc, run: c => c.cmds.zoomIn() },
  'view.zoomOut':  { label: 'Zoom Out', shortcut: 'Ctrl+−', keys: ['Ctrl+-'], inInputs: true, enabled: hasDoc, run: c => c.cmds.zoomOut() },
  'view.fit':      { label: 'Fit Artboard in Window', shortcut: 'Ctrl+0', inInputs: true, enabled: hasDoc, run: c => c.cmds.fitView() },
  'view.actual':   { label: 'Actual Size', shortcut: 'Ctrl+1', inInputs: true, enabled: hasDoc, run: c => c.cmds.setZoom(1) },
  'view.rulers':   { label: 'Rulers', shortcut: 'Ctrl+R', enabled: hasDoc, checked: c => c.app.showRulers, run: c => c.app.setShowRulers(!c.app.showRulers) },
  'view.guides':   { label: 'Guides', shortcut: 'Ctrl+;', enabled: hasDoc, checked: c => c.app.showGuides, run: c => c.app.setShowGuides(!c.app.showGuides) },
  'view.wheelZooms': { label: 'Scroll Wheel Zooms', checked: c => c.app.wheelZooms, run: c => c.app.setViewOption({ wheelZooms: !c.app.wheelZooms }) },
  'view.effects':  {
    label: 'Show Effects on Canvas', enabled: hasDoc,
    checked: c => !!c.activeDoc?.state.effects?.preview,
    run: c => useDocumentStore.getState().setField(c.activeDoc.id, 'effects', fx => ({ ...fx, preview: !fx.preview })),
  },
  'window.effects': { label: 'Effects', enabled: hasDoc, run: c => c.app.showDockTab('effects', 'effects') },
  'view.clearGuides': { label: 'Clear Guides', enabled: c => c.hasDoc && !!c.cmds.hasGuides, run: c => c.cmds.clearGuides() },
  'view.overlay.thirds':  overlay('thirds', 'Rule of Thirds'),
  'view.overlay.golden':  overlay('golden', 'Golden Ratio'),
  'view.overlay.centre':  overlay('centre', 'Centre Lines'),
  'view.overlay.ig45':    overlay('ig45', 'Instagram 4:5 Post'),
  'view.overlay.ig916':   overlay('ig916', 'Instagram 9:16 Story / Reel'),
  'view.overlay.none':    { label: 'Hide All Overlays', enabled: c => c.hasDoc && c.app.overlays.length > 0, run: c => c.app.setOverlays([]) },

  // Window & Help
  'window.home':    { label: 'Home', run: () => useDocumentStore.getState().showHome() },
  'window.next':    { label: 'Next Document', shortcut: 'Ctrl+Tab', inInputs: true, run: () => cycleTab(1) },
  'window.prev':    { label: 'Previous Document', shortcut: 'Ctrl+Shift+Tab', inInputs: true, run: () => cycleTab(-1) },
  'window.history':  { label: 'History', enabled: hasDoc, run: c => c.app.showDockTab('properties', 'history') },
  'window.resetDock': { label: 'Reset Panel Layout', run: c => c.app.resetDock() },
  'help.shortcuts': { label: 'Keyboard Shortcuts', shortcut: '?', enabled: hasDoc, run: c => c.cmds.toggleShortcuts() },
};

// Opens a swatch file and adds its libraries; resolves to how many were
// added. Lives here (not in the Swatches panel) so the panel menu can use it.
export async function importSwatchLibrary() {
  const picked = await pickAndReadBinary({ title: 'Import Swatches', filters: [{ name: 'Swatch files', extensions: ['ase', 'gpl', 'json'] }] });
  return picked ? importSwatchBuffer(picked.fileName, picked.buffer) : 0;
}

export function isEnabled(id, c = commandContext()) {
  const cmd = COMMANDS[id];
  return !!cmd && (cmd.enabled ? !!cmd.enabled(c) : true);
}

export function runCommand(id) {
  const c = commandContext();
  const cmd = COMMANDS[id];
  if (!cmd || !isEnabled(id, c)) return false;
  cmd.run(c);
  return true;
}

// Menu item for the MenuBar / panel menus from a command id. The context is
// read once per render by the caller and passed in.
export function menuItem(id, c, overrides = {}) {
  const cmd = COMMANDS[id];
  return {
    label: cmd.label,
    shortcut: cmd.shortcut,
    disabled: !isEnabled(id, c),
    checked: cmd.checked ? !!cmd.checked(c) : undefined,
    onClick: () => runCommand(id),
    ...overrides,
  };
}

// ── Keyboard matching ────────────────────────────────────────────────────────

const KEY_ALIASES = { del: 'delete', '−': '-', esc: 'escape' };

function parseCombo(combo) {
  const parts = combo.split('+');
  // 'Ctrl++' splits into ['Ctrl', '', ''] — the key is '+'.
  let key = parts.pop();
  if (key === '' && parts[parts.length - 1] === '') { parts.pop(); key = '+'; }
  const mods = new Set(parts.map(p => p.toLowerCase()));
  key = key.toLowerCase();
  return { ctrl: mods.has('ctrl'), shift: mods.has('shift'), alt: mods.has('alt'), key: KEY_ALIASES[key] ?? key };
}

const BINDINGS = Object.entries(COMMANDS).flatMap(([id, cmd]) =>
  [cmd.shortcut, ...(cmd.keys ?? [])].filter(Boolean).map(combo => ({ id, ...parseCombo(combo) })));

const isTypingTarget = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// Single printable symbols ('?', '+', ';') are matched without Shift, since
// typing them often needs Shift on one keyboard layout and not another.
const isSymbol = key => key.length === 1 && !/[a-z0-9]/.test(key);

// The command bound to a keydown event, or null.
export function commandForEvent(e) {
  const key = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  const typing = isTypingTarget(e.target);
  for (const b of BINDINGS) {
    if (b.key !== key || b.ctrl !== ctrl || b.alt !== e.altKey) continue;
    if (!isSymbol(b.key) && b.shift !== e.shiftKey) continue;
    if (typing && !COMMANDS[b.id].inInputs) continue;
    return b.id;
  }
  return null;
}
