import { useEffect, useRef, useState } from 'react';
import styles from './Shell.module.css';

// Illustrator-style menu bar. `menus` is [{ label, items }] where each item
// is { label, shortcut?, onClick, disabled?, checked? } | 'separator' | { heading }.
// Once a menu is open, hovering other triggers switches between them.
export function MenuBar({ menus }) {
  const [openIdx, setOpenIdx] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    if (openIdx === null) return;
    const onDown = (e) => { if (!barRef.current?.contains(e.target)) setOpenIdx(null); };
    const onKey = (e) => { if (e.key === 'Escape') setOpenIdx(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openIdx]);

  return (
    <nav className={styles.menuBar} ref={barRef}>
      <div className={styles.brand}>
        <span className={styles.brandDot} />
        Pattern Studio
      </div>
      {menus.map((menu, i) => (
        <div key={menu.label} className={styles.menu}>
          <button
            className={`${styles.menuTrigger} ${openIdx === i ? styles.menuTriggerOpen : ''}`}
            onMouseDown={() => setOpenIdx(openIdx === i ? null : i)}
            onMouseEnter={() => { if (openIdx !== null) setOpenIdx(i); }}
          >
            {menu.label}
          </button>
          {openIdx === i && (
            <div className={styles.menuDropdown} role="menu">
              {menu.items.map((item, j) => {
                if (item === 'separator') return <div key={j} className={styles.menuSeparator} />;
                if (item.heading) return <div key={j} className={styles.menuLabel}>{item.heading}</div>;
                return (
                  <button
                    key={j}
                    role="menuitem"
                    className={styles.menuItem}
                    disabled={item.disabled}
                    onClick={() => { setOpenIdx(null); item.onClick?.(); }}
                  >
                    <span className={styles.menuItemLabel}>
                      {item.checked !== undefined && <span className={styles.menuCheck}>{item.checked ? '✓' : ''}</span>}
                      {item.label}
                    </span>
                    {item.shortcut && <span className={styles.menuShortcut}>{item.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
