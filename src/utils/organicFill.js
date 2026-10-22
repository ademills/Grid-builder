import { mulberry32 } from './rng';

/**
 * Organic fill: grows a pattern and fills the cells it covers. Two engines:
 *
 *  'reaction'  — Gray-Scott reaction-diffusion (Turing patterns): spots,
 *                mazes, coral, worms… simulated on a finer grid than the
 *                cells, then averaged per cell and thresholded.
 *  'automaton' — a life-like cellular automaton run on the cells themselves:
 *                random start, then N generations of a birth/survival rule
 *                (Game of Life, caves, coral, mazes…).
 *
 * Both are seeded and run in the fill worker. Pure function → Set of "col,row".
 */

// Feed / kill rates for each reaction-diffusion look.
export const RD_PRESETS = {
  spots:  { label: 'Spots',  feed: 0.0367, kill: 0.0649 },
  maze:   { label: 'Maze',   feed: 0.029,  kill: 0.057 },
  coral:  { label: 'Coral',  feed: 0.0545, kill: 0.062 },
  worms:  { label: 'Worms',  feed: 0.078,  kill: 0.061 },
  holes:  { label: 'Holes',  feed: 0.039,  kill: 0.058 },
  waves:  { label: 'Ripples', feed: 0.025, kill: 0.056 },
};

// Birth / survival neighbour counts (Moore neighbourhood).
export const CA_RULES = {
  life:     { label: 'Life',      born: [3],          survive: [2, 3] },
  highlife: { label: 'HighLife',  born: [3, 6],       survive: [2, 3] },
  daynight: { label: 'Day & Night', born: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] },
  cave:     { label: 'Caves',     born: [5, 6, 7, 8], survive: [4, 5, 6, 7, 8] },
  coral:    { label: 'Coral',     born: [3],          survive: [4, 5, 6, 7, 8] },
  maze:     { label: 'Maze',      born: [3],          survive: [1, 2, 3, 4, 5] },
};

// The pattern's typical wavelength in simulation pixels (measured for these
// rates with the diffusion constants below), used to size the simulation so
// features come out about `feature` cells across.
const RD_WAVELENGTH = 12;
const RD_MAX_PIXELS = 48000;

// Copies the left half onto the right (and/or top onto bottom), mirrored.
function mirrorField(field, w, h, mode) {
  if (mode === 'x' || mode === 'xy') {
    for (let y = 0; y < h; y++)
      for (let x = Math.ceil(w / 2); x < w; x++) field[y * w + x] = field[y * w + (w - 1 - x)];
  }
  if (mode === 'xy') {
    for (let y = Math.ceil(h / 2); y < h; y++)
      for (let x = 0; x < w; x++) field[y * w + x] = field[(h - 1 - y) * w + x];
  }
}

function reaction(cols, rows, s, rng) {
  const preset = RD_PRESETS[s.preset] ?? RD_PRESETS.spots;
  let ppc = Math.max(1, Math.min(8, Math.round(RD_WAVELENGTH / Math.max(0.5, s.feature ?? 2))));
  while (ppc > 1 && cols * rows * ppc * ppc > RD_MAX_PIXELS) ppc--;
  const W = cols * ppc, H = rows * ppc, N = W * H;

  let A = new Float32Array(N).fill(1);
  let B = new Float32Array(N);
  // Seed with small squares of B scattered over the whole field.
  const seeds = Math.max(3, Math.round(N / 260));
  for (let i = 0; i < seeds; i++) {
    const sx = Math.floor(rng() * W), sy = Math.floor(rng() * H), r = 1 + Math.floor(rng() * 2);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = (sx + dx + W) % W, y = (sy + dy + H) % H;
        B[y * W + x] = 1;
        A[y * W + x] = 0.5;
      }
  }
  mirrorField(A, W, H, s.symmetry);
  mirrorField(B, W, H, s.symmetry);

  const { feed: f, kill: k } = preset;
  const DA = 1, DB = 0.5;
  let A2 = new Float32Array(N), B2 = new Float32Array(N);
  const steps = Math.max(100, Math.min(8000, s.iterations ?? 2500));
  for (let t = 0; t < steps; t++) {
    for (let y = 0; y < H; y++) {
      const yu = ((y - 1 + H) % H) * W, y0 = y * W, yd = ((y + 1) % H) * W;
      for (let x = 0; x < W; x++) {
        const xl = (x - 1 + W) % W, xr = (x + 1) % W;
        const i = y0 + x;
        const a = A[i], b = B[i];
        // 9-point Laplacian: 0.2 sides, 0.05 corners, −1 centre (wraps around).
        const lapA = 0.2 * (A[yu + x] + A[yd + x] + A[y0 + xl] + A[y0 + xr])
          + 0.05 * (A[yu + xl] + A[yu + xr] + A[yd + xl] + A[yd + xr]) - a;
        const lapB = 0.2 * (B[yu + x] + B[yd + x] + B[y0 + xl] + B[y0 + xr])
          + 0.05 * (B[yu + xl] + B[yu + xr] + B[yd + xl] + B[yd + xr]) - b;
        const abb = a * b * b;
        A2[i] = a + DA * lapA - abb + f * (1 - a);
        B2[i] = b + DB * lapB + abb - (k + f) * b;
      }
    }
    [A, A2] = [A2, A];
    [B, B2] = [B2, B];
  }

  // Average B over each cell.
  const values = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      for (let dy = 0; dy < ppc; dy++)
        for (let dx = 0; dx < ppc; dx++) sum += B[(r * ppc + dy) * W + c * ppc + dx];
      values[r * cols + c] = sum / (ppc * ppc);
    }
  return values;
}

function automaton(cols, rows, s, rng) {
  const rule = CA_RULES[s.rule] ?? CA_RULES.life;
  const born = new Set(rule.born), survive = new Set(rule.survive);
  const density = s.density ?? 0.4;
  let cells = new Uint8Array(cols * rows);
  for (let i = 0; i < cells.length; i++) cells[i] = rng() < density ? 1 : 0;
  mirrorField(cells, cols, rows, s.symmetry);
  let next = new Uint8Array(cols * rows);
  const wrap = !!s.wrap;
  const at = (c, r) => {
    if (wrap) return cells[((r + rows) % rows) * cols + ((c + cols) % cols)];
    return c < 0 || r < 0 || c >= cols || r >= rows ? 0 : cells[r * cols + c];
  };
  const gens = Math.max(0, Math.min(200, s.generations ?? 12));
  for (let g = 0; g < gens; g++) {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const n = at(c - 1, r - 1) + at(c, r - 1) + at(c + 1, r - 1) + at(c - 1, r)
          + at(c + 1, r) + at(c - 1, r + 1) + at(c, r + 1) + at(c + 1, r + 1);
        const alive = cells[r * cols + c];
        next[r * cols + c] = alive ? (survive.has(n) ? 1 : 0) : (born.has(n) ? 1 : 0);
      }
    [cells, next] = [next, cells];
  }
  return Float32Array.from(cells);
}

export function computeOrganicMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const rng = mulberry32(settings.seed ?? 0);
  const values = settings.algorithm === 'automaton'
    ? automaton(cols, rows, settings, rng)
    : reaction(cols, rows, settings, rng);

  // Automaton cells are already 0 / 1; reaction values are scaled to 0..1
  // over this grid before thresholding.
  let min = 0, range = 1;
  if (settings.algorithm !== 'automaton') {
    let max = -Infinity;
    min = Infinity;
    for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
    range = max - min || 1;
  }
  const threshold = settings.algorithm === 'automaton' ? 0.5 : (settings.threshold ?? 0.5);
  const cells = new Set();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const on = (values[r * cols + c] - min) / range >= threshold;
      if (on !== !!settings.invert) cells.add(`${c},${r}`);
    }
  return cells;
}
