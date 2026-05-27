import { useRef, useEffect, useCallback, useState } from 'react';
import styles from './Canvas.module.css';

export function Canvas({ viewTransform, setViewTransform, activeTool, bgColor, canvasBg, workArea, onDeselectAll, onMarqueeSelect, overlay, children }) {
  const containerRef = useRef(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Marquee select state
  const marqueeStart = useRef(null);
  const marqueeActive = useRef(false);
  const suppressClick = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState(null);

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
    if (e.button !== 0) return;
    if (activeTool === 'hand') {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (activeTool === 'select') {
      const rect = containerRef.current.getBoundingClientRect();
      marqueeStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      marqueeActive.current = false;
      suppressClick.current = false;
    }
  }, [activeTool]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      return;
    }
    if (activeTool === 'select' && marqueeStart.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const dx = cx - marqueeStart.current.x;
      const dy = cy - marqueeStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        marqueeActive.current = true;
        setMarqueeRect({
          x: Math.min(marqueeStart.current.x, cx),
          y: Math.min(marqueeStart.current.y, cy),
          w: Math.abs(dx),
          h: Math.abs(dy),
        });
      }
    }
  }, [activeTool, setViewTransform]);

  const handleMouseUp = useCallback((e) => {
    isPanning.current = false;
    if (marqueeActive.current && marqueeStart.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const x1 = Math.min(marqueeStart.current.x, cx);
      const y1 = Math.min(marqueeStart.current.y, cy);
      const x2 = Math.max(marqueeStart.current.x, cx);
      const y2 = Math.max(marqueeStart.current.y, cy);
      onMarqueeSelect?.({ x1, y1, x2, y2 });
      suppressClick.current = true;
    }
    marqueeStart.current = null;
    marqueeActive.current = false;
    setMarqueeRect(null);
  }, [onMarqueeSelect]);

  const stopAll = useCallback(() => {
    isPanning.current = false;
    marqueeStart.current = null;
    marqueeActive.current = false;
    setMarqueeRect(null);
  }, []);

  const { x, y, scale } = viewTransform;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ backgroundColor: bgColor }}
      data-tool={activeTool}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={stopAll}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (activeTool === 'select') onDeselectAll?.();
      }}
    >
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

      {marqueeRect && (
        <div
          className={styles.marquee}
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
          }}
        />
      )}

      {overlay}
    </div>
  );
}
