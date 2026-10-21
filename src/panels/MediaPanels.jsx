import { useDocField } from '../store/useDocField';
import { useEditor, useDocSettings } from '../editor/EditorContext';
import { ImagePicker, Segmented, Stepper, Toggle } from './controls';
import styles from './Panel.module.css';

// Reference / backdrop image shown behind the artboard. In Meander the same
// image can also supply the strand colours.
export function ImagePanel() {
  const { mode } = useEditor();
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
        </>
      )}
    </div>
  );
}

export function AnimationPanel() {
  const [animSettings, setAnimSettings] = useDocSettings('animSettings');
  return (
    <div className={styles.sectionContent}>
      {/* Play / Pause */}
      <div className={styles.animPlayRow}>
        <button
          className={`${styles.actionBtn} ${animSettings.enabled ? styles.actionBtnPrimary : ''}`}
          onClick={() => setAnimSettings({ enabled: !animSettings.enabled })}
        >
          {animSettings.enabled ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* Type selector */}
      <div className={styles.animTypeGrid}>
        {[
          { key: 'noise',         label: 'Noise'    },
          { key: 'gradientSweep', label: 'Gradient' },
          { key: 'paletteWave',   label: 'Wave'     },
          { key: 'hueDrift',      label: 'Hue'      },
          { key: 'warp',          label: 'Warp'     },
          { key: 'flicker',       label: 'Flicker'  },
          { key: 'pixelSort',     label: 'Pixel Sort' },
          { key: 'stripScan',     label: 'Strip Scan' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.animTypeBtn} ${animSettings.type === key ? styles.active : ''}`}
            onClick={() => setAnimSettings({ type: key })}
          >{label}</button>
        ))}
      </div>

      {/* Speed */}
      <div className={styles.formRow}>
        <span className={styles.label}>Speed</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider}
            min={0.05} max={3} step={0.05}
            value={animSettings.speed}
            onChange={e => setAnimSettings({ speed: parseFloat(e.target.value) })}
          />
          <span className={styles.sliderVal}>{animSettings.speed.toFixed(2)}</span>
        </div>
      </div>

      {/* Intensity */}
      <div className={styles.formRow}>
        <span className={styles.label}>Intensity</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider}
            min={0.05} max={1} step={0.05}
            value={animSettings.intensity}
            onChange={e => setAnimSettings({ intensity: parseFloat(e.target.value) })}
          />
          <span className={styles.sliderVal}>{Math.round(animSettings.intensity * 100)}%</span>
        </div>
      </div>

      {/* ── Per-type controls ── */}
      {animSettings.type === 'noise' && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Scale</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider}
                min={0.02} max={0.6} step={0.01}
                value={animSettings.noise?.scale ?? 0.18}
                onChange={e => setAnimSettings({ noise: { ...animSettings.noise, scale: parseFloat(e.target.value) } })}
              />
              <span className={styles.sliderVal}>{(animSettings.noise?.scale ?? 0.18).toFixed(2)}</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Octaves</span>
            <div className={styles.animTypeGrid} style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              {[1,2,3,4].map(n => (
                <button key={n}
                  className={`${styles.animTypeBtn} ${(animSettings.noise?.octaves ?? 3) === n ? styles.active : ''}`}
                  onClick={() => setAnimSettings({ noise: { ...animSettings.noise, octaves: n } })}
                >{n}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {animSettings.type === 'paletteWave' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Wavelength</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider}
              min={1} max={12} step={0.5}
              value={animSettings.paletteWave?.wavelength ?? 4}
              onChange={e => setAnimSettings({ paletteWave: { ...animSettings.paletteWave, wavelength: parseFloat(e.target.value) } })}
            />
            <span className={styles.sliderVal}>{(animSettings.paletteWave?.wavelength ?? 4).toFixed(1)}</span>
          </div>
        </div>
      )}

      {animSettings.type === 'hueDrift' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Range</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider}
              min={15} max={360} step={5}
              value={animSettings.hueDrift?.range ?? 120}
              onChange={e => setAnimSettings({ hueDrift: { ...animSettings.hueDrift, range: parseInt(e.target.value) } })}
            />
            <span className={styles.sliderVal}>{animSettings.hueDrift?.range ?? 120}°</span>
          </div>
        </div>
      )}

      {animSettings.type === 'warp' && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Scale</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider}
                min={2} max={60} step={1}
                value={animSettings.warp?.scale ?? 18}
                onChange={e => setAnimSettings({ warp: { ...animSettings.warp, scale: parseInt(e.target.value) } })}
              />
              <span className={styles.sliderVal}>{animSettings.warp?.scale ?? 18}</span>
            </div>
          </div>
          <div className={styles.formRow}>
            <span className={styles.label}>Frequency</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider}
                min={0.001} max={0.025} step={0.001}
                value={animSettings.warp?.frequency ?? 0.006}
                onChange={e => setAnimSettings({ warp: { ...animSettings.warp, frequency: parseFloat(e.target.value) } })}
              />
              <span className={styles.sliderVal}>{(animSettings.warp?.frequency ?? 0.006).toFixed(3)}</span>
            </div>
          </div>
        </>
      )}

      {animSettings.type === 'flicker' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Density</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider}
              min={0.01} max={0.5} step={0.01}
              value={animSettings.flicker?.density ?? 0.07}
              onChange={e => setAnimSettings({ flicker: { ...animSettings.flicker, density: parseFloat(e.target.value) } })}
            />
            <span className={styles.sliderVal}>{Math.round((animSettings.flicker?.density ?? 0.07) * 100)}%</span>
          </div>
        </div>
      )}

      {animSettings.type === 'pixelSort' && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Sort Axis</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'row',      label: 'Rows' },
                { key: 'column',   label: 'Columns' },
                { key: 'diagonal', label: 'Diagonal' },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortAxis ?? 'row') === key ? styles.modeBtnActive : ''}`}
                  onClick={() => setAnimSettings({ pixelSort: { ...animSettings.pixelSort, sortAxis: key } })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Sort By</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'brightness', label: 'Brightness' },
                { key: 'hue',        label: 'Hue' },
                { key: 'saturation', label: 'Saturation' },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortBy ?? 'brightness') === key ? styles.modeBtnActive : ''}`}
                  onClick={() => setAnimSettings({ pixelSort: { ...animSettings.pixelSort, sortBy: key } })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Direction</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'ascending',  label: 'Ascending' },
                { key: 'descending', label: 'Descending' },
                { key: 'oscillate',  label: 'Oscillate' },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${(animSettings.pixelSort?.sortDirection ?? 'ascending') === key ? styles.modeBtnActive : ''}`}
                  onClick={() => setAnimSettings({ pixelSort: { ...animSettings.pixelSort, sortDirection: key } })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Sort Width</span>
            <Stepper value={animSettings.pixelSort?.sortWidth ?? 8} onChange={v => setAnimSettings({ pixelSort: { ...animSettings.pixelSort, sortWidth: v } })} min={1} max={40} format={v => `${v} cells`} />
          </div>
        </>
      )}

      {animSettings.type === 'stripScan' && (
        <>
          <div className={styles.formRow}>
            <span className={styles.label}>Sweep Axis</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'h', label: 'Horizontal' },
                { key: 'v', label: 'Vertical' },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${(animSettings.stripScan?.sweepAxis ?? 'h') === key ? styles.modeBtnActive : ''}`}
                  onClick={() => setAnimSettings({ stripScan: { ...animSettings.stripScan, sweepAxis: key } })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Beam Width</span>
            <Stepper value={animSettings.stripScan?.beamWidth ?? 4} onChange={v => setAnimSettings({ stripScan: { ...animSettings.stripScan, beamWidth: v } })} min={1} max={20} format={v => `${v} cells`} />
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Motion</span>
            <div className={styles.modeToggle}>
              {[
                { key: 'pingpong', label: 'Ping-pong' },
                { key: 'scroll',   label: 'Scroll' },
              ].map(({ key, label }) => (
                <button key={key}
                  className={`${styles.modeBtn} ${(animSettings.stripScan?.motionMode ?? 'pingpong') === key ? styles.modeBtnActive : ''}`}
                  onClick={() => setAnimSettings({ stripScan: { ...animSettings.stripScan, motionMode: key } })}
                >{label}</button>
              ))}
            </div>
          </div>

          <div className={styles.formRow}>
            <span className={styles.label}>Dim Strength</span>
            <div className={styles.sliderRow}>
              <input type="range" className={styles.slider}
                min={0} max={1} step={0.05}
                value={animSettings.stripScan?.dimStrength ?? 0.7}
                onChange={e => setAnimSettings({ stripScan: { ...animSettings.stripScan, dimStrength: parseFloat(e.target.value) } })}
              />
              <span className={styles.sliderVal}>{Math.round((animSettings.stripScan?.dimStrength ?? 0.7) * 100)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AudioPanel() {
  const { audioFileSrc, setAudioFileSrc } = useEditor();
  const [audioSettings, setAudioSettings] = useDocSettings('audioSettings');
  return (
    <div className={styles.sectionContent}>
      <div className={styles.formRow}>
        <span className={styles.label}>Enabled</span>
        <button
          className={`${styles.modeBtn} ${audioSettings.enabled ? styles.modeBtnActive : ''}`}
          onClick={() => setAudioSettings({ enabled: !audioSettings.enabled })}
        >{audioSettings.enabled ? 'On' : 'Off'}</button>
      </div>

      <div className={styles.formRow}>
        <span className={styles.label}>Input Source</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'mic', label: 'Microphone' },
            { key: 'file', label: 'Audio File' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${audioSettings.inputSource === key ? styles.modeBtnActive : ''}`}
              onClick={() => setAudioSettings({ inputSource: key })}
            >{label}</button>
          ))}
        </div>
      </div>

      {audioSettings.inputSource === 'file' && (
        <div className={styles.formRow}>
          <span className={styles.label}>File</span>
          <input
            type="file"
            accept="audio/*"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (audioFileSrc) URL.revokeObjectURL(audioFileSrc);
              setAudioFileSrc(URL.createObjectURL(file));
            }}
          />
        </div>
      )}

      <div className={styles.formRow}>
        <span className={styles.label}>Amplitude Mapping</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'linear', label: 'Linear' },
            { key: 'logarithmic', label: 'Log' },
            { key: 'exponential', label: 'Exp' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${audioSettings.ampMapping === key ? styles.modeBtnActive : ''}`}
              onClick={() => setAudioSettings({ ampMapping: key })}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className={styles.sliderRow}>
        <span className={styles.label}>Beat Sensitivity</span>
        <input type="range" className={styles.slider} min="0" max="1" step="0.01"
          value={audioSettings.beatSensitivity}
          onChange={e => setAudioSettings({ beatSensitivity: +e.target.value })} />
        <span className={styles.sliderVal}>{audioSettings.beatSensitivity.toFixed(2)}</span>
      </div>
    </div>
  );
}
