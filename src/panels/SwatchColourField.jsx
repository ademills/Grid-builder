import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDocField } from '../store/useDocField';
import { useAppStore } from '../store/appStore';
import { ColorPicker } from './ColorPicker';
import bar from '../shell/ControlBar.module.css';

// A colour field that picks from the document swatches (and recent
// colours) or any colour, like the paint colour chip in the control bar.
// The popover is placed on the page so scrolling panels can't clip it.
export function SwatchColourField({ value, onChange, title, label }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const anchor = useRef(null);
  const pop = useRef(null);
  const recentColours = useAppStore(s => s.recentColours);
  const [shapeColors] = useDocField('shapeColors');
  const [bgColors] = useDocField('bgColors');

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

  // Below the chip, kept inside the window.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !pop.current) return;
    const a = anchor.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(a.left, window.innerWidth - p.width - 8));
    const below = a.bottom + 6;
    const top = below + p.height > window.innerHeight - 8 ? Math.max(8, a.top - p.height - 6) : below;
    setPos({ left, top });
  }, [open]);

  const pick = (hex, swatchId = null) => onChange(hex, swatchId);
  const swatches = [...shapeColors, ...bgColors];

  return (
    <span ref={anchor} className={bar.popAnchor}>
      <button className={bar.colourChip} onClick={() => { setPos(null); setOpen(o => !o); }} title={title}>
        <span style={{ background: value }} />
        {label ?? value}
      </button>
      {open && createPortal(
        <div ref={pop} className={bar.popover}
          style={{ position: 'fixed', width: 236, zIndex: 1000, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
          {recentColours.length > 0 && (
            <>
              <div className={bar.popLabel}>Recent</div>
              <div className={bar.popSwatches}>
                {recentColours.map(hex => (
                  <button key={hex} className={bar.popSwatch} style={{ background: hex }} title={hex} onClick={() => pick(hex)} />
                ))}
              </div>
            </>
          )}
          <div className={bar.popLabel}>Document swatches</div>
          <div className={bar.popSwatches}>
            {swatches.map(s => (
              <button key={s.id} className={bar.popSwatch} style={{ background: s.hex }}
                title={s.name || s.hex} onClick={() => pick(s.hex, s.id)} />
            ))}
          </div>
          <ColorPicker value={value} onChange={hex => pick(hex)} />
        </div>,
        document.body,
      )}
    </span>
  );
}
