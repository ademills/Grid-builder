import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { FILLS, FILLS_BY_ID } from '../modes/gridBuilder/fills';
import { PanelMenu } from './Dock';
import {
  DiceIcon, CloseIcon, LayersIcon, HistoryIcon, InfoIcon, LayoutsIcon, SwatchesIcon, PaletteIcon,
  ShapesIcon, EffectsIcon, ImageIcon, AnimationIcon, AudioIcon,
} from './icons';
import styles from './Inspector.module.css';

// Inspector layout: the panels you tune a design with (Properties, the
// mode's generator, Colour) as folding sections in one scrolling column,
// with the mode's Generate buttons pinned underneath. Every other panel
// sits on an icon rail beside it and opens as a flyout. Built from the
// same registry `dock` groups as the classic Dock: the first panel of each
// group that starts expanded goes in the column, the rest go on the rail.

const RAIL_ICONS = {
  layers: LayersIcon, history: HistoryIcon, info: InfoIcon, layouts: LayoutsIcon,
  swatches: SwatchesIcon, colour: PaletteIcon, assets: ShapesIcon, effects: EffectsIcon,
  image: ImageIcon, animation: AnimationIcon, audio: AudioIcon,
};

function splitPanels(groups) {
  const sections = [], rail = [];
  for (const g of groups) {
    const [first, ...rest] = g.panels;
    if (g.defaultCollapsed) rail.push(...g.panels.map(p => ({ ...p, groupId: g.id })));
    else {
      sections.push({ ...first, groupId: g.id });
      rail.push(...rest.map(p => ({ ...p, groupId: g.id })));
    }
  }
  return { sections, rail };
}

function Section({ panel }) {
  const key = `inspector:${panel.id}`;
  const collapsed = useAppStore(s => !!s.dock.groups[key]?.collapsed);
  const updateDockGroup = useAppStore(s => s.updateDockGroup);
  const Panel = panel.component;
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <button className={styles.sectionToggle} onClick={() => updateDockGroup(key, { collapsed: !collapsed })}
          aria-expanded={!collapsed}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}>
            <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {panel.title}
        </button>
        {!collapsed && <PanelMenu panel={panel} />}
      </header>
      {!collapsed && <div className={styles.sectionBody}><Panel /></div>}
    </section>
  );
}

// Each mode's further actions, in the Generate bar's ⋯ menu (command ids).
const MORE_ACTIONS = {
  gridBuilder: ['generate.fillGaps', 'generate.flipH', 'generate.flipV', 'separator', 'generate.clear'],
  knotwork: ['meander.recolour'],
  linework: ['linework.recolour'],
};

// The mode's main actions, always in view at the foot of the column: the
// same Generate and Surprise me in every mode, plus a ⋯ menu for the rest.
function GenerateBar({ mode }) {
  const { actions, status, fillActions } = useEditor();
  const [activeFill] = useDocField('activeFill');

  let generate, surprise;
  if (mode === 'gridBuilder') {
    const fill = FILLS_BY_ID[activeFill] ?? FILLS[0];
    const action = fillActions[fill.id];
    generate = { run: () => action?.run(), can: !!action?.can, title: `Run the ${fill.label} fill (pick it in the control bar or Generate)` };
    surprise = { run: actions.surpriseMe, can: !!fillActions.standard?.can, title: 'Random fill, settings, palette and seed (Ctrl+Shift+R)' };
  } else if (mode === 'knotwork') {
    generate = { run: actions.knotworkFill, can: status.canKnotworkFill, title: 'Generate a new design (keeps the seed when a word is set)' };
    surprise = { run: actions.knotworkSurprise, can: status.canKnotworkFill, title: 'Random density, symmetry, strand shape and seed (Ctrl+Shift+R)' };
  } else {
    generate = { run: actions.lineworkReseed, can: true, title: 'New seeds for every layer' };
    surprise = { run: actions.lineworkSurprise, can: true, title: 'Random preset colours, design and seeds (Ctrl+Shift+R)' };
  }

  return (
    <div className={styles.generateBar}>
      <button className={styles.primaryBtn} onClick={generate.run} disabled={!generate.can} title={generate.title}>Generate</button>
      <button className={styles.secondaryBtn} onClick={surprise.run} disabled={!surprise.can} title={surprise.title}>
        <DiceIcon size={14} /> Surprise me
      </button>
      <PanelMenu panel={{ title: 'More', menu: MORE_ACTIONS[mode] }} up withReset={false} className={styles.secondaryBtn}>
        <span aria-hidden="true">⋯</span>
      </PanelMenu>
    </div>
  );
}

export function Inspector({ mode, groups }) {
  const width = useAppStore(s => s.dock.width);
  const setDockWidth = useAppStore(s => s.setDockWidth);
  const flyout = useAppStore(s => s.flyout);
  const setFlyout = useAppStore(s => s.setFlyout);
  const { sections, rail } = splitPanels(groups);
  const open = rail.find(p => p.id === flyout);
  const dragRef = useRef(null);

  // A panel revealed by a menu command that lives in the column (e.g.
  // Window › Effects in a mode where it's a section) needs no flyout.
  useEffect(() => {
    if (flyout && !open) setFlyout(null);
  }, [flyout, open, setFlyout]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !e.target.closest?.('input, textarea, select')) setFlyout(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setFlyout]);

  const onResizeStart = useCallback((e) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: useAppStore.getState().dock.width };
    const onMove = (ev) => dragRef.current && setDockWidth(dragRef.current.startW + (dragRef.current.startX - ev.clientX));
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
  }, [setDockWidth]);

  const Flyout = open?.component;

  return (
    <aside className={styles.inspector} data-layout="inspector">
      {open && (
        <div className={styles.flyout}>
          <header className={styles.flyoutHeader}>
            <span className={styles.flyoutTitle}>{open.title}</span>
            <PanelMenu panel={open} />
            <button className={styles.flyoutClose} onClick={() => setFlyout(null)} title="Close (Esc)"><CloseIcon /></button>
          </header>
          <div className={styles.flyoutBody}><Flyout /></div>
        </div>
      )}

      <nav className={styles.rail} aria-label="Panels">
        {rail.map(p => {
          const Icon = RAIL_ICONS[p.id] ?? LayersIcon;
          return (
            <button key={p.id} className={`${styles.railBtn} ${p.id === flyout ? styles.railBtnActive : ''}`}
              onClick={() => setFlyout(p.id === flyout ? null : p.id)} title={p.title} aria-pressed={p.id === flyout}>
              <Icon size={18} />
            </button>
          );
        })}
      </nav>

      <div className={styles.column} style={{ width }}>
        <div className={styles.resizeHandle} onMouseDown={onResizeStart} title="Drag to resize panels" />
        <div className={styles.scroll}>
          {sections.map(p => <Section key={p.id} panel={p} />)}
        </div>
        <GenerateBar mode={mode} />
      </div>
    </aside>
  );
}
