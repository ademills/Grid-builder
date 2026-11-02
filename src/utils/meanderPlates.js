import { composeKnotworkLayers, meanderLayoutSig } from './knotworkCompose';

// Meander plates: smaller panels stacked over the main design, each holding
// a Meander of its own (its own seed; the rest of the main design's
// settings unless the plate sets them), on a background with an optional
// shadow and rim, like Linework's plates. Plates are square or turned 45°
// (a diamond), placed on whole grid cells around the grid's centre.
//
// knotworkSettings.plates = [plate]; each plate's blocks share the group
// `meander-plate-<id>`, so it selects and moves as one.

const CELL = 100; // design units per grid cell, as the main design

export const PLATE_LAYOUT_KEYS = ['density', 'straightBias', 'wallDensity', 'symmetryMode'];

export function meanderPlateDefaults(over = {}) {
  return {
    id: 'p1', name: 'Plate 1', enabled: true,
    cols: 6, rows: 6, shape: 'square', ox: 0, oy: 0,
    backing: 'square', corner: 0, shadow: 'none', depth: 0.25, rim: 0,
    seed: Math.floor(Math.random() * 0x80000000),
    ...over,
  };
}

// A new plate, smaller than the one below it (or about half the grid), with
// a fresh seed.
export function newMeanderPlate(plates, grid) {
  const ids = new Set(plates.map(p => p.id));
  let n = plates.length + 1;
  while (ids.has(`p${n}`)) n++;
  const below = plates[plates.length - 1];
  const size = Math.max(2, Math.round(below ? Math.min(below.cols, below.rows) * 0.6 : Math.min(grid.cols, grid.rows) * 0.5));
  return meanderPlateDefaults({ id: `p${n}`, name: `Plate ${n}`, cols: size, rows: size, shape: below?.shape ?? 'square' });
}

// ── Path helpers ─────────────────────────────────────────────────────────────

// Maps every point in an SVG path made of M, L, A and Z commands (what the
// Meander outlines use). Arcs here are circular, so rotation keeps them.
function mapPath(d, fn) {
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const out = [];
  const f = n => Math.round(n * 1000) / 1000;
  for (let i = 0; i < tokens.length;) {
    const c = tokens[i++];
    if (c === 'Z' || c === 'z') { out.push('Z'); continue; }
    if (c === 'M' || c === 'L') {
      const [x, y] = fn(+tokens[i], +tokens[i + 1]); i += 2;
      out.push(`${c} ${f(x)} ${f(y)}`);
    } else if (c === 'A') {
      const [rx, ry, rot, large, sweep] = tokens.slice(i, i + 5); i += 5;
      const [x, y] = fn(+tokens[i], +tokens[i + 1]); i += 2;
      out.push(`A ${rx} ${ry} ${rot} ${large} ${sweep} ${f(x)} ${f(y)}`);
    }
  }
  return out.join(' ');
}

// A rectangle w × h centred on the origin, corners rounded by r, as points
// and arcs: [['M', p], ['L', p] | ['A', r, p]..., 'Z'], clockwise on screen.
function roundedRect(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
  if (r < 1e-6) return [['M', [x0, y0]], ['L', [x1, y0]], ['L', [x1, y1]], ['L', [x0, y1]], ['Z']];
  return [
    ['M', [x0 + r, y0]], ['L', [x1 - r, y0]], ['A', r, [x1, y0 + r]], ['L', [x1, y1 - r]], ['A', r, [x1 - r, y1]],
    ['L', [x0 + r, y1]], ['A', r, [x0, y1 - r]], ['L', [x0, y0 + r]], ['A', r, [x0 + r, y0]], ['Z'],
  ];
}

// An outline (from roundedRect) as SVG, its points mapped by fn; reversed
// traces it the other way round (for a hole under the nonzero rule).
function outlineD(steps, fn, reversed = false) {
  const f = n => Math.round(n * 1000) / 1000;
  let seq = steps.filter(s => s !== 'Z' && s[0] !== 'Z');
  if (reversed) {
    const pts = seq.map(s => s[s.length - 1]);
    seq = [['M', pts[pts.length - 1]], ...seq.slice(1).reverse().map((s, i) => {
      const to = pts[seq.length - 2 - i];
      return s[0] === 'A' ? ['A', s[1], to, 0] : ['L', to];
    })];
  }
  return seq.map(s => {
    const [x, y] = fn(...s[s.length > 2 && s[0] === 'A' ? 2 : 1]);
    if (s[0] === 'A') return `A ${f(s[1])} ${f(s[1])} 0 0 ${s[3] === 0 ? 0 : 1} ${f(x)} ${f(y)}`;
    return `${s[0]} ${f(x)} ${f(y)}`;
  }).join(' ') + ' Z';
}

// ── Composition ──────────────────────────────────────────────────────────────

// The largest plate side that fits the grid: a diamond's footprint is √2
// times its side.
export function maxPlateSize(shape, grid, axis = 'cols') {
  if (shape === 'diamond') return Math.floor(Math.min(grid.cols, grid.rows) / Math.SQRT2 + 1e-6);
  return grid[axis];
}

// Where a plate sits: its footprint on the grid (whole cells) and the map
// from its own design's units into the footprint's. A plate too big for the
// grid shrinks to the largest that fits.
function placement(plate, grid) {
  const diamond = plate.shape === 'diamond';
  const size = (v, axis) => Math.max(2, Math.min(maxPlateSize(plate.shape, grid, axis), Math.round(v)));
  const cols = size(plate.cols, 'cols'), rows = diamond ? cols : size(plate.rows, 'rows');
  const fw = diamond ? Math.ceil(cols * Math.SQRT2 - 1e-6) : cols, fh = diamond ? fw : rows;
  const gridCol = Math.max(0, Math.min(grid.cols - fw, Math.round(grid.cols / 2 + (plate.ox ?? 0) - fw / 2)));
  const gridRow = Math.max(0, Math.min(grid.rows - fh, Math.round(grid.rows / 2 + (plate.oy ?? 0) - fh / 2)));
  const cx = (fw * CELL) / 2, cy = (fh * CELL) / 2;
  const a = diamond ? Math.PI / 4 : 0, cos = Math.cos(a), sin = Math.sin(a);
  // From the plate's centred frame into the footprint's.
  const place = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  // From the plate design's own frame (origin top-left).
  const fromDesign = (x, y) => place(x - (cols * CELL) / 2, y - (rows * CELL) / 2);
  return { cols, rows, fw, fh, gridCol, gridRow, place, fromDesign };
}

const boundsOf = (pts) => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

// The blocks for every enabled plate, bottom to top: shadow, background, rim
// and strands. settings: the Meander's settings with its theme colours (fg,
// bg, palette) as for composeKnotworkLayers; grid: { cols, rows }.
// layoutOf(prefix, sig): a plate's hand-built layout (see meanderHand.js).
export function composeMeanderPlates(settings, grid, layoutOf = () => null) {
  const blocks = [];
  (settings.plates ?? []).forEach((plate, i) => {
    if (!plate.enabled) return;
    if (maxPlateSize(plate.shape, grid) < 2) return;
    const P = placement(plate, grid);
    const tag = `p${plate.id}`, groupId = `meander-plate-${plate.id}`, name = plate.name ?? `Plate ${i + 1}`;
    const footprint = { gridCol: P.gridCol, gridRow: P.gridRow, cols: P.fw, rows: P.fh };
    const view = { viewW: P.fw * CELL, viewH: P.fh * CELL };
    const block = (key, label, d, fill, bounds, more = {}) => ({
      id: crypto.randomUUID(), type: 'vector', ...footprint, ...view, d, fill, bounds,
      name: `${name} · ${label}`, meanderKey: `${tag}:${key}`, groupId, ...more,
    });
    const W = P.cols * CELL, H = P.rows * CELL;
    const shape = roundedRect(W, H, (plate.corner ?? 0) * Math.min(W, H) / 2);
    const corners = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
    const plateBounds = boundsOf(corners.map(c => P.place(...c)));
    if (plate.backing !== 'none') {
      const depth = (plate.depth ?? 0) * CELL;
      if (plate.shadow && plate.shadow !== 'none' && depth > 0) {
        const off = depth * Math.SQRT1_2, soft = plate.shadow === 'soft';
        const at = (x, y) => { const [u, v] = P.place(x, y); return [u + off, v + off]; };
        blocks.push(block('shadow', 'Shadow', outlineD(shape, at), '#000000', boundsOf(corners.map(c => at(...c))),
          { blur: soft ? depth * 0.6 : 0, ...(soft ? { opacity: 0.55 } : {}) }));
      }
      blocks.push(block('ground', 'Background', outlineD(shape, P.place), settings.bg ?? '#ffffff', plateBounds));
      const rim = (plate.rim ?? 0) * CELL;
      if (rim > 0 && rim < Math.min(W, H) / 2) {
        const inner = roundedRect(W - 2 * rim, H - 2 * rim, Math.max(0, (plate.corner ?? 0) * Math.min(W, H) / 2 - rim));
        blocks.push(block('rim', 'Rim', `${outlineD(shape, P.place)} ${outlineD(inner, P.place, true)}`,
          settings.fg ?? '#000000', plateBounds));
      }
    }
    // The plate's own Meander: the main settings, its own seed and any of
    // the layout settings it sets; no centre motif or word.
    const own = Object.fromEntries(PLATE_LAYOUT_KEYS.filter(k => plate[k] != null).map(k => [k, plate[k]]));
    const local = { cols: P.cols, rows: P.rows, cellSize: CELL, gridOriginX: 0, gridOriginY: 0 };
    const plateSettings = { ...settings, ...own, seed: plate.seed, coreStyle: 'none', seedWord: '', weaveAsLetters: false };
    const design = composeKnotworkLayers(local, plateSettings, layoutOf(`${tag}:`, meanderLayoutSig(local, plateSettings)));
    let strand = 0, dot = 0;
    for (const item of design.items) {
      const b = item.bounds;
      const box = b ? boundsOf([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(c => P.fromDesign(...c))) : undefined;
      blocks.push(block(item.key, item.kind === 'dot' ? `Dot ${++dot}` : `Strand ${++strand}`,
        mapPath(item.d, P.fromDesign), item.fill, box, { cells: item.cells, layoutSig: design.layoutSig }));
    }
  });
  return blocks;
}
