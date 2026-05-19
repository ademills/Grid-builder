export const PALETTES = {
  Vibrant:  ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
  Bold:     ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#264653'],
  Pastel:   ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF'],
  Earth:    ['#8B4513', '#D2691E', '#CD853F', '#A0522D', '#BC8F5F', '#F5DEB3'],
  Nordic:   ['#2E4057', '#048A81', '#54C6EB', '#8EE3EF', '#EEF5DB', '#3A86FF'],
  Sunset:   ['#FF3D00', '#FF6E40', '#FF9100', '#FFAB40', '#FFD740', '#FF6D00'],
  Forest:   ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'],
  Mono:     ['#1a1a1a', '#404040', '#666666', '#8C8C8C', '#B3B3B3', '#D9D9D9'],
};

export const PALETTE_KEYS = Object.keys(PALETTES);

// Mulberry32 seeded PRNG — gives consistent colours per block across re-renders
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randHsl(rand) {
  return `hsl(${Math.floor(rand() * 360)},${Math.floor(40 + rand() * 60)}%,${Math.floor(30 + rand() * 40)}%)`;
}

const SHAPE_SEL = 'rect, circle, ellipse, path, polygon, polyline';

function findLayer(root, name) {
  for (const g of root.querySelectorAll('g')) {
    const id    = (g.getAttribute('id') || '').toLowerCase();
    const label = (g.getAttribute('inkscape:label') || g.getAttribute('label') || '').toLowerCase();
    if (id.includes(name) || label.includes(name)) return g;
  }
  return null;
}

function applyFill(el, color) {
  const fill = el.getAttribute('fill');
  if (fill && fill !== 'none' && fill !== 'transparent') {
    el.setAttribute('fill', color);
  }
  const style = el.getAttribute('style');
  if (style) {
    el.setAttribute('style', style.replace(
      /\bfill\s*:\s*([^;'"]+)/g,
      (_, v) => (v.trim() !== 'none' && v.trim() !== 'transparent') ? `fill:${color}` : `fill:${v}`
    ));
  }
}

export function colorizeSvg(svgContent, mode, palette, bgChoice, seed = 0) {
  if (mode === 'none') return svgContent;

  let doc;
  try {
    doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svgContent;
  } catch {
    return svgContent;
  }

  const root = doc.documentElement;

  if (mode === 'random') {
    const rand = mulberry32(seed);
    root.querySelectorAll(SHAPE_SEL).forEach(el => applyFill(el, randHsl(rand)));
  } else if (mode === 'uniform') {
    const bgColor =
      bgChoice === 'black'   ? '#000000' :
      bgChoice === 'white'   ? '#ffffff' :
      palette[0]; // 'primary' → first palette swatch

    const bgLayer = findLayer(root, 'background') || findLayer(root, 'bg');
    if (bgLayer) {
      bgLayer.querySelectorAll(SHAPE_SEL).forEach(el => applyFill(el, bgColor));
    }

    const shapeLayer = findLayer(root, 'shape');
    if (shapeLayer) {
      const shapes = [...shapeLayer.querySelectorAll(SHAPE_SEL)];
      shapes.forEach((el, i) => applyFill(el, palette[i % palette.length]));
    }
  }

  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return svgContent;
  }
}
