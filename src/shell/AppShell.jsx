import { useEffect, useMemo } from 'react';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DocumentEditor } from '../DocumentEditor';
import { DocContext } from '../store/useDocField';
import { useDocumentStore, selectActiveDoc } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import {
  newDocument, openDocument, openRecent, saveDocument, closeDocument, dirtyDocuments, cycleTab,
} from './documentActions';
import { isTauri } from './fileIO';
import { MenuBar } from './MenuBar';
import { TabBar } from './TabBar';
import { ToolBar } from './ToolBar';
import { ControlBar } from './ControlBar';
import { StatusBar } from './StatusBar';
import { HomeScreen } from './HomeScreen';
import { PromptDialog } from './PromptDialog';
import styles from './Shell.module.css';

const isTypingTarget = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

function useUpdateCheck() {
  useEffect(() => {
    if (!isTauri) return;
    checkForUpdate().then(update => {
      if (!update) return;
      if (!confirm(`Version ${update.version} is available. Download and install now?`)) return;
      update.downloadAndInstall().then(relaunch);
    }).catch(() => {});
  }, []);
}

// Never lose unsaved work to the window's close button.
function useCloseGuard() {
  useEffect(() => {
    if (isTauri) {
      const win = getCurrentWindow();
      let unlisten;
      win.onCloseRequested(async (event) => {
        const dirty = dirtyDocuments();
        if (!dirty.length) return;
        event.preventDefault();
        const choice = await useAppStore.getState().ask('quit', { count: dirty.length });
        if (choice === 'quit') await win.destroy();
      }).then(fn => { unlisten = fn; });
      return () => unlisten?.();
    }
    const onBeforeUnload = (e) => {
      if (dirtyDocuments().length) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}

// App-wide shortcuts. Editing shortcuts (undo, nudge, delete) stay in the
// editor; anything here works from the home screen too where it makes sense.
function useShellShortcuts(activeId, activeMode) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (useAppStore.getState().prompt) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const cmds = useAppStore.getState().editorCommands;

      if (ctrl) {
        const handled = (() => {
          if (key === 'n') { e.shiftKey ? newDocument('knotwork') : newDocument('gridBuilder'); return true; }
          if (key === 'o') { openDocument(); return true; }
          if (key === 's' && activeId) { saveDocument(activeId, { saveAs: e.shiftKey }); return true; }
          if (key === 'w' && activeId) { closeDocument(activeId); return true; }
          if (key === 'tab') { cycleTab(e.shiftKey ? -1 : 1); return true; }
          if (key === 'e' && e.shiftKey && cmds && useAppStore.getState().editorStatus?.canExport) { cmds.openExport(); return true; }
          if (!cmds) return false;
          if (key === '=' || key === '+') { cmds.zoomIn(); return true; }
          if (key === '-') { cmds.zoomOut(); return true; }
          if (key === '0') { cmds.fitView(); return true; }
          if (key === '1') { cmds.setZoom(1); return true; }
          if (isTypingTarget(e.target)) return false;
          if (key === 'a') { e.shiftKey ? cmds.deselectAll() : cmds.selectAll(); return true; }
          return false;
        })();
        if (handled) e.preventDefault();
        return;
      }

      if (!activeId || isTypingTarget(e.target) || e.altKey) return;
      const tools = MODE_REGISTRY[activeMode].tools;
      const tool = tools.find(id => TOOLS[id]?.key.toLowerCase() === key);
      if (tool) { useAppStore.getState().setActiveTool(tool); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, activeMode]);
}

function useMenus(activeDoc) {
  const status = useAppStore(s => s.editorStatus);
  const cmds = useAppStore(s => s.editorCommands);
  const recentFiles = useAppStore(s => s.recentFiles);
  const hasDoc = !!activeDoc && !!cmds;
  const gridDoc = hasDoc && activeDoc?.mode === 'gridBuilder';
  const hasSel = gridDoc && (status?.selectedCount ?? 0) > 0;

  return useMemo(() => [
    {
      label: 'File',
      items: [
        { label: 'New Grid Pattern', shortcut: 'Ctrl+N', onClick: () => newDocument('gridBuilder') },
        { label: 'New Meander', shortcut: 'Ctrl+Shift+N', onClick: () => newDocument('knotwork') },
        'separator',
        { label: 'Open…', shortcut: 'Ctrl+O', onClick: openDocument },
        ...(recentFiles.length
          ? [{ heading: 'Open Recent' }, ...recentFiles.slice(0, 6).map(r => ({ label: r.name, onClick: () => openRecent(r) }))]
          : []),
        'separator',
        { label: 'Save', shortcut: 'Ctrl+S', disabled: !activeDoc, onClick: () => saveDocument(activeDoc.id) },
        { label: 'Save As…', shortcut: 'Ctrl+Shift+S', disabled: !activeDoc, onClick: () => saveDocument(activeDoc.id, { saveAs: true }) },
        'separator',
        { label: 'Export As…', shortcut: 'Ctrl+Shift+E', disabled: !hasDoc || !status?.canExport, onClick: () => cmds.openExport() },
        { label: 'Quick Export SVG…', disabled: !hasDoc || !status?.canExport, onClick: () => cmds.exportSvg() },
        'separator',
        { label: 'Close', shortcut: 'Ctrl+W', disabled: !activeDoc, onClick: () => closeDocument(activeDoc.id) },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !hasDoc || !status?.canUndo, onClick: () => cmds.undo() },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !hasDoc || !status?.canRedo, onClick: () => cmds.redo() },
        'separator',
        { label: 'Delete', shortcut: 'Del', disabled: !hasDoc || !status?.selectedCount, onClick: () => cmds.deleteSelection() },
      ],
    },
    {
      label: 'Object',
      items: [
        { label: 'Rotate 90° Clockwise', disabled: !hasSel, onClick: () => cmds.selection.rotate(true) },
        { label: 'Rotate 90° Anticlockwise', disabled: !hasSel, onClick: () => cmds.selection.rotate(false) },
        { label: 'Reflect Horizontal', disabled: !hasSel, onClick: () => cmds.selection.reflect(false) },
        { label: 'Reflect Vertical', disabled: !hasSel, onClick: () => cmds.selection.reflect(true) },
        'separator',
        { label: 'Paint with Current Colour', disabled: !hasSel, onClick: () => cmds.selection.paint() },
        { label: 'Unpin Colours', disabled: !hasSel, onClick: () => cmds.selection.unpin() },
        'separator',
        { label: 'Hide', disabled: !hasSel, onClick: () => cmds.selection.hide() },
        { label: 'Show All', disabled: !gridDoc, onClick: () => cmds.showAll() },
        { label: 'Lock', disabled: !hasSel, onClick: () => cmds.selection.lock() },
        { label: 'Unlock All', disabled: !gridDoc, onClick: () => cmds.unlockAll() },
      ],
    },
    {
      label: 'Select',
      items: [
        { label: 'All', shortcut: 'Ctrl+A', disabled: !hasDoc, onClick: () => cmds.selectAll() },
        { label: 'Deselect', shortcut: 'Ctrl+Shift+A', disabled: !hasDoc, onClick: () => cmds.deselectAll() },
        'separator',
        { label: 'Same Colour', disabled: !hasSel, onClick: () => cmds.selection.selectSameColour() },
        { label: 'Same Shape', disabled: !hasSel, onClick: () => cmds.selection.selectSameShape() },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: 'Ctrl++', disabled: !hasDoc, onClick: () => cmds.zoomIn() },
        { label: 'Zoom Out', shortcut: 'Ctrl+−', disabled: !hasDoc, onClick: () => cmds.zoomOut() },
        { label: 'Fit Artboard in Window', shortcut: 'Ctrl+0', disabled: !hasDoc, onClick: () => cmds.fitView() },
        { label: 'Actual Size', shortcut: 'Ctrl+1', disabled: !hasDoc, onClick: () => cmds.setZoom(1) },
      ],
    },
    {
      label: 'Window',
      items: [
        { label: 'Home', onClick: () => useDocumentStore.getState().showHome() },
        { label: 'Next Document', shortcut: 'Ctrl+Tab', onClick: () => cycleTab(1) },
        { label: 'Previous Document', shortcut: 'Ctrl+Shift+Tab', onClick: () => cycleTab(-1) },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: '?', disabled: !hasDoc, onClick: () => cmds.toggleShortcuts() },
      ],
    },
  ], [activeDoc, cmds, status, hasDoc, gridDoc, hasSel, recentFiles]);
}

export function AppShell() {
  const activeDoc = useDocumentStore(selectActiveDoc);
  // The editor only needs to remount when the document (not its state) changes.
  const activeId = activeDoc?.id ?? null;
  const activeMode = activeDoc?.mode ?? null;

  useUpdateCheck();
  useCloseGuard();
  useShellShortcuts(activeId, activeMode);
  const menus = useMenus(activeDoc);
  const selectedCount = useAppStore(s => s.editorStatus?.selectedCount ?? 0);

  // Each mode has its own tool set — fall back to Selection if the active
  // tool isn't available in the newly active document's mode.
  useEffect(() => {
    if (!activeMode) return;
    const { activeTool, setActiveTool } = useAppStore.getState();
    if (!MODE_REGISTRY[activeMode].tools.includes(activeTool)) setActiveTool('select');
  }, [activeMode]);

  return (
    <div className={styles.shell}>
      <MenuBar menus={menus} />
      <TabBar />
      {activeId ? (
        <DocContext.Provider value={activeId}>
          <ControlBar mode={activeMode} selectedCount={selectedCount} />
          <div className={styles.workspace}>
            <ToolBar mode={activeMode} />
            <main className={styles.stage}>
              <DocumentEditor key={activeId} mode={activeMode} />
            </main>
          </div>
        </DocContext.Provider>
      ) : (
        <>
          <div />
          <div className={styles.workspace}>
            <main className={styles.stage}><HomeScreen /></main>
          </div>
        </>
      )}
      <StatusBar doc={activeDoc} />
      <PromptDialog />
    </div>
  );
}
