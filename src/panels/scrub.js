import { useEffect } from 'react';
import styles from './Panel.module.css';

// Drag-to-scrub, as in Figma: press on a setting's label (or a number
// field's value) and drag sideways to change it. Shift drags finely.
//
// scrubDrag() runs one drag from a pointerdown. useSliderLabelScrub() wires
// every slider row's label up at once, without each panel opting in: the
// row's range input is driven through its normal onChange.

const THRESHOLD = 3; // px before a press becomes a drag

// Follows the pointer from `e` (a pointerdown). onDrag(dx, shiftKey) gets the
// distance from the start in px; onClick runs instead if it never moved.
export function scrubDrag(e, { onDrag, onClick }) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  let dragging = false;
  const move = (ev) => {
    const dx = ev.clientX - startX;
    if (!dragging && Math.abs(dx) < THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    }
    onDrag(dx, ev.shiftKey);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (!dragging) onClick?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Sets a React-controlled input's value so its onChange fires.
export function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// The full range of a slider spans this many px of drag (×10 with Shift).
const RANGE_PX = 160;

export function useSliderLabelScrub() {
  useEffect(() => {
    const onDown = (e) => {
      const label = e.target.closest?.(`.${styles.label}`);
      if (!label || e.target.closest(`.${styles.infoTip}`)) return;
      const ranges = label.parentElement?.querySelectorAll('input[type="range"]');
      if (ranges?.length !== 1 || ranges[0].disabled) return;
      const range = ranges[0];
      const min = +range.min, max = +range.max, start = +range.value;
      e.preventDefault();
      scrubDrag(e, {
        onDrag: (dx, fine) => {
          const v = Math.min(max, Math.max(min, start + dx * (max - min) / (RANGE_PX * (fine ? 10 : 1))));
          if (+range.value !== v) setInputValue(range, v); // the input snaps it to its step
        },
      });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
}
