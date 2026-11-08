// Geometry for the plotter and separations passes (v1.16): SVG transforms
// and path data turned into plain polylines in the root's coordinates.
//
// Uses only getAttribute / childNodes / tagName, so it runs on the browser's
// DOM and on @xmldom/xmldom in tests.

// ── Transforms ───────────────────────────────────────────────────────────────
// A matrix is [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f.
export const IDENTITY = [1, 0, 0, 1, 0, 0];
export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function parseTransform(text) {
  let m = IDENTITY;
  if (!text) return m;
  for (const [, fn, args] of String(text).matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let t = IDENTITY;
    if (fn === 'matrix' && a.length === 6) t = a;
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      t = [c, s, -s, c, 0, 0];
      if (a.length >= 3) t = multiply(multiply([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === 'skewX') t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, t);
  }
  return m;
}

// ── Path data → polylines ────────────────────────────────────────────────────
// Each subpath becomes { pts: [[x, y]…], closed }. Curves and arcs are split
// into straight pieces no more than `tol` from the curve.

const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function tokens(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) out.push(m[1] ?? +m[2]);
  return out;
}

const curveSteps = (len, tol) => Math.max(2, Math.min(128, Math.ceil(Math.sqrt(len / Math.max(tol, 1e-9)) * 0.7)));

function cubic(out, p0, p1, p2, p3, tol) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = curveSteps(len, tol);
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

function quad(out, p0, p1, p2, tol) {
  cubic(out, p0, [p0[0] + (2 / 3) * (p1[0] - p0[0]), p0[1] + (2 / 3) * (p1[1] - p0[1])],
    [p2[0] + (2 / 3) * (p1[0] - p2[0]), p2[1] + (2 / 3) * (p1[1] - p2[1])], p2, tol);
}

// SVG arc (endpoint form) → points, via the centre form (SVG spec F.6.5).
function arc(out, p0, rx, ry, phi, large, sweep, p1, tol) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || (p0[0] === p1[0] && p0[1] === p1[1])) { out.push(p1); return; }
  const r = (phi * Math.PI) / 180, cp = Math.cos(r), sp = Math.sin(r);
  const dx = (p0[0] - p1[0]) / 2, dy = (p0[1] - p1[1]) / 2;
  const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * rx * y1) / ry, cyp = (-k * ry * x1) / rx;
  const cx = cp * cxp - sp * cyp + (p0[0] + p1[0]) / 2, cy = sp * cxp + cp * cyp + (p0[1] + p1[1]) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t0 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = curveSteps(Math.abs(dt) * Math.max(rx, ry), tol);
  for (let i = 1; i <= n; i++) {
    const t = t0 + (dt * i) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
    out.push(i === n ? p1 : [cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]);
  }
}

export function pathPolylines(d, tol = 0.1) {
  const tk = tokens(d || '');
  const subs = [];
  let cur = null, pos = [0, 0], start = [0, 0], lastCtrl = null, lastCmd = '';
  let i = 0, cmd = '';
  const num = () => tk[i++];
  while (i < tk.length) {
    if (typeof tk[i] === 'string') cmd = tk[i++];
    else if (!cmd) { i++; continue; }
    const lc = cmd.toLowerCase(), rel = cmd !== cmd.toUpperCase();
    if (lc === 'z') {
      if (cur) { cur.closed = true; pos = start; }
      cur = null; lastCtrl = null; lastCmd = 'z';
      continue;
    }
    if (tk.length - i < ARGS[lc] || tk.slice(i, i + ARGS[lc]).some(t => typeof t === 'string')) { i++; continue; }
    const P = (x, y) => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    if (!cur && lc !== 'm') { cur = { pts: [pos], closed: false }; subs.push(cur); }
    if (lc === 'm') {
      pos = P(num(), num());
      start = pos;
      cur = { pts: [pos], closed: false };
      subs.push(cur);
      cmd = rel ? 'l' : 'L'; // more pairs after a moveto are linetos
      lastCtrl = null;
      lastCmd = 'm';
      continue;
    }
    let next, ctrl = null;
    if (lc === 'l') { next = P(num(), num()); cur.pts.push(next); }
    else if (lc === 'h') { const x = num(); next = [rel ? pos[0] + x : x, pos[1]]; cur.pts.push(next); }
    else if (lc === 'v') { const y = num(); next = [pos[0], rel ? pos[1] + y : y]; cur.pts.push(next); }
    else if (lc === 'c' || lc === 's') {
      let c1;
      if (lc === 'c') c1 = P(num(), num());
      else c1 = lastCtrl && /[cs]/.test(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
      ctrl = P(num(), num());
      next = P(num(), num());
      cubic(cur.pts, pos, c1, ctrl, next, tol);
    } else if (lc === 'q' || lc === 't') {
      if (lc === 'q') ctrl = P(num(), num());
      else ctrl = lastCtrl && /[qt]/.test(lastCmd) ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
      next = P(num(), num());
      quad(cur.pts, pos, ctrl, next, tol);
    } else if (lc === 'a') {
      const rx = num(), ry = num(), phi = num(), large = num(), sweep = num();
      next = P(num(), num());
      arc(cur.pts, pos, rx, ry, phi, !!large, !!sweep, next, tol);
    }
    lastCtrl = ctrl;
    lastCmd = lc;
    pos = next;
  }
  return subs.filter(s => s.pts.length > 1);
}

// One painted element's outline as polylines in its own coordinates, or
// null for anything that isn't a shape (images, text).
const num = (el, a, d = 0) => { const v = parseFloat(el.getAttribute(a)); return Number.isFinite(v) ? v : d; };
const nameOf = (el) => (el.localName || el.tagName || '').replace(/^svg:/, '').toLowerCase();

export function elementPolylines(el, tol) {
  const tag = nameOf(el);
  if (tag === 'path') return pathPolylines(el.getAttribute('d'), tol);
  if (tag === 'rect') {
    const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height');
    if (!(w > 0 && h > 0)) return [];
    let rx = num(el, 'rx', NaN), ry = num(el, 'ry', NaN);
    if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0;
    if (!Number.isFinite(ry)) ry = rx;
    rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx || !ry) return [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true }];
    return pathPolylines(`M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
      + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`, tol);
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(el, 'cx'), cy = num(el, 'cy');
    const rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx'), ry = tag === 'circle' ? rx : num(el, 'ry');
    if (!(rx > 0 && ry > 0)) return [];
    return pathPolylines(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`, tol);
  }
  if (tag === 'line') return [{ pts: [[num(el, 'x1'), num(el, 'y1')], [num(el, 'x2'), num(el, 'y2')]], closed: false }];
  if (tag === 'polygon' || tag === 'polyline') {
    const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    const pts = [];
    for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]);
    return pts.length > 1 ? [{ pts, closed: tag === 'polygon' }] : [];
  }
  return null;
}

// ── Paint ────────────────────────────────────────────────────────────────────
// An element's own or inherited fill / stroke / opacity, from attributes and
// style="", as the export writes them.
function own(el, prop) {
  const style = el.getAttribute?.('style');
  if (style) {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
    if (m) return m[1].trim();
  }
  const a = el.getAttribute?.(prop);
  return a == null || a === '' ? null : a.trim();
}
export function paintOf(el, prop) {
  for (let n = el; n && n.getAttribute; n = n.parentNode) {
    const v = own(n, prop);
    if (v != null && v !== 'inherit') return v;
  }
  return prop === 'fill' ? '#000000' : 'none';
}
// Opacity multiplies down the tree.
export function opacityOf(el) {
  let o = 1;
  for (let n = el; n && n.getAttribute; n = n.parentNode) {
    const v = parseFloat(own(n, 'opacity'));
    if (Number.isFinite(v)) o *= v;
  }
  return o;
}

// #rgb / #rrggbb / rgb() / a few names → '#rrggbb', or null (none, url(), …).
const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff' };
export function normaliseColour(c) {
  if (!c) return null;
  const s = String(c).trim().toLowerCase();
  if (s === 'none' || s === 'transparent' || s.startsWith('url(')) return null;
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]].map(ch => ch + ch).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{8}$/.test(s)) return s.slice(0, 7);
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return `#${m.slice(1, 4).map(v => Math.max(0, Math.min(255, Math.round(+v))).toString(16).padStart(2, '0')).join('')}`;
  return null;
}

// ── Clipping ─────────────────────────────────────────────────────────────────
// A polyline cut to a convex polygon (a clip-path wedge): the pieces inside,
// as open polylines (a closed one cut open where it leaves).
export function clipToConvex({ pts, closed }, poly) {
  if (signedPolyArea(poly) < 0) poly = poly.slice().reverse();
  const edges = poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);
  const inside = (q) => edges.every(([a, b]) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= -1e-9);
  // Cyrus-Beck: the part of segment p→q inside, as [t0, t1], or null.
  const clipSeg = (p, q) => {
    let t0 = 0, t1 = 1;
    const d = [q[0] - p[0], q[1] - p[1]];
    for (const [a, b] of edges) {
      const n = [-(b[1] - a[1]), b[0] - a[0]]; // inward normal (counter-clockwise polygon)
      const num = n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]);
      const den = n[0] * d[0] + n[1] * d[1];
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = -num / den;
      if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
    return [t0, t1];
  };
  const at = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const all = closed ? [...pts, pts[0]] : pts;
  if (all.every(inside)) return [{ pts, closed }];
  const out = [];
  let cur = null;
  for (let i = 1; i < all.length; i++) {
    const p = all[i - 1], q = all[i];
    const r = clipSeg(p, q);
    if (!r) { if (cur) { out.push(cur); cur = null; } continue; }
    const a = at(p, q, r[0]), b = at(p, q, r[1]);
    if (!cur) cur = { pts: [a], closed: false };
    else if (r[0] > 1e-9) { out.push(cur); cur = { pts: [a], closed: false }; }
    cur.pts.push(b);
    if (r[1] < 1 - 1e-9) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  // A closed line cut open: its first and last pieces join where it started.
  if (closed && out.length > 1 && inside(pts[0])) {
    const first = out.shift(), last = out.pop();
    out.push({ pts: [...last.pts, ...first.pts.slice(1)], closed: false });
  }
  return out.filter(o => o.pts.length > 1);
}
const signedPolyArea = (P) => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;

// Every painted shape under root, in drawing order, with its outline in
// root coordinates: [{ el, polys, fill, stroke, strokeWidth, opacity, filtered, inBackground }].
// skip(el): leave this element and everything inside it out.
export function collectShapes(root, { tol = 0.1, skip = () => false } = {}) {
  const out = [];
  // Elements by id, for clip-path="url(#…)".
  const byId = new Map();
  const index = (el) => { for (const c of [...(el.childNodes ?? [])]) if (c.nodeType === 1) { const id = c.getAttribute('id'); if (id) byId.set(id, c); index(c); } };
  index(root);
  // A clip path's outline (its first shape) in root coordinates, for an
  // element whose transform is m; null if there's none to use.
  const clipOf = (child, m) => {
    const ref = /url\(#([^)]+)\)/.exec(child.getAttribute('clip-path') || '');
    const clip = ref && byId.get(ref[1]);
    if (!clip) return null;
    for (const c of [...clip.childNodes]) {
      if (c.nodeType !== 1) continue;
      const polys = elementPolylines(c, tol);
      if (polys?.[0]) return polys[0].pts.map(q => apply(multiply(m, parseTransform(c.getAttribute('transform'))), q));
    }
    return null;
  };
  const walk = (el, m, inBg, clips = []) => {
    for (const child of [...(el.childNodes ?? [])]) {
      if (child.nodeType !== 1) continue;
      const tag = nameOf(child);
      if (['defs', 'title', 'desc', 'metadata', 'style', 'clippath', 'mask', 'symbol', 'filter', 'lineargradient', 'radialgradient', 'pattern'].includes(tag)) continue;
      if (skip(child)) continue;
      const cm = multiply(m, parseTransform(child.getAttribute('transform')));
      const bg = inBg || child.getAttribute('data-name') === 'Background';
      const clip = clipOf(child, cm);
      const myClips = clip ? [...clips, clip] : clips;
      if (tag === 'g' || tag === 'svg' || tag === 'a') { walk(child, cm, bg, myClips); continue; }
      let polys = elementPolylines(child, tol);
      if (!polys) continue;
      polys = polys.map(p => ({ pts: p.pts.map(q => apply(cm, q)), closed: p.closed }));
      for (const C of myClips) polys = polys.flatMap(p => clipToConvex(p, C));
      const sw = parseFloat(paintOf(child, 'stroke-width'));
      // Stroke widths scale with the transform (its average scale).
      const k = Math.sqrt(Math.abs(cm[0] * cm[3] - cm[1] * cm[2])) || 1;
      out.push({
        el: child, inBackground: bg,
        polys,
        fill: normaliseColour(paintOf(child, 'fill')), rawFill: paintOf(child, 'fill'),
        stroke: normaliseColour(paintOf(child, 'stroke')),
        strokeWidth: (Number.isFinite(sw) ? sw : 1) * k,
        opacity: opacityOf(child),
        // A blur (Linework shadows): a plotter can't draw it.
        filtered: paintOf(child, 'filter') !== 'none',
      });
    }
  };
  walk(root, IDENTITY, false);
  return out;
}
