import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useShapeStore } from '../store/shapeStore';
import { useDocumentStore } from '../store/documentStore';
import { analyseSvg, buildImportedSvg, IMPORT_SIZES } from '../utils/svgImport';
import styles from './Shell.module.css';

// Import SVG files as shapes (5.1). Each file in the queue gets a name, a
// grid size, an optional background square and its colour slots: one per
// colour, biggest first, which can be reordered, merged or kept as drawn.
// Imported shapes go into the user's library (Assets › My shapes) and are
// switched on in the active document.

const svgUrl = markup => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

// A preview of the built shape with its slots in stand-in colours, so the
// slot order is visible.
const PREVIEW = ['#7b61ff', '#ff6b6b', '#2ec4b6', '#ffbf47', '#3a86ff', '#8338ec', '#fb5607', '#06d6a0'];

function ImportOne({ file, onDone, onSkip, remaining }) {
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState(file.name.replace(/\.svg$/i, ''));
  const [size, setSize] = useState(null);
  const [slots, setSlots] = useState([]);
  const [background, setBackground] = useState(true);
  const [tags, setTags] = useState('');
  const [showSlots, setShowSlots] = useState(true);

  useEffect(() => {
    let cancelled = false;
    analyseSvg(file.text).then(a => {
      if (cancelled) return;
      setAnalysis(a);
      setSize(a.suggested);
      setSlots(a.colours.map(c => ({ hexes: [c.hex], area: c.area })));
    }).catch(err => { if (!cancelled) setError(err.message ?? String(err)); });
    return () => { cancelled = true; };
  }, [file]);

  const svg = useMemo(() => (analysis && size
    ? buildImportedSvg(analysis, { slots, background: background ? '#ffffff' : null, cols: size.cols, rows: size.rows })
    : null), [analysis, slots, background, size]);

  // The same shape with each slot in a stand-in colour.
  const slotPreview = useMemo(() => {
    if (!svg) return null;
    let i = 0;
    const colourOf = new Map(slots.filter(s => !s.keep).map(s => [s, PREVIEW[i++ % PREVIEW.length]]));
    let out = svg;
    for (const s of slots) if (!s.keep) for (const hex of s.hexes) out = out.split(`fill:${hex}`).join(`fill:${colourOf.get(s)}`);
    return out;
  }, [svg, slots]);

  const move = (i, d) => setSlots(prev => {
    const next = [...prev];
    const j = i + d;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const mergeUp = i => setSlots(prev => {
    if (i === 0) return prev;
    const next = [...prev];
    next[i - 1] = { ...next[i - 1], hexes: [...next[i - 1].hexes, ...next[i].hexes], area: next[i - 1].area + next[i].area };
    next.splice(i, 1);
    return next;
  });
  const split = i => setSlots(prev => {
    const s = prev[i];
    return [...prev.slice(0, i), ...s.hexes.map(hex => ({ hexes: [hex], area: s.area / s.hexes.length, keep: s.keep })), ...prev.slice(i + 1)];
  });
  const toggleKeep = i => setSlots(prev => prev.map((s, k) => (k === i ? { ...s, keep: !s.keep } : s)));

  const add = () => {
    const shape = useShapeStore.getState().addShape({
      name: name.trim() || 'Shape', cols: size.cols, rows: size.rows, svgContent: svg,
      tags: tags.split(','),
    });
    const docs = useDocumentStore.getState();
    if (docs.activeId) docs.setField(docs.activeId, 'enabledAssetIds', prev => new Set([...prev, shape.id]));
    onDone(shape);
  };

  if (error) {
    return (
      <>
        <h2 className={styles.dialogTitle}>Can’t import {file.name}</h2>
        <p className={styles.dialogBody}>{error}</p>
        <div className={styles.dialogActions}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSkip} autoFocus>{remaining ? 'Next' : 'Close'}</button>
        </div>
      </>
    );
  }
  if (!analysis || !size) return <p className={styles.dialogBody}>Reading {file.name}…</p>;

  return (
    <>
      <h2 className={styles.dialogTitle}>Import shape{remaining ? ` (${remaining + 1} left)` : ''}</h2>
      <div className={styles.importBody}>
        <div className={styles.importPreviews}>
          <img src={svgUrl(svg)} alt="" style={{ aspectRatio: `${size.cols} / ${size.rows}` }} title="As drawn" />
          <img src={svgUrl(slotPreview)} alt="" style={{ aspectRatio: `${size.cols} / ${size.rows}` }} title="Colour slots" />
        </div>
        <div className={styles.importFields}>
          <label className={styles.importRow}>
            <span>Name</span>
            <input value={name} onChange={e => setName(e.target.value)} spellCheck={false} />
          </label>
          <label className={styles.importRow}>
            <span>Size</span>
            <select value={`${size.cols}x${size.rows}`} onChange={e => { const [c, r] = e.target.value.split('x').map(Number); setSize({ cols: c, rows: r }); }}>
              {IMPORT_SIZES.map(([c, r]) => <option key={`${c}x${r}`} value={`${c}x${r}`}>{c} × {r} cells</option>)}
            </select>
          </label>
          <label className={styles.importRow}>
            <span>Background</span>
            <input type="checkbox" checked={background} onChange={e => setBackground(e.target.checked)} />
            <em>A square behind the shape, like the built-in shapes</em>
          </label>
          <label className={styles.importRow}>
            <span>Tags</span>
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="curves, heavy…" spellCheck={false} />
          </label>
        </div>
      </div>

      <button className={styles.importSlotsToggle} onClick={() => setShowSlots(v => !v)}>
        {showSlots ? '▼' : '▶'} Colour slots ({slots.filter(s => !s.keep).length})
      </button>
      {showSlots && (
        <div className={styles.importSlots}>
          {slots.length === 0 && <p className={styles.dialogBody}>No filled shapes found — the shape keeps its own colours.</p>}
          {(() => {
            let n = 0;
            return slots.map((s, i) => (
              <div key={s.hexes.join()} className={styles.importSlot}>
                <span className={styles.importSlotNum}>{s.keep ? '–' : (background ? n++ + 2 : ++n)}</span>
                <span className={styles.importSlotChips}>
                  {s.hexes.map(hex => <span key={hex} style={{ background: hex }} title={hex} />)}
                </span>
                <span className={styles.importSlotArea}>{Math.round(s.area * 100)}%</span>
                <button className={styles.btn} onClick={() => move(i, -1)} disabled={i === 0} title="Earlier slot">▲</button>
                <button className={styles.btn} onClick={() => move(i, 1)} disabled={i === slots.length - 1} title="Later slot">▼</button>
                <button className={styles.btn} onClick={() => mergeUp(i)} disabled={i === 0} title="Merge with the slot above (one colour)">Merge ↑</button>
                {s.hexes.length > 1 && <button className={styles.btn} onClick={() => split(i)} title="Split back into one slot per colour">Split</button>}
                <label title="Keep this colour as drawn; colour modes leave it alone">
                  <input type="checkbox" checked={!!s.keep} onChange={() => toggleKeep(i)} /> Keep
                </label>
              </div>
            ));
          })()}
          {background && <p className={styles.importNote}>Slot 1 is the background square.</p>}
        </div>
      )}

      <div className={styles.dialogActions}>
        {remaining > 0 && <button className={`${styles.btn} ${styles.btnLeft}`} onClick={onSkip}>Skip</button>}
        <button className={styles.btn} onClick={() => onDone(null, true)}>Cancel</button>
        <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={add} autoFocus>Import</button>
      </div>
    </>
  );
}

export function ShapeImportDialog() {
  const queue = useAppStore(s => s.shapeImport);
  const setQueue = useAppStore(s => s.setShapeImport);
  const showToast = useAppStore(s => s.showToast);
  const showDockTab = useAppStore(s => s.showDockTab);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    if (!queue?.length) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setQueue(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [queue, setQueue]);

  if (!queue?.length) return null;
  const next = (shape, cancelAll) => {
    const count = added + (shape ? 1 : 0);
    if (cancelAll || queue.length === 1) {
      if (count) {
        showToast(`Imported ${count} ${count === 1 ? 'shape' : 'shapes'} — Assets › My shapes`);
        showDockTab('assets', 'assets');
      }
      setAdded(0);
      setQueue(null);
      return;
    }
    setAdded(count);
    setQueue(queue.slice(1));
  };
  return (
    <div className={styles.backdrop}>
      <div className={`${styles.dialog} ${styles.importDialog}`} role="dialog" aria-modal="true">
        <ImportOne key={queue[0].id} file={queue[0]} remaining={queue.length - 1}
          onDone={next} onSkip={() => next(null)} />
      </div>
    </div>
  );
}
