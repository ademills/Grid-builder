import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePicker } from '../../panels/controls';
import { useEditor } from '../../editor/EditorContext';
import { silhouetteCoverage, silhouetteCells } from '../../utils/silhouetteMask';
import { computeColourRegions, regionDefaults } from '../../utils/regionFill';
import { useShapeStore } from '../../store/shapeStore';
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

// Colour Regions: one row per region (darkest first) with its colour from
// the image, its shapes (enabled shapes, a pack or none), scale and density.
export function RegionList({ values: s, set }) {
  const { gridComputed, imagePixels } = useEditor();
  const packs = useShapeStore(st => st.packs);
  const found = useMemo(
    () => (gridComputed && imagePixels ? computeColourRegions(gridComputed, imagePixels, s) : null),
    [gridComputed, imagePixels, s.numRegions, s.smoothing, s.seed], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const regions = regionDefaults(s.numRegions, s.regions);
  const total = found ? found.counts.reduce((a, b) => a + b, 0) : 0;
  const setRegion = (i, changes) => {
    const next = regionDefaults(Math.max(8, s.numRegions), s.regions);
    next[i] = { ...next[i], ...changes };
    set({ regions: next });
  };
  if (!imagePixels) return <div className={styles.gridNote}>Load an image in Image colour mode (Colour panel) to see its regions.</div>;
  return Array.from({ length: s.numRegions }, (_, i) => {
    const r = regions[i];
    return (
      <div key={i} className={styles.regionRow}>
        <div className={styles.formRow}>
          <span className={styles.label}>
            <span className={styles.regionChip} style={{ background: found?.colours[i] ?? '#888' }} />
            Region {i + 1}
            {found && <span className={styles.regionShare}>{Math.round((found.counts[i] / total) * 100)}%</span>}
          </span>
          <select className={styles.select} value={r.shapes} onChange={e => setRegion(i, { shapes: e.target.value })}>
            <option value="enabled">Enabled shapes</option>
            {packs.map(p => <option key={p.id} value={p.id}>Pack: {p.name}</option>)}
            <option value="none">Leave empty</option>
          </select>
        </div>
        {r.shapes !== 'none' && (
          <div className={styles.formRow}>
            <span className={styles.label} style={{ paddingLeft: 18 }}>Scale · density</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider} min={1} max={4} step={1} value={r.maxScale}
                onChange={e => setRegion(i, { maxScale: +e.target.value })} title="Largest scale shapes may grow to" />
              <span className={styles.sliderVal} style={{ minWidth: 22 }}>{r.maxScale}×</span>
              <input type="range" className={styles.slider} min={0.1} max={1} step={0.05} value={r.density}
                onChange={e => setRegion(i, { density: +e.target.value })} title="Share of the region's cells that get a shape" />
              <span className={styles.sliderVal}>{Math.round(r.density * 100)}%</span>
            </div>
          </div>
        )}
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
