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
 *
 * Returns an array of placed-block descriptors ready for the canvas renderer.
 */
export function fillGrid(assets, gridComputed, maxScale = 1, scaleFreq = 0, existingBlocks = []) {
  if (!gridComputed || !assets || assets.length === 0) return [];

  const { cols, rows } = gridComputed;

  // 2-D occupancy map
  const occupied = Array.from({ length: rows }, () => new Array(cols).fill(false));

  // Shuffle once then cycle
  const pool = [...assets].sort(() => Math.random() - 0.5);
  let poolIdx = 0;

  const canPlace = (c, r, bw, bh) => {
    if (c + bw > cols || r + bh > rows) return false;
    for (let dr = 0; dr < bh; dr++)
      for (let dc = 0; dc < bw; dc++)
        if (occupied[r + dr][c + dc]) return false;
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
            poolIdx = (poolIdx + i + 1) % pool.length;
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
            poolIdx = (poolIdx + i + 1) % pool.length;
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
