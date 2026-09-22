import { mulberry32 } from './rng';

const PHI = (1 + Math.sqrt(5)) / 2;
const PHI_INV = 1 / PHI;

export function generateGoldenLayout(assets, gridComputed, settings) {
  if (!assets.length || !gridComputed) return [];
  const { cols, rows } = gridComputed;
  const {
    minSize = 2,
    maxDepth = 6,
    alternate = true,
    seed = 0,
  } = settings;

  const rng = mulberry32(seed);
  const regions = [];

  function subdivide(x, y, w, h, depth, horizontal) {
    if (depth >= maxDepth || (w < minSize * 2 && h < minSize * 2)) {
      regions.push({ x, y, w, h });
      return;
    }

    if (horizontal && w >= minSize * 2) {
      const split = Math.max(minSize, Math.min(w - minSize, Math.round(w * PHI_INV)));
      const flipOrder = rng() < 0.5;
      if (flipOrder) {
        subdivide(x, y, w - split, h, depth + 1, alternate ? !horizontal : horizontal);
        regions.push({ x: x + w - split, y, w: split, h });
      } else {
        regions.push({ x, y, w: split, h });
        subdivide(x + split, y, w - split, h, depth + 1, alternate ? !horizontal : horizontal);
      }
    } else if (h >= minSize * 2) {
      const split = Math.max(minSize, Math.min(h - minSize, Math.round(h * PHI_INV)));
      const flipOrder = rng() < 0.5;
      if (flipOrder) {
        subdivide(x, y, w, h - split, depth + 1, alternate ? !horizontal : horizontal);
        regions.push({ x, y: y + h - split, w, h: split });
      } else {
        regions.push({ x, y, w, h: split });
        subdivide(x, y + split, w, h - split, depth + 1, alternate ? !horizontal : horizontal);
      }
    } else {
      regions.push({ x, y, w, h });
    }
  }

  subdivide(0, 0, cols, rows, 0, cols >= rows);

  const pool = [...assets];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

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
