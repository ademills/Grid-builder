import { useEffect } from 'react';
import { check as checkForUpdate } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DocumentEditor } from '../DocumentEditor';
import { DocContext } from '../store/useDocField';
import { useDocumentStore, selectActiveDoc } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import { openRecent, dirtyDocuments } from './documentActions';
import { commandContext, commandForEvent, menuItem, runCommand } from './commands';
import { useFileDrop } from './fileDrop';
import { useSliderValueTyping } from '../panels/sliderTyping';
import { useSliderLabelScrub } from '../panels/scrub';
import { isTauri } from './fileIO';
import { startSession, flushSession } from './session';
import { startSeedHistory } from './seedHistory';
import { recordError } from './diagnostics';
import { DocumentErrorBoundary } from './DocumentErrorBoundary';
import { MenuBar } from './MenuBar';
import { TabBar } from './TabBar';
import { ToolBar } from './ToolBar';
import { ControlBar } from './ControlBar';
import { StatusBar } from './StatusBar';
import { HomeScreen } from './HomeScreen';
import { PromptDialog } from './PromptDialog';
import { CommandPalette } from './CommandPalette';
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

// Never lose unsaved work to the window's close button. In the desktop app
// quitting saves the session (open tabs and their unsaved changes come back
// next launch), so it only asks if that couldn't be written. Tauri waits for
// this handler before closing the window.
function useCloseGuard() {
  useEffect(() => {
    if (isTauri) {
      const win = getCurrentWindow();
      let unlisten;
      win.onCloseRequested(async (event) => {
        try {
          await flushSession();
          return;
        } catch (err) {
          recordError(err, 'saving the session on quit');
        }
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

// Keyboard shortcuts. Command shortcuts come from the registry
// (shell/commands.js); single-letter keys pick a tool in the active mode.
// The open document's mode colours the chrome: main buttons, active
// switches and segments, selections. Set on the page root so popovers and
// menus placed outside the shell follow too; the home screen keeps the
// defaults from index.css.
const ACCENT_VARS = ['--chrome-accent', '--chrome-accent-soft', '--chrome-accent-hover', '--chrome-on-accent'];
function useModeAccent(activeMode) {
  useEffect(() => {
    const root = document.documentElement.style;
    const def = MODE_REGISTRY[activeMode];
    if (!def?.accent) { ACCENT_VARS.forEach(v => root.removeProperty(v)); return; }
    const a = def.accent;
    root.setProperty('--chrome-accent', a);
    root.setProperty('--chrome-accent-soft', `color-mix(in srgb, ${a} 18%, transparent)`);
    root.setProperty('--chrome-accent-hover', `color-mix(in srgb, ${a} 82%, white)`);
    root.setProperty('--chrome-on-accent', def.onAccent ?? '#fff');
  }, [activeMode]);
}

function useShellShortcuts(activeId, activeMode) {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (useAppStore.getState().prompt) return;
      const id = commandForEvent(e);
      if (id) {
        if (runCommand(id)) e.preventDefault();
        else if (e.ctrlKey || e.metaKey) e.preventDefault(); // e.g. Ctrl+S with nothing open
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (!activeId || isTypingTarget(e.target) || e.altKey) return;
      const key = e.key.toLowerCase();
      const tools = MODE_REGISTRY[activeMode].tools;
      const tool = tools.find(t => TOOLS[t]?.key.toLowerCase() === key);
      if (tool) { useAppStore.getState().setActiveTool(tool); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeId, activeMode]);
}

// Menu structure: command ids, 'separator', or { heading }.
const MENUS = [
  { label: 'File', items: ['file.newGrid', 'file.newMeander', 'file.newLinework', 'separator', 'file.open', 'recent', 'separator',
    'file.save', 'file.saveAs', 'file.saveCopy', 'file.duplicate', 'separator', 'file.export', 'file.exportSvg', 'separator',
    'file.close', 'file.closeOthers'] },
  { label: 'Edit', items: ['edit.undo', 'edit.redo', 'separator', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.duplicate',
    'separator', 'edit.delete'] },
  { label: 'Object', items: ['object.group', 'object.ungroup', 'separator',
    'object.rotateCw', 'object.rotateCcw', 'object.reflectH', 'object.reflectV', 'separator',
    'object.paint', 'object.unpin', 'object.randomOpacity', 'object.resetOpacity', 'separator',
    'object.hide', 'object.showAll', 'object.lock', 'object.unlockAll'] },
  { label: 'Select', items: ['select.all', 'select.none', 'separator', 'select.sameColour', 'select.sameShape'] },
  { label: 'Generate', items: ['generate.fill', 'generate.fillGaps', 'generate.surprise', 'separator',
    'generate.flipH', 'generate.flipV', 'generate.clearLayout', 'generate.clear', 'separator',
    'meander.fill', 'meander.recolour'] },
  { label: 'View', items: ['view.zoomIn', 'view.zoomOut', 'view.fit', 'view.actual', 'view.wheelZooms', 'separator',
    'view.grid', 'view.rulers', 'view.guides', 'view.clearGuides', 'view.effects', 'separator', { heading: 'Overlays' },
    'view.overlay.thirds', 'view.overlay.golden', 'view.overlay.centre', 'view.overlay.ig45', 'view.overlay.ig916',
    'view.overlay.none', 'separator', { heading: 'Pasteboard' },
    'view.pasteboard.dark', 'view.pasteboard.grey', 'view.pasteboard.light'] },
  { label: 'Window', items: ['app.palette', 'separator', 'window.home', 'window.next', 'window.prev', 'separator', 'window.history', 'window.effects', 'separator', 'window.resetDock'] },
  { label: 'Help', items: ['help.shortcuts', 'separator', 'help.diagnostics'] },
];

function useMenus() {
  // Re-render whenever anything a command's enabled/checked state reads changes.
  useAppStore(s => s.editorStatus);
  useAppStore(s => s.editorCommands);
  useAppStore(s => s.clipboard);
  useAppStore(s => s.overlays);
  useAppStore(s => s.showRulers);
  useAppStore(s => s.showGuides);
  useAppStore(s => s.showGrid);
  useAppStore(s => s.wheelZooms);
  useAppStore(s => s.pasteboard);
  useDocumentStore(selectActiveDoc);
  const recentFiles = useAppStore(s => s.recentFiles);

  const c = commandContext();
  return MENUS.map(menu => ({
    label: menu.label,
    items: menu.items.flatMap(item => {
      if (item === 'separator' || typeof item === 'object') return [item];
      if (item === 'recent') {
        return recentFiles.length
          ? [{ heading: 'Open Recent' }, ...recentFiles.slice(0, 6).map(r => ({ label: r.name, onClick: () => openRecent(r) }))]
          : [];
      }
      return [menuItem(item, c)];
    }),
  }));
}

// Window title follows the active document, with a dot for unsaved changes.
function useWindowTitle(activeDoc) {
  const title = activeDoc ? `${activeDoc.name}${activeDoc.dirty ? ' •' : ''} — Mills Pattern Studio` : 'Mills Pattern Studio';
  useEffect(() => {
    document.title = title;
    if (isTauri) getCurrentWindow().setTitle(title).catch(() => {});
  }, [title]);
}

export function AppShell() {
  const activeDoc = useDocumentStore(selectActiveDoc);
  // The editor only needs to remount when the document (not its state) changes.
  const activeId = activeDoc?.id ?? null;
  const activeMode = activeDoc?.mode ?? null;

  useEffect(startSession, []);
  useEffect(startSeedHistory, []);
  useUpdateCheck();
  useCloseGuard();
  useSliderValueTyping();
  useSliderLabelScrub();
  useShellShortcuts(activeId, activeMode);
  useModeAccent(activeMode);
  const menus = useMenus();
  useWindowTitle(activeDoc);
  const dropping = useFileDrop();
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
              <DocumentErrorBoundary key={activeId} docId={activeId} docName={activeDoc.name}>
                <DocumentEditor mode={activeMode} />
              </DocumentErrorBoundary>
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
      <CommandPalette />
      {dropping && <div className={styles.dropOverlay}><span>Drop to open</span></div>}
    </div>
  );
}
