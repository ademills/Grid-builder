import {
  SHAPE_SEL, findLayer, buildClassFillMap, parseTransformMatrix, concatMat, applyMat, getShapePoints,
} from './colorize';

// A shape's SVG parsed once into canvas paths, for the canvas renderer
// (components/ShapeCanvas.jsx). Each fillable element becomes
//   { path, rule, slot, paintable, fixed, opacity, centre, pts }
//   path      — Path2D in viewBox coordinates, its transforms baked in
//   rule      — 'nonzero' | 'evenodd'
//   slot      — the element's colour slot, numbered exactly as colorize.js
//               numbers them (background layer, then shape layer, else
//               document order), or -1 when colour modes never touch it
//   paintable — colour modes and pins recolour it (colorize's applyFill
//               would change it); otherwise it keeps `fixed`
//   fixed     — its own fill from the artwork as #rrggbb, or null for none
//   centre    — average anchor point (viewBox coords), where continuous
//               animations sample their colour
//   pts       — anchor points image colour mode samples (as export does)
//
// Fixed fills come from the browser's computed style, so classes, inline
// styles and inherited group fills resolve exactly as they do in SVG.

const cache = new Map(); // svgContent → model | null

function rgbToHex(rgb) {
  const m = rgb.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('')}`;
}

// Mirrors colorize.js applyFill: does a colour mode actually recolour `el`?
function isPaintable(el, classFillMap) {
  const fill = el.getAttribute('fill');
  if (fill && fill !== 'none' && fill !== 'transparent') return true;
  const style = el.getAttribute('style') || '';
  const m = style.match(/\bfill\s*:\s*([^;'"]+)/);
  if (m) return m[1].trim() !== 'none' && m[1].trim() !== 'transparent';
  const cls = (el.getAttribute('class') || '').trim().split(/\s+/);
  return cls.some(c => classFillMap[c]);
}

const num = (el, a) => parseFloat(el.getAttribute(a)) || 0;

function elementPath(el) {
  const tag = el.tagName.toLowerCase().split(':').pop();
  const p = new Path2D();
  if (tag === 'path') return new Path2D(el.getAttribute('d') || '');
  if (tag === 'rect') {
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    const rx = num(el, 'rx') || num(el, 'ry');
    if (rx && p.roundRect) p.roundRect(x, y, w, h, rx);
    else p.rect(x, y, w, h);
    return p;
  }
  if (tag === 'circle') { p.arc(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), 0, Math.PI * 2); return p; }
  if (tag === 'ellipse') { p.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'), 0, 0, Math.PI * 2); return p; }
  if (tag === 'polygon' || tag === 'polyline') {
    const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).filter(v => !isNaN(v));
    for (let i = 0; i + 1 < n.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, n[i], n[i + 1]);
    p.closePath();
    return p;
  }
  return null;
}

function build(svgContent) {
  const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const root = doc.documentElement;
  const classFillMap = buildClassFillMap(root);

  const vbStr = root.getAttribute('viewBox');
  const vb = vbStr
    ? vbStr.trim().split(/[\s,]+/).map(Number)
    : [0, 0, parseFloat(root.getAttribute('width')) || 100, parseFloat(root.getAttribute('height')) || 100];

  // Slot numbering, as in colorize.js buildColorTemplate.
  const slotOf = new Map();
  const bgLayer = findLayer(root, 'background') || findLayer(root, 'bg');
  const shapeLayer = findLayer(root, 'shape');
  const slotEls = (bgLayer || shapeLayer)
    ? [...(bgLayer ? bgLayer.querySelectorAll(SHAPE_SEL) : []), ...(shapeLayer ? shapeLayer.querySelectorAll(SHAPE_SEL) : [])]
    : [...root.querySelectorAll(SHAPE_SEL)];
  slotEls.forEach((el, i) => slotOf.set(el, i));

  // Attach briefly so the browser resolves each element's computed fill.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  const live = document.importNode(root, true);
  host.appendChild(live);
  document.body.appendChild(host);

  const elements = [];
  const liveEls = [...live.querySelectorAll('*')];
  const srcEls = [...root.querySelectorAll('*')];
  try {
    const walk = (node, parentMat) => {
      const mat = concatMat(parentMat, parseTransformMatrix(node.getAttribute('transform') || ''));
      const tag = node.tagName.toLowerCase().split(':').pop();
      const raw = SHAPE_SEL.includes(tag) ? elementPath(node) : null;
      if (raw) {
        const style = getComputedStyle(liveEls[srcEls.indexOf(node)]);
        const path = new Path2D();
        path.addPath(raw, new DOMMatrix(mat));
        const pts = getShapePoints(node).map(([x, y]) => applyMat(mat, x, y));
        const centre = pts.length
          ? [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
          : [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
        elements.push({
          path,
          rule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
          slot: slotOf.has(node) ? slotOf.get(node) : -1,
          paintable: slotOf.has(node) && isPaintable(node, classFillMap),
          fixed: style.fill === 'none' ? null : rgbToHex(style.fill),
          opacity: (parseFloat(style.fillOpacity) || 1) * (parseFloat(style.opacity) || 1),
          centre,
          pts,
        });
      }
      for (const child of node.children) walk(child, mat);
    };
    walk(root, [1, 0, 0, 1, 0, 0]);
  } finally {
    host.remove();
  }
  return { vb, elements };
}

export function getShapeModel(svgContent) {
  if (!svgContent) return null;
  if (!cache.has(svgContent)) {
    let model;
    try { model = build(svgContent); } catch { model = null; }
    cache.set(svgContent, model);
  }
  return cache.get(svgContent);
}
