// Plates from SVG (v1.14): an SVG's parts as shapes for Linework shape
// plates (shapeClip.js). The SVG is cleaned up as for a shape import
// (svgImport.js analyseSvg: fills resolved, nothing that runs code), drawn
// off-screen, and each filled element's outline sampled into rings in the
// SVG's own units, then merged by its fill rule.
//
// Parts, by `by`:
//   'group'  — the SVG's layers / top-level groups (descending through a
//              single wrapping group); loose shapes at that level stand alone
//   'colour' — every element of one fill colour together
//   'shape'  — each filled element on its own
//
// → { width, height, parts: [{ key, name, colour, box: { x, y, w, h },
//     rings (in the box, -0.5…0.5), d (an SVG path of it, in SVG units),
//     area (share of the SVG) }] } in drawing order.

import { analyseSvg } from '../svgImport';
import { SHAPE_SEL } from '../colorize';
import { unionRings, cleanRings, ringsArea } from './shapeClip';

const SKIP = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'script', 'clipPath', 'mask', 'pattern', 'symbol', 'marker', 'linearGradient', 'radialGradient']);
const kids = el => [...el.children].filter(c => !SKIP.has(c.localName));

const labelOf = (el) => el.getAttribute('inkscape:label') || el.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label')
  || el.getAttribute('data-name') || el.getAttribute('id') || null;

// An element's outline as rings in the root's user units.
function elementRings(el, root, step) {
  const ctm = el.getScreenCTM(), rootCtm = root.getScreenCTM();
  if (!ctm || !rootCtm) return [];
  const M = rootCtm.inverse().multiply(ctm);
  const map = (x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
  const name = el.localName;
  if ((name === 'polygon' || name === 'polyline') && el.points?.numberOfItems > 2) {
    return [[...Array(el.points.numberOfItems)].map((_, i) => { const p = el.points.getItem(i); return map(p.x, p.y); })];
  }
  if (name === 'rect' && !(parseFloat(el.getAttribute('rx')) > 0) && !(parseFloat(el.getAttribute('ry')) > 0)) {
    const x = el.x.baseVal.value, y = el.y.baseVal.value, w = el.width.baseVal.value, h = el.height.baseVal.value;
    return w > 0 && h > 0 ? [[map(x, y), map(x + w, y), map(x + w, y + h), map(x, y + h)]] : [];
  }
  if (typeof el.getTotalLength !== 'function') return [];
  const len = el.getTotalLength();
  if (!(len > 0)) return [];
  // Scale the sampling step into the element's own units.
  const unitScale = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
  const n = Math.min(6000, Math.max(16, Math.ceil(len * unitScale / step)));
  const gap = (len / n) * 2.5;
  const rings = [];
  let ring = [], prev = null;
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n);
    // A jump between samples is a new subpath (a moveto).
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > gap) { if (ring.length > 2) rings.push(ring); ring = []; }
    ring.push(map(p.x, p.y));
    prev = p;
  }
  if (ring.length > 2) rings.push(ring);
  return rings;
}

export async function svgShapes(text, { by = 'group' } = {}) {
  const analysis = await analyseSvg(text);
  const { width: W, height: H } = analysis;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  host.innerHTML = analysis.markup;
  const root = host.querySelector('svg');
  root.setAttribute('width', String(W));
  root.setAttribute('height', String(H));
  document.body.appendChild(host);
  try {
    // The level the groups are at: under analyseSvg's wrapper, through any
    // single group that wraps everything.
    let level = root.querySelector(':scope > g') ?? root;
    while (kids(level).length === 1 && kids(level)[0].localName === 'g') level = kids(level)[0];
    const tops = kids(level);

    const step = Math.max(W, H) / 600;
    const parts = new Map(); // key → { name, colour, rings: [...] }
    let loose = 0;
    for (const el of root.querySelectorAll(SHAPE_SEL)) {
      const colour = el.getAttribute('data-orig');
      if (!colour || el.closest('defs, clipPath, mask, pattern, symbol, marker')) continue;
      let key, name;
      if (by === 'colour') { key = colour; name = `Colour ${colour}`; }
      else if (by === 'shape') { key = `s${parts.size}`; name = labelOf(el) ?? `Shape ${parts.size + 1}`; }
      else {
        const top = tops.find(t => t === el || t.contains(el));
        const i = top ? tops.indexOf(top) : -1;
        key = `g${i}`;
        name = top && top.localName === 'g' ? labelOf(top) ?? `Group ${i + 1}` : (top && labelOf(top)) ?? `Shape ${++loose}`;
      }
      const rule = getComputedStyle(el).fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
      const own = unionRings(elementRings(el, root, step), rule);
      if (!own.length) continue;
      if (!parts.has(key)) parts.set(key, { key, name, colour, rings: [] });
      parts.get(key).rings.push(...own);
    }

    const out = [];
    for (const p of parts.values()) {
      const rings = cleanRings(unionRings(p.rings), step / 4);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of rings) for (const [x, y] of r) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const w = x1 - x0, h = y1 - y0;
      if (!(w > 0) || !(h > 0)) continue;
      const cx = x0 + w / 2, cy = y0 + h / 2;
      const r5 = v => Math.round(v * 1e5) / 1e5;
      out.push({
        key: p.key, name: p.name, colour: p.colour, box: { x: x0, y: y0, w, h },
        rings: rings.map(r => r.map(([x, y]) => [r5((x - cx) / w), r5((y - cy) / h)])),
        d: rings.map(r => `M${r.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join('L')}Z`).join(''),
        area: ringsArea(rings) / (W * H),
      });
    }
    return { width: W, height: H, parts: out };
  } finally {
    host.remove();
  }
}
