import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { ImagePicker, Segmented, Toggle, InfoTip } from './controls';
import { SwatchColourField } from './SwatchColourField';
import styles from './Panel.module.css';

// Reference / backdrop image shown behind the artboard. In Meander and
// Linework the same image can also supply the line colours.
export function ImagePanel() {
  const { mode, linework } = useEditor();
  const [backdropSrc, setBackdropSrc] = useDocField('backdropSrc');
  const [settings, setSettings] = useDocSettings('backdropSettings');
  const [knotworkSettings, setKnotworkSettings] = useDocSettings('knotworkSettings');

  return (
    <div className={styles.sectionContent}>
      <ImagePicker src={backdropSrc} onChange={setBackdropSrc} alt="Backdrop" />
      {!backdropSrc && (
        <div className={styles.gridNote}>
          Reference images sit behind the artboard while you work. Backdrop images are also included when you export.
        </div>
      )}
      {backdropSrc && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Use as</span>
            <Segmented value={settings.mode} onChange={v => setSettings({ mode: v })} options={[
              { key: 'reference', label: 'Reference' },
              { key: 'backdrop', label: 'Backdrop' },
            ]} />
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Fit</span>
            <Segmented value={settings.fit} onChange={v => setSettings({ fit: v })} options={[
              { key: 'contain', label: 'Contain' },
              { key: 'cover', label: 'Cover' },
              { key: 'stretch', label: 'Stretch' },
            ]} />
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Opacity</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider} min="0" max="1" step="0.05"
                value={settings.opacity} onChange={e => setSettings({ opacity: +e.target.value })} />
              <span className={styles.sliderVal}>{Math.round(settings.opacity * 100)}%</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Tint</span>
            <div className={styles.sliderRow}>
              <input type="color" value={settings.tintColour} onChange={e => setSettings({ tintColour: e.target.value })} className={styles.colorInput} />
              <input type="range" className={styles.slider} min="0" max="1" step="0.05"
                value={settings.tintOpacity} onChange={e => setSettings({ tintOpacity: +e.target.value })} />
              <span className={styles.sliderVal}>{Math.round(settings.tintOpacity * 100)}%</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Cutout<InfoTip text="Shapes become holes in a solid overlay, so the image shows through them. Exported too." /></span>
            <Toggle value={!!settings.cutout} onChange={v => setSettings({ cutout: v })} />
          </div>
          {settings.cutout && (
            <div className={styles.formRow}>
              <span className={styles.label}>Overlay</span>
              <SwatchColourField value={settings.cutoutHex ?? '#111111'} title="Overlay colour"
                onChange={(hex, swatch) => setSettings({ cutoutHex: hex, cutoutSwatch: swatch ?? null })} />
            </div>
          )}
          {mode === 'knotwork' && (
            <div className={styles.formRow}>
              <span className={styles.label}>Ink from image</span>
              <Toggle
                value={knotworkSettings.inkMode === 'image'}
                onChange={on => setKnotworkSettings({ inkMode: on ? 'image' : 'palette' })}
                title="Sample strand colour from this image instead of the palette"
              />
            </div>
          )}
          {mode === 'linework' && (
            <div className={styles.formRow}>
              <span className={styles.label}>Ink from image</span>
              <Toggle
                value={!!linework.settings.inkFromImage}
                onChange={on => linework.update({ inkFromImage: on }, 'Ink from Image')}
                title="Colour each line group from this image instead of the palette"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
