import { create } from 'zustand';

const RECENT_KEY = 'mps-recent-files';
const RECENT_LIMIT = 12;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
}

function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
}

const DOCK_KEY = 'mps-dock';

function loadDock() {
  try { return { width: 300, groups: {}, ...JSON.parse(localStorage.getItem(DOCK_KEY) || '{}') }; }
  catch { return { width: 300, groups: {} }; }
}

function saveDock(dock) {
  try { localStorage.setItem(DOCK_KEY, JSON.stringify(dock)); } catch { /* storage full or blocked */ }
}

// App-level (not per-document) state: the active tool, recent files, dock
// layout, and the command bridge the menu bar / shortcuts use to reach the
// active editor.
export const useAppStore = create((set, get) => ({
  // Panel dock: width plus, per group id, { tab, collapsed }. Shared by all
  // documents (like Illustrator's workspace), persisted between sessions.
  dock: loadDock(),
  updateDockGroup(groupId, changes) {
    const dock = get().dock;
    const next = { ...dock, groups: { ...dock.groups, [groupId]: { ...dock.groups[groupId], ...changes } } };
    saveDock(next);
    set({ dock: next });
  },
  // Bring a panel to the front of its group and expand the group.
  showDockTab(groupId, tab) {
    get().updateDockGroup(groupId, { tab, collapsed: false });
  },
  setDockWidth(width) {
    const next = { ...get().dock, width: Math.round(Math.min(520, Math.max(240, width))) };
    saveDock(next);
    set({ dock: next });
  },

  activeTool: 'select',
  setActiveTool: (activeTool) => set({ activeTool }),
  // A tool held temporarily (Space → Hand) that wins over activeTool.
  toolOverride: null,
  setToolOverride: (toolOverride) => set({ toolOverride }),

  // Options for the tools, shown in the control bar.
  //   paintHex     — Paint Bucket colour (set by the Eyedropper or a swatch)
  //   bucketScope  — 'part' paints the clicked part; 'colour' every part of that colour in the shape
  //   wandMatch    — 'colour' | 'shape' | 'size'
  //   wandAdd      — add to the selection instead of replacing it
  //   stampAsset   — asset id to stamp, or 'random' (from the enabled shapes)
  toolOptions: { paintHex: '#7b61ff', bucketScope: 'part', wandMatch: 'colour', wandAdd: false, stampAsset: 'random' },
  setToolOption: (changes) => set({ toolOptions: { ...get().toolOptions, ...changes } }),

  // { path, name, mode, thumbnail, openedAt }[] — newest first
  recentFiles: loadRecent(),
  addRecentFile(entry) {
    const list = [
      { ...entry, openedAt: Date.now() },
      ...get().recentFiles.filter(r => r.path !== entry.path),
    ].slice(0, RECENT_LIMIT);
    saveRecent(list);
    set({ recentFiles: list });
  },
  removeRecentFile(path) {
    const list = get().recentFiles.filter(r => r.path !== path);
    saveRecent(list);
    set({ recentFiles: list });
  },

  // The mounted editor registers its commands here (undo, zoom, export…)
  // plus a small status summary for the status bar.
  editorCommands: null,
  editorStatus: null,
  setEditorBridge: (editorCommands, editorStatus) => set({ editorCommands, editorStatus }),

  // Modal prompt shown by the shell: { kind, ...data, resolve }.
  prompt: null,
  ask(kind, data = {}) {
    return new Promise(resolve => set({ prompt: { kind, ...data, resolve } }));
  },
  answer(value) {
    const p = get().prompt;
    set({ prompt: null });
    p?.resolve(value);
  },

  // Transient one-line message in the status bar (e.g. "Saved").
  toast: null,
  showToast(message) {
    const toast = { message, at: Date.now() };
    set({ toast });
    setTimeout(() => { if (get().toast === toast) set({ toast: null }); }, 2600);
  },
}));
