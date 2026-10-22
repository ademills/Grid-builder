// Raster effects (7.9): a post-processing pass over the rendered artwork,
// shown live on the canvas and applied to PNG / JPEG exports. Sizes are in
// artboard pixels, so the look doesn't change with zoom or export scale.
// Effects run in this fixed order (effects/effectsRenderer.js).

export const EFFECTS = [
  { id: 'posterise', label: 'Posterise', params: [
    { key: 'levels', label: 'Levels', min: 2, max: 12, step: 1 },
  ] },
  { id: 'halftone', label: 'Halftone', params: [
    { key: 'size', label: 'Dot spacing', min: 3, max: 60, step: 1, unit: 'px' },
    { key: 'angle', label: 'Angle', min: 0, max: 90, step: 1, unit: '°' },
    { key: 'mono', label: 'Black ink', type: 'toggle' },
  ] },
  { id: 'photocopy', label: 'Photocopy', params: [
    { key: 'contrast', label: 'Contrast', min: 0, max: 1, step: 0.01, pct: true },
    { key: 'toner', label: 'Toner noise', min: 0, max: 1, step: 0.01, pct: true },
  ] },
  { id: 'riso', label: 'Riso misregistration', params: [
    { key: 'offset', label: 'Offset', min: 0, max: 30, step: 0.5, unit: 'px' },
    { key: 'angle', label: 'Direction', min: 0, max: 360, step: 1, unit: '°' },
    { key: 'texture', label: 'Ink texture', min: 0, max: 1, step: 0.01, pct: true },
  ] },
  { id: 'chroma', label: 'Chromatic aberration', params: [
    { key: 'amount', label: 'Amount', min: 0, max: 40, step: 0.5, unit: 'px' },
  ] },
  { id: 'glow', label: 'Neon glow', params: [
    { key: 'radius', label: 'Radius', min: 2, max: 60, step: 1, unit: 'px' },
    { key: 'strength', label: 'Strength', min: 0, max: 2, step: 0.01, pct: true },
    { key: 'threshold', label: 'Threshold', min: 0, max: 0.95, step: 0.01, pct: true },
  ] },
  { id: 'scanlines', label: 'CRT scanlines', params: [
    { key: 'spacing', label: 'Line spacing', min: 2, max: 24, step: 0.5, unit: 'px' },
    { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01, pct: true },
  ] },
  { id: 'grain', label: 'Grain', params: [
    { key: 'amount', label: 'Amount', min: 0, max: 0.6, step: 0.01, pct: true },
    { key: 'size', label: 'Size', min: 0.5, max: 8, step: 0.1, unit: 'px' },
  ] },
];

export function createDefaultEffects() {
  return {
    preview: true,
    seed: 1,
    posterise: { on: false, levels: 5 },
    halftone: { on: false, size: 10, angle: 45, mono: false },
    photocopy: { on: false, contrast: 0.6, toner: 0.35 },
    riso: { on: false, offset: 4, angle: 30, texture: 0.4 },
    chroma: { on: false, amount: 6 },
    glow: { on: false, radius: 16, strength: 0.9, threshold: 0.45 },
    scanlines: { on: false, spacing: 4, intensity: 0.35 },
    grain: { on: false, amount: 0.15, size: 1.2 },
  };
}

// Fills in effects / params missing from older files.
export function mergeEffects(saved) {
  const base = createDefaultEffects();
  if (!saved) return base;
  const out = { ...base, ...saved };
  for (const e of EFFECTS) out[e.id] = { ...base[e.id], ...(saved[e.id] ?? {}) };
  return out;
}

export const effectsActive = (fx) => !!fx && EFFECTS.some(e => fx[e.id]?.on);

// How far (artboard px) any effect samples away from a pixel — the overlap
// tiles need when an export is processed in pieces.
export function effectsReach(fx) {
  let r = 2;
  if (fx.glow?.on) r += fx.glow.radius;
  if (fx.riso?.on) r += fx.riso.offset * 1.2;
  if (fx.chroma?.on) r += fx.chroma.amount * 1.5;
  if (fx.halftone?.on) r += fx.halftone.size;
  return r;
}
