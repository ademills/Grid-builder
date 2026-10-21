import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeHex } from './panelUtils';
import styles from './Panel.module.css';

// HSB colour picker (saturation/brightness square + hue strip) with hex and
// RGB fields and, where the platform supports it, a screen eyedropper.
// `onChange(hex)` fires at most once per animation frame while dragging.

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsvToRgb([h, s, v]) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function useDrag(onMove) {
  const ref = useRef(null);
  const start = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const move = (ev) => {
      const rect = el.getBoundingClientRect();
      onMove(
        Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width)),
        Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height)),
      );
    };
    move(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, [onMove]);
  return [ref, start];
}

export function ColorPicker({ value, onChange }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)));
  const [hexDraft, setHexDraft] = useState(value);
  // The last colour this picker sent out, so its own changes echoing back
  // through `value` don't reset the HSV state (which would lose hue on greys).
  const [lastEmitted, setLastEmitted] = useState(value);

  // Follow external changes (e.g. a different swatch selected, undo).
  const [source, setSource] = useState(value);
  if (source !== value) {
    setSource(value);
    if (value !== lastEmitted) {
      setHsv(rgbToHsv(hexToRgb(value)));
      setHexDraft(value);
    }
  }

  const raf = useRef(null);
  const pending = useRef(null);
  const emit = useCallback((hex) => {
    pending.current = hex;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setLastEmitted(pending.current);
      onChange(pending.current);
    });
  }, [onChange]);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const applyHsv = useCallback((next) => {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    setHexDraft(hex);
    emit(hex);
  }, [emit]);

  const [svRef, svStart] = useDrag(useCallback((x, y) => applyHsv([hsv[0], x, 1 - y]), [hsv, applyHsv]));
  const [hueRef, hueStart] = useDrag(useCallback((x) => applyHsv([x * 360, hsv[1], hsv[2]]), [hsv, applyHsv]));

  const rgb = hsvToRgb(hsv).map(Math.round);
  const hex = rgbToHex(rgb);
  const hueHex = rgbToHex(hsvToRgb([hsv[0], 1, 1]));

  const setChannel = (i, v) => {
    const next = [...rgb];
    next[i] = Math.min(255, Math.max(0, +v || 0));
    applyHsv(rgbToHsv(next));
  };

  const commitHex = () => {
    const h = normalizeHex(hexDraft);
    if (h) applyHsv(rgbToHsv(hexToRgb(h)));
    else setHexDraft(hex);
  };

  const canEyedrop = typeof window !== 'undefined' && 'EyeDropper' in window;
  const eyedrop = async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const h = normalizeHex(sRGBHex);
      if (h) applyHsv(rgbToHsv(hexToRgb(h)));
    } catch { /* cancelled */ }
  };

  return (
    <div className={styles.picker}>
      <div ref={svRef} className={styles.pickerSV} style={{ background: hueHex }} onPointerDown={svStart}>
        <div className={styles.pickerSVWhite} />
        <div className={styles.pickerSVBlack} />
        <div className={styles.pickerSVThumb} style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: hex }} />
      </div>
      <div ref={hueRef} className={styles.pickerHue} onPointerDown={hueStart}>
        <div className={styles.pickerHueThumb} style={{ left: `${(hsv[0] / 360) * 100}%` }} />
      </div>
      <div className={styles.pickerFields}>
        <input className={styles.hexInput} value={hexDraft} spellCheck={false} maxLength={7}
          onChange={e => setHexDraft(e.target.value)}
          onBlur={commitHex}
          onKeyDown={e => e.key === 'Enter' && commitHex()}
          aria-label="Hex" />
        {['R', 'G', 'B'].map((ch, i) => (
          <label key={ch} className={styles.pickerChannel}>
            <span>{ch}</span>
            <input type="number" min={0} max={255} className={styles.numberInput} value={rgb[i]}
              onChange={e => setChannel(i, e.target.value)} />
          </label>
        ))}
        {canEyedrop && (
          <button className={styles.addQuickBtn} onClick={eyedrop} title="Pick a colour from the screen">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M13 3.5l3.5 3.5-2 2-1-1-6.5 6.5H4.5v-2.5L11 5.5l-1-1z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
