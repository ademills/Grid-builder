import { useDocumentStore } from '../store/documentStore';
import { useSeedHistory, restoreSeeds } from '../shell/seedHistory';
import { useAnchoredPopover } from './anchoredPopover';
import styles from './SeedHistory.module.css';

const NONE = [];

function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
}

// A clock button beside a seed field: the document's recent designs, newest
// first, as thumbnails. Clicking one puts its seeds back.
export function SeedHistoryButton({ className }) {
  const docId = useDocumentStore(s => s.activeId);
  const entries = useSeedHistory(s => s.byDoc[docId] ?? NONE);
  const { anchor, toggle, close, portal } = useAnchoredPopover();
  const past = entries.length > 1;

  return (
    <>
      <button ref={anchor} className={className} onClick={toggle} disabled={!past}
        title={past ? 'Recent designs' : 'Recent designs appear here as you change the seed'}>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.2h2.2M8 5v3.2l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {portal(
        <div className={styles.history}>
          <div className={styles.title}>Recent designs</div>
          <div className={styles.grid}>
            {entries.map((e, i) => (
              <button key={e.sig} className={`${styles.entry} ${i === 0 ? styles.current : ''}`}
                onClick={() => { restoreSeeds(docId, e); close(); }}
                title={`${e.seeds.label ? `${e.seeds.label} · ` : ''}seed ${e.seeds.seed} · ${ago(e.at)}${i === 0 ? ' (current)' : ''}`}>
                <span className={styles.thumb}>{e.thumb ? <img src={e.thumb} alt="" /> : null}</span>
                <span className={styles.seed}>{e.seeds.seed}</span>
              </button>
            ))}
          </div>
        </div>,
        292,
      )}
    </>
  );
}
