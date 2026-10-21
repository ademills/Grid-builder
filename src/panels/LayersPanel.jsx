import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { groupBlocks, designColours } from '../utils/layers';
import { loadSlotCoverage, getSlotCoverage } from '../utils/slotCoverage';
import { isShapeBlock } from '../utils/blockColours';
import { EyeIcon, LockIcon, PinIcon, ChevronIcon } from '../shell/icons';
import { Segmented } from './controls';
import { SWATCH_MIME, COLOUR_MIME } from './panelUtils';
import styles from './Panel.module.css';


// Measure visible area per colour slot for every shape in use (async, once
// per shape), then bump a counter so groups recompute with real weights.
function useCoverage(blocks) {
  const [, setVersion] = useState(0);
  const missing = useMemo(() => {
    const set = new Set();
    for (const b of blocks) if (isShapeBlock(b) && !getSlotCoverage(b.svgContent)) set.add(b.svgContent);
    return [...set];
  }, [blocks]);
  useEffect(() => {
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(loadSlotCoverage)).then(() => { if (!cancelled) setVersion(v => v + 1); });
    return () => { cancelled = true; };
  }, [missing]);
  return missing.length === 0;
}

function SwatchStrip({ swatches, onPick }) {
  // Native colour inputs fire React's onChange continuously while dragging;
  // the DOM 'change' event fires once when the picker is closed.
  const customRef = useRef(null);
  const pickRef = useRef(onPick);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => {
    const el = customRef.current;
    if (!el) return;
    const onCommit = () => pickRef.current(el.value);
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, []);
  return (
    <div className={styles.layerPickStrip}>
      {swatches.map(s => (
        <button key={s.id} className={styles.layerPickSwatch} style={{ background: s.hex }}
          title={`${s.name || s.hex}${s.enabled === false ? ' (not in palette)' : ''}`} onClick={() => onPick(s.id)} />
      ))}
      <label className={styles.layerPickCustom} title="Any colour">
        +
        <input ref={customRef} type="color" defaultValue="#ffffff" />
      </label>
    </div>
  );
}

function RowToggles({ hidden, locked, onHidden, onLocked, mixedHidden, mixedLocked }) {
  return (
    <span className={styles.layerToggles}>
      <button className={`${styles.layerToggle} ${hidden ? styles.layerToggleOn : ''} ${mixedHidden ? styles.layerToggleMixed : ''}`}
        onClick={e => { e.stopPropagation(); onHidden(); }} title={hidden ? 'Show' : 'Hide'}>
        <EyeIcon off={hidden} />
      </button>
      <button className={`${styles.layerToggle} ${locked ? styles.layerToggleOn : ''} ${mixedLocked ? styles.layerToggleMixed : ''}`}
        onClick={e => { e.stopPropagation(); onLocked(); }} title={locked ? 'Unlock' : 'Lock'}>
        <LockIcon open={!locked} />
      </button>
    </span>
  );
}

// Layers for Grid Pattern: every placed shape, grouped by its dominant
// colour (or shape / size). Hide, lock, select, and recolour whole groups —
// recolouring pins the matching parts to a document swatch, so they keep
// that colour through mode changes and reshuffles.
export function LayersPanel() {
  const { colourCtx, layerActions, selectedIds } = useEditor();
  const [placedBlocks] = useDocField('placedBlocks');
  const [shapeColors] = useDocField('shapeColors');
  const [bgColors] = useDocField('bgColors');
  const [groupBy, setGroupBy] = useState('colour');
  const [open, setOpen] = useState(() => new Set());
  const [recolouring, setRecolouring] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const measured = useCoverage(placedBlocks);

  const imageMode = colourCtx.colorMode === 'image';
  const by = imageMode && groupBy === 'colour' ? 'shape' : groupBy;
  const groups = useMemo(
    () => groupBlocks(placedBlocks, by, colourCtx),
    // `measured` flips once coverage arrives so dominant colours use real areas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placedBlocks, by, colourCtx, measured]
  );
  const swatches = useMemo(() => [...shapeColors, ...bgColors], [shapeColors, bgColors]);
  const swatchName = useMemo(() => {
    const m = new Map();
    for (const s of swatches) if (!m.has(s.hex.toLowerCase())) m.set(s.hex.toLowerCase(), s.name || null);
    return m;
  }, [swatches]);

  const toggleOpen = key => setOpen(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const shapeCount = placedBlocks.filter(isShapeBlock).length;
  if (!placedBlocks.length) {
    return <div className={styles.sectionContent}><div className={styles.gridNote}>Nothing placed yet. Fill the grid to see its layers.</div></div>;
  }

  const onDropOnGroup = (e, g) => {
    e.preventDefault();
    setDropKey(null);
    if (g.kind !== 'colour') return;
    const swatchId = e.dataTransfer.getData(SWATCH_MIME);
    const fromGroup = e.dataTransfer.getData(COLOUR_MIME);
    if (swatchId) layerActions.pinColour(g.ids, g.hex, swatchId);
    else if (fromGroup) {
      const src = groups.find(x => x.key === fromGroup);
      if (src && src.key !== g.key) layerActions.pinColour(src.ids, src.hex, g.hex);
    }
  };

  return (
    <>
      <div className={styles.layerToolbar}>
        <Segmented value={by} onChange={setGroupBy} options={[
          { key: 'colour', label: 'Colour', disabled: imageMode, title: imageMode ? 'Not available in Image colour mode' : undefined },
          { key: 'shape', label: 'Shape' },
          { key: 'size', label: 'Size' },
        ]} />
      </div>
      <div className={styles.layerSummary}>
        {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {shapeCount} shapes
        {by === 'colour' && ' · drag a swatch onto a group to recolour it'}
      </div>

      <div className={styles.layerList} onMouseLeave={() => layerActions.highlight(null)}>
        {groups.map(g => {
          const allHidden = g.hiddenCount === g.items.length;
          const allLocked = g.lockedCount === g.items.length;
          const isOpen = open.has(g.key);
          const selectedInGroup = g.ids.filter(id => selectedIds.has(id)).length;
          const name = g.kind === 'colour' ? (swatchName.get(g.hex.toLowerCase()) ?? null) : null;
          return (
            <div key={g.key} className={styles.layerGroup}>
              <div
                className={`${styles.layerRow} ${styles.layerGroupRow} ${dropKey === g.key ? styles.layerRowDrop : ''} ${selectedInGroup ? styles.layerRowSelected : ''}`}
                onMouseEnter={() => layerActions.highlight(new Set(g.ids))}
                onClick={() => layerActions.select(g.ids)}
                draggable={g.kind === 'colour'}
                onDragStart={e => e.dataTransfer.setData(COLOUR_MIME, g.key)}
                onDragOver={e => { if (g.kind === 'colour') { e.preventDefault(); setDropKey(g.key); } }}
                onDragLeave={() => setDropKey(k => (k === g.key ? null : k))}
                onDrop={e => onDropOnGroup(e, g)}
                title={g.kind === 'colour' ? 'Click to select · drag onto another group to merge' : 'Click to select'}
              >
                <button className={styles.layerChevron} onClick={e => { e.stopPropagation(); toggleOpen(g.key); }} aria-expanded={isOpen}>
                  <ChevronIcon open={isOpen} />
                </button>
                {g.kind === 'colour' && <span className={styles.layerChip} style={{ background: g.hex }} />}
                {g.kind === 'shape' && <img className={styles.layerThumb} alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(g.svgContent)}`} />}
                <span className={styles.layerName}>
                  {name ? <>{name} <span className={styles.layerHex}>{g.hex}</span></> : g.label}
                </span>
                {g.pinnedCount > 0 && <span className={styles.layerPinned} title={`${g.pinnedCount} pinned`}><PinIcon /></span>}
                <span className={styles.layerCount}>{selectedInGroup ? `${selectedInGroup}/` : ''}{g.items.length}</span>
                {g.kind === 'colour' && (
                  <button className={styles.layerRecolour} onClick={e => { e.stopPropagation(); setRecolouring(r => (r === g.key ? null : g.key)); }}
                    title="Recolour this group">⇄</button>
                )}
                <RowToggles
                  hidden={allHidden} locked={allLocked}
                  mixedHidden={g.hiddenCount > 0 && !allHidden} mixedLocked={g.lockedCount > 0 && !allLocked}
                  onHidden={() => layerActions.setHidden(g.ids, !allHidden)}
                  onLocked={() => layerActions.setLocked(g.ids, !allLocked)}
                />
              </div>

              {recolouring === g.key && (
                <SwatchStrip swatches={swatches} onPick={swatch => { layerActions.pinColour(g.ids, g.hex, swatch); setRecolouring(null); }} />
              )}

              {isOpen && g.items.map(({ block, colours }) => (
                <div
                  key={block.id}
                  className={`${styles.layerRow} ${styles.layerItemRow} ${selectedIds.has(block.id) ? styles.layerRowSelected : ''} ${block.hidden ? styles.layerRowHidden : ''}`}
                  onMouseEnter={() => layerActions.highlight(new Set([block.id]))}
                  onClick={() => layerActions.select([block.id])}
                >
                  <span className={styles.layerChips}>
                    {colours.slice(0, 3).map(c => <span key={c.hex} className={styles.layerMiniChip} style={{ background: c.hex }} />)}
                  </span>
                  <span className={styles.layerName}>{block.name ?? block.type ?? 'Block'}</span>
                  {block.slotPins && (
                    <button className={styles.layerPinned} title="Pinned colours — click to unpin"
                      onClick={e => { e.stopPropagation(); layerActions.clearPins([block.id]); }}><PinIcon /></button>
                  )}
                  <span className={styles.layerPos}>{block.gridCol + 1},{block.gridRow + 1}</span>
                  <RowToggles
                    hidden={!!block.hidden} locked={!!block.locked}
                    onHidden={() => layerActions.setHidden([block.id], !block.hidden)}
                    onLocked={() => layerActions.setLocked([block.id], !block.locked)}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className={styles.fillBar}>
          <span className={styles.layerSummary} style={{ padding: 0, flex: 1, alignSelf: 'center' }}>{selectedIds.size} selected</span>
          <button className={styles.actionBtn} onClick={() => layerActions.setHidden([...selectedIds], true)}>Hide</button>
          <button className={styles.actionBtn} onClick={() => layerActions.setLocked([...selectedIds], true)}>Lock</button>
          <button className={styles.actionBtn} onClick={() => layerActions.clearPins([...selectedIds])} title="Remove pinned colours">Unpin</button>
        </div>
      )}
    </>
  );
}

// Layers for Meander: the colours in the generated design. Replacing one
// rewrites it throughout the design until the next Generate / Recolour.
export function MeanderLayersPanel() {
  const { layerActions } = useEditor();
  const [placedBlocks] = useDocField('placedBlocks');
  const [canvasBg] = useDocField('canvasBg');
  const [shapeColors] = useDocField('shapeColors');
  const [replacing, setReplacing] = useState(null);

  const design = placedBlocks.find(b => b.type === 'image' && b.imageSrc?.startsWith('data:image/svg+xml'));
  const colours = useMemo(() => {
    if (!design) return [];
    const comma = design.imageSrc.indexOf(',');
    return designColours(decodeURIComponent(design.imageSrc.slice(comma + 1)));
  }, [design]);

  if (!design) {
    return <div className={styles.sectionContent}><div className={styles.gridNote}>Generate a design to see its colours here.</div></div>;
  }

  return (
    <>
      <div className={styles.layerSummary}>{colours.length} colours in this design</div>
      <div className={styles.layerList}>
        {colours.map(c => (
          <div key={c.hex}>
            <div className={`${styles.layerRow} ${styles.layerGroupRow}`}>
              <span className={styles.layerChip} style={{ background: c.hex }} />
              <span className={styles.layerName}>
                {c.hex.toLowerCase() === canvasBg.toLowerCase() ? <>Paper <span className={styles.layerHex}>{c.hex}</span></> : c.hex}
              </span>
              <span className={styles.layerCount}>{c.count}</span>
              <button className={styles.layerRecolour} onClick={() => setReplacing(r => (r === c.hex ? null : c.hex))} title="Replace this colour">⇄</button>
            </div>
            {replacing === c.hex && (
              <SwatchStrip
                swatches={shapeColors}
                onPick={swatch => {
                  const hex = swatch.startsWith('#') ? swatch : shapeColors.find(s => s.id === swatch)?.hex;
                  if (hex) layerActions.replaceDesignColour(c.hex, hex);
                  setReplacing(null);
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className={styles.gridNote} style={{ padding: '8px 12px' }}>
        Replacements last until you Generate or Recolour again.
      </div>
    </>
  );
}
