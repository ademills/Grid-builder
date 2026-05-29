/**
 * Loads all SVGs from src/assets/svgs/**\/GRIDSIZE/name.svg at build time.
 *
 * Folder convention:
 *   src/assets/svgs/
 *     Default/          ← enabled at startup; all other themes off by default
 *       1x1/
 *         circle.svg
 *       Basketball/
 *         Spurs/        ← nested folders render as expandable sub-folders
 *           1x1/
 *             ...
 *
 * The last folder before each SVG file must be a grid size (e.g. 1x1, 2x1).
 * Any number of parent folders are allowed and rendered as a nested tree.
 * Add a new theme by creating a folder — the app picks it up automatically.
 */

const svgModules = import.meta.glob(
  './assets/svgs/**/*.svg',
  { eager: true, query: '?raw', import: 'default' }
);

// ── Build the asset tree ─────────────────────────────────────────────────────

export const ALL_BUILTIN_ASSETS = [];

// ASSET_FOLDER_TREE root node — each node: { sizes: { [size]: Asset[] }, children: { [name]: node } }
export const ASSET_FOLDER_TREE = { sizes: {}, children: {} };

// ASSET_TREE kept for asset IDs and backward compat: { [theme]: { [size]: Asset[] } }
export const ASSET_TREE = {};

for (const [path, svgContent] of Object.entries(svgModules)) {
  const stripped = path.replace('./assets/svgs/', '');
  const parts = stripped.split('/');
  if (parts.length < 3) continue;

  const folderParts = parts.slice(0, -2);       // e.g. ['Basketball', 'Spurs']
  const theme = folderParts.join(' / ');         // kept for stable asset IDs
  const size  = parts[parts.length - 2];        // '1x1'
  const file  = parts[parts.length - 1];        // 'square.svg'
  const name  = file.replace(/\.svg$/i, '');

  const m = size.match(/^(\d+)x(\d+)$/i);
  if (!m) continue;
  const cols = parseInt(m[1], 10);
  const rows = parseInt(m[2], 10);

  const id = `builtin::${theme}::${size}::${name}`;
  const asset = { id, name, cols, rows, svgContent, size, theme, builtin: true };

  ALL_BUILTIN_ASSETS.push(asset);

  // Flat ASSET_TREE (for ID lookups)
  if (!ASSET_TREE[theme]) ASSET_TREE[theme] = {};
  if (!ASSET_TREE[theme][size]) ASSET_TREE[theme][size] = [];
  ASSET_TREE[theme][size].push(asset);

  // Nested ASSET_FOLDER_TREE
  let node = ASSET_FOLDER_TREE;
  for (const part of folderParts) {
    if (!node.children[part]) node.children[part] = { sizes: {}, children: {} };
    node = node.children[part];
  }
  if (!node.sizes[size]) node.sizes[size] = [];
  node.sizes[size].push(asset);
}

// ── Sort the nested tree ─────────────────────────────────────────────────────

function sortNode(node) {
  for (const sizeAssets of Object.values(node.sizes)) {
    sizeAssets.sort((a, b) => a.name.localeCompare(b.name));
  }
  // Sort sizes by area then cols
  const sortedSizes = Object.keys(node.sizes).sort((a, b) => {
    const [ac, ar] = a.split('x').map(Number);
    const [bc, br] = b.split('x').map(Number);
    return (ac * ar - bc * br) || (ac - bc);
  });
  const orderedSizes = {};
  for (const s of sortedSizes) orderedSizes[s] = node.sizes[s];
  node.sizes = orderedSizes;
  for (const child of Object.values(node.children)) sortNode(child);
}

sortNode(ASSET_FOLDER_TREE);

// Sort ASSET_TREE too (kept for compat)
export const ASSET_THEMES = Object.keys(ASSET_TREE).sort((a, b) => {
  if (a === 'Default') return -1;
  if (b === 'Default') return 1;
  return a.localeCompare(b);
});
for (const theme of ASSET_THEMES) {
  const sizes = Object.keys(ASSET_TREE[theme]).sort((a, b) => {
    const [ac, ar] = a.split('x').map(Number);
    const [bc, br] = b.split('x').map(Number);
    return (ac * ar - bc * br) || (ac - bc);
  });
  const sorted = {};
  for (const s of sizes) sorted[s] = ASSET_TREE[theme][s];
  ASSET_TREE[theme] = sorted;
  for (const size of Object.keys(ASSET_TREE[theme])) {
    ASSET_TREE[theme][size].sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Default enabled: all assets in the 'Default' theme
export const DEFAULT_ENABLED_IDS = new Set(
  ALL_BUILTIN_ASSETS.filter(a => a.theme === 'Default').map(a => a.id)
);
