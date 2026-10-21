import { useState } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { MODE_REGISTRY } from '../modes/registry';
import { closeDocument } from './documentActions';
import { CloseIcon, HomeIcon, PlusIcon } from './icons';
import styles from './Shell.module.css';

export function TabBar() {
  const order = useDocumentStore(s => s.order);
  const docs = useDocumentStore(s => s.docs);
  const activeId = useDocumentStore(s => s.activeId);
  const setActive = useDocumentStore(s => s.setActive);
  const showHome = useDocumentStore(s => s.showHome);
  const moveDocument = useDocumentStore(s => s.moveDocument);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

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
    </div>
  );
}
