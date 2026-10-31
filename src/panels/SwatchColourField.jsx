import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDocField } from '../store/useDocField';
import { useAppStore } from '../store/appStore';
import { ColorPicker } from './ColorPicker';
import bar from '../shell/ControlBar.module.css';

// A popover opened from a chip, placed on the page (so scrolling panels
// can't clip it) below the chip and kept inside the window. Closes on an
// outside click or Escape.
function useAnchoredPopover() {
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

// A colour field that picks from the document swatches (and recent
// colours) or any colour, like the paint colour chip in the control bar.
export function SwatchColourField({ value, onChange, title, label }) {
  const { anchor, toggle, portal } = useAnchoredPopover();
  const recentColours = useAppStore(s => s.recentColours);
  const [shapeColors] = useDocField('shapeColors');
  const [bgColors] = useDocField('bgColors');

  const pick = (hex, swatchId = null) => onChange(hex, swatchId);
  const swatches = [...shapeColors, ...bgColors];

  return (
    <span ref={anchor} className={bar.popAnchor}>
      <button className={bar.colourChip} onClick={toggle} title={title}>
        <span style={{ background: value }} />
        {label ?? value}
      </button>
      {portal(
        <>
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
        </>,
      )}
    </span>
  );
}

// A colour role (e.g. Linework's ink): either Auto, which follows `autoHex`,
// or one of the document swatches, stored by id. One chip in the panel; the
// choices open in a popover.
export function SwatchRoleField({ value, autoHex, autoLabel, swatches, onChange, title }) {
  const { anchor, toggle, close, portal } = useAnchoredPopover();
  const chosen = value ? swatches.find(s => s.id === value) : null;
  const pick = (id) => { onChange(id); close(); };
  return (
    <span ref={anchor} className={bar.popAnchor} style={{ flex: 1, display: 'flex' }}>
      <button className={`${bar.colourChip} ${bar.roleChip}`} onClick={toggle} title={title}>
        <span style={{ background: chosen?.hex ?? autoHex }} />
        {chosen ? (chosen.name || chosen.hex) : 'Auto'}
      </button>
      {portal(
        <>
          <button className={`${bar.popAuto} ${!chosen ? bar.popAutoActive : ''}`} onClick={() => pick(null)}>
            <span style={{ background: autoHex }} /> Auto <em>{autoLabel}</em>
          </button>
          <div className={bar.popLabel}>Document swatches</div>
          <div className={bar.popSwatches}>
            {swatches.map(s => (
              <button key={s.id} className={`${bar.popSwatch} ${s.id === value ? bar.popSwatchActive : ''}`}
                style={{ background: s.hex }} title={s.name || s.hex} onClick={() => pick(s.id)} />
            ))}
          </div>
        </>,
        220,
      )}
    </span>
  );
}
