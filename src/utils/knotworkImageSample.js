// Samples one flat colour per Meander strand from a loaded backdrop image,
// used when knotworkSettings.inkMode === 'image' (see composeKnotworkSvg).
// Mirrors the sample-multiple-points-and-average technique colorize.js uses
// for image-coloured shapes (colorizeSvgByImage), but simpler: a strand
// lives in one self-contained local coordinate space (0..W, 0..H), not a
// per-block placement, so mapping into the image buffer is a single fit
// transform rather than per-shape viewBox math.

// Maps a point in the knot's local (0..W, 0..H) space into the image
// buffer's pixel space, replicating the same placement an SVG <image> with
// preserveAspectRatio would use for each fit mode -- 'contain' (xMidYMid
// meet), 'cover' (xMidYMid slice), or 'stretch' (none) -- so sampled
// colours line up with what the backdrop picture actually shows there.
function mapToBuffer(x, y, W, H, iW, iH, fit) {
  if (fit === 'stretch') {
    return { bx: (x / W) * iW, by: (y / H) * iH };
  }
  const sx = W / iW, sy = H / iH;
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  const drawW = iW * scale, drawH = iH * scale;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;
  return { bx: (x - offX) / scale, by: (y - offY) / scale };
}

function samplePixel(imagePixels, bx, by) {
  const px = Math.max(0, Math.min(Math.round(bx), imagePixels.width - 1));
  const py = Math.max(0, Math.min(Math.round(by), imagePixels.height - 1));
  const i = (py * imagePixels.width + px) * 4;
  const d = imagePixels.data;
  return [d[i], d[i + 1], d[i + 2]];
}

function toHex([r, g, b]) {
  const h = n => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// strandPixelPointsList: array of per-strand [{x,y}, ...] centreline points
// (knot-local pixel space, same space the SVG's own viewBox uses).
export function sampleStrandColours(strandPixelPointsList, imagePixels, W, H, fit, fallbackColours) {
  const { width: iW, height: iH } = imagePixels;
  return strandPixelPointsList.map((pts, i) => {
    if (!pts.length) return fallbackColours[i % fallbackColours.length];
    // Up to 5 evenly-spaced samples along the strand, averaged -- enough to
    // smooth out single-pixel noise without needing to sample every point.
    const step = Math.max(1, Math.floor(pts.length / 5));
    let r = 0, g = 0, b = 0, n = 0;
    for (let idx = 0; idx < pts.length; idx += step) {
      const { bx, by } = mapToBuffer(pts[idx].x, pts[idx].y, W, H, iW, iH, fit);
      const [pr, pg, pb] = samplePixel(imagePixels, bx, by);
      r += pr; g += pg; b += pb; n++;
    }
    return toHex([r / n, g / n, b / n]);
  });
}
