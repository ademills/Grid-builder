import { useState, useMemo } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { assetThumb } from '../panels/panelUtils';
import { RotateIcon, ReflectIcon, WandIcon, BucketIcon, EyeIcon, LockIcon, PinIcon, DiceIcon } from '../shell/icons';
import styles from './SelectionToolbar.module.css';

function Btn({ onClick, title, active, danger, children }) {
  return (
    <button
      className={`${styles.btn} ${active ? styles.btnActive : ''} ${danger ? styles.btnDelete : ''}`}
      onClick={onClick}
      title={title}
    >{children}</button>
  );
}

// Contextual task bar that floats above the current selection (like
// Illustrator's): quick edits for the selected shapes.
export function SelectionToolbar({
  selectedBlocks,
  viewTransform,
  gridComputed,
  colorMode,
  paintHex,
  onDelete,
  onRefresh,
  onRandomise,
  onSwap,
  onToggleLock,
  onRotate,
  onReflect,
  onSelectSame,
  onPaint,
  onHide,
  onLock,
  onUnpin,
}) {
  const [swapFor, setSwapFor] = useState(null);
  const [query, setQuery] = useState('');

  // The swap picker belongs to the selection it was opened for, so it
  // closes by itself when the selection changes.
  const selectionKey = selectedBlocks.map(b => b.id).join(',');
  const swapOpen = swapFor === selectionKey && selectionKey !== '';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_BUILTIN_ASSETS.filter(a => a.name.toLowerCase().includes(q)) : ALL_BUILTIN_ASSETS;
  }, [query]);

  if (!selectedBlocks.length || !gridComputed) return null;

  const allFrozen = selectedBlocks.every(b => b.colorLocked);
  const anyPinned = selectedBlocks.some(b => b.slotPins);
  const single = selectedBlocks.length === 1;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const { x: panX, y: panY, scale } = viewTransform;
  const minCol = Math.min(...selectedBlocks.map(b => b.gridCol));
  const minRow = Math.min(...selectedBlocks.map(b => b.gridRow));
  const maxCol = Math.max(...selectedBlocks.map(b => b.gridCol + b.cols));
  const screenLeft = Math.round((gridOriginX + ((minCol + maxCol) / 2) * cellSize) * scale + panX);
  const screenTop = Math.round((gridOriginY + minRow * cellSize) * scale + panY);

  return (
    <div
      className={styles.root}
      style={{ left: screenLeft, top: screenTop }}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className={styles.bar}>
        <span className={styles.count} title={`${selectedBlocks.length} selected`}>{selectedBlocks.length}</span>
        <div className={styles.divider} />
        <Btn onClick={onSelectSame} title="Select all shapes with the same colour"><WandIcon size={15} /></Btn>
        <Btn onClick={onPaint} title={`Paint the main colour with ${paintHex}`}>
          <span className={styles.paintIcon}><BucketIcon size={15} /><span style={{ background: paintHex }} /></span>
        </Btn>
        {colorMode !== 'none' && <Btn onClick={onRefresh} title="Shuffle colours">↺</Btn>}
        <Btn onClick={onToggleLock} active={allFrozen} title={allFrozen ? 'Unfreeze colours' : 'Freeze colours (keep them through shuffles)'}>❄</Btn>
        {anyPinned && <Btn onClick={onUnpin} title="Remove pinned colours"><PinIcon size={14} /></Btn>}
        <div className={styles.divider} />
        <Btn onClick={onRotate} title="Rotate 90° (R)"><RotateIcon size={15} /></Btn>
        <Btn onClick={onReflect} title="Reflect horizontally (O)"><ReflectIcon size={15} /></Btn>
        <Btn onClick={onRandomise} title="Swap for a random shape"><DiceIcon size={15} /></Btn>
        <Btn onClick={() => { setSwapFor(swapOpen ? null : selectionKey); setQuery(''); }} active={swapOpen}
          title={single ? 'Swap shape…' : 'Swap all for one shape…'}>⇄</Btn>
        <div className={styles.divider} />
        <Btn onClick={onHide} title="Hide"><EyeIcon off size={15} /></Btn>
        <Btn onClick={onLock} title="Lock"><LockIcon size={15} /></Btn>
        <Btn onClick={onDelete} danger title="Delete">×</Btn>
      </div>

      {swapOpen && (
        <div className={styles.swapPanel}>
          <input
            className={styles.swapSearch}
            placeholder="Search shapes…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <div className={styles.swapGrid}>
            {filtered.map(asset => (
              <button
                key={asset.id}
                className={styles.swapItem}
                onClick={() => { onSwap(asset); setSwapFor(null); setQuery(''); }}
                title={`${asset.theme ?? ''} / ${asset.size ?? ''} / ${asset.name}`}
              >
                <img src={assetThumb(asset)} alt={asset.name} className={styles.swapThumb} />
                <span className={styles.swapName}>{asset.name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className={styles.swapEmpty}>No shapes found</p>}
          </div>
        </div>
      )}
    </div>
  );
}
