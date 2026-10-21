import { useRef, useState } from 'react';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
import { wireframeRects } from '../utils/layouts';
import { randomSeed } from './panelUtils';
import styles from './Panel.module.css';

export function Stepper({ value, onChange, min = 0, max = Infinity, format, validValues }) {
  let prevVal, nextVal;
  if (validValues) {
    prevVal = [...validValues].reverse().find(v => v < value) ?? null;
    nextVal = validValues.find(v => v > value) ?? null;
  } else {
    prevVal = value > min ? value - 1 : null;
    nextVal = value < max ? value + 1 : null;
  }
  return (
    <div className={styles.stepper}>
      <button className={styles.stepBtn} onClick={() => prevVal != null && onChange(prevVal)} disabled={prevVal == null}>−</button>
      <span className={styles.stepVal}>{format ? format(value) : value}</span>
      <button className={styles.stepBtn} onClick={() => nextVal != null && onChange(nextVal)} disabled={nextVal == null}>+</button>
    </div>
  );
}

// On/Off toggle used for boolean settings.
export function Toggle({ value, onChange, title }) {
  return (
    <button
      className={`${styles.modeBtn} ${value ? styles.modeBtnActive : ''}`}
      style={{ flex: 'none', minWidth: 44 }}
      onClick={() => onChange(!value)}
      title={title}
    >{value ? 'On' : 'Off'}</button>
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
