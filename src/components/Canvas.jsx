import { useRef, useEffect, useCallback } from 'react';
import styles from './Canvas.module.css';

export function Canvas({ viewTransform, setViewTransform, activeTool, bgColor, workArea, children }) {
  const containerRef = useRef(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const width = workArea?.width ?? 800;
  const height = workArea?.height ?? 600;

  // Fit the SVG to the viewport on mount / when work area dimensions change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width: vw, height: vh } = el.getBoundingClientRect();
    const padding = 80;
    const scale = Math.min((vw - padding * 2) / width, (vh - padding * 2) / height, 1);
    setViewTransform({
      x: (vw - width * scale) / 2,
      y: (vh - height * scale) / 2,
      scale,
    });
  }, [width, height, setViewTransform]);

  // Non-passive wheel listener so we can preventDefault and stop page scroll
  useEffect(() => {
    const el = containerRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setViewTransform(prev => {
        const newScale = Math.min(Math.max(prev.scale * factor, 0.05), 20);
        const sf = newScale / prev.scale;
        return {
          scale: newScale,
          x: cx - (cx - prev.x) * sf,
          y: cy - (cy - prev.y) * sf,
        };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setViewTransform]);

  const handleMouseDown = useCallback((e) => {
    if (activeTool !== 'hand' || e.button !== 0) return;
    isPanning.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [activeTool]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, [setViewTransform]);

  const stopPan = useCallback(() => { isPanning.current = false; }, []);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ backgroundColor: bgColor }}
      data-tool={activeTool}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopPan}
      onMouseLeave={stopPan}
    >
      <div
        className={styles.viewport}
        style={{
          transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
        }}
      >
        <svg
          id="main-canvas"
          width={width}
          height={height}
          xmlns="http://www.w3.org/2000/svg"
          className={styles.svg}
        >
          <rect width={width} height={height} fill="white" />
          {children}
        </svg>
      </div>
    </div>
  );
}
