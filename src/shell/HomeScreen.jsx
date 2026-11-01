import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
import { useLibraryStore } from '../store/libraryStore';
import { MODE_REGISTRY, MODE_ORDER } from '../modes/registry';
import { useAppStore } from '../store/appStore';
import { useDocumentStore } from '../store/documentStore';
import { newDocument, openDocument, openRecent } from './documentActions';
import { isTauri } from './fileIO';
import { useRecoveryStore, openRecovered, discardRecovered } from './session';
import { FolderIcon, CloseIcon } from './icons';
import styles from './HomeScreen.module.css';

const presetByKey = Object.fromEntries(PRESETS.map(p => [p.key, p]));

// Artboard sizes offered on the home screen. The first row is the everyday
// set; "More sizes" adds sizes for common outputs. `state` tweaks the new
// document.
const COMMON_SIZES = [
  { key: 'a4-portrait', name: 'A4', note: 'Portrait' },
  { key: 'a4-landscape', name: 'A4', note: 'Landscape' },
  { key: 'us-letter', name: 'US Letter', note: 'Portrait' },
  { key: 'us-letter-landscape', name: 'US Letter', note: 'Landscape' },
  { key: 'square-1080', name: 'Square', note: '1:1' },
  { key: 'hd-landscape', name: 'HD', note: '16:9' },
  { key: 'hd-portrait', name: 'Story / Reel', note: '9:16' },
];
const MORE_SIZES = [
  { key: 'ig-portrait', name: 'Instagram post', note: '4:5' },
  { key: 'a3-portrait', name: 'A3 print', note: 'Portrait' },
  { key: '4k-landscape', name: '4K wallpaper', note: '16:9' },
  { key: 'phone-wallpaper', name: 'Phone wallpaper', note: '19.5:9' },
  // Edge to edge so the design can tile as a repeat.
  { key: 'fabric-repeat', name: 'Fabric repeat', note: '12 in at 300 dpi', state: { gridSettings: { cols: 12, borderPct: 0 } } },
];
const ALL_SIZES = [...COMMON_SIZES, ...MORE_SIZES];

// Small Grid / Meander buttons for starting a document either way.
function ModeButtons({ onPick }) {
  return (
    <span className={styles.modeButtons}>
      {MODE_ORDER.map(m => {
        const def = MODE_REGISTRY[m];
        return (
          <button key={m} className={styles.modeBtnSmall} style={{ '--mode-accent': def.accent }}
            onClick={() => onPick(m)} title={`New ${def.label}`}>
            <def.mark size={14} /> {m === 'gridBuilder' ? 'Grid' : def.label}
          </button>
        );
      })}
    </span>
  );
}

// A new document coloured from a palette: its swatches become the document
// palette, shown with Random colouring in Grid mode.
function startFromPalette(mode, { name, colours }, size) {
  newDocument(mode, {
    ...size,
    state: {
      ...size.state,
      paletteKey: name,
      shapeColors: colours.map((hex, i) => ({ id: `p-${i}`, hex, enabled: true, source: 'palette' })),
      ...(mode === 'gridBuilder' ? { colorMode: 'random' } : {}),
    },
  });
}

const PALETTE_PAGE = 12;

function PaletteSection({ size }) {
  const allLibraries = useLibraryStore(s => s.libraries);
  const libraries = allLibraries.filter(l => l.swatches.length);
  const groups = [
    ...(libraries.length ? [{ name: 'Your libraries', palettes: libraries.map(l => ({ name: l.name, colours: l.swatches.map(s => s.hex) })) }] : []),
    ...PALETTE_GROUPS.map(gr => ({ name: gr.name, palettes: gr.keys.filter(k => PALETTES[k]).map(k => ({ name: k, colours: PALETTES[k] })) })),
  ];
  const [groupName, setGroupName] = useState(groups[0]?.name);
  const [showAll, setShowAll] = useState(false);
  const group = groups.find(gr => gr.name === groupName) ?? groups[0];
  if (!group) return null;
  const shown = showAll ? group.palettes : group.palettes.slice(0, PALETTE_PAGE);

  return (
    <section className={styles.recent}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>Start from a palette</h3>
        <div className={styles.groupTabs} role="tablist">
          {groups.map(gr => (
            <button key={gr.name} role="tab" aria-selected={gr.name === group.name}
              className={`${styles.groupTab} ${gr.name === group.name ? styles.groupTabActive : ''}`}
              onClick={() => { setGroupName(gr.name); setShowAll(false); }}>
              {gr.name}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.paletteGrid}>
        {shown.map(p => (
          <div key={p.name} className={styles.paletteCard}>
            <button className={styles.paletteMain} onClick={() => startFromPalette('gridBuilder', p, size)} title={`New Grid Pattern using ${p.name}`}>
              <span className={styles.paletteStrip}>
                {p.colours.slice(0, 10).map((hex, i) => <span key={i} style={{ background: hex }} />)}
              </span>
              <span className={styles.paletteName}>{p.name}</span>
            </button>
            <ModeButtons onPick={mode => startFromPalette(mode, p, size)} />
          </div>
        ))}
      </div>
      {group.palettes.length > PALETTE_PAGE && (
        <button className={styles.showAllBtn} onClick={() => setShowAll(s => !s)}>
          {showAll ? 'Show fewer' : `Show all ${group.palettes.length}`}
        </button>
      )}
    </section>
  );
}

function ArtboardGlyph({ width, height }) {
  const s = 26 / Math.max(width, height);
  return <span className={styles.presetGlyph} style={{ width: width * s, height: height * s }} />;
}

function SizeTile({ size, active, onPick, onCreate }) {
  const p = presetByKey[size.key];
  return (
    <button role="radio" aria-checked={active}
      className={`${styles.preset} ${active ? styles.presetActive : ''}`}
      onClick={onPick} onDoubleClick={onCreate}
      title={`${p.width} × ${p.height}px · double-click for a new Grid Pattern`}>
      <span className={styles.presetGlyphBox}><ArtboardGlyph width={p.width} height={p.height} /></span>
      <span className={styles.presetName}>{size.name}</span>
      <span className={styles.presetSub}>{size.note}</span>
    </button>
  );
}

// One artboard picker shared by every mode, then a button per mode.
function NewDocument({ sizeKey, setSizeKey, custom, setCustom, size }) {
  const [showMore, setShowMore] = useState(() => MORE_SIZES.some(t => t.key === sizeKey));
  const sizes = showMore ? ALL_SIZES : COMMON_SIZES;
  const dims = sizeKey === 'custom' ? custom : presetByKey[sizeKey];
  const setDim = (k, v) => setCustom(c => ({ ...c, [k]: Math.max(1, Math.min(20000, Math.round(+v) || 1)) }));

  return (
    <section className={styles.newDoc}>
      <div className={styles.newDocHeader}>
        <h3 className={styles.sectionTitle}>Artboard</h3>
        <span className={styles.newDocDims}>{dims.width} × {dims.height} px</span>
      </div>
      <div className={styles.presetGrid} role="radiogroup" aria-label="Artboard size">
        {sizes.map(t => (
          <SizeTile key={t.key} size={t} active={sizeKey === t.key}
            onPick={() => setSizeKey(t.key)}
            onCreate={() => newDocument('gridBuilder', { presetKey: t.key, state: t.state })} />
        ))}
        <button role="radio" aria-checked={sizeKey === 'custom'}
          className={`${styles.preset} ${sizeKey === 'custom' ? styles.presetActive : ''}`}
          onClick={() => setSizeKey('custom')} title="Any size in pixels">
          <span className={styles.presetGlyphBox}><span className={`${styles.presetGlyph} ${styles.presetGlyphCustom}`} /></span>
          <span className={styles.presetName}>Custom</span>
          <span className={styles.presetSub}>Any size</span>
        </button>
      </div>
      <div className={styles.newDocTools}>
        <button className={styles.showAllBtn} onClick={() => setShowMore(m => !m)}>
          {showMore ? 'Fewer sizes' : `More sizes (${MORE_SIZES.length})`}
        </button>
        {sizeKey === 'custom' && (
          <span className={styles.customDims}>
            <input type="number" min={1} value={custom.width} aria-label="Width" onChange={e => setDim('width', e.target.value)} />
            <span>×</span>
            <input type="number" min={1} value={custom.height} aria-label="Height" onChange={e => setDim('height', e.target.value)} />
            <span>px</span>
          </span>
        )}
      </div>

      <div className={styles.modeGrid}>
        {MODE_ORDER.map(m => {
          const def = MODE_REGISTRY[m];
          return (
            <button key={m} className={styles.modeCard} style={{ '--mode-accent': def.accent }}
              onClick={() => newDocument(m, size)} title={def.description}>
              <span className={styles.modeMark}><def.mark size={30} /></span>
              <span className={styles.modeText}>
                <span className={styles.modeTitle}>New {def.label}</span>
                <span className={styles.modeTagline}>{def.tagline}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// Autosaved documents that no tab owns (kept for seven days).
function RecoverSection() {
  const items = useRecoveryStore(s => s.items);
  if (!items.length) return null;
  return (
    <section className={styles.recent}>
      <h3 className={styles.sectionTitle}>Recover unsaved documents</h3>
      <div className={styles.recentGrid}>
        {items.map(r => {
          const def = MODE_REGISTRY[r.mode] ?? MODE_REGISTRY.gridBuilder;
          return (
            <div key={r.id} className={styles.recentCard}>
              <button className={styles.recentOpen} onClick={() => openRecovered(r.id)} title="Open this autosave in a new tab">
                <span className={styles.recentThumb}><def.mark size={30} /></span>
                <span className={styles.recentMeta}>
                  <span className={styles.recentName}>{r.name}</span>
                  <span className={styles.recentSub}>
                    <span className={styles.recentDot} style={{ background: def.accent }} />
                    {def.label} · autosaved {timeAgo(r.at)}
                  </span>
                </span>
              </button>
              <button className={styles.recentRemove} onClick={() => discardRecovered(r.id)} title="Discard this autosave">
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HomeScreen() {
  const recentFiles = useAppStore(s => s.recentFiles);
  const removeRecentFile = useAppStore(s => s.removeRecentFile);
  const openCount = useDocumentStore(s => s.order.length);
  const [sizeKey, setSizeKey] = useState('a4-portrait');
  const [custom, setCustom] = useState({ width: 800, height: 600 });
  const size = {
    presetKey: sizeKey,
    state: sizeKey === 'custom' ? { customSize: custom } : ALL_SIZES.find(t => t.key === sizeKey)?.state,
  };

  return (
    <div className={styles.home}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.title}>Mills Pattern Studio</h1>
            <p className={styles.subtitle}>
              Start a new document, or pick up where you left off.
              {openCount > 0 && ` ${openCount} ${openCount === 1 ? 'document is' : 'documents are'} open in tabs.`}
            </p>
          </div>
          <button className={styles.openBtn} onClick={openDocument}>
            <FolderIcon /> Open…
          </button>
        </header>

        <RecoverSection />

        <NewDocument sizeKey={sizeKey} setSizeKey={setSizeKey} custom={custom} setCustom={setCustom} size={size} />

        <PaletteSection size={size} />

        <section className={styles.recent}>
          <h3 className={styles.sectionTitle}>Recent</h3>
          {recentFiles.length === 0 ? (
            <p className={styles.empty}>
              {isTauri
                ? 'Projects you save or open will appear here.'
                : 'Recent files are available in the desktop app.'}
            </p>
          ) : (
            <div className={styles.recentGrid}>
              {recentFiles.map(r => {
                const def = MODE_REGISTRY[r.mode] ?? MODE_REGISTRY.gridBuilder;
                return (
                  <div key={r.path} className={styles.recentCard}>
                    <button className={styles.recentOpen} onClick={() => openRecent(r)} title={r.path}>
                      <span className={styles.recentThumb}>
                        {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <def.mark size={30} />}
                      </span>
                      <span className={styles.recentMeta}>
                        <span className={styles.recentName}>{r.name}</span>
                        <span className={styles.recentSub}>
                          <span className={styles.recentDot} style={{ background: def.accent }} />
                          {def.label} · {timeAgo(r.openedAt)}
                        </span>
                      </span>
                    </button>
                    <button className={styles.recentRemove} onClick={() => removeRecentFile(r.path)} title="Remove from recent">
                      <CloseIcon />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
