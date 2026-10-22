import { useEffect, useState } from 'react';
import { isTauri } from '../shell/fileIO';

// The desktop app renders PNG/JPEG in Rust, which allows far larger images
// than the browser's canvas (16,384 px a side).
const SCALES = isTauri ? [1, 2, 4, 8, 16] : [1, 2, 4];
const MAX_SIDE = { png: isTauri ? 32768 : 16384, jpeg: 16384 };
import styles from '../panels/Panel.module.css';

function Dialog({ title, onClose, children, width }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className={styles.dialogBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} style={width ? { width } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.dialogHeader}>
          <span>{title}</span>
          <button className={styles.dialogClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// File → Export As…: format, scale and the options that apply to it.
export function ExportDialog({ onClose, onExport, workArea, hasBackdrop, hasLayout, hasEffects, defaultScale = 1 }) {
  const [format, setFormat] = useState('svg');
  const [scale, setScale] = useState(defaultScale);
  const [transparent, setTransparent] = useState(true);
  const [photoComposite, setPhotoComposite] = useState(false);
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [wireframeLayer, setWireframeLayer] = useState(false);
  const [svgLayers, setSvgLayers] = useState('colour');
  const [svgReuse, setSvgReuse] = useState(false);
  const [svgPrecision, setSvgPrecision] = useState(2);
  const outScale = format === 'svg' ? 1 : scale;

  return (
    <Dialog title="Export As" onClose={onClose}>
      <div className={styles.sectionContent}>
        <div className={styles.formRow}>
          <span className={styles.label}>Format</span>
          <div className={styles.modeToggle}>
            {['svg', 'png', 'jpeg'].map(f => (
              <button key={f}
                className={`${styles.modeBtn} ${format === f ? styles.modeBtnActive : ''}`}
                onClick={() => setFormat(f)}
              >{f.toUpperCase()}</button>
            ))}
          </div>
        </div>

        {format !== 'svg' && (
          <div className={styles.formRow}>
            <span className={styles.label}>Scale</span>
            <div className={styles.modeToggle}>
              {SCALES.map(s => (
                <button key={s}
                  className={`${styles.modeBtn} ${scale === s ? styles.modeBtnActive : ''}`}
                  onClick={() => setScale(s)}
                >{s}×</button>
              ))}
            </div>
          </div>
        )}

        {workArea && (
          <div className={styles.gridInfo}>
            Output size: {Math.round(workArea.width * outScale)} × {Math.round(workArea.height * outScale)} px
            {format !== 'svg' && Math.max(workArea.width, workArea.height) * outScale > MAX_SIDE[format] && (
              <span className={styles.snapNote}> — too large; {format.toUpperCase()} is limited to {MAX_SIDE[format].toLocaleString()} px a side</span>
            )}
          </div>
        )}

        {hasEffects && (
          <div className={styles.gridNote}>
            {format === 'svg' ? 'Effects are raster-only, so this SVG is exported without them.' : 'Effects are applied (up to 16,384 px a side).'}
          </div>
        )}

        {format === 'svg' && (
          <>
            <div className={styles.formRow}>
              <span className={styles.label}>Layers by</span>
              <div className={styles.modeToggle}>
                {[['colour', 'Colour'], ['shape', 'Shape'], ['group', 'Groups'], ['none', 'None']].map(([k, label]) => (
                  <button key={k} className={`${styles.modeBtn} ${svgLayers === k ? styles.modeBtnActive : ''}`}
                    onClick={() => setSvgLayers(k)}
                    title={k === 'group' ? 'Your Object › Group groups' : k === 'none' ? 'Every shape directly in one Shapes layer' : undefined}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div className={styles.formRow}>
              <span className={styles.label}>Decimal places</span>
              <div className={styles.modeToggle}>
                {[1, 2, 3].map(p => (
                  <button key={p} className={`${styles.modeBtn} ${svgPrecision === p ? styles.modeBtnActive : ''}`}
                    onClick={() => setSvgPrecision(p)}>{p}</button>
                ))}
              </div>
            </div>
            <label className={styles.formRow} style={{ cursor: 'pointer' }}
              title="Identical shapes are defined once and placed with <use>. Smaller files; Figma imports them less tidily.">
              <span className={styles.label}>Reuse repeated shapes</span>
              <input type="checkbox" checked={svgReuse} onChange={e => setSvgReuse(e.target.checked)} />
            </label>
          </>
        )}

        {format === 'png' && (
          <label className={styles.formRow} style={{ cursor: 'pointer' }}>
            <span className={styles.label}>Transparent background</span>
            <input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} />
          </label>
        )}

        {format === 'jpeg' && (
          <div className={styles.formRow}>
            <span className={styles.label}>Quality</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider} min="0.5" max="1" step="0.01"
                value={jpegQuality} onChange={e => setJpegQuality(+e.target.value)} />
              <span className={styles.sliderVal}>{Math.round(jpegQuality * 100)}%</span>
            </div>
          </div>
        )}

        {hasBackdrop && (
          <label className={styles.formRow} style={{ cursor: 'pointer' }}>
            <span className={styles.label}>Composite over photo</span>
            <input type="checkbox" checked={photoComposite} onChange={e => setPhotoComposite(e.target.checked)} />
          </label>
        )}

        {hasLayout && (
          <label className={styles.formRow} style={{ cursor: 'pointer' }}>
            <span className={styles.label}>Include layout reference</span>
            <input type="checkbox" checked={wireframeLayer} onChange={e => setWireframeLayer(e.target.checked)} />
          </label>
        )}
      </div>
      <div className={styles.dialogFooter}>
        <button className={styles.actionBtn} onClick={onClose}>Cancel</button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          autoFocus
          onClick={() => {
            onExport({
              format,
              scale,
              transparentBackground: format === 'png' && transparent,
              jpegQuality,
              photoComposite,
              includeWireframeLayer: wireframeLayer,
              svgLayers, svgReuse, svgPrecision,
            });
            onClose();
          }}
        >Export</button>
      </div>
    </Dialog>
  );
}

const SHORTCUTS = [
  { group: 'Files' },
  { keys: 'Ctrl + N', desc: 'New Grid Pattern' },
  { keys: 'Ctrl + Shift + N', desc: 'New Meander' },
  { keys: 'Ctrl + O', desc: 'Open project' },
  { keys: 'Ctrl + S', desc: 'Save (Shift: Save As)' },
  { keys: 'Ctrl + Shift + E', desc: 'Export As…' },
  { keys: 'Ctrl + W', desc: 'Close document' },
  { keys: 'Ctrl + Tab', desc: 'Next document' },
  { group: 'Tools' },
  { keys: 'V / M / Y', desc: 'Selection / Move / Magic Wand' },
  { keys: 'Alt + drag (M)', desc: 'Copy the shapes instead of moving them' },
  { keys: 'S / E', desc: 'Shape Stamp / Eraser (drag to paint)' },
  { keys: 'R / O', desc: 'Rotate / Reflect (Alt: other direction)' },
  { keys: 'K / I', desc: 'Paint Bucket / Eyedropper' },
  { keys: 'H / Z', desc: 'Hand / Zoom (Alt+click zooms out)' },
  { keys: 'Hold Space', desc: 'Temporary Hand tool' },
  { keys: 'Alt + click (K)', desc: 'Paint every part of that colour' },
  { keys: 'Shift + click (K)', desc: 'Paint that colour in every shape' },
  { keys: 'Alt + click (S)', desc: 'Replace the shape under the cursor' },
  { keys: 'Alt + click (I)', desc: 'Pick a colour and paint the selection with it' },
  { keys: 'Drag (Z)', desc: 'Zoom to the dragged area' },
  { group: 'Editing' },
  { keys: 'Ctrl + Z', desc: 'Undo' },
  { keys: 'Ctrl + Shift + Z / Ctrl + Y', desc: 'Redo' },
  { keys: 'Ctrl + X / C / V', desc: 'Cut / copy / paste (pastes under the pointer)' },
  { keys: 'Ctrl + D', desc: 'Duplicate beside the selection' },
  { keys: 'Ctrl + G', desc: 'Group (Shift: ungroup)' },
  { keys: 'Ctrl + Shift + R', desc: 'Surprise Me' },
  { keys: 'Ctrl + A', desc: 'Select all (Shift: deselect)' },
  { keys: 'Shift + click', desc: 'Add block to selection' },
  { keys: 'Drag canvas', desc: 'Marquee select blocks' },
  { keys: 'Arrow keys', desc: 'Nudge selected blocks one cell' },
  { keys: 'Delete / ⌫', desc: 'Delete selected blocks' },
  { group: 'View' },
  { keys: 'Ctrl + = / −', desc: 'Zoom in / out' },
  { keys: 'Ctrl + 0', desc: 'Fit artboard' },
  { keys: 'Ctrl + 1', desc: 'Actual size' },
  { keys: 'Scroll wheel', desc: 'Pan (Shift: sideways)' },
  { keys: 'Ctrl / Alt + scroll', desc: 'Zoom at the pointer' },
  { keys: 'Ctrl + R', desc: 'Show / hide rulers' },
  { keys: 'Ctrl + ;', desc: 'Show / hide guides' },
  { keys: 'Drag from a ruler', desc: 'New guide (Shift: no snapping)' },
  { keys: '?', desc: 'Show this list' },
];

export function ShortcutsDialog({ onClose }) {
  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose} width={440}>
      <div className={styles.shortcutsList}>
        {SHORTCUTS.map((s, i) => s.group ? (
          <div key={i} className={styles.subHeading} style={i === 0 ? { marginTop: 4 } : undefined}>{s.group}</div>
        ) : (
          <div key={i} className={styles.shortcutRow}>
            <kbd className={styles.shortcutKey}>{s.keys}</kbd>
            <span className={styles.shortcutDesc}>{s.desc}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
