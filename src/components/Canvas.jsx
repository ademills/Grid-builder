import { useRef, useEffect, useCallback } from 'react';
import styles from './Canvas.module.css';

export function Canvas({ viewTransform, setViewTransform, activeTool, bgColor, canvasBg, workArea, onDeselectAll, overlay, children }) {
  const containerRef = useRef(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const width  = workArea?.width  ?? 800;
  const height = workArea?.height ?? 600;

  // Fit the work area to the viewport on mount / when dimensions change
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

  const { x, y, scale } = viewTransform;

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
      onClick={() => activeTool === 'select' && onDeselectAll?.()}
    >
      {/*
        The SVG fills the entire container and the pan/zoom transform lives on
        a <g> *inside* the SVG coordinate system.  This keeps everything in
        SVG-native vector space — the renderer re-draws at the correct
        resolution on every zoom level instead of scaling a rasterised texture.
      */}
      <svg
        id="main-canvas"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svg}
      >
        <g
          transform={`translate(${x},${y}) scale(${scale})`}
          style={{ filter: 'drop-shadow(0 8px 40px rgba(0,0,0,0.35))' }}
        >
          <rect width={width} height={height} fill={canvasBg ?? '#ffffff'} />
          {children}
        </g>
      </svg>
      {overlay}
    </div>
  );
}
