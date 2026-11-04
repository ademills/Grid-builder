// Settings undo (2.1): which document fields count as settings, what a step
// is called, and how a settings step folds into the undo stack. useHistory
// wires these to the document store; they're kept pure so they can be tested.

// How long after the last change (with the pointer up) a settings step commits.
export const SETTINGS_IDLE_MS = 250;

// Fields that are content or view, not settings. placedBlocks has its own
// history; the rest are view state or a choice of which panel to show.
const NOT_SETTINGS = new Set(['placedBlocks', 'viewTransform', 'showTilePreview', 'activeFill']);

export const isUndoableField = key => !NOT_SETTINGS.has(key);

const FIELD_LABELS = {
  presetKey: 'Artboard Size', customSize: 'Artboard Size', gridSettings: 'Grid',
  maxScale: 'Max Scale', scaleFreq: 'Scale Frequency', autoFill: 'Auto Fill',
  fillOpacity: 'Fill Opacity', guides: 'Guides', canvasBg: 'Paper Colour',
  colorMode: 'Colour Mode', paletteKey: 'Palette', shapeColors: 'Palette',
  bgColors: 'Background Colours', uniformReverse: 'Reverse', randomReverseEnabled: 'Random Reverse',
  randomReversePct: 'Random Reverse', colorTempShift: 'Temperature', blendMode: 'Blend Mode',
  gradientSettings: 'Gradient', meshSettings: 'Mesh', imageSrc: 'Image', imageColourTolerance: 'Image Tolerance',
  paletteExtractSettings: 'Palette Extractor', knotworkSettings: 'Meander Settings',
  lineworkSettings: 'Linework Settings', enabledAssetIds: 'Shapes', groupNames: 'Group Names',
  backdropSrc: 'Backdrop', backdropSettings: 'Backdrop', effects: 'Effects',
  activeLayoutId: 'Layout',
};

// "glitchSettings" → "Glitch Settings"
const titleCase = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

export function settingsLabel(keys) {
  const names = [...new Set(keys.filter(k => k !== 'groupNames').map(k => FIELD_LABELS[k] ?? titleCase(k)))];
  return names.length === 1 ? names[0] : 'Settings';
}

// Folds a settings step into the stacks. `step` = { fields, blocks, since,
// label }: the fields' values and the blocks before the step, and when the
// gesture began. Block steps pushed since then (a design regenerated while a
// slider moved) merge into one entry: the oldest blocks and the oldest value
// of each field win, and the first block step's name is kept.
export function foldSettingsStep(stacks, step, limit = 100) {
  const merged = stacks.undo.filter(e => (e.born ?? e.at) >= step.since);
  const kept = stacks.undo.slice(0, stacks.undo.length - merged.length);
  const first = merged[0];
  const fields = { ...step.fields };
  for (const e of [...merged].reverse()) Object.assign(fields, e.fields ?? {});
  const now = Date.now();
  const entry = {
    blocks: first ? first.blocks : step.blocks,
    fields,
    label: first ? first.label : step.label,
    at: now, born: first?.born ?? now,
    coalesce: false,
  };
  if (kept.length + 1 > limit) stacks.truncated = true;
  stacks.undo = [...kept, entry].slice(-limit);
  stacks.redo = [];
  return entry;
}

// Recent user input. Settings changes are only recorded close to an input
// event, so the editor's own bookkeeping (snapping columns, loading an
// image) never becomes an undo step.
const input = { at: 0, downAt: 0, pointerDown: false };
const listeners = new Set();

if (typeof window !== 'undefined') {
  const mark = down => () => {
    input.at = Date.now();
    if (down) input.downAt = input.at;
    if (down !== undefined) input.pointerDown = down;
    for (const fn of listeners) fn();
  };
  for (const type of ['keydown', 'input', 'change', 'wheel']) window.addEventListener(type, mark(), true);
  window.addEventListener('pointerdown', mark(true), true);
  window.addEventListener('pointerup', mark(false), true);
  window.addEventListener('pointercancel', mark(false), true);
  window.addEventListener('blur', () => { input.pointerDown = false; });
}

export function userActiveSince(t) {
  // `at` is when the gesture began: the press, during a drag.
  return { active: input.pointerDown || input.at >= t, at: input.pointerDown ? input.downAt : input.at, pointerDown: input.pointerDown };
}

export function onUserInput(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// For tests.
export function _setInput(next) { Object.assign(input, next); }
