import { useEffect, useRef, useState } from 'react';
import { ImagePicker } from '../../panels/controls';
import { useEditor } from '../../editor/EditorContext';
import { silhouetteCoverage, silhouetteCells } from '../../utils/silhouetteMask';
import styles from '../../panels/Panel.module.css';

// Custom fields for the Grid Pattern fill schemas (schema.js). Each takes
// ({ values, set }) like any schema field.

// Multi-Strip with manual spacing: one slider per strip.
export function StripPositions({ values: s, set }) {
  const positions = s.positions ?? [];
  return Array.from({ length: s.numStrips }, (_, i) => {
    const value = positions[i] ?? (i + 1) / (s.numStrips + 1);
    return (
      <div className={styles.formRow} key={i}>
        <span className={styles.label}>Strip {i + 1}</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={100} step={1}
            value={Math.round(value * 100)}
            onChange={e => {
              const next = [...positions];
              next[i] = +e.target.value / 100;
              set({ positions: next });
            }} />
          <span className={styles.sliderVal}>{Math.round(value * 100)}%</span>
        </div>
      </div>
    );
  });
}

// A small map of the cells the silhouette will fill, on the current grid.
function SilhouettePreview({ s }) {
  const { gridComputed } = useEditor();
  const ref = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!s.src || !gridComputed) return;
    let cancelled = false;
    const { cols, rows } = gridComputed;
    silhouetteCoverage(cols, rows, s).then(cov => {
      if (cancelled || !ref.current) return;
      setError(null);
      const on = new Set(silhouetteCells(cov, cols, rows, s));
      const cv = ref.current;
      const k = Math.max(2, Math.floor(220 / Math.max(cols, rows)));
      cv.width = cols * k; cv.height = rows * k;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#262626';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#7b61ff';
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) if (on.has(`${c},${r}`)) ctx.fillRect(c * k + 0.5, r * k + 0.5, k - 1, k - 1);
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [s, gridComputed]);
  if (!s.src) return null;
  if (error) return <div className={styles.gridNote}>{error}</div>;
  return <canvas ref={ref} className={styles.silhouettePreview} title="Cells this fill will use" />;
}

// Silhouette: the SVG or PNG used as the fill mask (utils/silhouetteMask.js).
export function SilhouetteImage({ values: s, set }) {
  return (
    <>
      <ImagePicker src={s.src} onChange={src => set({ src })} alt="Silhouette" />
      <SilhouettePreview s={s} />
    </>
  );
}
