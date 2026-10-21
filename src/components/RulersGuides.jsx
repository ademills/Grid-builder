import { useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { RULER } from '../hooks/useGuideDrag';
import styles from './Canvas.module.css';

// Rulers along the top and left of the canvas, and the guides dragged out of
// them. Guides are stored per document in artboard px:
//   guides.h — horizontal guides (y), dragged from the top ruler
//   guides.v — vertical guides (x), dragged from the left ruler
// Dragging is handled by hooks/useGuideDrag.js.

const GUIDE = '#3fc8ff';

// A "nice" step (1, 2 or 5 × 10ⁿ) at least `min` long.
function niceStep(min) {
  const p = 10 ** Math.floor(Math.log10(min));
  return [1, 2, 5, 10].map(m => m * p).find(s => s >= min);
}

// The guide lines, drawn inside the artboard group (artboard coordinates).
export function GuideLines({ guides, drag, onStartDrag, interactive, scale }) {
  const lines = { v: [...guides.v], h: [...guides.h] };
  if (drag) {
    if (drag.index == null) lines[drag.axis].push(drag.pos);
    else lines[drag.axis][drag.index] = drag.pos;
  }
  const FAR = 1e6;
  const hit = 8 / scale;
  return (
    <g data-noexport="true">
      {['v', 'h'].map(axis => lines[axis].map((pos, i) => {
        const dragging = drag && drag.axis === axis && (drag.index == null ? i === lines[axis].length - 1 : drag.index === i);
        const [x1, y1, x2, y2] = axis === 'v' ? [pos, -FAR, pos, FAR] : [-FAR, pos, FAR, pos];
        return (
          <g key={`${axis}${i}`} opacity={dragging && drag.remove ? 0.35 : 1}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={GUIDE} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {interactive && !dragging && (
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={hit}
                style={{ cursor: axis === 'v' ? 'ew-resize' : 'ns-resize' }}
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.button === 0 && onStartDrag(axis, i, e.currentTarget.ownerSVGElement.getBoundingClientRect(), e)} />
            )}
          </g>
        );
      }))}
    </g>
  );
}

function Ruler({ axis, length, offset, scale, pointer, onMouseDown }) {
  // Ticks in artboard px, labelled every `step`.
  const step = niceStep(70 / scale);
  const minor = step / (String(step).startsWith('2') ? 4 : 5);
  const from = Math.floor((-offset / scale) / minor) * minor;
  const to = (length - offset) / scale;
  const ticks = [];
  for (let v = from; v <= to; v += minor) {
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const s = offset + v * scale;
    ticks.push({ s, major, label: major ? Math.round(v) : null });
  }
  const horiz = axis === 'h';
  return (
    <svg className={horiz ? styles.rulerTop : styles.rulerLeft} onMouseDown={onMouseDown} onClick={e => e.stopPropagation()}>
      {ticks.map(({ s, major, label }, i) => (
        <g key={i}>
          {horiz
            ? <line x1={s} x2={s} y1={major ? 0 : RULER - 5} y2={RULER} />
            : <line y1={s} y2={s} x1={major ? 0 : RULER - 5} x2={RULER} />}
          {label != null && (horiz
            ? <text x={s + 3} y={9}>{label}</text>
            : <text x={9} y={s + 3} transform={`rotate(-90 9 ${s + 3})`}>{label}</text>)}
        </g>
      ))}
      {pointer != null && (horiz
        ? <line className={styles.rulerPointer} x1={offset + pointer * scale} x2={offset + pointer * scale} y1={0} y2={RULER} />
        : <line className={styles.rulerPointer} y1={offset + pointer * scale} y2={offset + pointer * scale} x1={0} x2={RULER} />)}
    </svg>
  );
}

// Rulers, positioned over the canvas container's top and left edges.
export function Rulers({ viewTransform, viewportSize, onStartDrag }) {
  const cursor = useAppStore(s => s.cursor);
  const ref = useRef(null);
  if (!viewportSize) return null;
  const rect = () => ref.current.getBoundingClientRect();
  return (
    <div ref={ref} className={styles.rulers}>
      <Ruler axis="h" length={viewportSize.width} offset={viewTransform.x} scale={viewTransform.scale} pointer={cursor?.x}
        onMouseDown={e => e.button === 0 && onStartDrag('h', null, rect(), e)} />
      <Ruler axis="v" length={viewportSize.height} offset={viewTransform.y} scale={viewTransform.scale} pointer={cursor?.y}
        onMouseDown={e => e.button === 0 && onStartDrag('v', null, rect(), e)} />
      <div className={styles.rulerCorner} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} />
    </div>
  );
}
