import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { artworkColours, recolourMapping, applyRecolour } from '../utils/recolour';
import { hexToHsl } from '../utils/colourGuide';
import { ColorPicker } from '../panels/ColorPicker';
import styles from '../panels/Panel.module.css';

// Edit › Recolour Artwork… (6.7): every colour in the artwork mapped to a new
// one, with "reduce to N colours", a harmony-locked hue / saturation /
// brightness shift (drag the wheel to turn every colour together) and a
// live preview. OK leaves one undo step; Cancel puts everything back.
// It sits beside the other ways to recolour (swatches, Layers, the bucket).

const FIELDS = ['shapeColors', 'bgColors', 'canvasBg'];

// Hue / saturation wheel with a dot per new colour.
function Wheel({ colours, onTurn }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const angleAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  return (
    <div ref={ref} className={styles.recolourWheel} title="Drag to turn every colour around the wheel together"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = angleAt(e); }}
      onPointerMove={e => {
        if (drag.current == null) return;
        const a = angleAt(e);
        onTurn(a - drag.current);
        drag.current = a;
      }}
      onPointerUp={() => { drag.current = null; }}>
      <svg viewBox="-50 -50 100 100">
        {colours.map((hex, i) => {
          const { h, s } = hexToHsl(hex);
          const x = Math.cos((h * Math.PI) / 180) * s * 44, y = Math.sin((h * Math.PI) / 180) * s * 44;
          return (
            <g key={i}>
              <line x1={0} y1={0} x2={x} y2={y} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
              <circle cx={x} cy={y} r={4} fill={hex} stroke="#fff" strokeWidth={1.2} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RecolourDialog({ docId, mode, usage, history, onClose }) {
  // The document as it was when the dialog opened, and where history was.
  const start = useMemo(() => {
    const state = useDocumentStore.getState().docs[docId].state;
    return {
      state,
      snapshot: { blocks: state.placedBlocks, fields: Object.fromEntries(FIELDS.map(k => [k, state[k]])) },
      mark: history.mark(),
      rows: artworkColours(state, { usage, includeBg: mode === 'gridBuilder' && state.colorMode === 'uniform' }),
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { rows } = start;

  const [picks, setPicks] = useState({});
  const [reduceTo, setReduceTo] = useState(rows.length);
  const [adjust, setAdjust] = useState({ hue: 0, sat: 0, light: 0 });
  const [preview, setPreview] = useState(true);
  const [selected, setSelected] = useState(null);
  const touchedBlocks = useRef(false);

  const mapping = useMemo(
    () => recolourMapping(rows, { picks, reduceTo: reduceTo < rows.length ? reduceTo : null, adjust }),
    [rows, picks, reduceTo, adjust],
  );

  // Writes the mapping into the document (fields not changed go back to how they were).
  const write = (map) => {
    const store = useDocumentStore.getState();
    const changes = applyRecolour(start.state, rows, map);
    for (const k of FIELDS) store.setField(docId, k, changes[k] ?? start.snapshot.fields[k]);
    if (changes.placedBlocks || touchedBlocks.current) {
      touchedBlocks.current = !!changes.placedBlocks;
      store.setField(docId, 'placedBlocks', changes.placedBlocks ?? start.snapshot.blocks);
    }
  };

  useEffect(() => {
    if (preview) write(mapping);
    else history.putBack(start.snapshot);
  }, [mapping, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = () => {
    history.putBack(start.snapshot);
    history.rollback(start.mark);
    onClose();
  };
  const [closing, setClosing] = useState(false);
  const ok = () => {
    write(mapping);
    setClosing(true);
    // Let designs that rebuild from the palette (Meander, Linework) settle,
    // then leave the whole recolour as one undo step.
    setTimeout(() => {
      history.rollback(start.mark);
      history.push(start.snapshot.blocks, { label: 'Recolour Artwork', fields: start.snapshot.fields });
      onClose();
    }, 400);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const base = (hex) => (reduceTo < rows.length ? null : hex);
  const total = rows.reduce((a, r) => a + r.weight, 0) || 1;
  const sel = rows.find(r => r.hex === selected);
  const targets = [...new Set(mapping.values())];

  return (
    <div className={styles.recolourDialog} role="dialog" aria-label="Recolour Artwork">
      <div className={styles.dialogHeader}>
        <span>Recolour Artwork</span>
        <button className={styles.dialogClose} onClick={cancel} aria-label="Close">×</button>
      </div>
      <div className={styles.sectionContent}>
        {!rows.length && <div className={styles.gridNote}>No colours to recolour. In Grid Pattern, “None” colour mode keeps each shape’s own colours.</div>}
        <div className={styles.recolourTop}>
          <Wheel colours={targets} onTurn={d => setAdjust(a => ({ ...a, hue: ((a.hue + d) % 360 + 360) % 360 }))} />
          <div className={styles.recolourAdjust}>
            {[
              ['hue', 'Hue', 0, 359, 1, v => `${Math.round(v)}°`],
              ['sat', 'Saturation', -1, 1, 0.01, v => `${Math.round(v * 100)}%`],
              ['light', 'Brightness', -1, 1, 0.01, v => `${Math.round(v * 100)}%`],
            ].map(([k, label, min, max, step, fmt]) => (
              <div className={styles.formRow} key={k}>
                <span className={styles.label}>{label}</span>
                <div className={styles.sliderRow}>
                  <input type="range" className={styles.slider} min={min} max={max} step={step} value={adjust[k]}
                    onChange={e => setAdjust(a => ({ ...a, [k]: +e.target.value }))} />
                  <span className={styles.sliderVal}>{fmt(adjust[k])}</span>
                </div>
              </div>
            ))}
            <div className={styles.formRow}>
              <span className={styles.label}>Colours</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={1} max={Math.max(1, rows.length)} step={1} value={reduceTo}
                  onChange={e => { setReduceTo(+e.target.value); setSelected(null); }} />
                <span className={styles.sliderVal}>{reduceTo >= rows.length ? 'All' : reduceTo}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.recolourTable}>
          {rows.map(r => {
            const to = mapping.get(r.hex);
            const editable = base(r.hex) != null;
            return (
              <button key={r.hex} className={`${styles.recolourRow} ${selected === r.hex ? styles.recolourRowActive : ''}`}
                onClick={() => editable && setSelected(s => (s === r.hex ? null : r.hex))}
                title={editable ? 'Click to choose its new colour' : 'Reduced: it takes its group’s colour (set Colours to All to pick one)'}>
                <span className={styles.recolourChip} style={{ background: r.hex }} />
                <span className={styles.recolourArrow}>→</span>
                <span className={styles.recolourChip} style={{ background: to }} />
                <span className={styles.recolourHex}>{to}</span>
                <span className={styles.recolourShare}>{Math.round((r.weight / total) * 100)}%</span>
              </button>
            );
          })}
        </div>
        {sel && (
          <ColorPicker value={picks[sel.hex] ?? sel.hex} onChange={hex => setPicks(p => ({ ...p, [sel.hex]: hex }))} />
        )}

        <div className={styles.recolourFooter}>
          <label className={styles.recolourPreview}>
            <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /> Preview
          </label>
          <button className={styles.actionBtn} onClick={() => { setPicks({}); setAdjust({ hue: 0, sat: 0, light: 0 }); setReduceTo(rows.length); }}>Reset</button>
          <span style={{ flex: 1 }} />
          <button className={styles.actionBtn} onClick={cancel}>Cancel</button>
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={ok} disabled={closing}>OK</button>
        </div>
      </div>
    </div>
  );
}
