import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDocField } from '../store/useDocField';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import { ColorPicker } from '../panels/ColorPicker';
import { SwatchColourField } from '../panels/SwatchColourField';
import { assetThumb, randomSeed } from '../panels/panelUtils';
import { DiceIcon, RotateIcon, ReflectIcon, WandIcon, PinIcon } from './icons';
import { symmetryOptions, normaliseSymmetry, TOOL_SYMMETRY, MEANDER_SYMMETRY, LINEWORK_SYMMETRY } from '../utils/symmetry';
import { FILLS } from '../modes/gridBuilder/fills';
import { mergeLineworkSettings } from '../modes/linework/settings';
import { runCommand } from './commands';
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

// The selection's fill: shows its colour (or Mixed) and sets it from a
// swatch or any colour. Picker drags apply once the colour settles.
function SelectionFill() {
  const fill = useAppStore(s => s.editorStatus?.selectionFill ?? null);
  const fillSelection = useAppStore(s => s.editorCommands?.fillSelection);
  const [draft, setDraft] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!fill || !fillSelection) return null;
  const shown = draft ?? (fill === 'mixed' ? '#808080' : fill);
  const onChange = (hex, swatchId) => {
    clearTimeout(timer.current);
    if (swatchId) { setDraft(null); fillSelection(hex, swatchId); return; }
    setDraft(hex);
    timer.current = setTimeout(() => { fillSelection(hex); setDraft(null); }, 250);
  };
  return (
    <>
      <span className={styles.label}>Fill</span>
      <SwatchColourField value={shown} label={!draft && fill === 'mixed' ? 'Mixed' : undefined} onChange={onChange}
        title="Fill the selection — a document swatch or any colour" />
    </>
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

// The selection's shape: a random one from the enabled shapes, or one picked
// from the library (shapes with a different footprint are left as they are).
function SelectionShape() {
  const selection = useAppStore(s => s.editorCommands?.selection);
  const [query, setQuery] = useState('');
  const { open, setOpen, ref: popRef } = usePopover();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ALL_BUILTIN_ASSETS.filter(a => a.name.toLowerCase().includes(q)) : ALL_BUILTIN_ASSETS;
  }, [query]);
  if (!selection) return null;
  return (
    <span className={styles.popAnchor} ref={popRef}>
      <span className={styles.iconGroup}>
        <button onClick={selection.randomShape} title="Swap for a random shape"><DiceIcon size={15} /></button>
        <button onClick={() => { setOpen(o => !o); setQuery(''); }} title="Swap shape…" aria-expanded={open}>⇄</button>
      </span>
      {open && (
        <div className={styles.popover} style={{ width: 320 }}>
          <input className={styles.popSearch} placeholder="Search shapes…" value={query} autoFocus
            onChange={e => setQuery(e.target.value)} spellCheck={false} />
          <div className={styles.assetGrid}>
            {shown.map(a => (
              <button key={a.id} className={styles.assetCell} title={`${a.name} (${a.size})`}
                onClick={() => { selection.swapShape(a); setOpen(false); }}>
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

function Select({ value, options, onChange, title }) {
  return (
    <select className={styles.select} value={value} onChange={e => onChange(e.target.value)} title={title}>
      {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

function SeedInput({ value, onChange }) {
  return (
    <span className={styles.seed}>
      <input type="number" value={value} onChange={e => onChange(+e.target.value || 0)} title="Seed" />
      <button onClick={() => onChange(randomSeed())} title="New random seed"><DiceIcon size={14} /></button>
    </span>
  );
}

const symmetryChoices = keys => symmetryOptions(keys).map(m => ({ key: m.key, label: m.key === 'none' ? m.label : `${m.icon}  ${m.label}` }));

const COLOUR_MODES = [
  { key: 'none', label: 'None' }, { key: 'uniform', label: 'Uniform' }, { key: 'random', label: 'Random' },
  { key: 'gradient', label: 'Gradient' }, { key: 'mesh', label: 'Mesh' }, { key: 'image', label: 'Image' },
];

// With nothing selected, the bar carries the design's most-used settings so
// they're reachable without scrolling the panels.
function DesignOptions({ mode }) {
  const [activeFill, setActiveFill] = useDocField('activeFill');
  const [colorMode, setColorMode] = useDocField('colorMode');
  const [knotwork, setKnotwork] = useDocField('knotworkSettings');
  const [lineworkRaw] = useDocField('lineworkSettings');
  const cmds = useAppStore(s => s.editorCommands);
  const editLayer = useAppStore(s => s.editorStatus?.lineworkEditLayer ?? 'base');

  if (mode === 'gridBuilder') {
    return (
      <>
        <span className={styles.label}>Fill</span>
        <Select value={activeFill} onChange={setActiveFill} title="The fill Generate runs"
          options={FILLS.map(f => ({ key: f.id, label: f.group === 'Experimental' ? `${f.label} (experimental)` : f.label }))} />
        <span className={styles.label}>Colour</span>
        <Select value={colorMode} onChange={setColorMode} options={COLOUR_MODES} />
      </>
    );
  }

  if (mode === 'knotwork' && knotwork) {
    const set = changes => setKnotwork(prev => ({ ...prev, ...changes }));
    return (
      <>
        <span className={styles.label}>Symmetry</span>
        <Select value={normaliseSymmetry(knotwork.symmetryMode)} options={symmetryChoices(MEANDER_SYMMETRY)} onChange={v => set({ symmetryMode: v })} />
        <span className={styles.label}>Seed</span>
        <SeedInput value={knotwork.seed} onChange={seed => set({ seed, seedWord: '' })} />
      </>
    );
  }

  if (mode === 'linework' && cmds?.updateLinework) {
    const s = mergeLineworkSettings(lineworkRaw);
    const L = s.layers.find(l => l.id === editLayer) ?? s.layers[0];
    const setLayer = changes => cmds.updateLinework(prev => ({
      ...prev, layers: prev.layers.map(l => (l.id === L.id ? { ...l, ...changes } : l)),
    }));
    return (
      <>
        {s.layers.length > 1 && (
          <>
            <span className={styles.label}>Layer</span>
            <Select value={L.id} onChange={cmds.setLineworkEditLayer}
              options={[...s.layers].reverse().map(l => ({ key: l.id, label: l.name }))} />
          </>
        )}
        <span className={styles.label}>Style</span>
        <Segment value={L.style} onChange={v => setLayer({ style: v })} options={[
          { key: 'angular', label: 'Angular' }, { key: 'circuit', label: 'Circuit' },
        ]} />
        <span className={styles.label}>Symmetry</span>
        <Select value={normaliseSymmetry(L.sym)} options={symmetryChoices(LINEWORK_SYMMETRY)} onChange={v => setLayer({ sym: v })} />
        <span className={styles.label}>Seed</span>
        <SeedInput value={L.seed} onChange={seed => setLayer({ seed })} />
      </>
    );
  }
  return null;
}

// With a selection: its fill plus the Object menu's quick actions — in the
// inspector layout, everything the floating selection toolbar offered.
function SelectionActions({ mode, selectedCount }) {
  const gridDoc = mode === 'gridBuilder';
  const selection = useAppStore(s => s.editorCommands?.selection);
  const colorMode = useAppStore(s => s.editorStatus?.colorMode);
  const frozen = useAppStore(s => !!s.editorStatus?.selectionFrozen);
  const pinned = useAppStore(s => !!s.editorStatus?.selectionPinned);
  return (
    <>
      <span className={styles.count}>{selectedCount} selected</span>
      <SelectionFill />
      {gridDoc && selection && (
        <span className={styles.iconGroup}>
          <button onClick={() => runCommand('select.sameColour')} title="Select every shape with the same colour"><WandIcon size={15} /></button>
          {colorMode !== 'none' && <button onClick={selection.shuffleColours} title="Shuffle colours">↺</button>}
          <button onClick={selection.toggleFreeze} className={frozen ? styles.iconBtnActive : ''} aria-pressed={frozen}
            title={frozen ? 'Unfreeze colours' : 'Freeze colours (keep them through shuffles)'}>❄</button>
          {pinned && <button onClick={() => runCommand('object.unpin')} title="Remove pinned colours"><PinIcon size={14} /></button>}
        </span>
      )}
      {gridDoc && (
        <span className={styles.iconGroup}>
          <button onClick={() => runCommand('object.rotateCcw')} title="Rotate 90° anticlockwise"><RotateIcon size={15} style={{ transform: 'scaleX(-1)' }} /></button>
          <button onClick={() => runCommand('object.rotateCw')} title="Rotate 90° clockwise"><RotateIcon size={15} /></button>
          <button onClick={() => runCommand('object.reflectH')} title="Reflect horizontal"><ReflectIcon size={15} /></button>
          <button onClick={() => runCommand('object.reflectV')} title="Reflect vertical"><ReflectIcon size={15} style={{ transform: 'rotate(90deg)' }} /></button>
        </span>
      )}
      {gridDoc && <SelectionShape />}
      <span className={styles.iconGroup}>
        {gridDoc && <button onClick={() => runCommand('edit.duplicate')} title="Duplicate (Ctrl+D)">Duplicate</button>}
        <button onClick={() => runCommand('object.hide')}>Hide</button>
        <button onClick={() => runCommand('object.lock')}>Lock</button>
        {gridDoc && <button onClick={() => runCommand('edit.delete')} title="Delete (Del)">Delete</button>}
      </span>
    </>
  );
}

// Tools with no options of their own, which show the design's settings
// instead (with nothing selected).
const DESIGN_TOOLS = new Set(['select', 'hand', 'zoom']);

// Illustrator-style control bar: the active tool's name, its options and a
// short hint. Sits between the document tabs and the canvas.
export function ControlBar({ mode, selectedCount }) {
  const tool = useAppStore(s => s.toolOverride ?? s.activeTool);
  const options = useAppStore(s => s.toolOptions);
  const setToolOption = useAppStore(s => s.setToolOption);
  const layout = useAppStore(s => s.dock.layout);
  const def = TOOLS[tool];
  if (!def || !MODE_REGISTRY[mode].tools.includes(tool)) return <div className={styles.bar} />;
  const Icon = def.icon;

  return (
    <div className={styles.bar}>
      <span className={styles.toolName}><Icon size={15} /> {def.label}</span>
      <span className={styles.sep} />

      {layout === 'classic' ? (
        <>
          {tool === 'select' && <span className={styles.hint}>{selectedCount ? `${selectedCount} selected` : 'Click or drag on the canvas to select shapes'}</span>}
          {(tool === 'select' || tool === 'wand') && selectedCount > 0 && <SelectionFill />}
        </>
      ) : (
        <>
          {(tool === 'select' || tool === 'wand') && selectedCount > 0 && <SelectionActions mode={mode} selectedCount={selectedCount} />}
          {DESIGN_TOOLS.has(tool) && !selectedCount && <DesignOptions mode={mode} />}
        </>
      )}

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
          <Segment value={normaliseSymmetry(options.symmetry)} onChange={v => setToolOption({ symmetry: v })}
            options={symmetryOptions(TOOL_SYMMETRY).map(m => ({ key: m.key, label: m.icon, title: m.title }))} />
        </>
      )}

      <span className={styles.spacer} />
      {def.hint && <span className={styles.hint}>{def.hint}</span>}
      {tool === 'bucket' && <span className={styles.hint}>· Shift: every shape</span>}
    </div>
  );
}
