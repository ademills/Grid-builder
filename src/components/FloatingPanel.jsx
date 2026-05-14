import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './FloatingPanel.module.css';

export function FloatingPanel({
  activeTool,
  onToolChange,
  bgColor,
  onBgColorChange,
  viewTransform,
  onZoom,
  onResetView,
  // Phase 2+
  gridSettings,
  onGridSettingsChange,
  assets,
  onIngestAssets,
  onFillGrid,
  onExport,
  canFill,
  canExport,
}) {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [collapsed, setCollapsed] = useState(false);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleHeaderMouseDown = useCallback((e) => {
    // Don't start dragging if clicking the collapse button
    if (e.target.closest('button')) return;
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const onMouseUp = () => { isDragging.current = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const zoomPct = Math.round((viewTransform?.scale ?? 1) * 100);

  return (
    <div
      className={styles.panel}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.titleRow}>
          <div className={styles.dot} />
          <span className={styles.title}>Grid Builder</span>
        </div>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>

      {!collapsed && (
        <div className={styles.body}>

          {/* Tool */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Tool</div>
            <div className={styles.toolToggle}>
              <button
                className={`${styles.toolBtn} ${activeTool === 'select' ? styles.active : ''}`}
                onClick={() => onToolChange('select')}
              >
                ↖ Select
              </button>
              <button
                className={`${styles.toolBtn} ${activeTool === 'hand' ? styles.active : ''}`}
                onClick={() => onToolChange('hand')}
              >
                ✋ Hand
              </button>
            </div>
          </div>

          {/* View / Zoom */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>View</div>
            <div className={styles.zoomRow}>
              <button className={styles.zoomBtn} onClick={() => onZoom(-1)} title="Zoom out">−</button>
              <span className={styles.zoomLabel}>{zoomPct}%</span>
              <button className={styles.zoomBtn} onClick={() => onZoom(1)} title="Zoom in">+</button>
              <button
                className={`${styles.zoomBtn} ${styles.resetBtn}`}
                onClick={onResetView}
                title="Reset view"
              >
                Fit
              </button>
            </div>
          </div>

          {/* Background Color */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Background</div>
            <div className={styles.colorRow}>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => onBgColorChange(e.target.value)}
                className={styles.colorInput}
              />
              <span className={styles.colorLabel}>{bgColor}</span>
            </div>
          </div>

          {/* Grid Settings — Phase 2 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Grid Settings</div>
            <p className={styles.placeholder}>Phase 2 — coming next</p>
          </div>

          {/* Ingest Assets — Phase 3 */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Ingest Assets</div>
            <p className={styles.placeholder}>Phase 3 — coming next</p>
          </div>

          {/* Actions */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Actions</div>
            <div className={styles.actionBtns}>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={onFillGrid}
                disabled={!canFill}
              >
                ▶ Fill Grid
              </button>
              <button
                className={styles.actionBtn}
                onClick={onExport}
                disabled={!canExport}
              >
                ↓ Export SVG
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
