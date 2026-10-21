import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

// Right-click menu for a shape on the canvas. `items` is
// [{ label, shortcut?, action, danger?, disabled? } | null] — null draws a divider.
export function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey  = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu on screen near the bottom/right edges.
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - items.length * 28 - 16);

  return (
    <div ref={ref} className={styles.menu} style={{ left, top }} role="menu">
      {items.map((item, i) =>
        item === null
          ? <div key={i} className={styles.divider} />
          : (
            <button
              key={item.label}
              role="menuitem"
              className={`${styles.item} ${item.danger ? styles.itemDanger : ''}`}
              disabled={item.disabled}
              onClick={() => { item.action(); onClose(); }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
            </button>
          )
      )}
    </div>
  );
}
