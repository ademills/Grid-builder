import { useState, useMemo, useEffect } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { colorizeSvg } from '../utils/colorize';
import styles from './SelectionToolbar.module.css';

export function SelectionToolbar({
  selectedBlocks,
  viewTransform,
  gridComputed,
  uploadedAssets,
  colorMode,
  effectivePalette,
  customWhite,
  customBlack,
  onDelete,
  onRefresh,
  onRandomise,
  onSwap,
}) {
  const [swapOpen, setSwapOpen] = useState(false);
  const [query, setQuery]       = useState('');

  const hasSelection = selectedBlocks.length > 0;

  // ── All hooks must be called unconditionally, before any early return ────

  useEffect(() => {
    if (!hasSelection) setSwapOpen(false);
  }, [hasSelection]);

  const allAssets = useMemo(
    () => [...ALL_BUILTIN_ASSETS, ...uploadedAssets],
    [uploadedAssets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allAssets.filter(a => a.name.toLowerCase().includes(q)) : allAssets;
  }, [allAssets, query]);

  // ── Early return after all hooks ─────────────────────────────────────────

  if (!hasSelection || !gridComputed) return null;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const { x: panX, y: panY, scale } = viewTransform;

  const minCol = Math.min(...selectedBlocks.map(b => b.gridCol));
  const minRow = Math.min(...selectedBlocks.map(b => b.gridRow));
  const maxCol = Math.max(...selectedBlocks.map(b => b.gridCol + b.cols));

  const svgCX  = gridOriginX + ((minCol + maxCol) / 2) * cellSize;
  const svgTop = gridOriginY + minRow * cellSize;

  const screenLeft = Math.round(svgCX  * scale + panX);
  const screenTop  = Math.round(svgTop * scale + panY);

  const thumbUrl = (asset) => {
    const svg = colorMode !== 'none'
      ? colorizeSvg(asset.svgContent, colorMode, effectivePalette, 0, 0, customWhite, customBlack)
      : asset.svgContent;
    const clean = svg
      .replace(/^<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  };

  return (
    <div
      className={styles.root}
      style={{ left: screenLeft, top: screenTop }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Action bar */}
      <div className={styles.bar}>
        {colorMode !== 'none' && (
          <button className={styles.btn} onClick={onRefresh} title="Refresh colour">↺</button>
        )}
        <button className={styles.btn} onClick={onRandomise} title="Swap to random SVG">⚄</button>
        <button
          className={`${styles.btn} ${swapOpen ? styles.btnActive : ''}`}
          onClick={() => { setSwapOpen(s => !s); setQuery(''); }}
          title="Swap SVG"
        >⇄</button>
        <div className={styles.divider} />
        <button className={`${styles.btn} ${styles.btnDelete}`} onClick={onDelete} title="Delete">×</button>
      </div>

      {/* Swap panel */}
      {swapOpen && (
        <div className={styles.swapPanel}>
          <input
            className={styles.swapSearch}
            placeholder="Search assets…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div className={styles.swapGrid}>
            {filtered.map(asset => (
              <button
                key={asset.id}
                className={styles.swapItem}
                onClick={() => { onSwap(asset); setSwapOpen(false); setQuery(''); }}
                title={`${asset.theme ?? ''} / ${asset.size ?? ''} / ${asset.name}`}
              >
                <img src={thumbUrl(asset)} alt={asset.name} className={styles.swapThumb} />
                <span className={styles.swapName}>{asset.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className={styles.swapEmpty}>No assets found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
