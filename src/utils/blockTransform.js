// Per-block rotation (quarter turns) and mirroring for shape blocks, set by
// the Rotate and Reflect tools. Stored as block.rotation (0/90/180/270,
// clockwise) and block.flipX / block.flipY.
//
// A shape point p is drawn at  c + F(R(p − c))  — rotate about the block's
// centre c, then mirror — which is exactly the SVG transform below.

export function hasShapeTransform(block) {
  return !block.type && (!!(block.rotation % 360) || !!block.flipX || !!block.flipY);
}

// SVG transform attribute for a block drawn in the box (x, y, w, h).
export function shapeTransform(block, x, y, w, h) {
  if (!hasShapeTransform(block)) return undefined;
  const cx = x + w / 2, cy = y + h / 2;
  const sx = block.flipX ? -1 : 1, sy = block.flipY ? -1 : 1;
  return `translate(${cx} ${cy}) scale(${sx} ${sy}) rotate(${block.rotation ?? 0}) translate(${-cx} ${-cy})`;
}

// Maps a click at (u, v) — 0..1 across the block's box on screen — back to
// the same 0..1 position in the untransformed shape (for slot hit-testing).
export function unTransformUV(block, u, v) {
  if (!hasShapeTransform(block)) return [u, v];
  let x = u - 0.5, y = v - 0.5;
  if (block.flipX) x = -x;
  if (block.flipY) y = -y;
  const r = ((block.rotation ?? 0) % 360 + 360) % 360;
  // Undo a clockwise rotation by r.
  if (r === 90) [x, y] = [y, -x];
  else if (r === 180) [x, y] = [-x, -y];
  else if (r === 270) [x, y] = [-y, x];
  return [x + 0.5, y + 0.5];
}

// Quarter turns only make sense for square footprints; anything else can
// only be turned half-way without changing the cells it covers.
export function rotateBlock(block, clockwise = true) {
  const step = block.cols === block.rows ? 90 : 180;
  const r = (((block.rotation ?? 0) + (clockwise ? step : -step)) % 360 + 360) % 360;
  return { ...block, rotation: r };
}
