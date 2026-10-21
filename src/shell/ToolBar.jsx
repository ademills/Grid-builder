import { useAppStore } from '../store/appStore';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import styles from './Shell.module.css';

// Vertical tool bar on the left. Its tool set comes from the active
// document's mode, so it changes as you switch tabs.
export function ToolBar({ mode }) {
  const activeTool = useAppStore(s => s.toolOverride ?? s.activeTool);
  const setActiveTool = useAppStore(s => s.setActiveTool);
  const toolIds = MODE_REGISTRY[mode]?.tools ?? [];

  return (
    <div className={styles.toolBar} role="toolbar" aria-orientation="vertical">
      {toolIds.map((id, i) => {
        if (id === '|') return <div key={`sep-${i}`} className={styles.toolDivider} />;
        const tool = TOOLS[id];
        const Icon = tool.icon;
        return (
          <button
            key={id}
            className={`${styles.toolBtn} ${activeTool === id ? styles.toolBtnActive : ''}`}
            onClick={() => setActiveTool(id)}
            title={`${tool.label} (${tool.key})${tool.hint ? ` — ${tool.hint}` : ''}`}
            aria-pressed={activeTool === id}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
