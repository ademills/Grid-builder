/**
 * Greedy 2-D bin packer.
 *
 * Scans grid cells row-major (top-left → bottom-right).  At each empty anchor
 * cell it tries assets from a rotating shuffle pool, placing the first one
 * whose bounding box fits and all underlying cells are free.  Assets cycle so
 * the whole pool is used before repetition.
 *
 * Returns an array of placed-block descriptors ready for the canvas renderer.
 */
export function fillGrid(assets, gridComputed) {
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

  const placed = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (occupied[r][c]) continue;

      let found = false;
      for (let i = 0; i < pool.length; i++) {
        const asset = pool[(poolIdx + i) % pool.length];
        if (canPlace(c, r, asset.cols, asset.rows)) {
          markOccupied(c, r, asset.cols, asset.rows);
          placed.push({
            id: crypto.randomUUID(),
            assetId: asset.id,
            cols: asset.cols,
            rows: asset.rows,
            svgContent: asset.svgContent,
            name: asset.name,
            gridCol: c,
            gridRow: r,
          });
          poolIdx = (poolIdx + i + 1) % pool.length;
          found = true;
          break;
        }
      }

      // Nothing fit at this anchor — skip the cell to avoid infinite stalling
      if (!found) occupied[r][c] = true;
    }
  }

  return placed;
}
