import { useState } from 'react';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useDocumentStore } from '../store/documentStore';
import { useAppStore } from '../store/appStore';
import { MODE_REGISTRY } from '../modes/registry';
import {
  closeDocument, closeOtherDocuments, closeDocumentsToRight, duplicateDocument, saveCopy,
} from './documentActions';
import { isTauri } from './fileIO';
import { ContextMenu } from '../components/ContextMenu';
import { CloseIcon, HomeIcon, PlusIcon } from './icons';
import styles from './Shell.module.css';

function copyPath(path) {
  navigator.clipboard.writeText(path)
    .then(() => useAppStore.getState().showToast('Path copied'))
    .catch(() => useAppStore.getState().showToast('Could not copy the path'));
}

// Right-click menu for a tab.
function tabMenuItems(id, order, doc) {
  const last = order.indexOf(id) === order.length - 1;
  return [
    { label: 'Close', shortcut: 'Ctrl+W', action: () => closeDocument(id) },
    { label: 'Close Others', action: () => closeOtherDocuments(id), disabled: order.length < 2 },
    { label: 'Close to the Right', action: () => closeDocumentsToRight(id), disabled: last },
    null,
    { label: 'Duplicate', action: () => duplicateDocument(id) },
    { label: 'Save a Copy…', action: () => saveCopy(id) },
    null,
    { label: 'Reveal in Explorer', action: () => revealItemInDir(doc.filePath).catch(() => {}), disabled: !doc.filePath || !isTauri },
    { label: 'Copy Path', action: () => copyPath(doc.filePath), disabled: !doc.filePath },
  ];
}

export function TabBar() {
  const order = useDocumentStore(s => s.order);
  const docs = useDocumentStore(s => s.docs);
  const activeId = useDocumentStore(s => s.activeId);
  const setActive = useDocumentStore(s => s.setActive);
  const showHome = useDocumentStore(s => s.showHome);
  const moveDocument = useDocumentStore(s => s.moveDocument);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [menu, setMenu] = useState(null); // { id, x, y }

  return (
    <div className={styles.tabBar} role="tablist">
      <button
        className={`${styles.homeTab} ${activeId === null ? styles.homeTabActive : ''}`}
        onClick={showHome}
        title="Home"
      >
        <HomeIcon />
      </button>

      {order.map(id => {
        const doc = docs[id];
        const mode = MODE_REGISTRY[doc.mode];
        return (
          <div
            key={id}
            role="tab"
            aria-selected={id === activeId}
            className={`${styles.tab} ${id === activeId ? styles.tabActive : ''} ${dragOverId === id && dragId !== id ? styles.tabDragOver : ''}`}
            style={{ '--tab-accent': mode.accent }}
            title={doc.filePath || doc.name}
            onMouseDown={(e) => { if (e.button === 0) setActive(id); }}
            onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeDocument(id); } }}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ id, x: e.clientX, y: e.clientY }); }}
            draggable
            onDragStart={() => setDragId(id)}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => {
              if (dragId && dragId !== id) moveDocument(dragId, order.indexOf(id));
              setDragId(null); setDragOverId(null);
            }}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
          >
            <span className={styles.tabMode} style={{ background: mode.accent }} title={mode.label} />
            <span className={styles.tabName}>{doc.name}</span>
            <button
              className={`${styles.tabClose} ${doc.dirty ? styles.tabCloseDirty : ''}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); closeDocument(id); }}
              title={doc.dirty ? 'Unsaved changes — close' : 'Close'}
            >
              <span className={styles.tabDirtyDot} />
              <CloseIcon className={styles.tabCloseIcon} />
            </button>
          </div>
        );
      })}

      <button className={styles.newTab} onClick={showHome} title="New document">
        <PlusIcon />
      </button>

      {menu && docs[menu.id] && (
        <ContextMenu x={menu.x} y={menu.y} items={tabMenuItems(menu.id, order, docs[menu.id])} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}
