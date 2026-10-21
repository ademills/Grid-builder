import { useAppStore } from '../store/appStore';
import { MODE_REGISTRY } from '../modes/registry';
import styles from './Shell.module.css';

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8];

export function StatusBar({ doc }) {
  const status = useAppStore(s => s.editorStatus);
  const commands = useAppStore(s => s.editorCommands);
  const toast = useAppStore(s => s.toast);
  const busy = useAppStore(s => s.busy);

  if (!doc || !status) {
    return (
      <footer className={styles.statusBar}>
        <span className={styles.statusItem}>{toast?.message ?? 'Ready'}</span>
      </footer>
    );
  }

  const pct = Math.round(status.zoom * 100);
  return (
    <footer className={styles.statusBar}>
      <span className={styles.statusItem}>
        <select
          className={styles.zoomSelect}
          value="current"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'fit') commands?.fitView();
            else commands?.setZoom(Number(v));
          }}
          title="Zoom"
        >
          <option value="current" hidden>{pct}%</option>
          {ZOOM_STEPS.map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
          <option value="fit">Fit artboard</option>
        </select>
      </span>
      <span className={styles.statusItem}>{MODE_REGISTRY[doc.mode].label}</span>
      <span className={styles.statusItem}>{status.width} × {status.height}</span>
      <span className={styles.statusItem}>Grid {status.cols} × {status.rows}</span>
      <span className={styles.statusItem}>
        {status.blockCount} {status.blockCount === 1 ? 'object' : 'objects'}
        {status.selectedCount > 0 && ` · ${status.selectedCount} selected`}
      </span>
      <span className={styles.statusSpacer} />
      {busy && <span className={`${styles.statusItem} ${styles.toast}`}>{busy}</span>}
      {toast && <span className={`${styles.statusItem} ${styles.toast}`}>{toast.message}</span>}
      <span className={styles.statusItem}>{doc.dirty ? 'Unsaved changes' : (doc.filePath || doc.savedAt ? 'All changes saved' : 'Not saved yet')}</span>
    </footer>
  );
}
