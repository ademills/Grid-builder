import { useMemo, useRef, useState } from 'react';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { useLibraryStore } from '../store/libraryStore';
import { useAppStore } from '../store/appStore';
import { parseSwatchFile, writeAse, writeGpl, writeJson } from '../utils/swatchFiles';
import { pickAndReadBinary, saveBinary } from '../shell/fileIO';
import { ColorPicker } from './ColorPicker';
import { Stepper, Toggle } from './controls';
import { SWATCH_MIME } from './panelUtils';
import styles from './Panel.module.css';

const SWATCH_FILE_FILTERS = [{ name: 'Swatch files', extensions: ['ase', 'gpl', 'json'] }];

// Built-in palettes presented as read-only libraries.
const BUILT_IN = PALETTE_GROUPS.map(group => ({
  group: group.name,
  libraries: group.keys.map(key => ({ id: `builtin:${key}`, key, name: key, builtIn: true, swatches: (PALETTES[key] ?? []).map(hex => ({ hex })) })),
}));

async function exportLibrary(lib, format) {
  const safe = lib.name.replace(/[\\/:*?"<>|]/g, '-');
  if (format === 'ase') {
    return saveBinary(writeAse([lib]), { title: 'Export Swatches', defaultName: `${safe}.ase`, filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }] });
  }
  if (format === 'gpl') {
    return saveBinary(writeGpl(lib), { title: 'Export Swatches', defaultName: `${safe}.gpl`, filters: [{ name: 'GIMP Palette', extensions: ['gpl'] }], mime: 'text/plain' });
  }
  return saveBinary(writeJson(lib), { title: 'Export Swatches', defaultName: `${safe}.json`, filters: [{ name: 'JSON', extensions: ['json'] }], mime: 'application/json' });
}

function ExportMenu({ onPick }) {
  return (
    <span className={styles.exportMenu}>
      {['ase', 'gpl', 'json'].map(f => (
        <button key={f} className={styles.addQuickBtn} onClick={() => onPick(f)} title={`Export as .${f}`}>.{f}</button>
      ))}
    </span>
  );
}

// A grid of document swatches: click to edit, drag to reorder, drag onto a
// Layers group to recolour it.
function SwatchGrid({ swatches, selectedId, onSelect, onReorder, usage }) {
  const [order, setOrder] = useState(null);
  const dragId = useRef(null);
  const shown = order ?? swatches;
  return (
    <div className={styles.paletteSwatchToggles}>
      {shown.map(c => (
        <div key={c.id} className={styles.customSwatchWrapper}
          draggable
          onDragStart={e => {
            dragId.current = c.id;
            e.dataTransfer.setData(SWATCH_MIME, c.id);
            e.dataTransfer.effectAllowed = 'copyMove';
            setOrder([...swatches]);
          }}
          onDragOver={e => {
            if (!dragId.current || dragId.current === c.id) return;
            e.preventDefault();
            setOrder(prev => {
              const arr = [...(prev ?? swatches)];
              const from = arr.findIndex(x => x.id === dragId.current);
              const to = arr.findIndex(x => x.id === c.id);
              if (from < 0 || to < 0) return prev;
              const [item] = arr.splice(from, 1);
              arr.splice(to, 0, item);
              return arr;
            });
          }}
          onDragEnd={() => {
            if (order) onReorder(order);
            dragId.current = null;
            setOrder(null);
          }}
        >
          <button
            className={`${styles.paletteSwatchToggle} ${c.enabled === false ? styles.swatchNotInPalette : ''} ${c.id === selectedId ? styles.swatchSelected : ''}`}
            style={{ background: c.hex }}
            onClick={() => onSelect(c.id === selectedId ? null : c.id)}
            title={`${c.name ? `${c.name} · ` : ''}${c.hex}${c.enabled === false ? ' · not in palette' : ''}${usage[c.id] ? ` · pinned on ${usage[c.id]}` : ''}`}
          />
          {usage[c.id] > 0 && <span className={styles.swatchUsageDot} />}
        </div>
      ))}
    </div>
  );
}

function SwatchEditor({ swatch, onChange, onDelete, usage, showPaletteToggle }) {
  return (
    <div className={styles.swatchEditor}>
      <ColorPicker value={swatch.hex} onChange={hex => onChange({ hex })} />
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Name</span>
        <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} placeholder="Unnamed"
          value={swatch.name ?? ''} onChange={e => onChange({ name: e.target.value })} spellCheck={false} />
      </div>
      {showPaletteToggle && (
        <div className={styles.formRow}>
          <span className={styles.label}>In palette</span>
          <Toggle value={swatch.enabled !== false} onChange={v => onChange({ enabled: v })}
            title="Whether the palette-based colour modes use this swatch" />
        </div>
      )}
      <div className={styles.formRow}>
        <span className={styles.gridNote} style={{ margin: 0 }}>
          {usage ? `Pinned on ${usage} ${usage === 1 ? 'block' : 'blocks'}. Changes recolour them too.` : 'Global swatch: editing it recolours everything that uses it.'}
        </span>
        <button className={styles.actionBtn} onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function LibraryRow({ lib, open, onToggle, onApply, onAdd, onAddOne, onExport, onRename, onDelete, active }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className={styles.libraryBlock}>
      <div className={`${styles.libraryRow} ${active ? styles.libraryRowActive : ''}`} onClick={onToggle}>
        {renaming ? (
          <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} autoFocus defaultValue={lib.name}
            onClick={e => e.stopPropagation()}
            onBlur={e => { onRename(e.target.value); setRenaming(false); }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} />
        ) : (
          <span className={styles.palettePickerName} onDoubleClick={e => { if (onRename) { e.stopPropagation(); setRenaming(true); } }}>{lib.name}</span>
        )}
        <span className={styles.palettePickerSwatches}>
          {lib.swatches.slice(0, 10).map((s, i) => <span key={i} className={styles.palettePickerSwatch} style={{ background: s.hex }} />)}
        </span>
        <span className={styles.libraryActions} onClick={e => e.stopPropagation()}>
          <button className={styles.addQuickBtn} onClick={onApply} title="Use as the document palette">Use</button>
          <button className={styles.addQuickBtn} onClick={onAdd} title="Add these swatches to the document">+</button>
        </span>
      </div>
      {open && (
        <div className={styles.libraryDetail}>
          <div className={styles.libraryChips}>
            {lib.swatches.map((s, i) => (
              <button key={i} className={styles.layerPickSwatch} style={{ background: s.hex }}
                title={`${s.name ? `${s.name} · ` : ''}${s.hex} — click to add to document`} onClick={() => onAddOne(s)} />
            ))}
          </div>
          <div className={styles.libraryDetailActions}>
            <ExportMenu onPick={onExport} />
            {onRename && <button className={styles.addQuickBtn} onClick={() => setRenaming(true)}>Rename</button>}
            {onDelete && <button className={styles.addQuickBtn} onClick={onDelete}>Delete</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// Swatches: the document's global swatches (what the palette modes and
// pinned blocks use), its block-background swatches, and the swatch
// libraries — built-in palettes plus the user's own, importable and
// exportable as .ase / .gpl / .json.
export function SwatchesPanel() {
  const { mode, extracted, actions } = useEditor();
  const [shapeColors, setShapeColors] = useDocField('shapeColors');
  const [bgColors, setBgColors] = useDocField('bgColors');
  const [paletteKey, setPaletteKey] = useDocField('paletteKey');
  const [colorMode] = useDocField('colorMode');
  const [placedBlocks] = useDocField('placedBlocks');
  const [, setMeshSettings] = useDocField('meshSettings');
  const [extractSettings, setExtractSettings] = useDocSettings('paletteExtractSettings');
  const libraries = useLibraryStore(s => s.libraries);
  const { addLibrary, addLibraries, renameLibrary, deleteLibrary } = useLibraryStore.getState();
  const showToast = useAppStore(s => s.showToast);
  const setToolOption = useAppStore(s => s.setToolOption);
  // Picking a swatch also makes it the Paint Bucket colour.
  const pickSwatch = (list, id) => {
    setSelected(id ? { list, id } : null);
    const hex = (list === 'bg' ? bgColors : shapeColors).find(c => c.id === id)?.hex;
    if (hex) setToolOption({ paintHex: hex });
  };

  const [selected, setSelected] = useState(null); // { list: 'shape'|'bg', id }
  const [query, setQuery] = useState('');
  const [openLib, setOpenLib] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => new Set(['__mine__']));
  const isGrid = mode === 'gridBuilder';
  const meshTarget = isGrid && colorMode === 'mesh';

  // How many blocks pin each swatch — those swatches are kept when a
  // library replaces the document palette, so pinned colours survive.
  const usage = useMemo(() => {
    const counts = {};
    for (const b of placedBlocks) {
      if (!b.slotPins) continue;
      for (const id of new Set(Object.values(b.slotPins))) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [placedBlocks]);

  const newSwatch = (hex, extra = {}) => ({ id: crypto.randomUUID(), hex, enabled: true, source: 'custom', ...extra });

  // Replace the document palette with a library, keeping user-added and
  // pinned swatches (pinned ones drop out of the palette but keep working).
  const applyLibrary = (lib) => {
    const colours = lib.swatches.map(s => s.hex);
    if (meshTarget) {
      setMeshSettings(prev => ({ ...prev, points: colours.slice(0, 8).map(hex => ({ id: crypto.randomUUID(), x: Math.random(), y: Math.random(), hex })) }));
      showToast(`Mesh points set from ${lib.name}`);
      return;
    }
    setShapeColors(prev => [
      ...lib.swatches.map((s, i) => ({ id: `p-${lib.id}-${i}-${crypto.randomUUID().slice(0, 4)}`, hex: s.hex, ...(s.name ? { name: s.name } : {}), enabled: true, source: 'palette' })),
      ...prev.filter(c => c.source === 'custom' || usage[c.id]).map(c => (c.source === 'custom' ? c : { ...c, enabled: false, source: 'custom' })),
    ]);
    setPaletteKey(lib.name);
  };
  const addLibraryToDoc = (lib) => {
    setShapeColors(prev => [...prev, ...lib.swatches.map(s => newSwatch(s.hex, s.name ? { name: s.name } : {}))]);
    showToast(`Added ${lib.swatches.length} swatches`);
  };

  const listFor = (list) => (list === 'bg' ? [bgColors, setBgColors] : [shapeColors, setShapeColors]);
  const selectedList = selected ? listFor(selected.list)[0] : null;
  const selectedSwatch = selectedList?.find(c => c.id === selected.id) ?? null;
  const updateSelected = (changes) => {
    const [, set] = listFor(selected.list);
    set(prev => prev.map(c => (c.id === selected.id ? { ...c, ...changes } : c)));
  };
  const deleteSelected = () => {
    const [, set] = listFor(selected.list);
    set(prev => prev.filter(c => c.id !== selected.id));
    setSelected(null);
  };

  const docLibrary = () => ({ name: paletteKey || 'Document swatches', swatches: shapeColors.map(c => ({ hex: c.hex, ...(c.name ? { name: c.name } : {}) })) });

  const importFile = async () => {
    try {
      const picked = await pickAndReadBinary({ title: 'Import Swatches', filters: SWATCH_FILE_FILTERS });
      if (!picked) return;
      const libs = parseSwatchFile(picked.fileName, picked.buffer).filter(l => l.swatches.length);
      if (!libs.length) { showToast('No swatches found in that file'); return; }
      const base = picked.fileName.replace(/\.[^.]+$/, '');
      addLibraries(libs.map(l => ({ ...l, name: libs.length === 1 && /^Imported/.test(l.name) ? base : l.name })));
      setOpenGroups(prev => new Set([...prev, '__mine__']));
      showToast(`Imported ${libs.length} ${libs.length === 1 ? 'library' : 'libraries'}`);
    } catch (err) {
      alert(`Could not import swatches.\n\n${err.message ?? err}`);
    }
  };

  const q = query.trim().toLowerCase();
  const match = lib => !q || lib.name.toLowerCase().includes(q);
  const toggleGroup = name => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const renderLib = (lib) => (
    <LibraryRow
      key={lib.id}
      lib={lib}
      active={lib.name === paletteKey}
      open={openLib === lib.id}
      onToggle={() => setOpenLib(o => (o === lib.id ? null : lib.id))}
      onApply={() => applyLibrary(lib)}
      onAdd={() => addLibraryToDoc(lib)}
      onAddOne={s => setShapeColors(prev => [...prev, newSwatch(s.hex, s.name ? { name: s.name } : {})])}
      onExport={f => exportLibrary(lib, f)}
      onRename={lib.builtIn ? null : name => renameLibrary(lib.id, name)}
      onDelete={lib.builtIn ? null : () => { if (confirm(`Delete the library “${lib.name}”?`)) deleteLibrary(lib.id); }}
    />
  );

  return (
    <>
      {meshTarget && <div className={styles.targetNote}>Mesh colour mode: “Use” on a library sets the mesh colour points.</div>}
      {mode === 'knotwork' && <div className={styles.targetNote}>Editing swatches regenerates the design with the same layout.</div>}

      <div className={styles.sectionContent}>
        <div className={styles.swatchHeader}>
          <div className={styles.subHeading} style={{ margin: 0, padding: 0, border: 'none', flex: 1 }}>Document · {paletteKey}</div>
          <button className={styles.addQuickBtn} title="New swatch"
            onClick={() => { const s = newSwatch(selectedSwatch?.hex ?? '#7b61ff'); setShapeColors(prev => [...prev, s]); setSelected({ list: 'shape', id: s.id }); }}>+</button>
          <button className={styles.addQuickBtn} title="Save document swatches as a library"
            onClick={() => { const name = prompt('Library name', paletteKey || 'My swatches'); if (name) { addLibrary(name, docLibrary().swatches); showToast(`Saved library “${name}”`); } }}>Save</button>
        </div>
        <SwatchGrid
          swatches={shapeColors}
          selectedId={selected?.list === 'shape' ? selected.id : null}
          onSelect={id => pickSwatch('shape', id)}
          onReorder={setShapeColors}
          usage={usage}
        />
        {selectedSwatch && selected.list === 'shape' && (
          <SwatchEditor swatch={selectedSwatch} onChange={updateSelected} onDelete={deleteSelected}
            usage={usage[selectedSwatch.id] ?? 0} showPaletteToggle />
        )}
        <div className={styles.swatchFooter}>
          <span className={styles.gridNote} style={{ margin: 0, flex: 1 }}>Drag a swatch onto a Layers group to recolour it.</span>
          <ExportMenu onPick={f => exportLibrary(docLibrary(), f)} />
        </div>

        {isGrid && (
          <>
            <div className={styles.swatchHeader} style={{ marginTop: 12 }}>
              <div className={styles.subHeading} style={{ margin: 0, padding: 0, border: 'none', flex: 1 }}>Block backgrounds</div>
              <button className={styles.addQuickBtn} title="New background swatch"
                onClick={() => { const s = { id: crypto.randomUUID(), hex: '#ffffff', enabled: true }; setBgColors(prev => [...prev, s]); setSelected({ list: 'bg', id: s.id }); }}>+</button>
            </div>
            <SwatchGrid
              swatches={bgColors}
              selectedId={selected?.list === 'bg' ? selected.id : null}
              onSelect={id => pickSwatch('bg', id)}
              onReorder={setBgColors}
              usage={usage}
            />
            {selectedSwatch && selected.list === 'bg' && (
              <SwatchEditor swatch={selectedSwatch} onChange={updateSelected} onDelete={deleteSelected}
                usage={usage[selectedSwatch.id] ?? 0} showPaletteToggle />
            )}
            <div className={styles.gridNote}>Used behind shapes in Uniform colour mode.</div>
          </>
        )}
      </div>

      <div className={styles.libraryToolbar}>
        <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} placeholder="Search libraries…"
          value={query} onChange={e => setQuery(e.target.value)} spellCheck={false} />
        <button className={styles.actionBtn} onClick={importFile} title="Import .ase, .gpl or .json swatches">Import…</button>
      </div>

      <button className={styles.paletteGroupHeader} onClick={() => toggleGroup('__mine__')}>
        <span className={styles.paletteGroupArrow}>{q || openGroups.has('__mine__') ? '▼' : '▶'}</span>
        <span className={styles.paletteGroupName}>My Libraries</span>
        <span className={styles.paletteGroupCount}>{libraries.length}</span>
      </button>
      {(q || openGroups.has('__mine__')) && (
        libraries.filter(match).length
          ? libraries.filter(match).map(renderLib)
          : <div className={styles.gridNote} style={{ padding: '4px 12px 8px' }}>Save the document swatches or import a swatch file to create a library.</div>
      )}

      {BUILT_IN.map(({ group, libraries: libs }) => {
        const shown = libs.filter(match);
        if (!shown.length) return null;
        const isOpen = q || openGroups.has(group);
        return (
          <div key={group}>
            <button className={styles.paletteGroupHeader} onClick={() => toggleGroup(group)}>
              <span className={styles.paletteGroupArrow}>{isOpen ? '▼' : '▶'}</span>
              <span className={styles.paletteGroupName}>{group}</span>
              <span className={styles.paletteGroupCount}>{shown.length}</span>
            </button>
            {isOpen && shown.map(renderLib)}
          </div>
        );
      })}

      {isGrid && extractSettings && (
        <div className={styles.sectionContent} style={{ borderTop: '1px solid var(--chrome-border)' }}>
          <div className={styles.subHeading}>Extract from image</div>
          <div className={styles.formRow}>
            <span className={styles.label}>Source</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'image',    label: 'Colour image', enabled: extracted.canFromImage },
                { key: 'backdrop', label: 'Backdrop',     enabled: extracted.canFromBackdrop },
              ].map(({ key, label, enabled }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${extractSettings.extractFrom === key ? styles.modeBtnActive : ''}`}
                  disabled={!enabled}
                  title={enabled ? '' : 'No image loaded for this source'}
                  onClick={() => setExtractSettings({ extractFrom: key })}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Colours</span>
            <Stepper value={extractSettings.numColours} onChange={v => setExtractSettings({ numColours: v })} min={4} max={16} />
          </div>
          {extracted.palette.length ? (
            <div className={styles.paletteChooserSwatches} style={{ marginBottom: 8 }}>
              {extracted.palette.map((c, i) => (
                <span key={i} className={styles.paletteChooserSwatch} style={{ background: c, width: 16, height: 20 }} title={c} />
              ))}
            </div>
          ) : (
            <div className={styles.gridNote}>Load a colour image (Colour panel) or a backdrop (Image panel) to extract from.</div>
          )}
          <div className={styles.actionBtns}>
            <button className={styles.actionBtn} disabled={!extracted.palette.length} onClick={actions.applyExtractedToShapes}>Use as swatches</button>
            <button className={styles.actionBtn} disabled={!extracted.palette.length} onClick={actions.applyExtractedToBg}>Use as backgrounds</button>
            <button className={styles.actionBtn} disabled={!extracted.palette.length}
              onClick={() => { const name = prompt('Library name', 'Extracted'); if (name) addLibrary(name, extracted.palette.map(hex => ({ hex }))); }}>Save as library</button>
          </div>
        </div>
      )}
    </>
  );
}
