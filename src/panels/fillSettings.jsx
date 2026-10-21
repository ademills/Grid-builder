// Settings controls for each Generate-panel fill. Carried over from the
// original sidebar; each takes the fill's settings object `s` and a merging
// setter `set(changes)`.
import { Stepper } from './controls';
import styles from './Panel.module.css';

export function GlitchSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Direction</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'h', label: 'H' },
            { key: 'v', label: 'V' },
            { key: 'both', label: 'Both' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.direction === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ direction: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>H Bars</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={60} step={1}
            value={s.hBars}
            onChange={e => set({ hBars: +e.target.value })} />
          <span className={styles.sliderVal}>{s.hBars}</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>V Bars</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={60} step={1}
            value={s.vBars}
            onChange={e => set({ vBars: +e.target.value })} />
          <span className={styles.sliderVal}>{s.vBars}</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Force</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={100} step={1}
            value={Math.round(s.force * 100)}
            onChange={e => set({ force: +e.target.value / 100 })} />
          <span className={styles.sliderVal}>{Math.round(s.force * 100)}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Active ratio</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={100} step={1}
            value={Math.round(s.activeRatio * 100)}
            onChange={e => set({ activeRatio: +e.target.value / 100 })} />
          <span className={styles.sliderVal}>{Math.round(s.activeRatio * 100)}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Bar variance</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={100} step={1}
            value={Math.round(s.barSizeVariance * 100)}
            onChange={e => set({ barSizeVariance: +e.target.value / 100 })} />
          <span className={styles.sliderVal}>{Math.round(s.barSizeVariance * 100)}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Min shift</span>
        <Stepper value={s.minDisplacement} onChange={v => set({ minDisplacement: v })} min={1} max={10} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Bidirectional</span>
        <button
          className={`${styles.modeBtn} ${s.bidirectional ? styles.modeBtnActive : ''}`}
          onClick={() => set({ bidirectional: !s.bidirectional })}
        >{s.bidirectional ? 'On' : 'Off'}</button>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Max scale</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={1} max={4} step={1}
            value={s.maxScale}
            onChange={e => set({ maxScale: +e.target.value })} />
          <span className={styles.sliderVal}>{s.maxScale}×</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Scale freq</span>
        <div className={styles.sliderRow}>
          <input type="range"
            className={`${styles.slider} ${s.maxScale === 1 ? styles.sliderDisabled : ''}`}
            min={0} max={100} step={5}
            value={s.scaleFreq}
            disabled={s.maxScale === 1}
            onChange={e => set({ scaleFreq: +e.target.value })} />
          <span className={styles.sliderVal}>{s.scaleFreq}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.sliderNumInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed and fill"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function StripSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Axis</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'h', label: 'Horizontal' },
            { key: 'v', label: 'Vertical' },
            { key: 'angle', label: 'Angle' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.axis === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ axis: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      {s.axis === 'angle' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Angle</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={180} step={1}
              value={s.angle}
              onChange={e => set({ angle: +e.target.value })} />
            <span className={styles.sliderVal}>{s.angle}°</span>
          </div>
        </div>
      )}
      
      <div className={styles.formRow}>
        <span className={styles.label}>Position</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={100} step={1}
            value={Math.round(s.position * 100)}
            onChange={e => set({ position: +e.target.value / 100 })} />
          <span className={styles.sliderVal}>{Math.round(s.position * 100)}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Width</span>
        <Stepper value={s.width} onChange={v => set({ width: v })} min={1} max={20} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Feather</span>
        <Stepper value={s.feather} onChange={v => set({ feather: v })} min={0} max={5} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.sliderNumInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function EdgeSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Edge Threshold</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.edgeThreshold}
            onChange={e => set({ edgeThreshold: +e.target.value })} />
          <span className={styles.sliderVal}>{s.edgeThreshold.toFixed(2)}</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Trace Width</span>
        <Stepper value={s.traceWidth} onChange={v => set({ traceWidth: v })} min={1} max={4} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Min Edge Length</span>
        <Stepper value={s.minEdgeLength} onChange={v => set({ minEdgeLength: v })} min={1} max={20} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Direction</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'all', label: 'All' },
            { key: 'h',   label: 'Horizontal' },
            { key: 'v',   label: 'Vertical' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.direction === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ direction: key })}
            >{label}</button>
          ))}
        </div>
      </div>
    </>
  );
}

export function MultiStripSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Axis</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'h', label: 'Horizontal' },
            { key: 'v', label: 'Vertical' },
            { key: 'angle', label: 'Angle' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.axis === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ axis: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      {s.axis === 'angle' && (
        <div className={styles.formRow}>
          <span className={styles.label}>Angle</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={180} step={1}
              value={s.angle}
              onChange={e => set({ angle: +e.target.value })} />
            <span className={styles.sliderVal}>{s.angle}°</span>
          </div>
        </div>
      )}
      
      <div className={styles.formRow}>
        <span className={styles.label}>Strip count</span>
        <Stepper value={s.numStrips} onChange={v => set({ numStrips: v })} min={2} max={12} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Strip width</span>
        <Stepper value={s.stripWidth} onChange={v => set({ stripWidth: v })} min={1} max={10} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Spacing</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'even', label: 'Even' },
            { key: 'manual', label: 'Manual' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${(s.spacing ?? 'even') === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ spacing: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      {s.spacing === 'manual' && (
        Array.from({ length: s.numStrips }, (_, i) => {
          const positions = s.positions ?? [];
          const value = positions[i] ?? (i + 1) / (s.numStrips + 1);
          return (
            <div className={styles.formRow} key={i}>
              <span className={styles.label}>Strip {i + 1}</span>
              <div className={styles.sliderRow}>
                <input type="range" className={styles.slider} min={0} max={100} step={1}
                  value={Math.round(value * 100)}
                  onChange={e => {
                    const next = [...positions];
                    next[i] = +e.target.value / 100;
                    set({ positions: next });
                  }} />
                <span className={styles.sliderVal}>{Math.round(value * 100)}%</span>
              </div>
            </div>
          );
        })
      )}
      
      <div className={styles.formRow}>
        <span className={styles.label}>Stagger</span>
        <button
          className={`${styles.modeBtn} ${s.stagger ? styles.modeBtnActive : ''}`}
          onClick={() => set({ stagger: !s.stagger })}
        >{s.stagger ? 'On' : 'Off'}</button>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Feather</span>
        <Stepper value={s.feather} onChange={v => set({ feather: v })} min={0} max={5} format={v => `${v} cells`} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.sliderNumInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function BrightnessSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Target zone</span>
        <div className={styles.modeToggle}>
          {[
            { key: 'darks', label: 'Darks' },
            { key: 'midtones', label: 'Mid' },
            { key: 'lights', label: 'Lights' },
            { key: 'custom', label: 'Custom' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.targetZone === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ targetZone: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      {(s.targetZone === 'custom') && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Low point</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.lowPoint}
            onChange={e => set({ lowPoint: +e.target.value })} />
          <span className={styles.sliderVal}>{s.lowPoint.toFixed(2)}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>High point</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.highPoint}
            onChange={e => set({ highPoint: +e.target.value })} />
          <span className={styles.sliderVal}>{s.highPoint.toFixed(2)}</span>
        </div>
      </div>
      </>)}
      
      {(s.targetZone === 'midtones') && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Low point</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.lowPoint}
            onChange={e => set({ lowPoint: +e.target.value })} />
          <span className={styles.sliderVal}>{s.lowPoint.toFixed(2)}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>High point</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.highPoint}
            onChange={e => set({ highPoint: +e.target.value })} />
          <span className={styles.sliderVal}>{s.highPoint.toFixed(2)}</span>
        </div>
      </div>
      </>)}
      
      {(s.targetZone === 'darks' || s.targetZone === 'lights') && (
      <div className={styles.formRow}>
        <span className={styles.label}>Boundary</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.targetZone === 'darks' ? s.lowPoint : s.highPoint}
            onChange={e => set(
              s.targetZone === 'darks' ? { lowPoint: +e.target.value } : { highPoint: +e.target.value }
            )} />
          <span className={styles.sliderVal}>
            {(s.targetZone === 'darks' ? s.lowPoint : s.highPoint).toFixed(2)}
          </span>
        </div>
      </div>
      )}
      
      <div className={styles.formRow}>
        <span className={styles.label}>Soft edge</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={0.3} step={0.01}
            value={s.softEdge}
            onChange={e => set({ softEdge: +e.target.value })} />
          <span className={styles.sliderVal}>{s.softEdge.toFixed(2)}</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Invert</span>
        <button
          className={`${styles.modeBtn} ${s.invert ? styles.modeBtnActive : ''}`}
          onClick={() => set({ invert: !s.invert })}
        >{s.invert ? 'On' : 'Off'}</button>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.sliderNumInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function NoiseSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Scale</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.05} max={2} step={0.01}
            value={s.scale}
            onChange={e => set({ scale: +e.target.value })} />
          <span className={styles.sliderVal}>{s.scale.toFixed(2)}</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Threshold</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.threshold}
            onChange={e => set({ threshold: +e.target.value })} />
          <span className={styles.sliderVal}>{Math.round(s.threshold * 100)}%</span>
        </div>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Octaves</span>
        <Stepper value={s.octaves} onChange={v => set({ octaves: v })} min={1} max={4} />
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Invert</span>
        <button
          className={`${styles.modeBtn} ${s.invert ? styles.modeBtnActive : ''}`}
          onClick={() => set({ invert: !s.invert })}
        >{s.invert ? 'On' : 'Off'}</button>
      </div>
      
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div className={styles.sliderRow}>
          <input type="number" className={styles.sliderNumInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function GeometricSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow} style={{ marginTop: 8 }}>
        <span className={styles.label}>Pattern</span>
        <div className={styles.modeGrid2col}>
          {[
            { key: 'stripes', label: 'Stripes' },
            { key: 'rings', label: 'Rings' },
            { key: 'checkerboard', label: 'Checkerboard' },
            { key: 'sunburst', label: 'Sunburst' },
            { key: 'dots', label: 'Dot Grid' },
            { key: 'hex', label: 'Hex Grid' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.patternType === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ patternType: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      
      {s.patternType === 'stripes' && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Angle</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={180} step={1}
            value={s.angle}
            onChange={e => set({ angle: +e.target.value })} />
          <span className={styles.sliderVal}>{s.angle}°</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Stripe width</span>
        <Stepper value={s.stripeWidth} onChange={v => set({ stripeWidth: v })} min={1} max={20} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Gap width</span>
        <Stepper value={s.gapWidth} onChange={v => set({ gapWidth: v })} min={0} max={20} format={v => `${v} cells`} />
      </div>
      </>)}
      
      {s.patternType === 'rings' && (<>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre X</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerX}
              onChange={e => set({ centerX: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerX.toFixed(2)}</span>
          </div>
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre Y</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerY}
              onChange={e => set({ centerY: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerY.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Ring width</span>
        <Stepper value={s.ringWidth} onChange={v => set({ ringWidth: v })} min={1} max={20} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Gap</span>
        <Stepper value={s.gap} onChange={v => set({ gap: v })} min={0} max={20} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Inner radius</span>
        <Stepper value={s.innerRadius} onChange={v => set({ innerRadius: v })} min={0} max={40} format={v => `${v} cells`} />
      </div>
      </>)}
      
      {s.patternType === 'checkerboard' && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Tile size</span>
        <Stepper value={s.tileSize} onChange={v => set({ tileSize: v })} min={1} max={20} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Offset X</span>
          <Stepper value={s.offsetX} onChange={v => set({ offsetX: v })} min={0} max={20} />
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Offset Y</span>
          <Stepper value={s.offsetY} onChange={v => set({ offsetY: v })} min={0} max={20} />
        </div>
      </div>
      </>)}
      
      {s.patternType === 'sunburst' && (<>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre X</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerX}
              onChange={e => set({ centerX: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerX.toFixed(2)}</span>
          </div>
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre Y</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerY}
              onChange={e => set({ centerY: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerY.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Spokes</span>
        <Stepper value={s.numSpokes} onChange={v => set({ numSpokes: v })} min={2} max={48} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Spoke width</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={1} max={45} step={1}
            value={s.spokeWidth}
            onChange={e => set({ spokeWidth: +e.target.value })} />
          <span className={styles.sliderVal}>{s.spokeWidth}°</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Inner radius</span>
        <Stepper value={s.innerRadius} onChange={v => set({ innerRadius: v })} min={0} max={40} format={v => `${v} cells`} />
      </div>
      </>)}
      
      {s.patternType === 'dots' && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Dot radius</span>
        <Stepper value={s.dotRadius} onChange={v => set({ dotRadius: v })} min={0.5} max={5} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Spacing X</span>
          <Stepper value={s.spacingX} onChange={v => set({ spacingX: v })} min={1} max={20} />
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Spacing Y</span>
          <Stepper value={s.spacingY} onChange={v => set({ spacingY: v })} min={1} max={20} />
        </div>
      </div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Offset X</span>
          <Stepper value={s.offsetX} onChange={v => set({ offsetX: v })} min={0} max={20} />
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Offset Y</span>
          <Stepper value={s.offsetY} onChange={v => set({ offsetY: v })} min={0} max={20} />
        </div>
      </div>
      </>)}
      
      {s.patternType === 'hex' && (<>
      <div className={styles.formRow}>
        <span className={styles.label}>Cell radius</span>
        <Stepper value={s.cellRadius} onChange={v => set({ cellRadius: v })} min={1} max={10} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Row offset</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={1} step={0.01}
            value={s.rowOffset}
            onChange={e => set({ rowOffset: +e.target.value })} />
          <span className={styles.sliderVal}>{s.rowOffset.toFixed(2)}</span>
        </div>
      </div>
      </>)}
      
      <div className={styles.formRow}>
        <span className={styles.label}>Phase</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={20} step={0.5}
            value={s.phase}
            onChange={e => set({ phase: +e.target.value })} />
          <span className={styles.sliderVal}>{s.phase}</span>
        </div>
      </div>
    </>
  );
}

export function HalftoneSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow}>
        <span className={styles.label}>Dot spacing</span>
        <Stepper value={s.dotSpacing} onChange={v => set({ dotSpacing: v })} min={2} max={20} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Max radius</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.5} max={10} step={0.5}
            value={s.maxRadius}
            onChange={e => set({ maxRadius: +e.target.value })} />
          <span className={styles.sliderVal}>{s.maxRadius}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Angle</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={180} step={1}
            value={s.angle}
            onChange={e => set({ angle: +e.target.value })} />
          <span className={styles.sliderVal}>{s.angle}°</span>
        </div>
      </div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre X</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerX}
              onChange={e => set({ centerX: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerX.toFixed(2)}</span>
          </div>
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre Y</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerY}
              onChange={e => set({ centerY: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerY.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Invert</span>
        <button
          className={`${styles.modeBtn} ${s.invert ? styles.modeBtnActive : ''}`}
          onClick={() => set({ invert: !s.invert })}
        >{s.invert ? 'On' : 'Off'}</button>
      </div>
    </>
  );
}

export function VoronoiSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow}>
        <span className={styles.label}>Points</span>
        <Stepper value={s.numPoints} onChange={v => set({ numPoints: v })} min={2} max={100} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Mode</span>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${!s.borderOnly ? styles.modeBtnActive : ''}`}
            onClick={() => set({ borderOnly: false })}
          >Regions</button>
          <button
            className={`${styles.modeBtn} ${s.borderOnly ? styles.modeBtnActive : ''}`}
            onClick={() => set({ borderOnly: true })}
          >Borders</button>
        </div>
      </div>
      {!s.borderOnly && (
        <div className={styles.formRow}>
          <span className={styles.label}>Fill ratio</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0.1} max={1} step={0.05}
              value={s.fillRatio}
              onChange={e => set({ fillRatio: +e.target.value })} />
            <span className={styles.sliderVal}>{Math.round(s.fillRatio * 100)}%</span>
          </div>
        </div>
      )}
      {s.borderOnly && (
        <div className={styles.formRow}>
          <span className={styles.label}>Border width</span>
          <Stepper value={s.borderWidth} onChange={v => set({ borderWidth: v })} min={1} max={5} format={v => `${v} cells`} />
        </div>
      )}
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" className={styles.numberInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function SpiralSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow}>
        <span className={styles.label}>Arms</span>
        <Stepper value={s.arms} onChange={v => set({ arms: v })} min={1} max={12} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Width</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.5} max={10} step={0.5}
            value={s.width}
            onChange={e => set({ width: +e.target.value })} />
          <span className={styles.sliderVal}>{s.width}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Tightness</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.02} max={1} step={0.01}
            value={s.tightness}
            onChange={e => set({ tightness: +e.target.value })} />
          <span className={styles.sliderVal}>{s.tightness.toFixed(2)}</span>
        </div>
      </div>
      <div className={styles.formRowPair}>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre X</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerX}
              onChange={e => set({ centerX: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerX.toFixed(2)}</span>
          </div>
        </div>
        <div className={styles.stackedField}>
          <span className={styles.label}>Centre Y</span>
          <div className={styles.sliderRow}>
            <input type="range" className={styles.slider} min={0} max={1} step={0.01}
              value={s.centerY}
              onChange={e => set({ centerY: +e.target.value })} />
            <span className={styles.sliderVal}>{s.centerY.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Direction</span>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${s.direction === 1 ? styles.modeBtnActive : ''}`}
            onClick={() => set({ direction: 1 })}
          >CW</button>
          <button
            className={`${styles.modeBtn} ${s.direction === -1 ? styles.modeBtnActive : ''}`}
            onClick={() => set({ direction: -1 })}
          >CCW</button>
        </div>
      </div>
    </>
  );
}

export function FlowFieldSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow}>
        <span className={styles.label}>Scale</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0.01} max={0.5} step={0.01}
            value={s.scale}
            onChange={e => set({ scale: +e.target.value })} />
          <span className={styles.sliderVal}>{s.scale.toFixed(2)}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Lines</span>
        <Stepper value={s.numLines} onChange={v => set({ numLines: v })} min={1} max={200} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Line length</span>
        <Stepper value={s.lineLength} onChange={v => set({ lineLength: v })} min={5} max={200} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Line width</span>
        <Stepper value={s.lineWidth} onChange={v => set({ lineWidth: v })} min={1} max={5} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" className={styles.numberInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function FractalSettings({ s, set }) {
  return (
    <>
      <div className={styles.formRow}>
        <span className={styles.label}>Pattern</span>
        <div className={styles.modeGrid2col}>
          {[
            { key: 'sierpinski', label: 'Sierpinski' },
            { key: 'cantorDust', label: 'Cantor Dust' },
            { key: 'vicsek', label: 'Vicsek' },
          ].map(({ key, label }) => (
            <button key={key}
              className={`${styles.modeBtn} ${s.patternType === key ? styles.modeBtnActive : ''}`}
              onClick={() => set({ patternType: key })}
            >{label}</button>
          ))}
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Depth</span>
        <Stepper value={s.depth} onChange={v => set({ depth: v })} min={1} max={6} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Invert</span>
        <button
          className={`${styles.modeBtn} ${s.invert ? styles.modeBtnActive : ''}`}
          onClick={() => set({ invert: !s.invert })}
        >{s.invert ? 'On' : 'Off'}</button>
      </div>
    </>
  );
}

export function MondrianSettings({ s, set }) {
  return (
    <>
      <div className={styles.gridNote}>Recursive rectangle subdivision — creates De Stijl / poster layouts.</div>
      <div className={styles.formRow}>
        <span className={styles.label}>Min region</span>
        <Stepper value={s.minSize} onChange={v => set({ minSize: v })} min={1} max={10} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Split variance</span>
        <div className={styles.sliderRow}>
          <input type="range" className={styles.slider} min={0} max={0.5} step={0.05}
            value={s.splitVariance}
            onChange={e => set({ splitVariance: +e.target.value })} />
          <span className={styles.sliderVal}>{s.splitVariance.toFixed(2)}</span>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" className={styles.numberInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}

export function GoldenSettings({ s, set }) {
  return (
    <>
      <div className={styles.gridNote}>Phi-ratio recursive subdivision — creates harmonious, balanced layouts.</div>
      <div className={styles.formRow}>
        <span className={styles.label}>Min region</span>
        <Stepper value={s.minSize} onChange={v => set({ minSize: v })} min={1} max={10} format={v => `${v} cells`} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Max depth</span>
        <Stepper value={s.maxDepth} onChange={v => set({ maxDepth: v })} min={1} max={12} />
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Alternate axes</span>
        <button
          className={`${styles.modeBtn} ${s.alternate ? styles.modeBtnActive : ''}`}
          onClick={() => set({ alternate: !s.alternate })}
        >{s.alternate ? 'On' : 'Off'}</button>
      </div>
      <div className={styles.formRow}>
        <span className={styles.label}>Seed</span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input type="number" className={styles.numberInput} style={{ flex: 1 }}
            value={s.seed}
            onChange={e => set({ seed: +e.target.value || 0 })} />
          <button className={styles.actionBtn} title="Randomise seed"
            onClick={() => set({ seed: Math.floor(Math.random() * 0x80000000) })}
          >⟳</button>
        </div>
      </div>
    </>
  );
}
