import { createDefaultDocState } from './docDefaults';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { mergeEffects } from '../effects/effectDefs';

// Project file format.
//
// v5 (current) — { version: 5, app, mode, name, state: {...docState} }.
//   `state` holds every field from createDefaultDocState(); placedBlocks are
//   stored without svgContent and re-hydrated from the built-in asset map.
// v1–v4 (legacy) — flat object with a subset of the fields at the top level
//   and no mode. Loaded by merging over defaults and inferring the mode.

export const PROJECT_VERSION = 5;
export const PROJECT_EXTENSION = 'mps.json';

const assetMap = new Map(ALL_BUILTIN_ASSETS.map(a => [a.id, a]));

// Settings objects are merged over defaults so files saved before a field
// existed still get a sensible value for it.
const MERGED_FIELDS = new Set([
  'gradientSettings', 'meshSettings', 'glitchSettings', 'stripSettings', 'multiStripSettings',
  'edgeSettings', 'brightnessSettings', 'noiseSettings', 'geometricSettings', 'halftoneSettings',
  'voronoiSettings', 'spiralSettings', 'flowFieldSettings', 'fractalSettings', 'mondrianSettings',
  'goldenSettings', 'knotworkSettings', 'backdropSettings', 'animSettings', 'audioSettings',
  'paletteExtractSettings', 'fillOpacity', 'guides', 'groupNames', 'organicSettings', 'silhouetteSettings',
]);

function hydrateBlocks(blocks) {
  return (blocks ?? []).map(b => {
    if (b.svgContent || !b.assetId) return b;
    const asset = assetMap.get(b.assetId);
    return { ...b, svgContent: asset?.svgContent ?? '' };
  });
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
      // Shape blocks are re-hydrated from the asset library on load.
      placedBlocks: state.placedBlocks.map(b => {
        if (!b.assetId) return b;
        const rest = { ...b };
        delete rest.svgContent;
        return rest;
      }),
      // Audio never auto-starts when a file is opened.
      audioSettings: { ...state.audioSettings, enabled: false },
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
  if (!['gridBuilder', 'knotwork'].includes(mode)) mode = 'gridBuilder';

  const state = createDefaultDocState(mode);
  for (const key of Object.keys(state)) {
    if (fields[key] === undefined) continue;
    state[key] = MERGED_FIELDS.has(key) ? { ...state[key], ...fields[key] } : fields[key];
  }
  state.enabledAssetIds = new Set(fields.enabledAssetIds ?? [...state.enabledAssetIds]);
  state.placedBlocks = hydrateBlocks(state.placedBlocks);
  state.effects = mergeEffects(fields.effects);
  state.audioSettings = { ...state.audioSettings, enabled: false };
  state.viewTransform = null;
  return { mode, name, state };
}

export function fileNameFromPath(path) {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.mps\.json$/i, '').replace(/\.json$/i, '');
}
