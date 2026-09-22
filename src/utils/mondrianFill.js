import { mulberry32 } from './rng';

export function generateMondrianLayout(assets, gridComputed, settings) {
  if (!assets.length || !gridComputed) return [];
  const { cols, rows } = gridComputed;
  const {
    minSize = 2,
    splitVariance = 0.3,
    seed = 0,
  } = settings;

  const rng = mulberry32(seed);
  const regions = [];

  function subdivide(x, y, w, h, depth) {
    const canSplitH = w >= minSize * 2;
    const canSplitV = h >= minSize * 2;

    if (!canSplitH && !canSplitV) {
      regions.push({ x, y, w, h });
      return;
    }

    const stopChance = Math.min(0.4, depth * 0.08);
    if (depth > 2 && rng() < stopChance) {
      regions.push({ x, y, w, h });
      return;
    }

    const preferH = canSplitH && (!canSplitV || (w >= h ? rng() < 0.65 : rng() < 0.35));

    if (preferH && canSplitH) {
      const center = w / 2;
      const jitter = (rng() - 0.5) * w * splitVariance;
      const split = Math.max(minSize, Math.min(w - minSize, Math.round(center + jitter)));
      subdivide(x, y, split, h, depth + 1);
      subdivide(x + split, y, w - split, h, depth + 1);
    } else if (canSplitV) {
      const center = h / 2;
      const jitter = (rng() - 0.5) * h * splitVariance;
      const split = Math.max(minSize, Math.min(h - minSize, Math.round(center + jitter)));
      subdivide(x, y, w, split, depth + 1);
      subdivide(x, y + split, w, h - split, depth + 1);
    } else {
      regions.push({ x, y, w, h });
    }
  }

  subdivide(0, 0, cols, rows, 0);

  const pool = [...assets];
  return regions.map((r, i) => ({
    id: crypto.randomUUID(),
    assetId: pool[i % pool.length].id,
    cols: r.w,
    rows: r.h,
    svgContent: pool[i % pool.length].svgContent,
    name: pool[i % pool.length].name,
    gridCol: r.x,
    gridRow: r.y,
    colorSeed: Math.floor(rng() * 0x80000000),
    colorOffset: 0,
  }));
}
