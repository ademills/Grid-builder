import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import bar from '../shell/ControlBar.module.css';

// A popover opened from a chip, placed on the page (so scrolling panels
// can't clip it) below the chip and kept inside the window. Closes on an
// outside click or Escape.
export function useAnchoredPopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchor = useRef(null);
  const pop = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!anchor.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchor.current || !pop.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(a.left, window.innerWidth - p.width - 8));
    const below = a.bottom + 6;
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, a.top - p.height - 6) : below;
    setPos({ left, top });
  }, [open]);

  const toggle = () => { setPos(null); setOpen(o => !o); };
  const portal = (children, width = 236) => open && createPortal(
    <div ref={pop} className={bar.popover}
      style={{ position: 'fixed', width, zIndex: 1000, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      {children}
    </div>,
    document.body,
  );
  return { anchor, toggle, close: () => setOpen(false), portal };
}
