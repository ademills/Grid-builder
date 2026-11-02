import { useMemo } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { useShapeStore } from '../store/shapeStore';

// Every shape a document can use: the built-in library plus the user's
// imported shapes (store/shapeStore.js). Look shapes up here rather than in
// ALL_BUILTIN_ASSETS so imported ones work everywhere.

const builtinById = new Map(ALL_BUILTIN_ASSETS.map(a => [a.id, a]));

// A user shape as an asset: same fields as a built-in one.
const asAsset = s => ({ ...s, size: `${s.cols}x${s.rows}`, theme: 'My shapes', builtin: false });

let cachedShapes = null;
let cachedAssets = [];
function userAssets() {
  const shapes = useShapeStore.getState().shapes;
  if (shapes !== cachedShapes) {
    cachedShapes = shapes;
    cachedAssets = shapes.map(asAsset);
  }
  return cachedAssets;
}

export function assetById(id) {
  return builtinById.get(id) ?? userAssets().find(a => a.id === id) ?? null;
}

export const allAssets = () => [...ALL_BUILTIN_ASSETS, ...userAssets()];

// The same list, re-rendering when user shapes change.
export function useAllAssets() {
  const shapes = useShapeStore(s => s.shapes);
  return useMemo(() => [...ALL_BUILTIN_ASSETS, ...shapes.map(asAsset)], [shapes]);
}

// Tags for a shape (built-in tags live in the store too).
export function assetTags(asset, builtinTags = useShapeStore.getState().builtinTags) {
  return asset.builtin ? (builtinTags[asset.id] ?? []) : (asset.tags ?? []);
}
