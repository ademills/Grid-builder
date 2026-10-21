import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import styles from './Dock.module.css';

// Illustrator-style panel dock: a column of panel groups, each with tabs
// along its top. Clicking a tab brings it to the front; double-clicking a
// tab (or clicking the chevron) collapses the group. `groups` comes from
// the active mode's registry entry.
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
