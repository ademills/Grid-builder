import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Segmented } from '../../panels/controls';
import { pickAndReadTexts } from '../../shell/fileIO';
import { svgShapes } from '../../utils/linework/svgShapes';
import { wordShapes } from '../../utils/linework/traceMask';
import { planShapeRefresh } from './settings';
import shell from '../../shell/Shell.module.css';
import styles from '../../panels/Panel.module.css';

// Properties › Grid › Plates from SVG (v1.14): pick an SVG, split it into
// parts (its layers / groups, its colours, or each shape), and make a shape
// plate for each part picked, placed where it is in the SVG with the SVG
// fitted to the canvas. ctx.platesFromSvg is DocumentEditor's
// linework.plates.fromShapes.

const SPLITS = [
  { key: 'group', label: 'Layers / groups' }, { key: 'colour', label: 'Colours' }, { key: 'shape', label: 'Each shape' },
];
const STAND_IN = ['#7b61ff', '#ff6b6b', '#2ec4b6', '#ffbf47', '#3a86ff', '#8338ec', '#fb5607', '#06d6a0'];

function Dialog({ file, onClose, onMake, hasPlates }) {
  const [by, setBy] = useState('group');
  const [result, setResult] = useState(null);   // { by, shapes } once read
  const [error, setError] = useState(null);
  const [off, setOff] = useState(() => new Set()); // part keys left out
  const [padding, setPadding] = useState(0.05);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    svgShapes(file.text, { by })
      .then(s => {
        if (cancelled) return;
        // Splitting by layers that aren't there: fall back to colours.
        if (by === 'group' && s.parts.length < 2) {
          return svgShapes(file.text, { by: 'colour' }).then(c => {
            if (cancelled) return;
            if (c.parts.length > s.parts.length) { setBy('colour'); return; }
            setResult({ by, shapes: s });
          });
        }
        setResult({ by, shapes: s });
        setOff(new Set());
      })
      .catch(err => { if (!cancelled) setError(err.message ?? String(err)); });
    return () => { cancelled = true; };
  }, [file, by]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const shapes = result?.by === by ? result.shapes : null;
  const picked = useMemo(() => shapes?.parts.filter(p => !off.has(p.key)) ?? [], [shapes, off]);
  const toggle = key => setOff(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return createPortal(
    <div className={shell.backdrop}>
      <div className={`${shell.dialog} ${shell.importDialog}`} role="dialog" aria-modal="true">
        <h2 className={shell.dialogTitle}>Plates from {file.name}</h2>
        {error && <p className={shell.dialogBody}>{error}</p>}
        {!error && !shapes && <p className={shell.dialogBody}>Reading {file.name}…</p>}
        {!error && shapes && (
          <>
            <div className={shell.importBody}>
              <svg className={styles.svgPlatesPreview} viewBox={`0 0 ${shapes.width} ${shapes.height}`}>
                {shapes.parts.map((p, i) => (
                  <path key={p.key} d={p.d} fill={off.has(p.key) ? '#777' : STAND_IN[i % STAND_IN.length]}
                    fillOpacity={off.has(p.key) ? 0.25 : 0.85} />
                ))}
              </svg>
              <div className={shell.importFields}>
                <div className={shell.importRow}>
                  <span>Split by</span>
                  <Segmented value={by} onChange={setBy} options={SPLITS} />
                </div>
                <label className={shell.importRow}>
                  <span>Margin</span>
                  <input type="range" min={0} max={0.3} step={0.01} value={padding} onChange={e => setPadding(+e.target.value)} />
                  <em>{Math.round(padding * 100)}%</em>
                </label>
                {hasPlates && (
                  <label className={shell.importRow}>
                    <span>Replace</span>
                    <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
                    <em>Delete the plates there are now</em>
                  </label>
                )}
                <p className={shell.importNote}>
                  Each part becomes a plate the size of its box, cut to its shape with an outline. Switch a plate to Mask in its Plate
                  section to fill only the cells the shape covers instead.
                </p>
              </div>
            </div>
            <div className={shell.importSlots}>
              {shapes.parts.length === 0 && <p className={shell.dialogBody}>No filled shapes found in this SVG.</p>}
              {shapes.parts.map((p, i) => (
                <label key={p.key} className={shell.importSlot}>
                  <input type="checkbox" checked={!off.has(p.key)} onChange={() => toggle(p.key)} />
                  <span className={shell.importSlotChips}><span style={{ background: STAND_IN[i % STAND_IN.length] }} /></span>
                  <span className={shell.importSlotChips}><span style={{ background: p.colour }} title={p.colour} /></span>
                  <span className={styles.svgPlatesName}>{p.name}</span>
                  <span className={shell.importSlotArea}>{p.area < 0.01 ? '<1' : Math.round(p.area * 100)}%</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className={shell.dialogActions}>
          <button className={shell.btn} onClick={onClose}>Cancel</button>
          <button className={`${shell.btn} ${shell.btnPrimary}`} disabled={!picked.length}
            onClick={() => { onMake({ ...shapes, parts: picked }, { replace, padding, by, file: file.name }); onClose(); }}>
            Make {picked.length} {picked.length === 1 ? 'plate' : 'plates'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Word plates (13.3): a word set in any installed font, each letter traced
// into a cutout shape plate (or the whole word as one), laid out across the
// canvas the way Plates from SVG lays out an SVG's parts.
const COMMON_FONTS = ['Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Consolas', 'Constantia',
  'Corbel', 'Franklin Gothic Medium', 'Georgia', 'Impact', 'Segoe UI', 'Segoe UI Black', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];

function WordDialog({ onClose, onMake, hasPlates }) {
  const [text, setText] = useState('WORD');
  const [font, setFont] = useState('Arial Black');
  const [weight, setWeight] = useState('bold');
  const [whole, setWhole] = useState(false);
  const [padding, setPadding] = useState(0.08);
  const [replace, setReplace] = useState(false);
  const [fonts, setFonts] = useState(COMMON_FONTS);

  // The installed fonts, where the system lets the app list them.
  useEffect(() => {
    let cancelled = false;
    if (typeof window.queryLocalFonts === 'function') {
      window.queryLocalFonts().then(list => {
        if (cancelled) return;
        const families = [...new Set(list.map(f => f.family))].sort((a, b) => a.localeCompare(b));
        if (families.length) setFonts(families);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const shapes = useMemo(() => wordShapes(text, { font, weight, whole }), [text, font, weight, whole]);
  const n = shapes.parts.length;

  return createPortal(
    <div className={shell.backdrop}>
      <div className={`${shell.dialog} ${shell.importDialog}`} role="dialog" aria-modal="true">
        <h2 className={shell.dialogTitle}>Word plates</h2>
        <div className={shell.importBody}>
          <svg className={styles.svgPlatesPreview} viewBox={`0 0 ${shapes.width} ${shapes.height}`}>
            {shapes.parts.map((p, i) => <path key={p.key} d={p.d} fill={STAND_IN[i % STAND_IN.length]} fillOpacity={0.85} />)}
          </svg>
          <div className={shell.importFields}>
            <label className={shell.importRow}>
              <span>Text</span>
              <input value={text} onChange={e => setText(e.target.value)} spellCheck={false} autoFocus />
            </label>
            <label className={shell.importRow}>
              <span>Font</span>
              <input list="word-plate-fonts" value={font} onChange={e => setFont(e.target.value)} spellCheck={false} />
              <datalist id="word-plate-fonts">{fonts.map(f => <option key={f} value={f} />)}</datalist>
            </label>
            <div className={shell.importRow}>
              <span>Weight</span>
              <Segmented value={weight} onChange={setWeight} options={[{ key: 'normal', label: 'Regular' }, { key: 'bold', label: 'Bold' }]} />
            </div>
            <div className={shell.importRow}>
              <span>Plates</span>
              <Segmented value={whole ? 'word' : 'letters'} onChange={v => setWhole(v === 'word')}
                options={[{ key: 'letters', label: 'One per letter' }, { key: 'word', label: 'Whole word' }]} />
            </div>
            <label className={shell.importRow}>
              <span>Margin</span>
              <input type="range" min={0} max={0.3} step={0.01} value={padding} onChange={e => setPadding(+e.target.value)} />
              <em>{Math.round(padding * 100)}%</em>
            </label>
            {hasPlates && (
              <label className={shell.importRow}>
                <span>Replace</span>
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} />
                <em>Delete the plates there are now</em>
              </label>
            )}
            <p className={shell.importNote}>Any installed font works; type its name if it isn’t listed. Each letter is cut to its outline, with holes (O, A, B…) kept.</p>
          </div>
        </div>
        <div className={shell.dialogActions}>
          <button className={shell.btn} onClick={onClose}>Cancel</button>
          <button className={`${shell.btn} ${shell.btnPrimary}`} disabled={!n}
            onClick={() => { onMake(shapes, { replace, padding, by: 'word', file: null }); onClose(); }}>
            Make {n} {n === 1 ? 'plate' : 'plates'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Refresh from SVG (13.2): the edited SVG, split the way the plates were
// made, matched to them by part name (then by position in the file).
// Matched plates take the new shapes, and their new place and size unless
// that's switched off; new parts can be added and plates whose part is gone
// deleted. Everything else about each plate stays.
function RefreshDialog({ file, layers, onClose, onRefresh }) {
  const shaped = layers.filter((l, i) => i > 0 && l.shapeFrom?.file);
  const splits = [...new Set(shaped.map(l => l.shapeFrom.by ?? 'group'))];
  const [by, setBy] = useState(splits[0] ?? 'group');
  const [shapes, setShapes] = useState(null);
  const [error, setError] = useState(null);
  const [geometry, setGeometry] = useState(true);
  const [addKeys, setAddKeys] = useState(() => new Set());
  const [removeIds, setRemoveIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    svgShapes(file.text, { by }).then(s => { if (!cancelled) setShapes({ by, s }); })
      .catch(err => { if (!cancelled) setError(err.message ?? String(err)); });
    return () => { cancelled = true; };
  }, [file, by]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const current = shapes?.by === by ? shapes.s : null;
  const plan = useMemo(() => (current ? planShapeRefresh(layers, current, by) : null), [current, layers, by]);
  const nameOf = id => layers.find(l => l.id === id)?.name ?? id;
  const flip = (setter, k) => setter(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const apply = () => {
    onRefresh(current, plan, {
      geometry, by, file: file.name,
      add: plan.added.filter(p => addKeys.has(p.key)), remove: [...removeIds],
    });
    onClose();
  };

  return createPortal(
    <div className={shell.backdrop}>
      <div className={`${shell.dialog} ${shell.importDialog}`} role="dialog" aria-modal="true">
        <h2 className={shell.dialogTitle}>Refresh plates from {file.name}</h2>
        {error && <p className={shell.dialogBody}>{error}</p>}
        {!error && !plan && <p className={shell.dialogBody}>Reading {file.name}…</p>}
        {!error && plan && (
          <>
            {splits.length > 1 && (
              <div className={shell.importRow}>
                <span>Plates made by</span>
                <Segmented value={by} onChange={setBy} options={SPLITS.filter(o => splits.includes(o.key))} />
              </div>
            )}
            <label className={shell.importRow}>
              <span>Place &amp; size</span>
              <input type="checkbox" checked={geometry} onChange={e => setGeometry(e.target.checked)} />
              <em>Move and resize plates to where their part is now (off: only the shape changes)</em>
            </label>
            <div className={shell.importSlots}>
              <p className={shell.importNote}>
                {plan.matches.length} {plan.matches.length === 1 ? 'plate' : 'plates'} updated: {plan.matches.map(m => nameOf(m.id)).join(', ') || 'none'}
              </p>
              {plan.added.length > 0 && <p className={shell.importNote}>New in the SVG (tick to add as plates):</p>}
              {plan.added.map(p => (
                <label key={p.key} className={shell.importSlot}>
                  <input type="checkbox" checked={addKeys.has(p.key)} onChange={() => flip(setAddKeys, p.key)} />
                  <span className={shell.importSlotChips}><span style={{ background: p.colour }} /></span>
                  <span className={styles.svgPlatesName}>{p.name}</span>
                </label>
              ))}
              {plan.missing.length > 0 && <p className={shell.importNote}>No longer in the SVG (tick to delete the plate):</p>}
              {plan.missing.map(id => (
                <label key={id} className={shell.importSlot}>
                  <input type="checkbox" checked={removeIds.has(id)} onChange={() => flip(setRemoveIds, id)} />
                  <span className={styles.svgPlatesName}>{nameOf(id)}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <div className={shell.dialogActions}>
          <button className={shell.btn} onClick={onClose}>Cancel</button>
          <button className={`${shell.btn} ${shell.btnPrimary}`}
            disabled={!plan || (!plan.matches.length && !addKeys.size && !removeIds.size)} onClick={apply}>Refresh</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The Properties row: a button that picks the SVG and opens the dialog,
// and Refresh once there are plates made from one.
export function SvgPlates({ ctx }) {
  const [file, setFile] = useState(null);
  const [refresh, setRefresh] = useState(null);
  const [word, setWord] = useState(false);
  if (!ctx?.platesFromSvg) return null;
  const pick = async (then) => {
    const [f] = await pickAndReadTexts({ title: 'Plates from SVG', filters: [{ name: 'SVG', extensions: ['svg'] }] });
    if (f) then({ ...f, id: Math.random() });
  };
  const canRefresh = !!ctx.refreshShapes && (ctx.layers ?? []).some((l, i) => i > 0 && l.shapeFrom?.file);
  return (
    <>
      <div className={styles.formRow} title="Make a plate for each layer, group or colour of an SVG, cut to its shape">
        <span className={styles.label}>Plates</span>
        <span className={styles.actionBtns}>
          {canRefresh && <button className={styles.actionBtn} onClick={() => pick(setRefresh)} title="Update the plates made from an SVG after editing it">Refresh…</button>}
          <button className={styles.actionBtn} onClick={() => setWord(true)} title="A plate for each letter of a word, in any font">Word…</button>
          <button className={styles.actionBtn} onClick={() => pick(setFile)}>From SVG…</button>
        </span>
      </div>
      {file && <Dialog key={file.id} file={file} hasPlates={ctx.plateCount > 0} onClose={() => setFile(null)} onMake={ctx.platesFromSvg} />}
      {word && <WordDialog hasPlates={ctx.plateCount > 0} onClose={() => setWord(false)} onMake={ctx.platesFromSvg} />}
      {refresh && <RefreshDialog key={refresh.id} file={refresh} layers={ctx.layers} onClose={() => setRefresh(null)} onRefresh={ctx.refreshShapes} />}
    </>
  );
}
