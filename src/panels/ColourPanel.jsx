import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { useAppStore } from '../store/appStore';
import { ImagePicker, InfoTip, Toggle } from './controls';
import { SwatchRoleField } from './SwatchColourField';
import { normalizeHex, hslToHex } from './panelUtils';
import { addSwatchGroup } from '../utils/colourGuide';
import styles from './Panel.module.css';

const COLOUR_MODES = [
  { key: 'none', label: 'None', lineworkLabel: 'Single' },
  { key: 'uniform', label: 'Uniform' },
  { key: 'random', label: 'Random' },
  { key: 'gradient', label: 'Gradient' },
  { key: 'mesh', label: 'Mesh' },
  { key: 'image', label: 'Image' },
];

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'exclusion'];

const capitalise = s => s[0].toUpperCase() + s.slice(1).replace('-', ' ');

// The document palette as one chip: its name and colours. Opens Swatches.
// + keeps the palette as a swatch group (6.2), so it survives using another
// library or Surprise Me.
function PaletteChip() {
  const [paletteKey] = useDocField('paletteKey');
  const [shapeColors, setShapeColors] = useDocField('shapeColors');
  const showDockTab = useAppStore(s => s.showDockTab);
  const showToast = useAppStore(s => s.showToast);
  const palette = shapeColors.filter(c => c.enabled !== false);
  const keep = () => {
    const { swatches, group } = addSwatchGroup(shapeColors, paletteKey || 'Palette', palette.map(c => c.hex));
    setShapeColors(swatches);
    showToast(`Added swatch group “${group}”`);
  };
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
      <button className={styles.paletteChooserBtn} style={{ flex: 1, minWidth: 0 }} onClick={() => showDockTab('colour', 'swatches')}
        title="Edit swatches or pick a library in the Swatches panel">
        <span className={styles.paletteChooserName}>{paletteKey || 'Document'}</span>
        <span className={styles.paletteChooserSwatches}>
          {palette.map(c => (
            <span key={c.id} className={styles.paletteChooserSwatch} style={{ background: c.hex }} title={c.name || c.hex} />
          ))}
        </span>
        <span className={styles.paletteChooserArrow}>›</span>
      </button>
      <button className={styles.addQuickBtn} onClick={keep} disabled={!palette.length}
        title="Add to swatches: keep this palette as a swatch group">+</button>
    </div>
  );
}

// Linework's colour roles: which swatch is the ink, the ground (the canvas
// colour unless split off) and the plate shadow.
function LineworkRoles() {
  const { linework } = useEditor();
  const [shapeColors] = useDocField('shapeColors');
  const [canvasBg] = useDocField('canvasBg');
  const s = linework.settings;
  const role = (label, key, autoHex, autoLabel, undoLabel) => (
    <div className={styles.formRow}>
      <span className={styles.label}>{label}</span>
      <SwatchRoleField value={s[key]} autoHex={autoHex} autoLabel={autoLabel} swatches={shapeColors}
        onChange={id => linework.update({ [key]: id }, undoLabel)} />
    </div>
  );
  return (
    <>
      {role('Ink', 'inkSwatch', linework.roles.ink, 'first palette swatch', 'Ink Colour')}
      {role('Ground', 'groundSwatch', canvasBg, 'canvas colour', 'Ground Colour')}
      {role('Shadow', 'shadowSwatch', '#000000', 'black', 'Shadow Colour')}
    </>
  );
}

// Meander's two colours, read-only: they follow the palette and canvas.
function MeanderRoles() {
  const { knotworkThemeColors } = useEditor();
  return (
    <div className={styles.formRow}>
      <span className={styles.label}>Ink / paper<InfoTip text="Ink is the first palette colour; paper is the canvas colour (Properties)" /></span>
      <div className={styles.sliderRow}>
        <span className={styles.swatchInline} style={{ background: knotworkThemeColors.fg }} />
        <span className={styles.swatchInline} style={{ background: knotworkThemeColors.bg }} />
      </div>
    </div>
  );
}

// One Colour panel for every mode, in the same order: the palette, the
// mode's colour roles, then (Grid Pattern and Linework) the colour mode with
// its options, temperature and blend, and a Shuffle for modes that use it.
export function ColourPanel() {
  const { actions, status, mode } = useEditor();
  const linework = mode === 'linework';
  const meander = mode === 'knotwork';
  const imageProgress = status.imageProgress;
  const openSwatches = useAppStore(s => s.showDockTab);
  const [colorMode, setColorMode] = useDocField('colorMode');
  const [bgColors] = useDocField('bgColors');
  const [uniformReverse, setUniformReverse] = useDocField('uniformReverse');
  const [randomReverseEnabled, setRandomReverseEnabled] = useDocField('randomReverseEnabled');
  const [randomReversePct, setRandomReversePct] = useDocField('randomReversePct');
  const [colorTempShift, setColorTempShift] = useDocField('colorTempShift');
  const [blendMode, setBlendMode] = useDocField('blendMode');
  const [gradientSettings, setGradientSettings] = useDocField('gradientSettings');
  const [meshSettings, setMeshSettings] = useDocField('meshSettings');
  const [imageSrc, setImageSrc] = useDocField('imageSrc');
  const [imageColourTolerance, setImageColourTolerance] = useDocField('imageColourTolerance');

  const [rawGradBgHex, setRawGradBgHex] = useState('');

  // Mesh colour points: dragging a colour/position slider fires onChange
  // continuously, and committing every tick to document state recolours every
  // placed block — locally track a "draft" for instant UI feedback and
  // debounce the expensive commit until the user pauses.
  const [meshDraft, setMeshDraft] = useState(meshSettings);
  const [meshSource, setMeshSource] = useState(meshSettings);
  if (meshSource !== meshSettings) {
    // Committed (or undone / changed elsewhere) — resync the draft.
    setMeshSource(meshSettings);
    setMeshDraft(meshSettings);
  }
  const meshCommitTimer = useRef(null);
  useEffect(() => () => clearTimeout(meshCommitTimer.current), []);
  const updateMesh = useCallback((next) => {
    setMeshDraft(next);
    clearTimeout(meshCommitTimer.current);
    meshCommitTimer.current = setTimeout(() => setMeshSettings(next), 80);
  }, [setMeshSettings]);

  // Native colour pickers fire onChange dozens of times per second while
  // dragging — coalesce those into at most one state update per animation
  // frame so the picker itself doesn't stutter fighting React re-renders.
  const meshHexPending = useRef({});
  const meshHexRaf = useRef(null);
  useEffect(() => () => { if (meshHexRaf.current) cancelAnimationFrame(meshHexRaf.current); }, []);
  const updateMeshHex = useCallback((pointId, hex) => {
    meshHexPending.current[pointId] = hex;
    if (meshHexRaf.current) return;
    meshHexRaf.current = requestAnimationFrame(() => {
      meshHexRaf.current = null;
      const pending = meshHexPending.current;
      meshHexPending.current = {};
      setMeshDraft(prev => {
        const next = {
          ...prev,
          points: prev.points.map(x => pending[x.id] !== undefined ? { ...x, hex: pending[x.id] } : x),
        };
        clearTimeout(meshCommitTimer.current);
        meshCommitTimer.current = setTimeout(() => setMeshSettings(next), 80);
        return next;
      });
    });
  }, [setMeshSettings]);

  // Grid Pattern's palette only shows in the palette-based colour modes.
  const usesPalette = colorMode !== 'none' && colorMode !== 'image' && colorMode !== 'mesh';
  const shuffle = meander ? actions.knotworkRecolour
    : linework ? actions.lineworkRecolour
    : colorMode === 'random' ? actions.randomRerun : null;

  return (
    <div className={styles.sectionContent}>
      {(mode !== 'gridBuilder' || usesPalette) && <PaletteChip />}
      {meander && <MeanderRoles />}
      {linework && <LineworkRoles />}

      {!meander && (
      <>
        <div className={styles.formRow} style={{ marginTop: 8 }}>
          <span className={styles.label}>
            Colour mode
            {linework && <InfoTip text="Single: every line takes the ink colour. Uniform cycles the palette over the line groups; Random, Gradient, Mesh and Image colour each group by where it sits." />}
          </span>
          <select className={styles.select} value={colorMode} onChange={e => setColorMode(e.target.value)}>
            {COLOUR_MODES.map(m => <option key={m.key} value={m.key}>{(linework && m.lineworkLabel) || m.label}</option>)}
          </select>
        </div>

        {colorMode === 'uniform' && !linework && (
          <>
            <div className={styles.formRow}>
              <span className={styles.label}>Reverse order</span>
              <Toggle value={uniformReverse} onChange={setUniformReverse} title="Apply palette colours in reverse order for all blocks" />
            </div>

            <div className={styles.formRow}>
              <span className={styles.label}>Random reverse</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Toggle value={randomReverseEnabled} title="Randomly reverse palette colours on a percentage of blocks"
                  onChange={(on) => {
                    setRandomReverseEnabled(on);
                    if (on) actions.randomReverse();
                  }} />
                {randomReverseEnabled && (
                  <button
                    className={styles.modeBtn}
                    style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                    onClick={actions.randomReverse}
                    title="Re-randomise"
                  >↺</button>
                )}
              </div>
            </div>

            {randomReverseEnabled && (
              <div className={styles.formRow}>
                <span className={styles.label}>Share reversed</span>
                <div className={styles.sliderRow}>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={randomReversePct}
                    onChange={e => setRandomReversePct(+e.target.value)}
                    className={styles.slider}
                  />
                  <span className={styles.sliderVal}>{randomReversePct}%</span>
                </div>
              </div>
            )}
            <div className={styles.formRow}>
              <span className={styles.label}>Backgrounds<InfoTip text="Block backgrounds, edited in the Swatches panel" /></span>
              <span className={styles.paletteChooserSwatches} style={{ flex: 1 }}>
                {bgColors.filter(c => c.enabled !== false).map(c => <span key={c.id} className={styles.paletteChooserSwatch} style={{ background: c.hex }} />)}
              </span>
            </div>
          </>
        )}

        <div className={styles.formRow}>
          <span className={styles.label}>Temperature</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={-100} max={100} step={1}
              value={colorTempShift}
              onChange={e => setColorTempShift(+e.target.value)} />
            <span className={styles.sliderVal}>{colorTempShift}</span>
          </div>
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>Blend mode</span>
          <select
            className={styles.select}
            value={blendMode}
            onChange={e => setBlendMode(e.target.value)}
          >
            {BLEND_MODES.map(m => <option key={m} value={m}>{capitalise(m)}</option>)}
          </select>
        </div>

        {colorMode === 'image' && (
          <div style={{ marginTop: 8 }}>
            <ImagePicker src={imageSrc} onChange={setImageSrc} alt="Colour source" />
            {imageProgress !== null && (
              <div className={styles.imageProgressBar}>
                <div
                  className={styles.imageProgressFill}
                  style={{ width: `${imageProgress}%` }}
                />
              </div>
            )}
            <div className={styles.formRow} style={{ marginTop: 8 }}>
              <span className={styles.label}>Tolerance</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0} max={50} step={1}
                  value={imageColourTolerance} onChange={e => setImageColourTolerance(Number(e.target.value))} />
                <span className={styles.sliderVal}>{imageColourTolerance}</span>
              </div>
            </div>
          </div>
        )}

        {colorMode === 'gradient' && gradientSettings && (
          <div className={styles.gradientControls}>
            <div className={styles.formRow}>
              <span className={styles.label}>Style</span>
              <div className={styles.modeToggle}>
                {[
                  { key: 'linear', label: 'Linear' },
                  { key: 'radial', label: 'Radial' },
                ].map(({ key, label }) => (
                  <button key={key}
                    className={`${styles.modeBtn} ${gradientSettings.gradMode === key ? styles.modeBtnActive : ''}`}
                    onClick={() => setGradientSettings({ ...gradientSettings, gradMode: key })}
                  >{label}</button>
                ))}
              </div>
            </div>

            {gradientSettings.gradMode === 'linear' && (
              <>
                <div className={styles.gradDirGrid}>
                  {[
                    { angle: 0,   label: '→' },
                    { angle: 90,  label: '↓' },
                    { angle: 180, label: '←' },
                    { angle: 270, label: '↑' },
                    { angle: 45,  label: '↘' },
                    { angle: 135, label: '↙' },
                    { angle: 225, label: '↖' },
                    { angle: 315, label: '↗' },
                  ].map(({ angle, label }) => (
                    <button
                      key={angle}
                      className={`${styles.gradDirBtn} ${gradientSettings.angle === angle ? styles.gradDirBtnActive : ''}`}
                      onClick={() => setGradientSettings({ ...gradientSettings, angle })}
                    >{label}</button>
                  ))}
                </div>
                <div className={styles.formRow} style={{ marginTop: 6 }}>
                  <span className={styles.label}>Angle</span>
                  <div className={styles.sliderRow}>
                    <input
                      type="range" min={0} max={359} step={1}
                      value={gradientSettings.angle}
                      onChange={e => setGradientSettings({ ...gradientSettings, angle: +e.target.value })}
                      className={styles.slider}
                    />
                    <span className={styles.sliderVal}>{gradientSettings.angle}°</span>
                  </div>
                </div>
              </>
            )}

            {gradientSettings.gradMode === 'radial' && (
              <>
                <div className={styles.gradDirGrid}>
                  {[
                    { cx: 0,   cy: 0,   label: '↖' },
                    { cx: 0.5, cy: 0,   label: '↑' },
                    { cx: 1,   cy: 0,   label: '↗' },
                    { cx: 0,   cy: 0.5, label: '←' },
                    { cx: 0.5, cy: 0.5, label: '·' },
                    { cx: 1,   cy: 0.5, label: '→' },
                    { cx: 0,   cy: 1,   label: '↙' },
                    { cx: 0.5, cy: 1,   label: '↓' },
                    { cx: 1,   cy: 1,   label: '↘' },
                  ].map(({ cx, cy, label }) => (
                    <button
                      key={`${cx}-${cy}`}
                      className={`${styles.gradDirBtn} ${gradientSettings.centerX === cx && gradientSettings.centerY === cy ? styles.gradDirBtnActive : ''}`}
                      onClick={() => setGradientSettings({ ...gradientSettings, centerX: cx, centerY: cy })}
                    >{label}</button>
                  ))}
                </div>
                <div className={styles.formRow} style={{ marginTop: 6 }}>
                  <span className={styles.label}>Center X</span>
                  <div className={styles.sliderRow}>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={Math.round((gradientSettings.centerX ?? 0.5) * 100)}
                      onChange={e => setGradientSettings({ ...gradientSettings, centerX: +e.target.value / 100 })}
                      className={styles.slider}
                    />
                    <span className={styles.sliderVal}>{Math.round((gradientSettings.centerX ?? 0.5) * 100)}%</span>
                  </div>
                </div>
                <div className={styles.formRow}>
                  <span className={styles.label}>Center Y</span>
                  <div className={styles.sliderRow}>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={Math.round((gradientSettings.centerY ?? 0.5) * 100)}
                      onChange={e => setGradientSettings({ ...gradientSettings, centerY: +e.target.value / 100 })}
                      className={styles.slider}
                    />
                    <span className={styles.sliderVal}>{Math.round((gradientSettings.centerY ?? 0.5) * 100)}%</span>
                  </div>
                </div>
              </>
            )}

            {/* Scale — applies to both linear and radial */}
            <div className={styles.formRow} style={{ marginTop: 6 }}>
              <span className={styles.label}>Scale</span>
              <div className={styles.sliderRow}>
                <input
                  type="range" min={0.1} max={4} step={0.1}
                  value={gradientSettings.gradScale ?? 1}
                  onChange={e => setGradientSettings({ ...gradientSettings, gradScale: +e.target.value })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>×{(gradientSettings.gradScale ?? 1).toFixed(1)}</span>
              </div>
            </div>

            {/* Repeat */}
            <div className={styles.formRow} style={{ marginTop: 6 }}>
              <span className={styles.label}>Repeat</span>
              <div className={styles.sliderRow}>
                <input
                  type="range" min={1} max={8} step={1}
                  value={gradientSettings.repeat ?? 1}
                  onChange={e => setGradientSettings({ ...gradientSettings, repeat: +e.target.value })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>×{gradientSettings.repeat ?? 1}</span>
              </div>
            </div>

            {(gradientSettings.repeat ?? 1) > 1 && (
              <div className={styles.formRow} style={{ marginTop: 2 }}>
                <span className={styles.label}>Mode</span>
                <div className={styles.modeToggle}>
                  {[{ key: 'tile', label: 'Tile' }, { key: 'mirror', label: 'Mirror' }].map(({ key, label }) => (
                    <button key={key}
                      className={`${styles.modeBtn} ${(gradientSettings.repeatMode ?? 'tile') === key ? styles.modeBtnActive : ''}`}
                      onClick={() => setGradientSettings({ ...gradientSettings, repeatMode: key })}
                    >{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Jitter */}
            <div className={styles.formRow} style={{ marginTop: 6 }}>
              <span className={styles.label}>Jitter</span>
              <div className={styles.sliderRow}>
                <input
                  type="range" min={0} max={100} step={5}
                  value={Math.round((gradientSettings.jitter ?? 0) * 100)}
                  onChange={e => setGradientSettings({ ...gradientSettings, jitter: +e.target.value / 100 })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>{Math.round((gradientSettings.jitter ?? 0) * 100)}%</span>
              </div>
            </div>

            {/* Block background colours for gradient mode */}
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className={styles.gradBgLabel} style={{ marginBottom: 0 }}>Block backgrounds</span>
                <button
                  className={`${styles.modeBtn} ${gradientSettings.reverseBg ? styles.modeBtnActive : ''}`}
                  style={{ flex: 'none', padding: '3px 8px', fontSize: 10 }}
                  onClick={() => setGradientSettings({ ...gradientSettings, reverseBg: !gradientSettings.reverseBg })}
                  title="Use the mirror palette position as the background colour"
                >Reverse</button>
              </div>
              {!gradientSettings.reverseBg && <div className={styles.gradBgSwatches}>
                {(gradientSettings.gradBgColors ?? []).map(c => (
                  <div key={c.id} className={styles.gradBgSwatch}>
                    <button
                      className={`${styles.gradBgSwatchBtn} ${!c.enabled ? styles.gradBgSwatchOff : ''}`}
                      style={{ background: c.hex }}
                      onClick={() => setGradientSettings({
                        ...gradientSettings,
                        gradBgColors: gradientSettings.gradBgColors.map(x => x.id === c.id ? { ...x, enabled: !x.enabled } : x),
                      })}
                      title={`${c.hex} — click to ${c.enabled ? 'disable' : 'enable'}`}
                    />
                    <button
                      className={styles.gradBgRemove}
                      onClick={() => setGradientSettings({
                        ...gradientSettings,
                        gradBgColors: gradientSettings.gradBgColors.filter(x => x.id !== c.id),
                      })}
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>}
              {!gradientSettings.reverseBg && <div className={styles.addColourRow}>
                <button className={styles.addQuickBtn}
                  onClick={() => setGradientSettings({
                    ...gradientSettings,
                    gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: '#ffffff', enabled: true }],
                  })}
                  title="Add white">W</button>
                <button className={styles.addQuickBtn}
                  onClick={() => setGradientSettings({
                    ...gradientSettings,
                    gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: '#000000', enabled: true }],
                  })}
                  title="Add black">B</button>
                <input
                  type="text"
                  className={styles.hexInput}
                  value={rawGradBgHex}
                  onChange={e => setRawGradBgHex(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const h = normalizeHex(rawGradBgHex);
                      if (h) {
                        setGradientSettings({
                          ...gradientSettings,
                          gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: h, enabled: true }],
                        });
                        setRawGradBgHex('');
                      }
                    }
                  }}
                  placeholder="#hex"
                  maxLength={7}
                  spellCheck={false}
                />
                <button
                  className={styles.addHexBtn}
                  onClick={() => {
                    const h = normalizeHex(rawGradBgHex);
                    if (h) {
                      setGradientSettings({
                        ...gradientSettings,
                        gradBgColors: [...(gradientSettings.gradBgColors ?? []), { id: crypto.randomUUID(), hex: h, enabled: true }],
                      });
                      setRawGradBgHex('');
                    }
                  }}
                  disabled={!normalizeHex(rawGradBgHex)}
                  title="Add colour"
                >+</button>
              </div>}
            </div>
          </div>
        )}

        {colorMode === 'mesh' && meshDraft && (
          <div className={styles.gradientControls}>
            <div className={styles.formRow}>
              <span className={styles.label}>Power</span>
              <div className={styles.sliderRow}>
                <input
                  type="range" min={0.5} max={6} step={0.5}
                  value={meshDraft.weightPower ?? 2}
                  onChange={e => updateMesh({ ...meshDraft, weightPower: +e.target.value })}
                  className={styles.slider}
                />
                <span className={styles.sliderVal}>×{(meshDraft.weightPower ?? 2).toFixed(1)}</span>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <span className={styles.gradBgLabel}>Colour points</span>
              {(meshDraft.points ?? []).map(p => (
                <div key={p.id} className={styles.meshPointCard}>
                  <div className={styles.meshPointRow}>
                    <input
                      type="color"
                      value={p.hex}
                      onChange={e => updateMeshHex(p.id, e.target.value)}
                      className={styles.colorInput}
                    />
                    <div className={styles.meshPointSliders}>
                      <div className={styles.sliderRow}>
                        <span className={styles.sliderVal} style={{ minWidth: 12, textAlign: 'left' }}>X</span>
                        <input
                          type="range" min={0} max={100} step={1}
                          value={Math.round(p.x * 100)}
                          onChange={e => updateMesh({
                            ...meshDraft,
                            points: meshDraft.points.map(x => x.id === p.id ? { ...x, x: +e.target.value / 100 } : x),
                          })}
                          className={styles.slider}
                        />
                        <span className={styles.sliderVal}>{Math.round(p.x * 100)}%</span>
                      </div>
                      <div className={styles.sliderRow}>
                        <span className={styles.sliderVal} style={{ minWidth: 12, textAlign: 'left' }}>Y</span>
                        <input
                          type="range" min={0} max={100} step={1}
                          value={Math.round(p.y * 100)}
                          onChange={e => updateMesh({
                            ...meshDraft,
                            points: meshDraft.points.map(x => x.id === p.id ? { ...x, y: +e.target.value / 100 } : x),
                          })}
                          className={styles.slider}
                        />
                        <span className={styles.sliderVal}>{Math.round(p.y * 100)}%</span>
                      </div>
                    </div>
                  </div>
                  <button
                    className={styles.meshRemoveBtn}
                    onClick={() => updateMesh({
                      ...meshDraft,
                      points: meshDraft.points.filter(x => x.id !== p.id),
                    })}
                    disabled={(meshDraft.points?.length ?? 0) <= 2}
                    title="Remove point"
                  >Remove point</button>
                </div>
              ))}
              <div className={styles.addColourRow} style={{ marginTop: 6 }}>
                <button
                  className={styles.modeBtn}
                  style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                  onClick={() => openSwatches('colour', 'swatches')}
                  title="Pick a library in the Swatches tab and press Use to spread its colours across the mesh points"
                >From palette</button>
                <button
                  className={styles.modeBtn}
                  style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                  onClick={() => updateMesh({
                    ...meshDraft,
                    points: (meshDraft.points ?? []).map(p => ({ ...p, x: Math.random(), y: Math.random() })),
                  })}
                >Randomise points</button>
                <button
                  className={styles.modeBtn}
                  style={{ flex: 'none', padding: '3px 10px', fontSize: 12 }}
                  onClick={() => updateMesh({
                    ...meshDraft,
                    points: [...(meshDraft.points ?? []), {
                      id: crypto.randomUUID(),
                      x: 0.5, y: 0.5,
                      hex: hslToHex((meshDraft.points?.length ?? 0) * 137.5 % 360, 70, 60),
                    }],
                  })}
                  disabled={(meshDraft.points?.length ?? 0) >= 8}
                >+ Add point</button>
              </div>
            </div>
          </div>
        )}

      </>
      )}

      {shuffle && (
        <button className={styles.actionBtn} style={{ width: '100%', marginTop: 8 }} onClick={shuffle}
          disabled={!status.hasBlocks} title="Reassign palette colours without changing the design">
          Shuffle colours
        </button>
      )}
    </div>
  );
}
