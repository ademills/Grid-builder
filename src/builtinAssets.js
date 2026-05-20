/**
 * Loads all SVGs from src/assets/svgs/**\/THEME/GRIDSIZE/name.svg at build time.
 *
 * Folder convention:
 *   src/assets/svgs/
 *     Default/          ← enabled at startup; all other themes off by default
 *       1x1/
 *         circle.svg
 *       2x1/
 *         wide-bar.svg
 *     Sports/
 *       1x1/
 *         ...
 *
 * Add a new theme by creating a folder — the app picks it up automatically.
 */

const svgModules = import.meta.glob(
  './assets/svgs/**/*.svg',
  { eager: true, query: '?raw', import: 'default' }
);

// ── Build the asset tree ─────────────────────────────────────────────────────

// ASSET_TREE: { [theme]: { [size]: Asset[] } }
export const ASSET_TREE = {};

export const ALL_BUILTIN_ASSETS = [];

for (const [path, svgContent] of Object.entries(svgModules)) {
  const stripped = path.replace('./assets/svgs/', '');
  const parts = stripped.split('/');
  if (parts.length < 3) continue;

  const theme = parts[0]; // 'Default'
  const size  = parts[1]; // '1x1'
  const file  = parts[2]; // 'square.svg'
  const name  = file.replace(/\.svg$/i, '');

  const m = size.match(/^(\d+)x(\d+)$/i);
  if (!m) continue;
  const cols = parseInt(m[1], 10);
  const rows = parseInt(m[2], 10);

  const id = `builtin::${theme}::${size}::${name}`;
  const asset = { id, name, cols, rows, svgContent, size, theme, builtin: true };

  ALL_BUILTIN_ASSETS.push(asset);

  if (!ASSET_TREE[theme]) ASSET_TREE[theme] = {};
  if (!ASSET_TREE[theme][size]) ASSET_TREE[theme][size] = [];
  ASSET_TREE[theme][size].push(asset);
}

// Sort themes: Default first, rest alphabetical
export const ASSET_THEMES = Object.keys(ASSET_TREE).sort((a, b) => {
  if (a === 'Default') return -1;
  if (b === 'Default') return 1;
  return a.localeCompare(b);
});

// Within each theme sort sizes by area (cols×rows) then cols
for (const theme of ASSET_THEMES) {
  const sizes = Object.keys(ASSET_TREE[theme]).sort((a, b) => {
    const [ac, ar] = a.split('x').map(Number);
    const [bc, br] = b.split('x').map(Number);
    return (ac * ar - bc * br) || (ac - bc);
  });
  const sorted = {};
  for (const s of sizes) sorted[s] = ASSET_TREE[theme][s];
  ASSET_TREE[theme] = sorted;
}

// Sort individual assets within each size alphabetically
for (const theme of ASSET_THEMES) {
  for (const size of Object.keys(ASSET_TREE[theme])) {
    ASSET_TREE[theme][size].sort((a, b) => a.name.localeCompare(b.name));
  }
}

// Default enabled: all assets in the 'Default' theme
export const DEFAULT_ENABLED_IDS = new Set(
  ALL_BUILTIN_ASSETS.filter(a => a.theme === 'Default').map(a => a.id)
);
