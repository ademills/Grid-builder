import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { commandContext, menuItem } from './commands';
import styles from './Dock.module.css';

// Illustrator-style panel dock: a column of panel groups, each with tabs
// along its top. Clicking a tab brings it to the front; double-clicking a
// tab (or clicking the chevron) collapses the group. `groups` comes from
// the active mode's registry entry.

// A panel's ☰ menu: its own commands, then Reset Panel Layout.
function PanelMenu({ panel }) {
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
  const items = open ? [...(panel.menu ?? []), ...(panel.menu?.length ? ['separator'] : []), 'window.resetDock'] : [];
  return (
    <span className={styles.panelMenu} ref={ref}>
      <button className={styles.collapseBtn} onClick={() => setOpen(o => !o)} title={`${panel.title} options`}
        aria-haspopup="menu" aria-expanded={open}>
        <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
          <path d="M1 1.5h10M1 5h10M1 8.5h10" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className={styles.panelMenuDropdown} role="menu">
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

export function Dock({ groups }) {
  const dock = useAppStore(s => s.dock);
  const updateDockGroup = useAppStore(s => s.updateDockGroup);
  const setDockWidth = useAppStore(s => s.setDockWidth);
  const dragRef = useRef(null);

  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: useAppStore.getState().dock.width };
    const onMove = (ev) => {
      if (!dragRef.current) return;
      setDockWidth(dragRef.current.startW + (dragRef.current.startX - ev.clientX));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }, [setDockWidth]);

  return (
    <aside className={styles.dock} style={{ width: dock.width }}>
      <div className={styles.resizeHandle} onMouseDown={onResizeStart} title="Drag to resize panels" />
      {groups.map(group => {
        const saved = dock.groups[group.id] ?? {};
        const collapsed = saved.collapsed ?? !!group.defaultCollapsed;
        const activeTab = group.panels.find(p => p.id === saved.tab) ?? group.panels[0];
        const Panel = activeTab.component;
        return (
          <section key={group.id} className={`${styles.group} ${collapsed ? styles.groupCollapsed : ''}`}
            style={{ '--group-grow': group.grow ?? 1 }}>
            <header className={styles.groupHeader}>
              <div className={styles.tabs} role="tablist">
                {group.panels.map(p => (
                  <button
                    key={p.id}
                    role="tab"
                    aria-selected={p.id === activeTab.id}
                    className={`${styles.tab} ${p.id === activeTab.id && !collapsed ? styles.tabActive : ''}`}
                    onClick={() => updateDockGroup(group.id, { tab: p.id, collapsed: false })}
                    onDoubleClick={() => updateDockGroup(group.id, { collapsed: !collapsed })}
                    title="Double-click to collapse or expand"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
              {!collapsed && <PanelMenu panel={activeTab} />}
              <button
                className={styles.collapseBtn}
                onClick={() => updateDockGroup(group.id, { collapsed: !collapsed })}
                title={collapsed ? 'Expand' : 'Collapse'}
                aria-expanded={!collapsed}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
                  style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
                  <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </header>
            {!collapsed && (
              <div className={styles.groupBody}>
                <Panel />
              </div>
            )}
          </section>
        );
      })}
    </aside>
  );
}
