import { useMemo, useState } from 'react';
import { useDocField } from '../store/useDocField';
import { useAppStore } from '../store/appStore';
import { useEditor } from '../editor/EditorContext';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { blockSlotColours } from '../utils/blockColours';
import { assetThumb } from './panelUtils';
import styles from './Panel.module.css';

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion'];

// The value every block shares, or MIXED.
const MIXED = Symbol('mixed');
function common(blocks, get) {
  const first = get(blocks[0]);
  return blocks.every(b => get(b) === first) ? first : MIXED;
}

// Opacity slider that only records an undo step when you let go.
function OpacitySlider({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value === MIXED ? 1 : value);
  const commit = () => { if (draft != null) { onCommit(draft); setDraft(null); } };
  return (
    <div className={styles.sliderRow}>
      <input type="range" className={styles.slider} min={0} max={100} step={1}
        value={Math.round(shown * 100)}
        onChange={e => setDraft(+e.target.value / 100)}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <span className={styles.sliderVal}>{value === MIXED && draft == null ? 'Mixed' : `${Math.round(shown * 100)}%`}</span>
    </div>
  );
}

// Info: the selected shapes' properties, editable, plus where the pointer is.
// Like Illustrator's Transform / Info panels combined.
export function InfoPanel() {
  const { selectedIds, selectionActions, colourCtx } = useEditor();
  const [placedBlocks] = useDocField('placedBlocks');
  const cursor = useAppStore(s => s.cursor);
  const setToolOption = useAppStore(s => s.setToolOption);

  const selected = useMemo(
    () => placedBlocks.filter(b => selectedIds.has(b.id) && !b.type),
    [placedBlocks, selectedIds],
  );
  const editable = selected.filter(b => !b.locked);
  const single = selected.length === 1 ? selected[0] : null;

  const footprint = selected.length ? common(selected, b => `${b.cols}x${b.rows}`) : MIXED;
  const shapeOptions = useMemo(() => {
    if (footprint === MIXED) return [];
    const [c, r] = footprint.split('x').map(Number);
    return ALL_BUILTIN_ASSETS.filter(a => (a.cols ?? 1) === c && (a.rows ?? 1) === r);
  }, [footprint]);

  const pointer = (
    <div className={styles.gridInfo} style={{ marginTop: 10 }}>
      {cursor
        ? <>Pointer: {cursor.x}, {cursor.y} px{cursor.col != null && <> · cell {cursor.col + 1}, {cursor.row + 1}</>}{cursor.shape && <> · {cursor.shape}</>}</>
        : 'Move the pointer over the artboard to see its position.'}
    </div>
  );

  if (!selected.length) {
    return (
      <div className={styles.sectionContent}>
        <div className={styles.gridNote}>Select shapes to see and edit their shape, rotation, opacity and blend mode.</div>
        {pointer}
      </div>
    );
  }

  const square = selected.every(b => b.cols === b.rows);
  const rotation = common(selected, b => ((b.rotation ?? 0) % 360 + 360) % 360);
  const flipX = common(selected, b => !!b.flipX);
  const flipY = common(selected, b => !!b.flipY);
  const opacity = common(selected, b => b.opacity ?? 1);
  const blend = common(selected, b => b.blendMode ?? 'normal');
  const shapeId = common(selected, b => b.assetId);
  const current = ALL_BUILTIN_ASSETS.find(a => a.id === shapeId);
  const lockedCount = selected.length - editable.length;
  const set = selectionActions.setProps;
  const slots = single ? blockSlotColours(single, colourCtx) ?? [] : [];

  return (
    <div className={styles.sectionContent}>
      <div className={styles.subHeading}>
        {single ? (single.name ?? 'Shape') : `${selected.length} shapes`}
      </div>
      {lockedCount > 0 && (
        <div className={styles.gridNote}>{lockedCount} locked {lockedCount === 1 ? 'shape is' : 'shapes are'} left unchanged.</div>
      )}

      <div className={styles.formRow}>
        <span className={styles.label}>Shape</span>
        {footprint === MIXED ? (
          <span className={styles.gridNote} style={{ margin: 0 }}>Shapes of different sizes</span>
        ) : (
          <div className={styles.sliderRow}>
            {current && <img src={assetThumb(current)} alt="" width={22} height={22} style={{ borderRadius: 3, flex: 'none' }} />}
            <select className={styles.select} value={shapeId === MIXED ? '' : shapeId ?? ''}
              onChange={e => { const a = ALL_BUILTIN_ASSETS.find(x => x.id === e.target.value); if (a) selectionActions.setShape(a); }}>
              {shapeId === MIXED && <option value="" disabled>Mixed</option>}
              {shapeOptions.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {single && (
        <div className={styles.formRow}>
          <span className={styles.label}>Position</span>
          <span className={styles.gridNote} style={{ margin: 0 }}>
            Cell {single.gridCol + 1}, {single.gridRow + 1} · {single.cols} × {single.rows} {single.cols * single.rows === 1 ? 'cell' : 'cells'}
          </span>
        </div>
      )}

      <div className={styles.formRow}>
        <span className={styles.label}>Rotate</span>
        <div className={styles.modeToggle}>
          {(square ? [0, 90, 180, 270] : [0, 180]).map(r => (
            <button key={r} className={`${styles.modeBtn} ${rotation === r ? styles.modeBtnActive : ''}`}
              onClick={() => set({ rotation: r })}>{r}°</button>
          ))}
        </div>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Reflect</span>
        <div className={styles.modeToggle}>
          <button className={`${styles.modeBtn} ${flipX === true ? styles.modeBtnActive : ''}`}
            onClick={() => set({ flipX: flipX !== true })} title="Mirror left to right">Horizontal</button>
          <button className={`${styles.modeBtn} ${flipY === true ? styles.modeBtnActive : ''}`}
            onClick={() => set({ flipY: flipY !== true })} title="Mirror top to bottom">Vertical</button>
        </div>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Opacity</span>
        <OpacitySlider key={selected.map(b => b.id).join()} value={opacity} onCommit={v => set({ opacity: v })} />
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Blend</span>
        <select className={styles.select} value={blend === MIXED ? '' : blend}
          onChange={e => set({ blendMode: e.target.value })}>
          {blend === MIXED && <option value="" disabled>Mixed</option>}
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {single && slots.length > 0 && (
        <div className={styles.formRow}>
          <span className={styles.label}>Colours</span>
          <div className={styles.paletteSwatchToggles} style={{ margin: 0 }}>
            {slots.map((hex, i) => hex && (
              <button key={i} className={styles.popSwatchSmall}
                style={{ background: hex, outline: single.slotPins?.[i] ? '2px solid var(--chrome-accent)' : undefined }}
                title={`${hex}${single.slotPins?.[i] ? ' · pinned to a swatch' : ''} — click to use as the paint colour`}
                onClick={() => setToolOption({ paintHex: hex })} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.actionBtns} style={{ marginTop: 8 }}>
        <button className={styles.actionBtn} onClick={selectionActions.randomOpacity} disabled={!editable.length}>Random opacity</button>
        <button className={styles.actionBtn} onClick={selectionActions.resetAppearance} disabled={!editable.length}>Reset opacity & blend</button>
      </div>

      {pointer}
    </div>
  );
}
