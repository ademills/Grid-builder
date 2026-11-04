import { createDefaultDocState } from './docDefaults';
import { assetById } from '../utils/assetRegistry';
import { useShapeStore, isUserShape } from './shapeStore';
import { mergeEffects } from '../effects/effectDefs';
import { meanderCornerSettings } from '../utils/knotworkCompose';
import { mergeLineworkSettings } from '../modes/linework/settings';

// Project file format.
//
// v5 (current) — { version: 5, app, mode, name, state: {...docState} }.
//   `state` holds every field from createDefaultDocState(); placedBlocks are
//   stored without svgContent and re-hydrated from the shape library. The
//   user's own shapes that the document uses travel with it in
//   `state.userShapes` (id → { name, cols, rows, svgContent, tags }).
// v1–v4 (legacy) — flat object with a subset of the fields at the top level
//   and no mode. Loaded by merging over defaults and inferring the mode.

export const PROJECT_VERSION = 5;
export const PROJECT_EXTENSION = 'mps.json';

// Settings objects are merged over defaults so files saved before a field
// existed still get a sensible value for it.
const MERGED_FIELDS = new Set([
  'gradientSettings', 'meshSettings', 'glitchSettings', 'stripSettings', 'multiStripSettings',
  'edgeSettings', 'brightnessSettings', 'noiseSettings', 'geometricSettings', 'halftoneSettings',
  'voronoiSettings', 'spiralSettings', 'flowFieldSettings', 'fractalSettings', 'mondrianSettings',
  'goldenSettings', 'knotworkSettings', 'backdropSettings',
  'paletteExtractSettings', 'fillOpacity', 'guides', 'groupNames', 'organicSettings', 'silhouetteSettings',
  'shapeStroke', 'regionSettings',
]);

function hydrateBlocks(blocks, fileShapes = {}) {
  return (blocks ?? []).map(b => {
    if (b.svgContent || !b.assetId) return b;
    const asset = assetById(b.assetId) ?? fileShapes[b.assetId];
    return { ...b, svgContent: asset?.svgContent ?? '' };
  });
}

// The user shapes a document uses, to save with it.
function usedUserShapes(state) {
  const ids = new Set([...state.enabledAssetIds, ...state.placedBlocks.map(b => b.assetId)].filter(isUserShape));
  const out = {};
  for (const id of ids) {
    const s = assetById(id);
    if (s) out[id] = { name: s.name, cols: s.cols, rows: s.rows, svgContent: s.svgContent, tags: s.tags ?? [] };
  }
  return out;
}

export function serializeProject(doc) {
  const state = { ...doc.state };
  delete state.viewTransform;
  return JSON.stringify({
    version: PROJECT_VERSION,
    app: 'mills-pattern-studio',
    mode: doc.mode,
    name: doc.name,
    state: {
      ...state,
      enabledAssetIds: [...state.enabledAssetIds],
      userShapes: usedUserShapes(state),
      // Shape blocks are re-hydrated from the asset library on load.
      placedBlocks: state.placedBlocks.map(b => {
        if (!b.assetId) return b;
        const rest = { ...b };
        delete rest.svgContent;
        return rest;
      }),
    },
  });
}

// Legacy files have no mode — a Meander design is always a single generated
// image block covering the whole grid, which a grid layout never is.
function inferLegacyMode(raw) {
  const blocks = raw.placedBlocks ?? [];
  if (blocks.length === 1 && blocks[0].type === 'image' && blocks[0].imageSrc?.startsWith('data:image/svg+xml')) {
    return 'knotwork';
  }
  return 'gridBuilder';
}

// Returns { mode, name, state } or throws with a readable message.
export function parseProject(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('This file is not a valid project (could not read JSON).'); }

  const version = raw?.version;
  let mode, name, fields;
  if (version === PROJECT_VERSION) {
    mode = raw.mode;
    name = raw.name;
    fields = raw.state ?? {};
  } else if ([1, 2, 3, 4].includes(version)) {
    mode = inferLegacyMode(raw);
    fields = raw;
  } else {
    throw new Error(`Unsupported project version: ${version ?? 'unknown'}.`);
  }
  if (!['gridBuilder', 'knotwork', 'linework'].includes(mode)) mode = 'gridBuilder';

  const state = createDefaultDocState(mode);
  // Meander documents before v1.4.1 had one shared roundness; turn it into
  // the corner radii that reproduce it before defaults would replace it.
  const knot = fields.knotworkSettings;
  if (knot && knot.capRoundness == null && knot.roundness != null) {
    fields = { ...fields, knotworkSettings: { ...knot, ...meanderCornerSettings(knot) } };
  }
  for (const key of Object.keys(state)) {
    if (fields[key] === undefined) continue;
    state[key] = MERGED_FIELDS.has(key) ? { ...state[key], ...fields[key] } : fields[key];
  }
  state.lineworkSettings = mergeLineworkSettings(fields.lineworkSettings);
  state.enabledAssetIds = new Set(fields.enabledAssetIds ?? [...state.enabledAssetIds]);
  // Shapes the file brought join this machine's library.
  if (fields.userShapes) useShapeStore.getState().adoptShapes(fields.userShapes);
  state.placedBlocks = hydrateBlocks(state.placedBlocks, fields.userShapes);
  state.effects = mergeEffects(fields.effects);
  state.viewTransform = null;
  return { mode, name, state };
}

export function fileNameFromPath(path) {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.mps\.json$/i, '').replace(/\.json$/i, '');
}
