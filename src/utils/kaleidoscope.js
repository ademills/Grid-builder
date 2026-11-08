// Radial repeat for the whole artboard (v1.16), in every mode: one wedge of
// the design -- 360° / count wide, centred on 12 o'clock at the artboard's
// centre -- drawn `count` times round the centre. mirror: every other copy
// is mirrored, as in a kaleidoscope, so neighbouring wedges meet seamlessly.
// The background isn't repeated; only the shapes.
//
// radialRepeat = { count: 1 (off) … 24, mirror: bool }

export const radialOn = (rr) => (rr?.count ?? 1) > 1;

export function wedgeAngles(count) {
  const step = (2 * Math.PI) / count;
  return { step, a0: -Math.PI / 2 - step / 2 };
}

// The source wedge as polygon points round (cx, cy), out to radius R, its
// sides opened by `pad` radians so copies overlap a hair (no seams).
export function wedgePoints(cx, cy, R, count, pad = 0) {
  const { step, a0 } = wedgeAngles(count);
  const pts = [[cx, cy]];
  const from = a0 - pad, to = a0 + step + pad;
  const n = Math.max(2, Math.ceil((to - from) / (Math.PI / 32)));
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return pts;
}

export const pointsToPath = (pts) => `M${pts.map(([x, y]) => `${+x.toFixed(3)} ${+y.toFixed(3)}`).join('L')}Z`;

// Copy k's linear map [a, b, c, d] (x' = a x + c y, y' = b x + d y, as
// canvas / SVG matrices) about the centre: a turn of k wedges, or with
// mirror, odd copies reflected across the wedge's edge first.
export function copyLinear(k, count, mirror) {
  const { step, a0 } = wedgeAngles(count);
  if (mirror && k % 2 === 1) {
    // Reflect across the edge between wedge 0 and wedge 1, then turn (k - 1) wedges.
    const phi = a0 + step, c2 = Math.cos(2 * phi), s2 = Math.sin(2 * phi);
    const t = (k - 1) * step, ct = Math.cos(t), st = Math.sin(t);
    // rotation(t) · reflection(phi)
    return [ct * c2 - st * s2, st * c2 + ct * s2, ct * s2 + st * c2, st * s2 - ct * c2];
  }
  const t = k * step, ct = Math.cos(t), st = Math.sin(t);
  return [ct, st, -st, ct];
}

// As an SVG / canvas matrix about (cx, cy).
export function copyMatrix(k, count, mirror, cx, cy) {
  const [a, b, c, d] = copyLinear(k, count, mirror);
  return [a, b, c, d, cx - a * cx - c * cy, cy - b * cx - d * cy];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Wraps an export's shapes group (data-layer="shapes" before the tidy pass,
// data-name="Shapes" after it) so its content is the source wedge, clipped,
// plus count − 1 turned (and mirrored) copies. size: { w, h } of the
// viewBox. Ids in the copies get a prefix so they stay unique.
export function radialSvg(svgEl, rr, { w, h }) {
  if (!radialOn(rr)) return svgEl;
  const doc = svgEl.ownerDocument;
  const find = (el) => {
    for (const c of [...el.childNodes]) {
      if (c.nodeType !== 1) continue;
      if (c.getAttribute('data-layer') === 'shapes' || c.getAttribute('data-name') === 'Shapes') return c;
    }
    return null;
  };
  const shapes = find(svgEl);
  if (!shapes) return svgEl;
  const count = Math.min(24, Math.round(rr.count));
  const cx = w / 2, cy = h / 2, R = Math.hypot(w, h);
  let defs = [...svgEl.childNodes].find(c => c.nodeType === 1 && (c.localName || c.tagName) === 'defs');
  if (!defs) { defs = doc.createElementNS(SVG_NS, 'defs'); svgEl.insertBefore(defs, svgEl.firstChild); }
  const clip = doc.createElementNS(SVG_NS, 'clipPath');
  clip.setAttribute('id', 'radial-wedge');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pointsToPath(wedgePoints(cx, cy, R, count, 0.0015)));
  clip.appendChild(path);
  defs.appendChild(clip);

  const source = doc.createElementNS(SVG_NS, 'g');
  source.setAttribute('id', 'radial_1');
  source.setAttribute('data-name', 'Radial 1');
  source.setAttribute('clip-path', 'url(#radial-wedge)');
  for (const c of [...shapes.childNodes]) source.appendChild(c);
  shapes.appendChild(source);
  for (let k = 1; k < count; k++) {
    const copy = source.cloneNode(true);
    copy.setAttribute('id', `radial_${k + 1}`);
    copy.setAttribute('data-name', `Radial ${k + 1}`);
    copy.setAttribute('transform', `matrix(${copyMatrix(k, count, !!rr.mirror, cx, cy).map(v => +v.toFixed(6)).join(' ')})`);
    const walk = (el) => {
      for (const c of [...el.childNodes]) {
        if (c.nodeType !== 1) continue;
        const id = c.getAttribute('id');
        if (id) c.setAttribute('id', `r${k + 1}_${id}`);
        walk(c);
      }
    };
    walk(copy);
    shapes.appendChild(copy);
  }
  return svgEl;
}
