import { hexToHsl, hslToHex } from './colourGuide';

// Recolour Artwork (6.7): every colour in the artwork, mapped to a new one.
// Colours live in a few places: the document swatches (which the palette
// modes, pinned parts and swatch-following layers all use), the block
// background swatches, the paper colour, and vector layers painted a colour
// of their own. Changing those recolours the whole design.

const norm = h => (h ?? '').toLowerCase();

// → [{ hex, weight, refs }] — refs: { kind: 'swatch', list: 'shape' | 'bg', id }
// | { kind: 'canvas' } | { kind: 'block', id }. Heaviest first.
// usage(swatchId) is how many shapes pin a swatch; swatches out of the palette
// count only when something uses them.
export function artworkColours(state, { usage = () => 0, includeBg = false } = {}) {
  const rows = new Map();
  const add = (hex, ref, weight) => {
    const key = norm(hex);
    if (!/^#[0-9a-f]{6}$/.test(key)) return;
    const row = rows.get(key) ?? { hex: key, weight: 0, refs: [] };
    row.weight += weight;
    row.refs.push(ref);
    rows.set(key, row);
  };
  for (const s of state.shapeColors ?? []) {
    const used = usage(s.id);
    if (s.enabled !== false || used) add(s.hex, { kind: 'swatch', list: 'shape', id: s.id }, Math.max(1, used));
  }
  if (includeBg) for (const s of state.bgColors ?? []) if (s.enabled !== false) add(s.hex, { kind: 'swatch', list: 'bg', id: s.id }, 1);
  add(state.canvasBg, { kind: 'canvas' }, 1);
  for (const b of state.placedBlocks ?? []) {
    if (b.type === 'vector' && b.fill && !b.fillSwatch && !b.hidden) add(b.fill, { kind: 'block', id: b.id }, 1);
  }
  return [...rows.values()].sort((a, b) => b.weight - a.weight);
}

const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const dist = (a, b) => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;   // "redmean" perceptual approximation
  return Math.sqrt((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2);
};

// Reduce to n colours: rows are grouped (agglomeratively, closest first) and
// each group takes its heaviest member's colour. → Map(hex → group hex).
export function reduceColours(rows, n) {
  let groups = rows.map(r => ({ hex: r.hex, weight: r.weight, members: [r.hex] }));
  while (groups.length > Math.max(1, n)) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const d = dist(groups[i].hex, groups[j].hex);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    const [a, b] = [groups[bi], groups[bj]];
    const merged = { hex: a.weight >= b.weight ? a.hex : b.hex, weight: a.weight + b.weight, members: [...a.members, ...b.members] };
    groups = groups.filter((_, k) => k !== bi && k !== bj).concat(merged);
  }
  const out = new Map();
  for (const g of groups) for (const m of g.members) out.set(m, g.hex);
  return out;
}

// Harmony-locked adjustment: every colour moves together.
// hue in degrees, sat and light in -1..1 (relative).
export function adjustColour(hex, { hue = 0, sat = 0, light = 0 } = {}) {
  if (!hue && !sat && !light) return hex;
  const c = hexToHsl(hex);
  const s = sat >= 0 ? c.s + (1 - c.s) * sat : c.s * (1 + sat);
  const l = light >= 0 ? c.l + (1 - c.l) * light : c.l * (1 + light);
  return hslToHex({ h: c.h + hue, s, l });
}

// The new colour for each row: its own pick, or (reduced) its group's,
// then the harmony adjustment. → Map(old hex → new hex)
export function recolourMapping(rows, { picks = {}, reduceTo = null, adjust = {} } = {}) {
  const groupOf = reduceTo && reduceTo < rows.length ? reduceColours(rows, reduceTo) : null;
  const out = new Map();
  for (const r of rows) {
    const base = groupOf ? groupOf.get(r.hex) : r.hex;
    out.set(r.hex, adjustColour(picks[base] ?? base, adjust));
  }
  return out;
}

// The document changes that apply a mapping: { shapeColors?, bgColors?, canvasBg?, placedBlocks? }.
export function applyRecolour(state, rows, mapping) {
  const swatch = { shape: new Map(), bg: new Map() };
  const blocks = new Map();
  let canvas = null;
  for (const r of rows) {
    const to = mapping.get(r.hex);
    if (!to || to === r.hex) continue;
    for (const ref of r.refs) {
      if (ref.kind === 'swatch') swatch[ref.list].set(ref.id, to);
      else if (ref.kind === 'block') blocks.set(ref.id, to);
      else canvas = to;
    }
  }
  const changes = {};
  if (swatch.shape.size) changes.shapeColors = state.shapeColors.map(s => (swatch.shape.has(s.id) ? { ...s, hex: swatch.shape.get(s.id) } : s));
  if (swatch.bg.size) changes.bgColors = state.bgColors.map(s => (swatch.bg.has(s.id) ? { ...s, hex: swatch.bg.get(s.id) } : s));
  if (canvas) changes.canvasBg = canvas;
  if (blocks.size) changes.placedBlocks = state.placedBlocks.map(b => (blocks.has(b.id) ? { ...b, fill: blocks.get(b.id) } : b));
  return changes;
}
