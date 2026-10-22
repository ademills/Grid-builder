import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDocField } from '../store/useDocField';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import { ColorPicker } from '../panels/ColorPicker';
import { assetThumb } from '../panels/panelUtils';
import { DiceIcon } from './icons';
import { SYMMETRY_OPTIONS } from '../utils/symmetry';
import styles from './ControlBar.module.css';

// Closes a popover on outside click / Escape.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

function Segment({ value, options, onChange }) {
  return (
    <span className={styles.segment}>
      {options.map(o => (
        <button key={o.key} className={`${styles.segBtn} ${value === o.key ? styles.segBtnActive : ''}`}
          onClick={() => onChange(o.key)} title={o.title}>{o.label}</button>
      ))}
    </span>
  );
}

// Paint colour chip: document swatches plus a full picker.
function PaintColour() {
  const paintHex = useAppStore(s => s.toolOptions.paintHex);
  const setToolOption = useAppStore(s => s.setToolOption);
  const recentColours = useAppStore(s => s.recentColours);
  const [shapeColors] = useDocField('shapeColors');
  const [bgColors] = useDocField('bgColors');
  const { open, setOpen, ref: popRef } = usePopover();
  return (
    <span className={styles.popAnchor} ref={popRef}>
      <button className={styles.colourChip} onClick={() => setOpen(o => !o)} title="Paint colour">
        <span style={{ background: paintHex }} />
        {paintHex}
      </button>
      {open && (
        <div className={styles.popover} style={{ width: 236 }}>
          {recentColours.length > 0 && (
            <>
              <div className={styles.popLabel}>Recent</div>
              <div className={styles.popSwatches}>
                {recentColours.map(hex => (
                  <button key={hex} className={styles.popSwatch} style={{ background: hex }}
                    title={hex} onClick={() => setToolOption({ paintHex: hex })} />
                ))}
              </div>
              <div className={styles.popLabel}>Document</div>
            </>
          )}
          <div className={styles.popSwatches}>
            {[...shapeColors, ...bgColors].map(s => (
              <button key={s.id} className={styles.popSwatch} style={{ background: s.hex }}
                title={s.name || s.hex} onClick={() => setToolOption({ paintHex: s.hex })} />
            ))}
          </div>
          <ColorPicker value={paintHex} onChange={hex => setToolOption({ paintHex: hex })} />
        </div>
      )}
    </span>
  );
}

// Stamp shape chooser: random from the enabled shapes, or one shape.
function StampShape() {
  const stampAsset = useAppStore(s => s.toolOptions.stampAsset);
  const setToolOption = useAppStore(s => s.setToolOption);
  const [enabledAssetIds] = useDocField('enabledAssetIds');
  const [query, setQuery] = useState('');
  const { open, setOpen, ref: popRef } = usePopover();
  const current = ALL_BUILTIN_ASSETS.find(a => a.id === stampAsset);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_BUILTIN_ASSETS
      .filter(a => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => (enabledAssetIds.has(b.id) - enabledAssetIds.has(a.id)));
  }, [query, enabledAssetIds]);
  return (
    <span className={styles.popAnchor} ref={popRef}>
      <button className={styles.assetChip} onClick={() => setOpen(o => !o)} title="Shape to stamp">
        {current ? <img src={assetThumb(current)} alt="" /> : <span className={styles.diceIcon}><DiceIcon size={16} /></span>}
        {current ? `${current.name} · ${current.size}` : 'Random enabled shape'}
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <div className={styles.popover} style={{ width: 320 }}>
          <input className={styles.popSearch} placeholder="Search shapes…" value={query} autoFocus
            onChange={e => setQuery(e.target.value)} spellCheck={false} />
          <div className={styles.assetGrid}>
            <button className={`${styles.assetCell} ${stampAsset === 'random' ? styles.assetCellActive : ''}`}
              onClick={() => { setToolOption({ stampAsset: 'random' }); setOpen(false); }} title="Random from the enabled shapes">
              <span className={styles.diceIcon}><DiceIcon size={16} /></span>
              <span>Random</span>
            </button>
            {shown.map(a => (
              <button key={a.id}
                className={`${styles.assetCell} ${a.id === stampAsset ? styles.assetCellActive : ''} ${!enabledAssetIds.has(a.id) ? styles.assetCellOff : ''}`}
                onClick={() => { setToolOption({ stampAsset: a.id }); setOpen(false); }} title={`${a.name} (${a.size})`}>
                <img src={assetThumb(a)} alt="" />
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// Illustrator-style control bar: the active tool's name, its options and a
// short hint. Sits between the document tabs and the canvas.
export function ControlBar({ mode, selectedCount }) {
  const tool = useAppStore(s => s.toolOverride ?? s.activeTool);
  const options = useAppStore(s => s.toolOptions);
  const setToolOption = useAppStore(s => s.setToolOption);
  const def = TOOLS[tool];
  if (!def || !MODE_REGISTRY[mode].tools.includes(tool)) return <div className={styles.bar} />;
  const Icon = def.icon;

  return (
    <div className={styles.bar}>
      <span className={styles.toolName}><Icon size={15} /> {def.label}</span>
      <span className={styles.sep} />

      {tool === 'select' && <span className={styles.hint}>{selectedCount ? `${selectedCount} selected` : 'Click or drag on the canvas to select shapes'}</span>}

      {tool === 'wand' && (
        <>
          <span className={styles.label}>Match</span>
          <Segment value={options.wandMatch} onChange={v => setToolOption({ wandMatch: v })} options={[
            { key: 'colour', label: 'Colour' }, { key: 'shape', label: 'Shape' }, { key: 'size', label: 'Size' },
          ]} />
          <label className={styles.check}>
            <input type="checkbox" checked={options.wandAdd} onChange={e => setToolOption({ wandAdd: e.target.checked })} />
            Add to selection
          </label>
        </>
      )}

      {tool === 'move' && (
        <>
          <span className={styles.label}>Onto shapes</span>
          <Segment value={options.moveDrop} onChange={v => setToolOption({ moveDrop: v })} options={[
            { key: 'replace', label: 'Replace', title: 'Shapes you drop onto are removed' },
            { key: 'swap', label: 'Swap', title: 'Shapes you drop onto move into the cells you left' },
          ]} />
        </>
      )}

      {tool === 'stamp' && <><span className={styles.label}>Shape</span><StampShape /></>}

      {(tool === 'bucket' || tool === 'eyedropper') && <><span className={styles.label}>Colour</span><PaintColour /></>}
      {tool === 'bucket' && (
        <>
          <span className={styles.label}>Paint</span>
          <Segment value={options.bucketScope} onChange={v => setToolOption({ bucketScope: v })} options={[
            { key: 'part', label: 'Clicked part', title: 'Paint only the part you click' },
            { key: 'colour', label: 'Whole colour', title: 'Paint every part of the shape that has the clicked colour' },
          ]} />
        </>
      )}

      {(tool === 'stamp' || tool === 'eraser' || tool === 'bucket') && (
        <>
          <span className={styles.label}>Symmetry</span>
          <Segment value={options.symmetry} onChange={v => setToolOption({ symmetry: v })} options={SYMMETRY_OPTIONS} />
        </>
      )}

      <span className={styles.spacer} />
      {def.hint && <span className={styles.hint}>{def.hint}</span>}
      {tool === 'bucket' && <span className={styles.hint}>· Shift: every shape</span>}
    </div>
  );
}
