import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { groupBlocks, designColours } from '../utils/layers';
import { listGroups } from '../utils/groups';
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

// Manual groups (Object › Group): select, hide, lock, rename, ungroup.
function GroupsSection({ blocks, selectedIds, layerActions }) {
  const [groupNames] = useDocField('groupNames');
  const [editing, setEditing] = useState(null);
  const groups = useMemo(() => listGroups(blocks, groupNames), [blocks, groupNames]);
  if (!groups.length) return null;
  return (
    <div className={styles.layerList} style={{ paddingBottom: 0 }} onMouseLeave={() => layerActions.highlight(null)}>
      <div className={styles.layerSectionLabel}>Groups</div>
      {groups.map(g => {
        const allHidden = g.hiddenCount === g.ids.length;
        const allLocked = g.lockedCount === g.ids.length;
        const selected = g.ids.filter(id => selectedIds.has(id)).length;
        return (
          <div key={g.id}
            className={`${styles.layerRow} ${styles.layerGroupRow} ${selected ? styles.layerRowSelected : ''}`}
            onMouseEnter={() => layerActions.highlight(new Set(g.ids))}
            onClick={() => layerActions.select(g.ids)}
            onDoubleClick={() => setEditing(g.id)}
            title="Click to select · double-click to rename"
          >
            <span className={styles.layerGroupIcon} aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                <rect x="1.5" y="1.5" width="11" height="11" rx="1" strokeDasharray="2 1.5" />
                <rect x="4" y="4" width="3" height="3" fill="currentColor" stroke="none" />
                <rect x="7.5" y="7" width="3" height="3" fill="currentColor" stroke="none" />
              </svg>
            </span>
            {editing === g.id ? (
              <input className={styles.layerRename} defaultValue={g.name} autoFocus spellCheck={false}
                onClick={e => e.stopPropagation()}
                onBlur={e => { layerActions.renameGroup(g.id, e.target.value.trim() || g.name); setEditing(null); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                  e.stopPropagation();
                }} />
            ) : (
              <span className={styles.layerName}>{g.name}</span>
            )}
            <span className={styles.layerCount}>{selected ? `${selected}/` : ''}{g.ids.length}</span>
            <button className={styles.layerRecolour} onClick={e => { e.stopPropagation(); layerActions.ungroup(g.id); }}
              title="Ungroup">✕</button>
            <RowToggles
              hidden={allHidden} locked={allLocked}
              mixedHidden={g.hiddenCount > 0 && !allHidden} mixedLocked={g.lockedCount > 0 && !allLocked}
              onHidden={() => layerActions.setHidden(g.ids, !allHidden)}
              onLocked={() => layerActions.setLocked(g.ids, !allLocked)}
            />
          </div>
        );
      })}
      <div className={styles.layerSectionLabel}>Layers</div>
    </div>
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
        {groups.length} {groups.length === 1 ? 'layer' : 'layers'} · {shapeCount} shapes
        {by === 'colour' && ' · drag a swatch onto a layer to recolour it'}
      </div>

      <GroupsSection blocks={placedBlocks} selectedIds={selectedIds} layerActions={layerActions} />

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

// Layers for Meander: every strand and dot is its own layer, grouped by
// colour. Groups and single strands can be selected, recoloured, hidden and
// locked; colour changes last until the next Generate / Recolour / swatch
// edit (reshaping with the shape sliders keeps them).
export function MeanderLayersPanel() {
  const { layerActions, selectedIds } = useEditor();
  const [placedBlocks] = useDocField('placedBlocks');
  const [shapeColors] = useDocField('shapeColors');
  const [open, setOpen] = useState(() => new Set());
  const [recolouring, setRecolouring] = useState(null);

  const vectors = placedBlocks.filter(b => b.type === 'vector');
  const cores = placedBlocks.filter(b => b.type === 'image' && b.meanderKey);
  const groups = useMemo(() => {
    const m = new Map();
    for (const b of placedBlocks) {
      if (b.type !== 'vector') continue;
      const hex = b.fill.toLowerCase();
      if (!m.has(hex)) m.set(hex, { hex, items: [] });
      m.get(hex).items.push(b);
    }
    return [...m.values()].sort((a, b) => b.items.length - a.items.length);
  }, [placedBlocks]);
  const swatchName = useMemo(() => {
    const m = new Map();
    for (const s of shapeColors) if (!m.has(s.hex.toLowerCase())) m.set(s.hex.toLowerCase(), s.name || null);
    return m;
  }, [shapeColors]);
  const hexOf = swatch => (swatch.startsWith('#') ? swatch : shapeColors.find(s => s.id === swatch)?.hex);

  if (!vectors.length) return <LegacyMeanderLayers />;

  const toggleOpen = key => setOpen(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const itemRow = (block, chip) => (
    <div
      key={block.id}
      className={`${styles.layerRow} ${styles.layerItemRow} ${selectedIds.has(block.id) ? styles.layerRowSelected : ''} ${block.hidden ? styles.layerRowHidden : ''}`}
      onMouseEnter={() => layerActions.highlight(new Set([block.id]))}
      onClick={e => layerActions.select(e.shiftKey ? [...new Set([...selectedIds, block.id])] : [block.id])}
    >
      {chip && <span className={styles.layerChips}><span className={styles.layerMiniChip} style={{ background: chip }} /></span>}
      <span className={styles.layerName}>{block.name}</span>
      <RowToggles
        hidden={!!block.hidden} locked={!!block.locked}
        onHidden={() => layerActions.setHidden([block.id], !block.hidden)}
        onLocked={() => layerActions.setLocked([block.id], !block.locked)}
      />
    </div>
  );

  const strandCount = vectors.filter(b => b.meanderKey?.startsWith('s')).length;
  return (
    <>
      <div className={styles.layerSummary}>
        {strandCount} strands · {vectors.length - strandCount} dots · {groups.length} colours
      </div>
      <div className={styles.layerList} onMouseLeave={() => layerActions.highlight(null)}>
        {groups.map(g => {
          const ids = g.items.map(b => b.id);
          const hiddenCount = g.items.filter(b => b.hidden).length;
          const lockedCount = g.items.filter(b => b.locked).length;
          const allHidden = hiddenCount === g.items.length, allLocked = lockedCount === g.items.length;
          const selectedInGroup = ids.filter(id => selectedIds.has(id)).length;
          const name = swatchName.get(g.hex) ?? null;
          const isOpen = open.has(g.hex);
          return (
            <div key={g.hex} className={styles.layerGroup}>
              <div
                className={`${styles.layerRow} ${styles.layerGroupRow} ${selectedInGroup ? styles.layerRowSelected : ''}`}
                onMouseEnter={() => layerActions.highlight(new Set(ids))}
                onClick={() => layerActions.select(ids)}
                title="Click to select every strand in this colour"
              >
                <button className={styles.layerChevron} onClick={e => { e.stopPropagation(); toggleOpen(g.hex); }} aria-expanded={isOpen}>
                  <ChevronIcon open={isOpen} />
                </button>
                <span className={styles.layerChip} style={{ background: g.hex }} />
                <span className={styles.layerName}>{name ? <>{name} <span className={styles.layerHex}>{g.hex}</span></> : g.hex}</span>
                <span className={styles.layerCount}>{selectedInGroup ? `${selectedInGroup}/` : ''}{g.items.length}</span>
                <button className={styles.layerRecolour} onClick={e => { e.stopPropagation(); setRecolouring(r => (r === g.hex ? null : g.hex)); }}
                  title="Replace this colour">⇄</button>
                <RowToggles
                  hidden={allHidden} locked={allLocked}
                  mixedHidden={hiddenCount > 0 && !allHidden} mixedLocked={lockedCount > 0 && !allLocked}
                  onHidden={() => layerActions.setHidden(ids, !allHidden)}
                  onLocked={() => layerActions.setLocked(ids, !allLocked)}
                />
              </div>
              {recolouring === g.hex && (
                <SwatchStrip swatches={shapeColors} onPick={swatch => {
                  const hex = hexOf(swatch);
                  if (hex) layerActions.replaceDesignColour(g.hex, hex);
                  setRecolouring(null);
                }} />
              )}
              {isOpen && g.items.map(b => itemRow(b, null))}
            </div>
          );
        })}
        {cores.map(b => itemRow(b, null))}
      </div>

      {selectedIds.size > 0 && (
        <>
          <div className={styles.fillBar}>
            <span className={styles.layerSummary} style={{ padding: 0, flex: 1, alignSelf: 'center' }}>{selectedIds.size} selected</span>
            <button className={styles.actionBtn} onClick={() => setRecolouring(r => (r === 'selection' ? null : 'selection'))}>Recolour</button>
            <button className={styles.actionBtn} onClick={() => layerActions.setHidden([...selectedIds], true)}>Hide</button>
            <button className={styles.actionBtn} onClick={() => layerActions.setLocked([...selectedIds], true)}>Lock</button>
          </div>
          {recolouring === 'selection' && (
            <SwatchStrip swatches={shapeColors} onPick={swatch => {
              const hex = hexOf(swatch);
              if (hex) layerActions.setFill([...selectedIds], hex);
              setRecolouring(null);
            }} />
          )}
        </>
      )}
      <div className={styles.gridNote} style={{ padding: '8px 12px' }}>
        Colour changes last until you Generate or Recolour again. The shape sliders keep them.
      </div>
    </>
  );
}

// Designs made before v1.4.1 are a single image: list its colours, each
// replaceable throughout the design.
function LegacyMeanderLayers() {
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
