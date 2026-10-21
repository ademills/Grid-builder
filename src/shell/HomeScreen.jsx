import { useState } from 'react';
import { PRESETS } from '../gridPresets';
import { MODE_REGISTRY, MODE_ORDER } from '../modes/registry';
import { useAppStore } from '../store/appStore';
import { useDocumentStore } from '../store/documentStore';
import { newDocument, openDocument, openRecent } from './documentActions';
import { isTauri } from './fileIO';
import { FolderIcon, CloseIcon } from './icons';
import styles from './HomeScreen.module.css';

const CARD_PRESETS = PRESETS.filter(p => p.key !== 'custom');

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
