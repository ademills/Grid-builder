export const PALETTES = {
  // ── Originals ────────────────────────────────────────────
  Vibrant:  ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'],
  Bold:     ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#264653'],
  Pastel:   ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF'],
  Earth:    ['#8B4513', '#D2691E', '#CD853F', '#A0522D', '#BC8F5F', '#F5DEB3'],
  Nordic:   ['#2E4057', '#048A81', '#54C6EB', '#8EE3EF', '#EEF5DB', '#3A86FF'],
  Sunset:   ['#FF3D00', '#FF6E40', '#FF9100', '#FFAB40', '#FFD740', '#FF6D00'],
  Forest:   ['#1B4332', '#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'],
  Mono:     ['#1a1a1a', '#404040', '#666666', '#8C8C8C', '#B3B3B3', '#D9D9D9'],
  // San Antonio Spurs — current black + silver, plus retro fuchsia/teal/orange (1989–2002)
  Spurs:    ['#000000', '#C4CED4', '#8D9093', '#EF426F', '#00B2A9', '#FF8200'],

  // ── Art movements & decades ──────────────────────────────
  Synthwave:    ['#0d0221', '#261447', '#ff2975', '#f222ff', '#00b4d8', '#2de2e6'],
  Vaporwave:    ['#ff71ce', '#b967ff', '#05ffa1', '#01cdfe', '#fffb96', '#ff6e92'],
  'Neon 80s':   ['#ff0080', '#ff8c00', '#ffee00', '#00ff41', '#00b4ff', '#bf00ff'],
  'Miami 80s':  ['#ff6eb4', '#00b4d8', '#fdfd96', '#77dd77', '#ffb347', '#c5a3ff'],
  'Grunge 90s': ['#2d2d2d', '#5a4a42', '#8b7355', '#b5a642', '#6b8e23', '#c4a882'],
  'Pop 90s':    ['#ff6663', '#feb144', '#fdff8b', '#9ee09e', '#9ec1cf', '#cc99c9'],
  'Groovy 70s': ['#c5602e', '#e8923a', '#f2c44e', '#8c9e3e', '#8b6914', '#d4874e'],
  Disco:        ['#c8531a', '#d4a017', '#f0c14b', '#8b6914', '#4a2c0a', '#e8d5a0'],
  'Art Deco':   ['#1a1a1a', '#d4af37', '#b8860b', '#f5f0e0', '#8b7355', '#2c2c2c'],
  Bauhaus:      ['#000000', '#e63329', '#2356ae', '#f9c825', '#ffffff', '#808080'],
  'Pop Art':    ['#ff0000', '#ffff00', '#0000ff', '#ff69b4', '#00cc44', '#ff6600'],
  Postmodern:   ['#ff3366', '#33ccff', '#ffcc00', '#9966ff', '#ff6600', '#00ff99'],
  Minimalist:   ['#f5f5f0', '#ddd8cc', '#a09880', '#50483c', '#1e1c18', '#c4a882'],
  Brutalist:    ['#000000', '#ffffff', '#ff0000', '#0055ff', '#ffdd00', '#555555'],
  Urban:        ['#2b2d42', '#8d99ae', '#ef233c', '#fcbf49', '#edf2f4', '#d90429'],
  Memphis:      ['#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#073b4c'],
  Cyberpunk:    ['#0d0d0d', '#ff003c', '#00ff9c', '#00b4ff', '#ff9000', '#7b2fff'],
  'Lo-Fi':      ['#f8c8a0', '#e8a87c', '#c87856', '#9a5c38', '#5c3720', '#f0e0d0'],
  Kodachrome:   ['#d64e2a', '#e8923a', '#f5c842', '#4a8a3c', '#2b5a8c', '#9c3a2a'],
  Cassette:     ['#e8e0d0', '#c8c0b0', '#8a8070', '#404038', '#c04020', '#208090'],

  // ── Popular / trending ───────────────────────────────────
  // Full-spectrum rainbow
  Rainbow:  ['#EE4035', '#F37736', '#FDF498', '#7BC043', '#0392CF', '#CC2299'],
  // Bold UI primaries (inspired by Metro / Material palettes)
  Metro:    ['#D11141', '#00B159', '#00AEDB', '#F37735', '#FFC425', '#7B2FBE'],
  // Classic deep-ocean blues
  Ocean:    ['#011F4B', '#03396C', '#005B96', '#6497B1', '#B3CDE0', '#E8F4F8'],
  // Purple cosmic — dark violet into warm gold
  Cosmic:   ['#2E003E', '#3D1E6D', '#8874A3', '#C5A3D1', '#F6CD61', '#FE8A71'],
  // Coffee-shop warm browns
  Cafe:     ['#3C2F2F', '#4B3832', '#854442', '#BE9B7B', '#FFF4E6', '#E8D5B7'],
  // Soft botanical pastels (distinct from the lighter Pastel palette)
  Garden:   ['#88D8B0', '#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5', '#FF8B94'],
  // Warm tropical beach
  Tropical: ['#45B29D', '#96CEB4', '#FFEEAD', '#FFCC5C', '#FF6F69', '#FF9966'],
  // Dark moody night — deep navy into hot pink
  Midnight: ['#1A1A2E', '#16213E', '#0F3460', '#533483', '#E94560', '#F5A623'],
  // Autumn harvest — rust, amber, teal accent
  Harvest:  ['#4F372D', '#CC2A36', '#EB6841', '#EDC951', '#00A0B0', '#BEE5D3'],
  // Classic preppy navy
  Navy:     ['#1E1F26', '#283655', '#4D648D', '#7395AE', '#D0E1F9', '#FFFFFF'],
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


const SHAPE_SEL = 'rect, circle, ellipse, path, polygon, polyline';

function findLayer(root, name) {
  for (const g of root.querySelectorAll('g')) {
    const id    = (g.getAttribute('id') || '').toLowerCase();
    const label = (g.getAttribute('inkscape:label') || g.getAttribute('label') || '').toLowerCase();
    if (id.includes(name) || label.includes(name)) return g;
  }
  return null;
}

// Build a map of CSS class name → fill colour from <style> blocks in the SVG.
// Needed because many SVG exporters (Illustrator, etc.) use class-based fills
// rather than direct fill attributes.
function buildClassFillMap(root) {
  const map = {};
  root.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent || '';
    for (const [, cls, fill] of text.matchAll(/\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs)) {
      const f = fill.trim();
      if (f !== 'none' && f !== 'transparent') map[cls] = f;
    }
  });
  return map;
}

function applyFill(el, color, classFillMap) {
  const fill  = el.getAttribute('fill');
  const style = el.getAttribute('style') || '';

  if (fill && fill !== 'none' && fill !== 'transparent') {
    // Direct presentation attribute
    el.setAttribute('fill', color);
    return;
  }

  if (/\bfill\s*:/.test(style)) {
    // Inline style fill
    el.setAttribute('style', style.replace(
      /\bfill\s*:\s*([^;'"]+)/g,
      (_, v) => (v.trim() !== 'none' && v.trim() !== 'transparent') ? `fill:${color}` : `fill:${v}`
    ));
    return;
  }

  // Class-based fill — add inline style to override (inline > class specificity)
  const cls = el.getAttribute('class') || '';
  if (cls && classFillMap) {
    const hasFillClass = cls.trim().split(/\s+/).some(c => classFillMap[c]);
    if (hasFillClass) {
      el.setAttribute('style', `${style}${style ? ';' : ''}fill:${color}`);
    }
  }
}

export function colorizeSvg(svgContent, mode, palette, seed = 0, colorOffset = 0, bgWhite = '#ffffff', bgBlack = '#000000') {
  if (mode === 'none') return svgContent;

  let doc;
  try {
    doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return svgContent;
  } catch {
    return svgContent;
  }

  const root = doc.documentElement;
  const classFillMap = buildClassFillMap(root);
  const rand = mulberry32(seed);

  const bgLayer    = findLayer(root, 'background') || findLayer(root, 'bg');
  const shapeLayer = findLayer(root, 'shape');
  const hasLayers  = bgLayer || shapeLayer;

  if (mode === 'random') {
    if (hasLayers) {
      // Background → random pick from the palette
      if (bgLayer) {
        bgLayer.querySelectorAll(SHAPE_SEL).forEach(el => {
          applyFill(el, palette[Math.floor(rand() * palette.length)], classFillMap);
        });
      }
      // Shapes → random picks from the selected palette
      if (shapeLayer) {
        shapeLayer.querySelectorAll(SHAPE_SEL).forEach(el => {
          applyFill(el, palette[Math.floor(rand() * palette.length)], classFillMap);
        });
      }
    } else {
      // No named layers — colour everything with random palette picks
      root.querySelectorAll(SHAPE_SEL).forEach(el => {
        applyFill(el, palette[Math.floor(rand() * palette.length)], classFillMap);
      });
    }
  } else if (mode === 'uniform') {
    // Background randomly draws from: customWhite, customBlack, or palette[0] (seeded per block)
    const bgOptions = [bgWhite, bgBlack, palette[0]];
    const bgColor   = bgOptions[Math.floor(rand() * bgOptions.length)];

    if (hasLayers) {
      if (bgLayer) {
        bgLayer.querySelectorAll(SHAPE_SEL).forEach(el => applyFill(el, bgColor, classFillMap));
      }
      // Shapes → palette colours in order, starting at index 1, shifted by colorOffset
      if (shapeLayer) {
        const shapes = [...shapeLayer.querySelectorAll(SHAPE_SEL)];
        shapes.forEach((el, i) => applyFill(el, palette[(i + 1 + colorOffset) % palette.length], classFillMap));
      }
    } else {
      // No named layers — sequential from palette[0], shifted by colorOffset
      const shapes = [...root.querySelectorAll(SHAPE_SEL)];
      shapes.forEach((el, i) => applyFill(el, palette[(i + colorOffset) % palette.length], classFillMap));
    }
  }

  try {
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return svgContent;
  }
}
