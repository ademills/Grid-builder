import { useCallback, useEffect, useRef, useState } from 'react';

// Dragging ruler guides: out of a ruler to create one, or along to move one.
// Snaps to the given lines (artboard edges, centre, grid cell lines) within a
// few screen px; hold Shift for free placement. Dropping a guide back on its
// ruler, or outside the canvas, deletes it.

export const RULER = 18; // px
const SNAP_PX = 6;

// Shared drag state for the ruler (new guide) and guide (move) drags.
export function useGuideDrag({ viewTransform, guides, setGuides, snapLines }) {
  const [drag, setDrag] = useState(null); // { axis, index, pos, remove }
  const viewRef = useRef(viewTransform);
  useEffect(() => { viewRef.current = viewTransform; }, [viewTransform]);

  const start = useCallback((axis, index, rect, e) => {
    e.preventDefault();
    e.stopPropagation();
    const posOf = (ev) => {
      const v = viewRef.current;
      let pos = axis === 'v' ? (ev.clientX - rect.left - v.x) / v.scale : (ev.clientY - rect.top - v.y) / v.scale;
      if (!ev.shiftKey) {
        const near = snapLines[axis].reduce((best, s) => (Math.abs(s - pos) < Math.abs(best - pos) ? s : best), Infinity);
        if (Math.abs(near - pos) * v.scale <= SNAP_PX) pos = near;
      }
      return Math.round(pos * 100) / 100;
    };
    // Back over its own ruler (or off the canvas) means delete.
    const removing = (ev) => {
      const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
      const outside = sx < 0 || sy < 0 || sx > rect.width || sy > rect.height;
      return outside || (axis === 'h' ? sy < RULER : sx < RULER);
    };
    const update = (ev) => setDrag({ axis, index, pos: posOf(ev), remove: removing(ev) });
    update(e);
    const onUp = (ev) => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', onUp);
      setDrag(null);
      const list = [...guides[axis]];
      if (removing(ev)) {
        if (index == null) return;
        list.splice(index, 1);
      } else if (index == null) {
        list.push(posOf(ev));
      } else {
        list[index] = posOf(ev);
      }
      setGuides({ ...guides, [axis]: list });
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', onUp);
  }, [guides, setGuides, snapLines]);

  return { drag, start };
}

