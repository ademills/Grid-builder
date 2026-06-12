/**
 * Greedy 2-D bin packer.
 *
 * Scans grid cells row-major (top-left → bottom-right).  At each empty anchor
 * cell it tries assets from a rotating shuffle pool, placing the first one
 * whose bounding box fits and all underlying cells are free.  Assets cycle so
 * the whole pool is used before repetition.
 *
 * maxScale    – maximum integer scale multiplier (1 = no scaling, 2 = up to 2×, …)
 * scaleFreq   – 0-100: probability (%) that an anchor cell attempts a scaled placement first
 * allowedCells – optional Set of "col,row" strings; when given, only cells in
 *                the set may be used as anchors or covered by a block's footprint
 *
 * Returns an array of placed-block descriptors ready for the canvas renderer.
 */
function packGrid(assets, gridComputed, maxScale = 1, scaleFreq = 0, existingBlocks = [], allowedCells = null) {
  if (!gridComputed || !assets || assets.length === 0) return [];

  const { cols, rows } = gridComputed;

  // 2-D occupancy map
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  const pool = [...assets].sort(() => Math.random() - 0.5);
  let poolIdx = 0;

  const reshufflePool = () => {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  };

  // Advance the pool index by `steps`; re-shuffle whenever a full cycle completes.
  const advancePool = (steps) => {
    const newRaw = poolIdx + steps;
    poolIdx = newRaw % pool.length;
    if (newRaw >= pool.length) reshufflePool();
  };

  const canPlace = (c, r, bw, bh) => {
    if (c + bw > cols || r + bh > rows) return false;
    for (let dr = 0; dr < bh; dr++)
      for (let dc = 0; dc < bw; dc++) {
        if (occupied[r + dr][c + dc]) return false;
        if (allowedCells && !allowedCells.has(`${c + dc},${r + dr}`)) return false;
      }
    return true;
  };

  const markOccupied = (c, r, bw, bh) => {
    for (let dr = 0; dr < bh; dr++)
      for (let dc = 0; dc < bw; dc++)
        occupied[r + dr][c + dc] = true;
  };

  const makeBlock = (asset, c, r, scaledCols, scaledRows) => ({
    id: crypto.randomUUID(),
    assetId: asset.id,
    cols: scaledCols,
    rows: scaledRows,
    svgContent: asset.svgContent,
    name: asset.name,
    gridCol: c,
    gridRow: r,
  });

  // Pre-mark cells occupied by existing blocks so Fill Gaps respects them
  for (const block of existingBlocks) {
    markOccupied(block.gridCol, block.gridRow, block.cols, block.rows);
  }

  const placed = [];
  const shouldScale = maxScale > 1 && scaleFreq > 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied[r][c]) continue;
      if (allowedCells && !allowedCells.has(`${c},${r}`)) continue;

      let found = false;

      // Attempt scaled placement if this anchor cell wins the frequency roll.
      // Pick a random integer scale in [2, maxScale] so all steps are reachable.
      if (shouldScale && Math.random() * 100 < scaleFreq) {
        const scale = Math.floor(Math.random() * (maxScale - 1)) + 2;
        for (let i = 0; i < pool.length; i++) {
          const asset = pool[(poolIdx + i) % pool.length];
          const sc = asset.cols * scale;
          const sr = asset.rows * scale;
          if (canPlace(c, r, sc, sr)) {
            markOccupied(c, r, sc, sr);
            placed.push(makeBlock(asset, c, r, sc, sr));
            advancePool(i + 1);
            found = true;
            break;
          }
        }
      }

      // Fall back to 1× placement
      if (!found) {
        for (let i = 0; i < pool.length; i++) {
          const asset = pool[(poolIdx + i) % pool.length];
          if (canPlace(c, r, asset.cols, asset.rows)) {
            markOccupied(c, r, asset.cols, asset.rows);
            placed.push(makeBlock(asset, c, r, asset.cols, asset.rows));
            advancePool(i + 1);
            found = true;
            break;
          }
        }
      }

      if (!found) occupied[r][c] = true;
    }
  }

  return placed;
}

export function fillGrid(assets, gridComputed, maxScale = 1, scaleFreq = 0, existingBlocks = []) {
  return packGrid(assets, gridComputed, maxScale, scaleFreq, existingBlocks, null);
}

/**
 * Same as fillGrid, but restricted to an allow-list of "col,row" cells —
 * used by mask-driven fills (Glitch, Strip, ...) so blocks only appear (and
 * only grow) inside the active region.
 */
export function fillMasked(assets, gridComputed, activeCells, maxScale = 1, scaleFreq = 0) {
  return packGrid(assets, gridComputed, maxScale, scaleFreq, [], activeCells);
}
