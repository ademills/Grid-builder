import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { useDocumentStore } from '../store/documentStore';
import { MODE_REGISTRY, TOOLS } from '../modes/registry';
import { FILLS } from '../modes/gridBuilder/fills';
import { LINEWORK_PRESETS } from '../modes/linework/settings';
import { COMMANDS, commandContext, isEnabled, runCommand } from './commands';
import { openRecent } from './documentActions';
import { fuzzyScore } from './fuzzy';
import styles from './CommandPalette.module.css';

// Ctrl+K: search every command, panel, tool, fill, Linework preset and
// recent file, and run the one you pick. The last few picks are listed
// first when the search is empty.

const RECENT_KEY = 'mps-palette-recent';
const GROUPS = {
  file: 'File', edit: 'Edit', object: 'Object', select: 'Select', generate: 'Generate', meander: 'Generate',
  linework: 'Generate', colour: 'Colour', assets: 'Assets', view: 'View', window: 'Window', help: 'Help',
};

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function remember(key) {
  const list = [key, ...loadRecent().filter(k => k !== key)].slice(0, 6);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}

// Everything the palette can run right now: [{ key, label, group, hint?, run }].
function buildEntries() {
  const c = commandContext();
  const app = useAppStore.getState();
  const doc = c.activeDoc;
  const mode = doc ? MODE_REGISTRY[doc.mode] : null;
  const entries = [];

  for (const [id, cmd] of Object.entries(COMMANDS)) {
    if (id === 'app.palette' || !isEnabled(id, c)) continue;
    // Menu labels lean on their menu (Select › All); spell those out here.
    const prefix = id.startsWith('view.overlay.') ? 'Overlay: ' : id.startsWith('view.pasteboard.') ? 'Pasteboard: ' : id.startsWith('select.') ? 'Select ' : '';
    const checked = cmd.checked?.(c);
    entries.push({
      key: `cmd:${id}`, label: prefix + cmd.label, group: GROUPS[id.split('.')[0]] ?? 'Command',
      hint: [checked ? 'On' : '', cmd.shortcut ?? ''].filter(Boolean).join(' · '), run: () => runCommand(id),
    });
  }
  if (mode) {
    for (const group of mode.dock) {
      for (const panel of group.panels) {
        entries.push({ key: `panel:${panel.id}`, label: `Show ${panel.title}`, group: 'Panel', run: () => app.showDockTab(group.id, panel.id) });
      }
    }
    for (const id of mode.tools.filter(t => TOOLS[t])) {
      const tool = TOOLS[id];
      entries.push({ key: `tool:${id}`, label: `${tool.label} Tool`, group: 'Tool', hint: tool.key, run: () => app.setActiveTool(id) });
    }
  }
  if (doc?.mode === 'gridBuilder') {
    for (const fill of FILLS) {
      entries.push({
        key: `fill:${fill.id}`, label: `${fill.label} Fill`, group: 'Fill', hint: doc.state.activeFill === fill.id ? 'Current' : '',
        run: () => { useDocumentStore.getState().setField(doc.id, 'activeFill', fill.id); app.showDockTab('generate', 'generate'); },
      });
    }
  }
  if (doc?.mode === 'linework' && c.cmds?.lineworkPreset) {
    for (const p of LINEWORK_PRESETS) {
      entries.push({ key: `preset:${p.name}`, label: `${p.name} Preset`, group: 'Linework', run: () => c.cmds.lineworkPreset(p.name) });
    }
  }
  for (const r of app.recentFiles) {
    entries.push({ key: `recent:${r.path}`, label: r.name, group: 'Open Recent', hint: MODE_REGISTRY[r.mode]?.label ?? '', run: () => openRecent(r) });
  }
  return entries;
}

export function CommandPalette() {
  const open = useAppStore(s => s.paletteOpen);
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const close = () => useAppStore.getState().setPaletteOpen(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [entries] = useState(buildEntries);
  const listRef = useRef(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      const recent = loadRecent();
      const byKey = new Map(entries.map(e => [e.key, e]));
      const first = recent.map(k => byKey.get(k)).filter(Boolean).map(e => ({ ...e, recent: true }));
      return [...first, ...entries.filter(e => !recent.includes(e.key))].slice(0, 60);
    }
    return entries
      .map(e => ({ e, s: fuzzyScore(query, `${e.label} ${e.group}`) }))
      .filter(x => x.s !== null)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map(x => x.e);
  }, [entries, query]);

  const pick = (entry) => {
    if (!entry) return;
    remember(entry.key);
    close();
    entry.run();
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className={styles.palette} role="dialog" aria-label="Command palette">
        <input
          className={styles.input}
          autoFocus
          placeholder="Search commands, panels, tools, fills, recent files…"
          value={query}
          onChange={e => { setQuery(e.target.value); setIndex(0); }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `palette-${index}` : undefined}
        />
        <ul className={styles.list} id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <li className={styles.empty}>Nothing matches “{query}”</li>}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`palette-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === index}
              className={`${styles.item} ${i === index ? styles.itemActive : ''}`}
              onMouseMove={() => setIndex(i)}
              onClick={() => pick(r)}
            >
              <span className={styles.group}>{r.recent ? 'Recent' : r.group}</span>
              <span className={styles.label}>{r.label}</span>
              {r.hint && <span className={styles.hint}>{r.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
