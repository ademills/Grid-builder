// Sobel edge-detection mask: traces high-contrast contours in the loaded
// image and marks the grid cells that fall on those edges.

const SOBEL_X = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
const SOBEL_Y = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

function luminance(d, i) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

/**
 * Computes the set of "col,row" cells lying on detected edges in `imagePixels`.
 * Pure function — same gridComputed + imagePixels + settings always produces
 * the same set.
 */
export function computeEdgeMask(gridComputed, imagePixels, settings) {
  const activeCells = new Set();
  if (!imagePixels) return activeCells;

  const { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed;
  const {
    edgeThreshold = 0.2,
    traceWidth = 1,
    minEdgeLength = 1,
    direction = 'all',
  } = settings;

  const { data, width, height, scaleX = 1, scaleY = 1 } = imagePixels;

  const lum = (px, py) => {
    const cx = Math.max(0, Math.min(px, width - 1));
    const cy = Math.max(0, Math.min(py, height - 1));
    return luminance(data, (cy * width + cx) * 4);
  };

  // Sobel gradient magnitude at each cell's centre pixel.
  const mags = new Array(rows);
  let maxMag = 0;
  for (let r = 0; r < rows; r++) {
    mags[r] = new Array(cols);
    for (let c = 0; c < cols; c++) {
      const px = Math.round((gridOriginX + (c + 0.5) * cellSize) * scaleX);
      const py = Math.round((gridOriginY + (r + 0.5) * cellSize) * scaleY);
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = lum(px + dx, py + dy);
          gx += SOBEL_X[dy + 1][dx + 1] * v;
          gy += SOBEL_Y[dy + 1][dx + 1] * v;
        }
      }
      let mag;
      if (direction === 'h') mag = Math.abs(gx);
      else if (direction === 'v') mag = Math.abs(gy);
      else mag = Math.sqrt(gx * gx + gy * gy);
      mags[r][c] = mag;
      if (mag > maxMag) maxMag = mag;
    }
  }
  if (maxMag <= 0) return activeCells;

  // Threshold to a raw edge cell set.
  let edgeCells = new Set();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (mags[r][c] / maxMag >= edgeThreshold) edgeCells.add(`${c},${r}`);
    }
  }

  // Filter out short connected runs (4-connected components below minEdgeLength).
  if (minEdgeLength > 1 && edgeCells.size) {
    const visited = new Set();
    const filtered = new Set();
    for (const key of edgeCells) {
      if (visited.has(key)) continue;
      const component = [];
      const stack = [key];
      visited.add(key);
      while (stack.length) {
        const cur = stack.pop();
        component.push(cur);
        const [cc, cr] = cur.split(',').map(Number);
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nKey = `${cc + dc},${cr + dr}`;
          if (edgeCells.has(nKey) && !visited.has(nKey)) {
            visited.add(nKey);
            stack.push(nKey);
          }
        }
      }
      if (component.length >= minEdgeLength) {
        for (const k of component) filtered.add(k);
      }
    }
    edgeCells = filtered;
  }

  // Dilate by (traceWidth - 1) cells in each direction to set the line thickness.
  const dilation = Math.max(0, Math.round(traceWidth) - 1);
  if (dilation === 0) return edgeCells;

  for (const key of edgeCells) {
    const [c, r] = key.split(',').map(Number);
    for (let dr = -dilation; dr <= dilation; dr++) {
      for (let dc = -dilation; dc <= dilation; dc++) {
        const nc = c + dc, nr = r + dr;
        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows) activeCells.add(`${nc},${nr}`);
      }
    }
  }
  return activeCells;
}
