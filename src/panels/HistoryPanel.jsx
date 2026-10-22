import { useEffect, useRef } from 'react';
import { useEditor } from '../editor/EditorContext';
import styles from './Panel.module.css';

// The document's undo steps, oldest first. Click a step to go back (or
// forward) to just after it; steps after the current one are dimmed until
// a new edit replaces them, as in Illustrator / Photoshop.
export function HistoryPanel() {
  const { history } = useEditor();
  const { undoLabels = [], redoLabels = [], truncated, jumpTo } = history;
  const currentRef = useRef(null);
  const current = undoLabels.length;

  useEffect(() => { currentRef.current?.scrollIntoView({ block: 'nearest' }); }, [current, redoLabels.length]);

  const rows = [
    { label: truncated ? 'Earlier steps' : 'Opened', steps: 0, start: true },
    ...undoLabels.map((label, i) => ({ label, steps: i + 1 })),
    ...redoLabels.map((label, i) => ({ label, steps: current + i + 1, future: true })),
  ];

  return (
    <>
      <div className={styles.layerSummary}>
        {current} {current === 1 ? 'step' : 'steps'}{redoLabels.length ? ` · ${redoLabels.length} undone` : ''}
      </div>
      <div className={styles.layerList}>
        {rows.map(row => (
          <div
            key={row.steps}
            ref={row.steps === current ? currentRef : undefined}
            className={`${styles.layerRow} ${styles.historyRow} ${row.steps === current ? styles.layerRowSelected : ''} ${row.future ? styles.historyFuture : ''}`}
            onClick={() => jumpTo(row.steps)}
            title={row.steps === current ? 'Current state' : `Go to “${row.label}”`}
          >
            <span className={styles.historyMarker}>{row.steps === current ? '▸' : ''}</span>
            <span className={`${styles.layerName} ${row.start ? styles.historyStart : ''}`}>{row.label}</span>
          </div>
        ))}
      </div>
      {rows.length === 1 && (
        <div className={styles.gridNote} style={{ padding: '4px 12px' }}>
          Fills, edits and tool strokes appear here as you work.
        </div>
      )}
    </>
  );
}
