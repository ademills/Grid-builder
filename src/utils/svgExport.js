// Tidies the exported SVG for Illustrator, Photoshop and Figma (8.11).
// buildFlatSvgElement (DocumentEditor) produces the artwork; this pass:
//   - puts the background, shapes and layout reference in named top-level
//     groups, and the shapes in sub-groups by colour, shape or manual group,
//     so the layers panel in each app reads sensibly
//   - names every shape group (id + data-name: Illustrator reads data-name,
//     Figma the id)
//   - removes the duplicate ids, classes, invisible fill:none paths and empty
//     wrapper groups that each shape's source SVG brings with it
//   - writes fills as attributes, and rounds coordinates
//   - optionally reuses repeated identical shapes with <use> (smaller files;
//     Figma imports these less tidily, so it's off by default)
// Shapes keep their transforms rather than being flattened into the paths.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const NUMERIC_ATTRS = ['d', 'points', 'transform', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2'];
const PAINTED = 'rect,circle,ellipse,path,polygon,polyline,line';

// Ids must be unique XML names; keep them readable for layer panels.
function makeIdFactory() {
  const used = new Set();
  return (name) => {
    let base = String(name).normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'layer';
    if (!/^[A-Za-z_]/.test(base)) base = `_${base}`;
    let id = base, n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    return id;
  };
}

function roundNumbers(value, precision) {
  const f = 10 ** precision;
  return value.replace(/-?\d*\.\d+(?:e-?\d+)?|-?\d+e-?\d+/gi, (m) => {
    const v = Math.round(parseFloat(m) * f) / f;
    return Object.is(v, -0) ? '0' : String(v);
  });
}

// Moves `fill: x` / `fill-opacity` out of style="" into attributes.
function styleToAttributes(el) {
  const style = el.getAttribute('style');
  if (!style) return;
  const keep = [];
  for (const decl of style.split(';')) {
    const [prop, ...rest] = decl.split(':');
    const key = prop?.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (!key || !val) continue;
    if (key === 'fill' || key === 'fill-opacity' || key === 'opacity' || key === 'stroke' || key === 'stroke-width') el.setAttribute(key, val);
    else keep.push(`${key}:${val}`);
  }
  if (keep.length) el.setAttribute('style', keep.join(';'));
  else el.removeAttribute('style');
}

const isInvisible = (el) => {
  const fill = el.getAttribute('fill');
  const stroke = el.getAttribute('stroke');
  const noFill = fill === 'none' || fill === 'transparent';
  const noStroke = !stroke || stroke === 'none' || stroke === 'transparent';
  return (noFill && noStroke) || el.getAttribute('opacity') === '0';
};

// Cleans one shape's content (everything inside its placement group).
function cleanContent(root, precision) {
  for (const el of [...root.querySelectorAll('title,desc,metadata,style')]) el.remove();
  for (const el of [...root.querySelectorAll('defs')]) if (!el.children.length) el.remove();
  // Ids only matter if something inside points at them (gradients, clips…).
  const referenced = !!root.querySelector('[fill^="url("],[clip-path],[mask],[filter],use');
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el !== root && !referenced) el.removeAttribute('id');
    el.removeAttribute('class');
    el.removeAttribute('data-name');
    styleToAttributes(el);
    for (const attr of [...el.attributes]) {
      if (/^(sodipodi|inkscape|xml:space)/.test(attr.name)) el.removeAttribute(attr.name);
      else if (NUMERIC_ATTRS.includes(attr.name)) el.setAttribute(attr.name, roundNumbers(attr.value, precision));
    }
  }
  for (const el of [...root.querySelectorAll(PAINTED)]) if (isInvisible(el)) el.remove();
  // Unwrap groups that no longer do anything; drop empty ones.
  for (const g of [...root.querySelectorAll('g')].reverse()) {
    if (!g.children.length) { g.remove(); continue; }
    if (!g.attributes.length) g.replaceWith(...g.childNodes);
  }
  for (const n of [...root.childNodes]) if (n.nodeType === 8 || (n.nodeType === 3 && !n.textContent.trim())) n.remove();
}

// The most used fill in an element (for grouping by colour when the colour
// mode can't say, e.g. Image mode).
function commonFill(el) {
  const counts = new Map();
  for (const p of el.querySelectorAll(PAINTED)) {
    const f = p.getAttribute('fill');
    if (f && f !== 'none') counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * svgEl     — the <svg> from buildFlatSvgElement (shape groups tagged data-block)
 * blocks    — the exported blocks, indexed by data-block
 * options   = { groupBy: 'colour'|'shape'|'group'|'none', reuse, precision, title,
 *               colourOf(block) → hex|null, colourName(hex) → name|null, groupNames }
 */
export function tidySvg(svgEl, blocks, { groupBy = 'colour', reuse = false, precision = 2, title, colourOf, colourName, groupNames = {} } = {}) {
  const doc = svgEl.ownerDocument;
  const idFor = makeIdFactory();
  const make = (tag) => doc.createElementNS(SVG_NS, tag);
  const named = (tag, name, idName = name) => {
    const el = make(tag);
    el.setAttribute('id', idFor(idName));
    el.setAttribute('data-name', name);
    return el;
  };

  const shapesRoot = svgEl.querySelector('[data-layer="shapes"]');
  const reference = svgEl.querySelector('#layout-reference');

  // Background: whatever sits before the shapes.
  const background = named('g', 'Background');
  for (const child of [...svgEl.children]) {
    if (child === shapesRoot || child === reference) break;
    background.appendChild(child);
  }
  if (background.children.length) svgEl.insertBefore(background, svgEl.firstChild);

  if (reference) {
    reference.setAttribute('id', idFor('Layout reference'));
    reference.setAttribute('data-name', 'Layout reference');
  }

  if (shapesRoot) {
    shapesRoot.removeAttribute('data-layer');
    shapesRoot.setAttribute('id', idFor('Shapes'));
    shapesRoot.setAttribute('data-name', 'Shapes');

    const sub = new Map(); // group key → <g>
    const groupOrder = [];
    const groupNumber = new Map();
    for (const el of [...shapesRoot.children]) {
      const block = blocks[+el.getAttribute('data-block')];
      el.removeAttribute('data-block');
      cleanContent(el, precision);
      if (!block) continue;

      const label = block.name ?? (block.type === 'image' ? 'Image' : block.type === 'text' ? (block.text || 'Text').slice(0, 24) : 'Shape');
      el.setAttribute('id', idFor(`${label}_${block.gridCol + 1}_${block.gridRow + 1}`));
      el.setAttribute('data-name', `${label} (${block.gridCol + 1}, ${block.gridRow + 1})`);

      if (groupBy === 'none') continue;
      let key, name;
      if (groupBy === 'shape') {
        key = block.assetId ?? block.type ?? 'other';
        name = label;
      } else if (groupBy === 'group') {
        key = block.groupId ?? '';
        if (key && !groupNumber.has(key)) groupNumber.set(key, groupNumber.size + 1);
        name = key ? (groupNames[key] || `Group ${groupNumber.get(key)}`) : 'Ungrouped';
      } else {
        const hex = (colourOf?.(block) ?? commonFill(el) ?? 'none').toLowerCase();
        key = hex;
        const swatch = hex !== 'none' ? colourName?.(hex) : null;
        name = swatch ? `${swatch} ${hex}` : hex === 'none' ? 'No colour' : hex;
      }
      if (!sub.has(key)) { sub.set(key, named('g', name, groupBy === 'colour' ? `colour_${name.replace('#', '')}` : name)); groupOrder.push(key); }
      sub.get(key).appendChild(el);
    }
    // Biggest groups first, as in the Layers panel; "Ungrouped" last.
    groupOrder
      .sort((a, b) => (a === '') - (b === '') || sub.get(b).children.length - sub.get(a).children.length)
      .forEach(k => shapesRoot.appendChild(sub.get(k)));

    if (reuse) reuseRepeats(svgEl, shapesRoot, make, idFor);
  }

  if (title) {
    const t = make('title');
    t.textContent = title;
    svgEl.insertBefore(t, svgEl.firstChild);
  }
  return svgEl;
}

// Shapes whose cleaned content is identical (same shape, same colours) are
// defined once and placed with <use>.
function reuseRepeats(svgEl, shapesRoot, make, idFor) {
  const placements = [...shapesRoot.querySelectorAll('g[transform]')].filter(g => g.children.length && !g.querySelector('use'));
  const byContent = new Map();
  for (const g of placements) {
    const key = [...g.childNodes].map(n => new XMLSerializer().serializeToString(n)).join('');
    if (!byContent.has(key)) byContent.set(key, []);
    byContent.get(key).push(g);
  }
  let defs = null;
  for (const group of byContent.values()) {
    if (group.length < 2) continue;
    defs ??= svgEl.insertBefore(make('defs'), svgEl.querySelector('g'));
    const def = make('g');
    const id = idFor('shape');
    def.setAttribute('id', id);
    for (const child of [...group[0].childNodes]) def.appendChild(child.cloneNode(true));
    defs.appendChild(def);
    for (const g of group) {
      g.replaceChildren();
      const use = make('use');
      use.setAttribute('href', `#${id}`);
      use.setAttributeNS(XLINK_NS, 'xlink:href', `#${id}`);
      g.appendChild(use);
    }
  }
}
