import { mulberry32 } from './rng';

// Colour Region fill (4.2): the grid's cells are grouped by the image colour
// under them (k-means), and each region is filled with its own shapes, scale
// and density. Regions are numbered from darkest to lightest, so "Region 1"
// keeps meaning the dark parts when the image or the count changes.

const SAMPLES = 3;   // samples per cell axis

// The average colour under each cell: Float32Array of r, g, b per cell.
function cellColours(grid, px) {
  const { cols, rows, cellSize, gridOriginX, gridOriginY } = grid;
  const { data, width, height, scaleX = 1, scaleY = 1 } = px;
  const out = new Float32Array(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let R = 0, G = 0, B = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = Math.max(0, Math.min(width - 1, Math.round((gridOriginX + (c + (sx + 0.5) / SAMPLES) * cellSize) * scaleX)));
          const y = Math.max(0, Math.min(height - 1, Math.round((gridOriginY + (r + (sy + 0.5) / SAMPLES) * cellSize) * scaleY)));
          const i = (y * width + x) * 4;
          R += data[i]; G += data[i + 1]; B += data[i + 2];
        }
      }
      const k = (r * cols + c) * 3, n = SAMPLES * SAMPLES;
      out[k] = R / n; out[k + 1] = G / n; out[k + 2] = B / n;
    }
  }
  return out;
}

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

// → { regionOf: Int16Array (cell index → region), colours: [hex], counts: [cells] }
// smoothing: passes of a majority filter, so regions are less speckled.
export function computeColourRegions(grid, imagePixels, { numRegions = 4, smoothing = 1, seed = 0 } = {}) {
  const { cols, rows } = grid;
  const n = cols * rows;
  const cells = cellColours(grid, imagePixels);
  const k = Math.max(1, Math.min(numRegions, n));

  // k-means++-ish start: spread the first centres across the brightness range.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) =>
    lum([cells[a * 3], cells[a * 3 + 1], cells[a * 3 + 2]]) - lum([cells[b * 3], cells[b * 3 + 1], cells[b * 3 + 2]]));
  const rand = mulberry32(seed);
  let centres = Array.from({ length: k }, (_, i) => {
    const at = order[Math.min(n - 1, Math.floor(((i + 0.5 + (rand() - 0.5) * 0.2) / k) * n))];
    return [cells[at * 3], cells[at * 3 + 1], cells[at * 3 + 2]];
  });

  let regionOf = new Int16Array(n);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = (cells[i * 3] - centres[j][0]) ** 2 + (cells[i * 3 + 1] - centres[j][1]) ** 2 + (cells[i * 3 + 2] - centres[j][2]) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      if (regionOf[i] !== best) { regionOf[i] = best; moved = true; }
    }
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[regionOf[i]];
      s[0] += cells[i * 3]; s[1] += cells[i * 3 + 1]; s[2] += cells[i * 3 + 2]; s[3]++;
    }
    centres = centres.map((c, j) => (sums[j][3] ? [sums[j][0] / sums[j][3], sums[j][1] / sums[j][3], sums[j][2] / sums[j][3]] : c));
    if (!moved && iter) break;
  }

  // Majority filter: a cell joins the region most of its neighbours are in.
  for (let pass = 0; pass < smoothing; pass++) {
    const next = new Int16Array(regionOf);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const votes = new Map();
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const g = regionOf[rr * cols + cc];
          votes.set(g, (votes.get(g) ?? 0) + (dr || dc ? 1 : 1.5));
        }
        let best = regionOf[r * cols + c], bestV = 0;
        for (const [g, v] of votes) if (v > bestV) { best = g; bestV = v; }
        next[r * cols + c] = best;
      }
    }
    regionOf = next;
  }

  // Number regions darkest first.
  const rank = centres.map((c, j) => j).sort((a, b) => lum(centres[a]) - lum(centres[b]));
  const newIndex = new Int16Array(k);
  rank.forEach((j, i) => { newIndex[j] = i; });
  for (let i = 0; i < n; i++) regionOf[i] = newIndex[regionOf[i]];
  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[regionOf[i]]++;
  return { regionOf, colours: rank.map(j => hex(centres[j])), counts };
}

// The cells of each region with its density applied (cells dropped by a
// per-cell hash, so the same cells stay as the density moves): ["c,r"][].
export function regionCellLists({ regionOf }, grid, regions, seed = 0) {
  const { cols, rows } = grid;
  const lists = regions.map(() => []);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const g = regionOf[r * cols + c];
      const reg = regions[g];
      if (!reg || reg.shapes === 'none') continue;
      const density = reg.density ?? 1;
      if (density < 1 && mulberry32((seed ^ Math.imul(c + 1, 73856093) ^ Math.imul(r + 1, 19349663)) >>> 0)() >= density) continue;
      lists[g].push(`${c},${r}`);
    }
  }
  return lists;
}

// Settings for each region, filled out to `count` with defaults that vary
// the scale so regions read as different textures.
export function regionDefaults(count, existing = []) {
  return Array.from({ length: count }, (_, i) => existing[i] ?? {
    shapes: 'enabled', maxScale: [1, 2, 1, 3][i % 4], scaleFreq: 60, density: 1,
  });
}
