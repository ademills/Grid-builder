import { useRef, useEffect, useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import styles from './Canvas.module.css';

const DEFAULT_VIEW = { x: 0, y: 0, scale: 1 };

// Tools the canvas handles itself; every other tool's clicks and drags are
// reported through onToolPointer in artboard coordinates.
const NAV_TOOLS = new Set(['select', 'hand', 'zoom']);

export function Canvas({ viewTransform, needsFit = true, setViewTransform, activeTool, bgColor, canvasBg, workArea, onDeselectAll, onMarqueeSelect, onViewportResize, onToolPointer, onPointerMove, overlay, children }) {
  const containerRef = useRef(null);
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  // Marquee select state
  const marqueeStart = useRef(null);
  const marqueeActive = useRef(false);
  const suppressClick = useRef(false);
  const [marqueeRect, setMarqueeRect] = useState(null);

  // Editing-tool drag state, plus the latest view for converting pointer
  // positions to artboard coordinates inside event handlers.
  const toolDown = useRef(false);
  const viewRef = useRef(viewTransform);
  useEffect(() => { viewRef.current = viewTransform; }, [viewTransform]);
  const toArtboard = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (e.clientX - rect.left - v.x) / v.scale,
      y: (e.clientY - rect.top - v.y) / v.scale,
      altKey: e.altKey, shiftKey: e.shiftKey,
    };
  }, []);

  const width  = workArea?.width  ?? 800;
  const height = workArea?.height ?? 600;

  // Fit the work area to the viewport when the document has no saved view
  // yet, and whenever the work area's dimensions change. A document that
  // already has a view (e.g. switching back to its tab) keeps it.
  const fittedDims = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const dims = `${width}x${height}`;
    const isFirst = fittedDims.current === null;
    fittedDims.current = dims;
    if (isFirst && !needsFit) return;
    const { width: vw, height: vh } = el.getBoundingClientRect();
    const padding = 80;
    const scale = Math.min((vw - padding * 2) / width, (vh - padding * 2) / height, 1);
    setViewTransform({
      x: (vw - width * scale) / 2,
      y: (vh - height * scale) / 2,
      scale,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- needsFit is only consulted on first run
  }, [width, height, setViewTransform]);

  // Report the container's on-screen pixel size so callers can derive which
  // part of canvas-space is actually visible (e.g. for render virtualization).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onViewportResize) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      onViewportResize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onViewportResize]);

  // Non-passive wheel listener so we can preventDefault and stop page scroll.
  // As in Illustrator, the wheel pans (Shift: sideways) and Ctrl/Alt+wheel
  // (or a trackpad pinch) zooms at the pointer — unless View › Scroll Wheel
  // Zooms is on, which makes the plain wheel zoom as before.
  useEffect(() => {
    const el = containerRef.current;
    const onWheel = (e) => {
      e.preventDefault();
      const zoom = e.ctrlKey || e.altKey || e.metaKey || useAppStore.getState().wheelZooms;
      if (!zoom) {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
        const dx = (e.shiftKey ? e.deltaY : e.deltaX) * unit;
        const dy = (e.shiftKey ? 0 : e.deltaY) * unit;
        setViewTransform(stored => { const prev = stored ?? DEFAULT_VIEW; return { ...prev, x: prev.x - dx, y: prev.y - dy }; });
        return;
      }
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setViewTransform(stored => {
        const prev = stored ?? DEFAULT_VIEW;
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
    if (!NAV_TOOLS.has(activeTool)) {
      toolDown.current = true;
      onToolPointer?.('down', toArtboard(e));
      return;
    }
    if (activeTool === 'hand') {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (activeTool === 'select' || activeTool === 'zoom') {
      const rect = containerRef.current.getBoundingClientRect();
      marqueeStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      marqueeActive.current = false;
      suppressClick.current = false;
    }
  }, [activeTool, onToolPointer, toArtboard]);

  const handleMouseMove = useCallback((e) => {
    onPointerMove?.(toArtboard(e));
    if (toolDown.current) {
      onToolPointer?.('move', toArtboard(e));
      return;
    }
    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setViewTransform(stored => { const prev = stored ?? DEFAULT_VIEW; return { ...prev, x: prev.x + dx, y: prev.y + dy }; });
      return;
    }
    if ((activeTool === 'select' || activeTool === 'zoom') && marqueeStart.current) {
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
  }, [activeTool, setViewTransform, onToolPointer, onPointerMove, toArtboard]);

  const handleMouseUp = useCallback((e) => {
    isPanning.current = false;
    if (toolDown.current) {
      toolDown.current = false;
      onToolPointer?.('up', toArtboard(e));
      return;
    }
    if (marqueeActive.current && marqueeStart.current) {
      const bounds = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const x1 = Math.min(marqueeStart.current.x, cx);
      const y1 = Math.min(marqueeStart.current.y, cy);
      const x2 = Math.max(marqueeStart.current.x, cx);
      const y2 = Math.max(marqueeStart.current.y, cy);
      if (activeTool === 'zoom') {
        // Zoom tool drag: fit the dragged rectangle to the view.
        const { width: vw, height: vh } = bounds;
        setViewTransform(stored => {
          const prev = stored ?? DEFAULT_VIEW;
          const scale = Math.min(Math.max(prev.scale * Math.min(vw / (x2 - x1), vh / (y2 - y1)), 0.05), 20);
          const ax = (x1 + x2) / 2, ay = (y1 + y2) / 2; // rect centre on screen
          const px = (ax - prev.x) / prev.scale, py = (ay - prev.y) / prev.scale; // … in artboard px
          return { scale, x: vw / 2 - px * scale, y: vh / 2 - py * scale };
        });
      } else {
        onMarqueeSelect?.({ x1, y1, x2, y2 });
      }
      suppressClick.current = true;
    }
    marqueeStart.current = null;
    marqueeActive.current = false;
    setMarqueeRect(null);
  }, [activeTool, onMarqueeSelect, onToolPointer, setViewTransform, toArtboard]);

  const stopAll = useCallback(() => {
    if (toolDown.current) { toolDown.current = false; onToolPointer?.('up', null); }
    isPanning.current = false;
    marqueeStart.current = null;
    marqueeActive.current = false;
    setMarqueeRect(null);
  }, [onToolPointer]);

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
      onMouseLeave={() => { onPointerMove?.(null); stopAll(); }}
      onClick={(e) => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (activeTool === 'select') onDeselectAll?.();
        if (activeTool === 'zoom') {
          // Zoom about the clicked point; Alt zooms out (as in Illustrator).
          const rect = containerRef.current.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const factor = e.altKey ? 1 / 1.5 : 1.5;
          setViewTransform(stored => {
            const prev = stored ?? DEFAULT_VIEW;
            const newScale = Math.min(Math.max(prev.scale * factor, 0.05), 20);
            const sf = newScale / prev.scale;
            return { scale: newScale, x: cx - (cx - prev.x) * sf, y: cy - (cy - prev.y) * sf };
          });
        }
      }}
    >
      <svg
        id="main-canvas"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.svg}
      >
        <g transform={`translate(${x},${y}) scale(${scale})`}>
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
