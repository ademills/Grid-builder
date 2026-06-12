// Simple k-means clustering over RGB pixel data, used to extract a dominant
// colour palette from an uploaded image (Palette Extractor feature).

function toHex(r, g, b) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * Extracts `k` dominant colours from an `imagePixels` buffer
 * ({ data: Uint8ClampedArray (RGBA), width, height }) using k-means.
 * Returns an array of hex colour strings, ordered by cluster size (largest first).
 */
export function extractPalette(imagePixels, k = 6, iterations = 8) {
  const { data, width, height } = imagePixels;
  const pixelCount = width * height;
  if (!pixelCount) return [];

  // Sample at most ~5000 pixels for speed.
  const maxSamples = 5000;
  const step = Math.max(1, Math.floor(pixelCount / maxSamples));
  const samples = [];
  for (let i = 0; i < pixelCount; i += step) {
    const o = i * 4;
    if (data[o + 3] < 16) continue; // skip near-transparent pixels
    samples.push([data[o], data[o + 1], data[o + 2]]);
  }
  if (!samples.length) return [];

  k = Math.min(k, samples.length);

  // Initialise centroids by picking evenly spaced samples.
  let centroids = Array.from({ length: k }, (_, i) =>
    samples[Math.floor((i / k) * samples.length)].slice()
  );

  let assignments = new Array(samples.length).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    // Assign
    for (let i = 0; i < samples.length; i++) {
      const [r, g, b] = samples[i];
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const [cr, cg, cb] = centroids[c];
        const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      assignments[i] = best;
    }

    // Update
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i];
      const [r, g, b] = samples[i];
      sums[c][0] += r; sums[c][1] += g; sums[c][2] += b; sums[c][3] += 1;
    }
    centroids = sums.map((s, i) => s[3] > 0
      ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
      : centroids[i]);
  }

  // Order clusters by size (largest first).
  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;
  const order = centroids
    .map((c, i) => ({ c, count: counts[i] }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);

  return order.map(({ c }) => toHex(c[0], c[1], c[2]));
}
