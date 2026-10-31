import { useEffect } from 'react';
import { setInputValue } from './scrub';
import styles from './Panel.module.css';

// Click a slider's value readout to type a number. Works for every
// `.sliderVal` that directly follows a range input, without each panel
// opting in: the typed number is converted back to the slider's own scale
// (the readout may show 0.55 as "55%"), clamped and step-snapped by the
// input itself, then fed through the slider's normal onChange.

const NUMBER = /-?\d*\.?\d+/;

function sliderFor(el) {
  const prev = el?.previousElementSibling;
  return prev?.tagName === 'INPUT' && prev.type === 'range' ? prev : null;
}

// Readout units per slider unit, e.g. 100 for a 0–1 slider shown as a percentage.
function displayFactor(text, slider) {
  const shown = text.match(NUMBER);
  const value = +slider.value;
  if (shown && value !== 0 && +shown[0] !== 0) {
    return 10 ** Math.round(Math.log10(Math.abs(+shown[0] / value)));
  }
  if (text.includes('%')) return +slider.max <= 1 ? 100 : 1;
  return !shown && +slider.max <= 1 ? 100 : 1;
}

function beginEdit(readout, slider) {
  const text = readout.textContent.trim();
  const factor = displayFactor(text, slider);
  const shown = text.match(NUMBER);
  const rect = readout.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = styles.sliderValEdit;
  input.value = shown ? shown[0] : String(+(+slider.value * factor).toFixed(4));
  const width = Math.max(rect.width + 12, 52);
  Object.assign(input.style, {
    left: `${rect.right - width + 4}px`, top: `${rect.top + rect.height / 2 - 11}px`, width: `${width}px`,
  });

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const typed = input.value.match(NUMBER);
    input.remove();
    if (commit && typed && slider.isConnected) setInputValue(slider, +typed[0] / factor);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  document.body.appendChild(input);
  input.focus();
  input.select();
}

export function useSliderValueTyping() {
  useEffect(() => {
    const onClick = (e) => {
      const readout = e.target.closest?.(`.${styles.sliderVal}`);
      const slider = sliderFor(readout);
      if (!slider || slider.disabled) return;
      e.preventDefault();
      beginEdit(readout, slider);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}
