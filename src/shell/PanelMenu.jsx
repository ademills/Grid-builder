import { useEffect, useRef, useState } from 'react';
import { commandContext, menuItem } from './commands';
import styles from './PanelMenu.module.css';

// A panel's ☰ menu: its own commands, then Reset Panel Layout.
// `up` opens the list above the button; `withReset: false` leaves off the
// Reset Panels item (for menus that aren't a panel's own); `children`
// replaces the ☰ icon and `className` the button style.
export function PanelMenu({ panel, up = false, withReset = true, className, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const c = open ? commandContext() : null;
  const items = !open ? [] : withReset
    ? [...(panel.menu ?? []), ...(panel.menu?.length ? ['separator'] : []), 'window.resetDock']
    : panel.menu ?? [];
  return (
    <span className={styles.panelMenu} ref={ref}>
      <button className={className ?? styles.menuBtn} onClick={() => setOpen(o => !o)} title={`${panel.title} options`}
        aria-haspopup="menu" aria-expanded={open}>
        {children ?? (
          <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
            <path d="M1 1.5h10M1 5h10M1 8.5h10" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>
      {open && (
        <div className={`${styles.panelMenuDropdown} ${up ? styles.panelMenuUp : ''}`} role="menu">
          {items.map((id, i) => {
            if (id === 'separator') return <div key={i} className={styles.panelMenuSeparator} />;
            const item = menuItem(id, c);
            return (
              <button key={id} role="menuitem" className={styles.panelMenuItem} disabled={item.disabled}
                onClick={() => { setOpen(false); item.onClick(); }}>
                <span>{item.label}</span>
                {item.shortcut && <span className={styles.panelMenuShortcut}>{item.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
