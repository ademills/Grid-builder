import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { PALETTES, PALETTE_GROUPS } from '../utils/colorize';
import { useLibraryStore } from '../store/libraryStore';
import { MODE_REGISTRY, MODE_ORDER } from '../modes/registry';
import { useAppStore } from '../store/appStore';
import { useDocumentStore } from '../store/documentStore';
import { newDocument, openDocument, openRecent } from './documentActions';
import { isTauri } from './fileIO';
import { FolderIcon, CloseIcon } from './icons';
import styles from './HomeScreen.module.css';

// The mode cards offer the everyday sizes; Templates below has the rest.
const CARD_PRESET_KEYS = ['a4-portrait', 'a4-landscape', 'us-letter', 'us-letter-landscape', 'square-1080', 'hd-landscape', 'hd-portrait'];
const CARD_PRESETS = PRESETS.filter(p => CARD_PRESET_KEYS.includes(p.key));
const presetByKey = Object.fromEntries(PRESETS.map(p => [p.key, p]));

// Start-from sizes for common outputs. `state` tweaks the new document.
const TEMPLATES = [
  { key: 'ig-portrait', name: 'Instagram post', note: '4:5' },
  { key: 'square-1080', name: 'Instagram square', note: '1:1' },
  { key: 'hd-portrait', name: 'Story / Reel', note: '9:16' },
  { key: 'a4-portrait', name: 'A4 print', note: 'Portrait' },
  { key: 'a3-portrait', name: 'A3 print', note: 'Portrait' },
  { key: '4k-landscape', name: '4K wallpaper', note: '16:9' },
  { key: 'phone-wallpaper', name: 'Phone wallpaper', note: '19.5:9' },
  // Edge to edge so the design can tile as a repeat.
  { key: 'fabric-repeat', name: 'Fabric repeat', note: '12 in at 300 dpi', state: { gridSettings: { cols: 12, borderPct: 0 } } },
];

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

function TemplateCard({ t }) {
  const p = presetByKey[t.key];
  return (
    <div className={styles.templateCard}>
      <button className={styles.templateMain} onClick={() => newDocument('gridBuilder', { presetKey: t.key, state: t.state })}
        title={`New Grid Pattern, ${p.width} × ${p.height}px`}>
        <span className={styles.templateGlyph}><ArtboardGlyph width={p.width} height={p.height} /></span>
        <span className={styles.templateText}>
          <span className={styles.templateName}>{t.name}</span>
          <span className={styles.templateSub}>{p.width} × {p.height} · {t.note}</span>
        </span>
      </button>
      <ModeButtons onPick={mode => newDocument(mode, { presetKey: t.key, state: t.state })} />
    </div>
  );
}

// A new document coloured from a palette: its swatches become the document
// palette, shown with Random colouring in Grid mode.
function startFromPalette(mode, { name, colours }) {
  newDocument(mode, {
    state: {
      paletteKey: name,
      shapeColors: colours.map((hex, i) => ({ id: `p-${i}`, hex, enabled: true, source: 'palette' })),
      ...(mode === 'gridBuilder' ? { colorMode: 'random' } : {}),
    },
  });
}

const PALETTE_PAGE = 12;

function PaletteSection() {
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
            <button className={styles.paletteMain} onClick={() => startFromPalette('gridBuilder', p)} title={`New Grid Pattern using ${p.name}`}>
              <span className={styles.paletteStrip}>
                {p.colours.slice(0, 10).map((hex, i) => <span key={i} style={{ background: hex }} />)}
              </span>
              <span className={styles.paletteName}>{p.name}</span>
            </button>
            <ModeButtons onPick={mode => startFromPalette(mode, p)} />
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

function ModeCard({ mode }) {
  const def = MODE_REGISTRY[mode];
  const Mark = def.mark;
  const [presetKey, setPresetKey] = useState('a4-portrait');

  return (
    <section className={styles.modeCard} style={{ '--mode-accent': def.accent }}>
      <div className={styles.modeHeader}>
        <span className={styles.modeMark}><Mark size={44} /></span>
        <div>
          <h2 className={styles.modeTitle}>{def.label}</h2>
          <p className={styles.modeTagline}>{def.tagline}</p>
        </div>
      </div>
      <p className={styles.modeDescription}>{def.description}</p>

      <div className={styles.presetLabel}>Artboard</div>
      <div className={styles.presetGrid} role="radiogroup" aria-label={`${def.label} artboard size`}>
        {CARD_PRESETS.map(p => (
          <button
            key={p.key}
            role="radio"
            aria-checked={presetKey === p.key}
            className={`${styles.preset} ${presetKey === p.key ? styles.presetActive : ''}`}
            onClick={() => setPresetKey(p.key)}
            onDoubleClick={() => newDocument(mode, { presetKey: p.key })}
            title={`${p.label} — ${p.width} × ${p.height}`}
          >
            <ArtboardGlyph width={p.width} height={p.height} />
            <span className={styles.presetName}>{p.label}</span>
          </button>
        ))}
      </div>

      <button className={styles.createBtn} onClick={() => newDocument(mode, { presetKey })}>
        Create {def.label}
      </button>
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

export function HomeScreen() {
  const recentFiles = useAppStore(s => s.recentFiles);
  const removeRecentFile = useAppStore(s => s.removeRecentFile);
  const openCount = useDocumentStore(s => s.order.length);

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

        <div className={styles.modeGrid}>
          {MODE_ORDER.map(m => <ModeCard key={m} mode={m} />)}
        </div>

        <section className={styles.recent}>
          <h3 className={styles.sectionTitle}>Templates</h3>
          <div className={styles.templateGrid}>
            {TEMPLATES.map(t => <TemplateCard key={t.key} t={t} />)}
          </div>
        </section>

        <PaletteSection />

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
