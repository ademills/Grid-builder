// Export › Separations (v1.16): the artwork split by ink (flat colour), for
// screen printing, risograph or one pen per plotter pass.
//   - one SVG per ink, all the same size, or one SVG with a named group per ink
//   - each ink's shapes keep their place; where a shape has two colours (a
//     fill and an outline) each goes to its own ink
//   - optional registration marks and an ink label in a margin round the
//     artwork, the same on every ink so the sheets line up
//   - optionally every ink printed in black (for films / screens)
// The background (the paper) is left out. Gradients, mesh colours and
// images aren't flat inks, so they're left out too and counted.
// Overprint: shapes are as drawn; nothing is knocked out of the ink below.

import { collectShapes, normaliseColour, paintOf } from './svgGeometry';
import { svgLength } from './units';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PAINTED = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line']);
const nameOf = (el) => (el.localName || el.tagName || '').replace(/^svg:/, '').toLowerCase();

// The inks used, in the order they're first drawn, and what can't be split.
export function inksOf(svgEl) {
  const inks = [];
  let skipped = 0;
  for (const s of collectShapes(svgEl, { tol: 1e9 })) {
    if (s.inBackground) continue;
    const flat = [s.fill, s.stroke].filter(Boolean);
    const raw = s.rawFill?.trim().toLowerCase() ?? '';
    if (raw.startsWith('url(')) skipped++;
    for (const hex of flat) if (!inks.includes(hex)) inks.push(hex);
  }
  skipped += countImages(svgEl);
  return { inks, skipped };
}

function countImages(el) {
  let n = 0;
  for (const c of [...(el.childNodes ?? [])]) {
    if (c.nodeType !== 1) continue;
    if (nameOf(c) === 'image') n++;
    else n += countImages(c);
  }
  return n;
}

// Sets fill / stroke on the element itself, out of style="" too.
function setPaint(el, prop, value) {
  const style = el.getAttribute('style');
  if (style) {
    const rest = style.split(';').filter(d => d.split(':')[0]?.trim().toLowerCase() !== prop && d.trim());
    if (rest.length) el.setAttribute('style', rest.join(';'));
    else el.removeAttribute('style');
  }
  el.setAttribute(prop, value);
}

// Keeps only `hex` in a copy of the artwork's children, in place.
function keepInk(root, hex, black) {
  for (const child of [...(root.childNodes ?? [])]) {
    if (child.nodeType !== 1) { if (child.nodeType === 3 && !child.textContent.trim()) root.removeChild(child); continue; }
    const tag = nameOf(child);
    if (child.getAttribute('data-name') === 'Background' || tag === 'image' || tag === 'foreignobject' || tag === 'text') { root.removeChild(child); continue; }
    if (tag === 'defs' || tag === 'title' || tag === 'desc') continue;
    if (PAINTED.has(tag)) {
      const fill = normaliseColour(paintOf(child, 'fill')), stroke = normaliseColour(paintOf(child, 'stroke'));
      const hasFill = fill === hex, hasStroke = stroke === hex;
      if (!hasFill && !hasStroke) { root.removeChild(child); continue; }
      setPaint(child, 'fill', hasFill ? (black ? '#000000' : hex) : 'none');
      setPaint(child, 'stroke', hasStroke ? (black ? '#000000' : hex) : 'none');
      continue;
    }
    keepInk(child, hex, black);
    if (tag === 'g' && ![...child.childNodes].some(n => n.nodeType === 1)) root.removeChild(child);
  }
}

// Ids made unique per ink in the one-file version (url(#…) and href kept pointing at them).
function prefixIds(root, prefix) {
  const all = [];
  const walk = (el) => { for (const c of [...(el.childNodes ?? [])]) if (c.nodeType === 1) { all.push(c); walk(c); } };
  walk(root);
  const ids = new Set(all.map(el => el.getAttribute('id')).filter(Boolean));
  if (!ids.size) return;
  for (const el of all) {
    for (const a of [...el.attributes]) {
      if (a.name === 'id') el.setAttribute('id', prefix + a.value);
      else if (a.value.includes('#')) {
        const v = a.value.replace(/url\(#([^)]+)\)/g, (m, id) => (ids.has(id) ? `url(#${prefix}${id})` : m));
        const href = (a.name === 'href' || a.name === 'xlink:href') && v.startsWith('#') && ids.has(v.slice(1)) ? `#${prefix}${v.slice(1)}` : v;
        if (href !== a.value) el.setAttribute(a.name, href);
      }
    }
  }
}

// Registration marks (a target at each side's middle) and a label, in the margin.
function marks(doc, { x, y, w, h, m, colour, label }) {
  const g = doc.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', 'registration');
  g.setAttribute('data-name', 'Registration');
  g.setAttribute('fill', 'none');
  g.setAttribute('stroke', colour);
  g.setAttribute('stroke-width', String(+(m * 0.02).toFixed(3)));
  const r = m * 0.22, arm = m * 0.38;
  for (const [cx, cy] of [[x + w / 2, y - m / 2], [x + w / 2, y + h + m / 2], [x - m / 2, y + h / 2], [x + w + m / 2, y + h / 2]]) {
    const c = doc.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(+cx.toFixed(3))); c.setAttribute('cy', String(+cy.toFixed(3))); c.setAttribute('r', String(+r.toFixed(3)));
    g.appendChild(c);
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', `M${+(cx - arm).toFixed(3)} ${+cy.toFixed(3)}H${+(cx + arm).toFixed(3)}M${+cx.toFixed(3)} ${+(cy - arm).toFixed(3)}V${+(cy + arm).toFixed(3)}`);
    g.appendChild(p);
  }
  if (label) {
    const t = doc.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', String(+(x).toFixed(3)));
    t.setAttribute('y', String(+(y + h + m * 0.62).toFixed(3)));
    t.setAttribute('font-family', 'sans-serif');
    t.setAttribute('font-size', String(+(m * 0.26).toFixed(3)));
    t.setAttribute('fill', colour);
    t.setAttribute('stroke', 'none');
    t.textContent = label;
    g.appendChild(t);
  }
  return g;
}

/**
 * svgEl  — a tidied export (left unchanged)
 * options = {
 *   marks: bool, margin: in viewBox units (room for the marks),
 *   page: { width, height } the artboard in pt and units, for the new size,
 *   black: bool, colourName(hex) → name|null, title
 * }
 * → { inks: [{ hex, name, svg }], combined: <svg> with a group per ink, skipped }
 */
export function separations(svgEl, { marks: withMarks = false, margin = 0, page = null, units = 'px', black = false, colourName = () => null, title = null } = {}) {
  const doc = svgEl.ownerDocument;
  const { inks, skipped } = inksOf(svgEl);
  const vb = (svgEl.getAttribute('viewBox') || `0 0 ${svgEl.getAttribute('width')} ${svgEl.getAttribute('height')}`).split(/[\s,]+/).map(Number);
  const [x, y, w, h] = vb;
  const m = withMarks ? margin : 0;

  // Every sheet the same size: the artwork plus the margin.
  const frame = (el) => {
    for (const a of ['width', 'height', 'viewBox']) el.removeAttribute(a);
    el.setAttribute('viewBox', [x - m, y - m, w + 2 * m, h + 2 * m].map(v => +v.toFixed(3)).join(' '));
    if (page) {
      const k = m / (w / page.width); // the margin in pt
      el.setAttribute('width', svgLength(page.width + 2 * k, units));
      el.setAttribute('height', svgLength(page.height + 2 * k, units));
    }
  };
  const nameFor = (hex, i) => `Ink ${i + 1} ${colourName(hex) ? `${colourName(hex)} ` : ''}${hex}`;

  const sheets = inks.map((hex, i) => {
    const copy = svgEl.cloneNode(true);
    keepInk(copy, hex, black);
    frame(copy);
    const label = `${nameFor(hex, i)} · ${i + 1} of ${inks.length}${title ? ` · ${title}` : ''}`;
    if (withMarks) copy.appendChild(marks(doc, { x, y, w, h, m, colour: black ? '#000000' : hex, label }));
    return { hex, name: nameFor(hex, i), svg: copy };
  });

  // One file: each ink's sheet as a group.
  const combined = doc.createElementNS(SVG_NS, 'svg');
  combined.setAttribute('xmlns', SVG_NS);
  frame(combined);
  if (title) {
    const t = doc.createElementNS(SVG_NS, 'title');
    t.textContent = title;
    combined.appendChild(t);
  }
  inks.forEach((hex, i) => {
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('id', `ink_${i + 1}_${hex.slice(1)}`);
    g.setAttribute('data-name', nameFor(hex, i));
    const copy = svgEl.cloneNode(true);
    keepInk(copy, hex, black);
    prefixIds(copy, `i${i + 1}_`);
    for (const c of [...copy.childNodes]) {
      if (c.nodeType !== 1 || nameOf(c) === 'title') continue;
      if (nameOf(c) === 'defs') { combined.insertBefore(c, combined.firstChild); continue; }
      g.appendChild(c);
    }
    combined.appendChild(g);
  });
  if (withMarks) combined.appendChild(marks(doc, { x, y, w, h, m, colour: '#000000', label: title }));
  return { inks: sheets, combined, skipped };
}
