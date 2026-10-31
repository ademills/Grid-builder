import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
import { wireframeRects } from '../utils/layouts';
import { randomSeed } from './panelUtils';
import { symmetryOptions, normaliseSymmetry } from '../utils/symmetry';
import { useAppStore } from '../store/appStore';
import { scrubDrag } from './scrub';
import styles from './Panel.module.css';

const NUMBER = /-?\d*\.?\d+/;

// Whole-number field: type a value, drag the value (or the row's label)
// sideways to scrub it, or step with − / +. `validValues` limits it to a
// sorted list (e.g. column counts that divide the artboard evenly).
export function NumberField({ value, onChange, min = 0, max = Infinity, format, validValues }) {
  const [draft, setDraft] = useState(null); // text while typing
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const latest = useRef({ value, onChange });

  const clampTo = (v) => {
    if (validValues?.length) return validValues.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best));
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  const stepFrom = (from, dir) => {
    if (!validValues) return clampTo(from + dir);
    const i = validValues.indexOf(clampTo(from));
    return validValues[Math.min(validValues.length - 1, Math.max(0, i + dir))];
  };
  const prevVal = stepFrom(value, -1), nextVal = stepFrom(value, 1);
  const set = (v) => { if (v !== latest.current.value) latest.current.onChange(v); };

  // Drag to scrub: one step per 6px (24px with Shift), counting steps from
  // the value at the start so validValues are walked in order.
  const stepN = (from, n) => {
    let v = from;
    for (let i = 0; i < Math.abs(n); i++) v = stepFrom(v, Math.sign(n));
    return v;
  };
  const scrubN = (e, onClick) => {
    const start = latest.current.value;
    scrubDrag(e, { onDrag: (dx, fine) => set(stepN(start, Math.trunc(dx / (fine ? 24 : 6)))), onClick });
  };
  // Handlers attached outside React (the label) read the latest props here.
  useLayoutEffect(() => { latest.current = { value, onChange, scrub: scrubN }; });

  // The row's label scrubs too.
  useEffect(() => {
    const row = wrapRef.current?.closest(`.${styles.formRow}, .${styles.stackedField}`);
    const label = row?.querySelector(`:scope > .${styles.label}`);
    if (!label) return;
    const onDown = (e) => { if (!e.target.closest(`.${styles.infoTip}`)) { e.preventDefault(); latest.current.scrub(e); } };
    label.addEventListener('pointerdown', onDown);
    return () => label.removeEventListener('pointerdown', onDown);
  }, []);

  const commit = () => {
    const typed = draft?.match(NUMBER);
    setDraft(null);
    if (typed) set(clampTo(+typed[0]));
  };

  return (
    <div className={`${styles.stepper} ${styles.numberField}`} ref={wrapRef}>
      <button className={styles.stepBtn} onClick={() => set(prevVal)} disabled={prevVal === value} tabIndex={-1} aria-label="Decrease">−</button>
      <input
        ref={inputRef}
        className={styles.stepVal}
        value={draft ?? (format ? format(value) : value)}
        inputMode="numeric"
        onPointerDown={(e) => {
          if (document.activeElement === inputRef.current) return;
          e.preventDefault();
          scrubN(e, () => inputRef.current?.focus());
        }}
        onFocus={(e) => { setDraft(String(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') { setDraft(null); requestAnimationFrame(() => inputRef.current?.blur()); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = stepFrom(clampTo(+(draft?.match(NUMBER)?.[0] ?? value)), e.key === 'ArrowUp' ? 1 : -1);
            setDraft(String(v));
            set(v);
          }
        }}
      />
      <button className={styles.stepBtn} onClick={() => set(nextVal)} disabled={nextVal === value} tabIndex={-1} aria-label="Increase">+</button>
    </div>
  );
}

// Toggle buttons for a multi-choice list: options = [[key, label]]; the
// value keeps the options' order.
export function Chips({ options, value, onChange }) {
  return (
    <div className={styles.fillPicker}>
      {options.map(([key, label]) => (
        <button key={key}
          className={`${styles.fillPickerBtn} ${value.includes(key) ? styles.fillPickerBtnActive : ''}`}
          onClick={() => onChange(value.includes(key) ? value.filter(v => v !== key) : options.map(o => o[0]).filter(k => k === key || value.includes(k)))}
        >{label}</button>
      ))}
    </div>
  );
}

// The old name, kept so existing panels need no change.
export const Stepper = NumberField;

// On/off switch for boolean settings.
export function Toggle({ value, onChange, title, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!value}
      className={`${styles.switch} ${value ? styles.switchOn : ''}`}
      onClick={() => onChange(!value)}
      title={title}
      disabled={disabled}
    ><span className={styles.switchKnob} /></button>
  );
}

export const Switch = Toggle;

// A folding group of settings inside a panel, with a light heading. Its
// open/closed state is remembered per `id` (shared across documents).
export function Section({ id, title, info, defaultOpen = true, children }) {
  const key = `section:${id}`;
  const collapsed = useAppStore(s => s.dock.groups[key]?.collapsed ?? !defaultOpen);
  const updateDockGroup = useAppStore(s => s.updateDockGroup);
  return (
    <section className={styles.subSection}>
      <div className={styles.subSectionHeader}>
        <button type="button" className={styles.subSectionToggle} aria-expanded={!collapsed}
          onClick={() => updateDockGroup(key, { collapsed: !collapsed })}>
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
            <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {title}
        </button>
        {info && <InfoTip text={info} />}
      </div>
      {!collapsed && <div className={styles.subSectionBody}>{children}</div>}
    </section>
  );
}

// An ⓘ that explains a setting on hover or focus, in place of help text
// that would otherwise sit in the panel. A native tooltip, so the panel's
// scroll area can't clip it.
export function InfoTip({ text }) {
  return (
    <span className={styles.infoTip} title={text} aria-label={text} role="img" tabIndex={0}>
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M10 9v5M10 6.2v.1" strokeLinecap="round" />
      </svg>
    </span>
  );
}

// Segmented control: options = [{ key, label }]
export function Segmented({ value, options, onChange }) {
  return (
    <div className={styles.modeToggle}>
      {options.map(({ key, label, disabled, title }) => (
        <button key={String(key)}
          className={`${styles.modeBtn} ${value === key ? styles.modeBtnActive : ''}`}
          onClick={() => onChange(key)}
          disabled={disabled}
          title={title}
        >{label}</button>
      ))}
    </div>
  );
}

export function SeedField({ value, onChange }) {
  return (
    <div className={styles.formRow}>
      <span className={styles.label}>Seed</span>
      <div className={styles.sliderRow}>
        <input type="number" className={styles.numberInput} style={{ flex: 1 }}
          value={value}
          onChange={e => onChange(+e.target.value || 0)} />
        <button className={styles.actionBtn} title="Randomise seed" onClick={() => onChange(randomSeed())}>⟳</button>
      </div>
    </div>
  );
}

// Symmetry picker shared by the generator panels, listing the modes in `keys`.
export function SymmetrySelect({ value, onChange, keys }) {
  return (
    <select className={styles.select} value={normaliseSymmetry(value)} onChange={e => onChange(e.target.value)}>
      {symmetryOptions(keys).map(m => (
        <option key={m.key} value={m.key} title={m.title}>{m.key === 'none' ? m.label : `${m.icon}  ${m.label}`}</option>
      ))}
    </select>
  );
}

// Image upload with thumbnail, Replace and Remove. Reads the file as a data URL.
export function ImagePicker({ src, onChange, alt = 'Image' }) {
  const inputRef = useRef(null);
  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => onChange(evt.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <div className={styles.imageUploadArea}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
      {src ? (
        <div className={styles.imageThumbnailWrapper}>
          <img src={src} className={styles.imageThumbnail} alt={alt} />
          <div className={styles.imageThumbnailActions}>
            <button className={styles.imageReplaceBtn} onClick={() => inputRef.current?.click()}>Replace</button>
            <button className={styles.imageRemoveBtn} onClick={() => onChange(null)} title="Remove">×</button>
          </div>
        </div>
      ) : (
        <button className={styles.ingestBtn} onClick={() => inputRef.current?.click()}>Upload image…</button>
      )}
    </div>
  );
}

// Grouped list of built-in palettes plus the user's own. `onPick(colors, name, isCustom)`.
export function PaletteList({ activeKey, customPalettes, onPickBuiltIn, onPickCustom, onDeleteCustom, filter = '' }) {
  const [openGroups, setOpenGroups] = useState(() => new Set(['__custom__']));
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const q = filter.trim().toLowerCase();
  const searching = q.length > 0;
  const custom = (customPalettes ?? []).filter(p => !q || p.name.toLowerCase().includes(q));

  return (
    <>
      {custom.length > 0 && (
        <div>
          <button className={styles.paletteGroupHeader} onClick={() => toggleGroup('__custom__')}>
            <span className={styles.paletteGroupArrow}>{searching || openGroups.has('__custom__') ? '▼' : '▶'}</span>
            <span className={styles.paletteGroupName}>My Palettes</span>
            <span className={styles.paletteGroupCount}>{custom.length}</span>
          </button>
          {(searching || openGroups.has('__custom__')) && custom.map(p => (
            <div key={p.name} className={styles.palettePickerRow}>
              <button className={styles.palettePickerItem} onClick={() => onPickCustom(p)}>
                <span className={styles.palettePickerName}>{p.name}</span>
                <span className={styles.palettePickerSwatches}>
                  {p.colors.map((c, i) => <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />)}
                </span>
              </button>
              {onDeleteCustom && (
                <button className={styles.customSwatchRemove} onClick={() => onDeleteCustom(p.name)} title="Delete palette">×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {PALETTE_GROUPS.map(group => {
        const keys = group.keys.filter(k => !q || k.toLowerCase().includes(q));
        if (!keys.length) return null;
        const open = searching || openGroups.has(group.name);
        return (
          <div key={group.name}>
            <button className={styles.paletteGroupHeader} onClick={() => toggleGroup(group.name)}>
              <span className={styles.paletteGroupArrow}>{open ? '▼' : '▶'}</span>
              <span className={styles.paletteGroupName}>{group.name}</span>
              <span className={styles.paletteGroupCount}>{keys.length}</span>
            </button>
            {open && keys.map(k => (
              <button
                key={k}
                className={`${styles.palettePickerItem} ${k === activeKey ? styles.palettePickerItemActive : ''}`}
                onClick={() => onPickBuiltIn(k)}
              >
                <span className={styles.palettePickerName}>{k}</span>
                <span className={styles.palettePickerSwatches}>
                  {PALETTES[k]?.map((c, i) => <span key={i} className={styles.palettePickerSwatch} style={{ background: c }} />)}
                </span>
                {k === activeKey && <span className={styles.palettePickerTick}>✓</span>}
              </button>
            ))}
          </div>
        );
      })}
    </>
  );
}

// Mini SVG preview of a layout: grid slots as hatched outlines, other slots as
// their wireframe placeholder rects. Drawn in a 0–1 coordinate box scaled to
// the work-area aspect ratio.
export function LayoutThumb({ layout, aspect = 0.75, size = 46 }) {
  const w = size, h = size / aspect;
  return (
    <svg width={w} height={h} viewBox="0 0 1 1" preserveAspectRatio="none"
      style={{ display: 'block', background: '#fff', borderRadius: 2 }}>
      {layout.slots.map((s, i) => {
        if (s.role === 'grid') {
          return (
            <g key={i}>
              <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="rgba(123,97,255,0.14)" stroke="rgba(123,97,255,0.6)" strokeWidth={0.006} />
              <line x1={s.x} y1={s.y} x2={s.x + s.w} y2={s.y + s.h} stroke="rgba(123,97,255,0.4)" strokeWidth={0.006} />
              <line x1={s.x + s.w} y1={s.y} x2={s.x} y2={s.y + s.h} stroke="rgba(123,97,255,0.4)" strokeWidth={0.006} />
            </g>
          );
        }
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        return (
          <g key={i} transform={s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined}>
            {wireframeRects(s.role, s.align).map((r, j) => (
              <rect key={j}
                x={s.x + r.x * s.w} y={s.y + r.y * s.h}
                width={r.w * s.w} height={r.h * s.h}
                fill={`rgba(0,0,0,${r.shade})`} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
