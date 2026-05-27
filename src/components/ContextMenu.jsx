import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

export function ContextMenu({ x, y, block, colorMode, onClose, onDelete, onToggleLock, onRefresh, onRandomise }) {
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

  const items = [
    colorMode !== 'none' && {
      label: block.colorLocked ? '🔓 Unlock colour' : '🔒 Lock colour',
      action: onToggleLock,
    },
    colorMode !== 'none' && { label: '↺ Refresh colour', action: onRefresh },
    { label: '⚄ Randomise asset', action: onRandomise },
    null,
    { label: '× Delete', action: onDelete, danger: true },
  ].filter(Boolean);

  return (
    <div ref={ref} className={styles.menu} style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item === null
          ? <div key={i} className={styles.divider} />
          : (
            <button
              key={item.label}
              className={`${styles.item} ${item.danger ? styles.itemDanger : ''}`}
              onClick={() => { item.action(); onClose(); }}
            >
              {item.label}
            </button>
          )
      )}
    </div>
  );
}
