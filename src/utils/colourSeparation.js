// ── Path tokeniser ────────────────────────────────────────────────────────────

function tokenisePath(d) {
  const tokens = [];
  const re = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let m;
  while ((m = re.exec(d)) !== null) tokens.push(m[0]);
  return tokens;
}

// ── Bezier subdivision (de Casteljau, tolerance = max chord deviation) ────────

function subdivideCubic(p0, p1, p2, p3, tol, out) {
  // Iterative de Casteljau — never overflows the call stack.
  // Right sub-curve is pushed first so left is processed first (preserves point order).
  const stack = [[p0, p1, p2, p3]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b, c, d] = stack.pop();
    const mx = (a[0] + 3*b[0] + 3*c[0] + d[0]) / 8;
    const my = (a[1] + 3*b[1] + 3*c[1] + d[1]) / 8;
    const dx = (a[0] + d[0]) / 2 - mx;
    const dy = (a[1] + d[1]) / 2 - my;
    if (dx*dx + dy*dy < t2 || !(dx*dx + dy*dy >= 0)) { // second condition catches NaN
      out.push([d[0], d[1]]);
    } else {
      const p01  = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      const p12  = [(b[0]+c[0])/2, (b[1]+c[1])/2];
      const p23  = [(c[0]+d[0])/2, (c[1]+d[1])/2];
      const p012 = [(p01[0]+p12[0])/2, (p01[1]+p12[1])/2];
      const p123 = [(p12[0]+p23[0])/2, (p12[1]+p23[1])/2];
      const mid  = [(p012[0]+p123[0])/2, (p012[1]+p123[1])/2];
      stack.push([mid, p123, p23, d]); // right first → processed second
      stack.push([a, p01, p012, mid]); // left second → processed first
    }
  }
}

function subdivideQuadratic(p0, p1, p2, tol, out) {
  // Iterative de Casteljau — never overflows the call stack.
  const stack = [[p0, p1, p2]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b, c] = stack.pop();
    const mx = (a[0] + 2*b[0] + c[0]) / 4;
    const my = (a[1] + 2*b[1] + c[1]) / 4;
    const dx = (a[0] + c[0]) / 2 - mx;
    const dy = (a[1] + c[1]) / 2 - my;
    if (dx*dx + dy*dy < t2 || !(dx*dx + dy*dy >= 0)) {
      out.push([c[0], c[1]]);
    } else {
      const p01 = [(a[0]+b[0])/2, (a[1]+b[1])/2];
      const p12 = [(b[0]+c[0])/2, (b[1]+c[1])/2];
      const mid = [(p01[0]+p12[0])/2, (p01[1]+p12[1])/2];
      stack.push([mid, p12, c]);   // right first
      stack.push([a, p01, mid]);   // left second
    }
  }
}

// ── SVG path d → array of rings ───────────────────────────────────────────────

export function pathToRings(d, tol = 1) {
  const tokens = tokenisePath(d);
  const rings = [];
  let ring = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCmd = '', lastCx = 0, lastCy = 0;
  let i = 0;

  const n = () => parseFloat(tokens[i++]);

  const flush = () => { if (ring.length >= 3) rings.push(ring); ring = []; };
  const push = (px, py) => { ring.push([px, py]); x = px; y = py; };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z';

    switch (cmd.toUpperCase()) {
      case 'M': {
        flush();
        const mx = rel ? x + n() : n();
        const my = rel ? y + n() : n();
        ring = [[mx, my]];
        x = sx = mx; y = sy = my;
        // Implicit L after M
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          push(rel ? x + n() : n(), rel ? y + n() : n());
        }
        break;
      }
      case 'L':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
          push(rel ? x + n() : n(), rel ? y + n() : n());
        break;
      case 'H':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
          push(rel ? x + n() : n(), y);
        break;
      case 'V':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i]))
          push(x, rel ? y + n() : n());
        break;
      case 'C':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const ax = rel ? x + n() : n(), ay = rel ? y + n() : n();
          const bx = rel ? x + n() : n(), by = rel ? y + n() : n();
          const ex = rel ? x + n() : n(), ey = rel ? y + n() : n();
          subdivideCubic([x, y], [ax, ay], [bx, by], [ex, ey], tol, ring);
          lastCx = bx; lastCy = by;
          x = ex; y = ey;
        }
        break;
      case 'S': {
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const reflX = lastCmd.toUpperCase() === 'C' || lastCmd.toUpperCase() === 'S' ? 2 * x - lastCx : x;
          const reflY = lastCmd.toUpperCase() === 'C' || lastCmd.toUpperCase() === 'S' ? 2 * y - lastCy : y;
          const bx = rel ? x + n() : n(), by = rel ? y + n() : n();
          const ex = rel ? x + n() : n(), ey = rel ? y + n() : n();
          subdivideCubic([x, y], [reflX, reflY], [bx, by], [ex, ey], tol, ring);
          lastCx = bx; lastCy = by;
          x = ex; y = ey;
        }
        break;
      }
      case 'Q':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const cx = rel ? x + n() : n(), cy = rel ? y + n() : n();
          const ex = rel ? x + n() : n(), ey = rel ? y + n() : n();
          subdivideQuadratic([x, y], [cx, cy], [ex, ey], tol, ring);
          lastCx = cx; lastCy = cy;
          x = ex; y = ey;
        }
        break;
      case 'T':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const reflX = lastCmd.toUpperCase() === 'Q' || lastCmd.toUpperCase() === 'T' ? 2 * x - lastCx : x;
          const reflY = lastCmd.toUpperCase() === 'Q' || lastCmd.toUpperCase() === 'T' ? 2 * y - lastCy : y;
          const ex = rel ? x + n() : n(), ey = rel ? y + n() : n();
          subdivideQuadratic([x, y], [reflX, reflY], [ex, ey], tol, ring);
          lastCx = reflX; lastCy = reflY;
          x = ex; y = ey;
        }
        break;
      case 'A':
        while (i < tokens.length && !/[A-Za-z]/.test(tokens[i])) {
          const rx = n(), ry = n(), xRot = n(), largeArc = n(), sweep = n();
          const ex = rel ? x + n() : n(), ey = rel ? y + n() : n();
          arcToPoints(x, y, rx, ry, xRot, largeArc, sweep, ex, ey, tol, ring);
          x = ex; y = ey;
        }
        break;
      case 'Z':
        ring.push([sx, sy]);
        flush();
        x = sx; y = sy;
        break;
    }
    lastCmd = cmd;
  }
  flush();
  return rings;
}

// SVG arc → polyline points (endpoint parameterisation → centre parameterisation)
function arcToPoints(x1, y1, rx, ry, xRotDeg, largeArc, sweep, x2, y2, tol, out) {
  if (rx === 0 || ry === 0) { out.push([x2, y2]); return; }
  const phi = xRotDeg * Math.PI / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  let rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  let lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; rxSq = rx * rx; rySq = ry * ry; }
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const sq = Math.sqrt(Math.max(0, num / den)) * (largeArc === sweep ? -1 : 1);
  const cxp = sq * rx * y1p / ry;
  const cyp = -sq * ry * x1p / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const ang1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
  let dAng = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - ang1;
  if (!sweep && dAng > 0) dAng -= 2 * Math.PI;
  if (sweep && dAng < 0) dAng += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dAng) * Math.max(rx, ry) / tol));
  for (let k = 1; k <= steps; k++) {
    const a = ang1 + dAng * k / steps;
    out.push([cx + Math.cos(a) * rx * cosPhi - Math.sin(a) * ry * sinPhi,
              cy + Math.cos(a) * rx * sinPhi + Math.sin(a) * ry * cosPhi]);
  }
}

// ── Primitive → rings ─────────────────────────────────────────────────────────

function circleToRings(cx, cy, r, steps = 64) {
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return [ring];
}

function ellipseToRings(cx, cy, rx, ry, steps = 64) {
  const ring = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [ring];
}

function rectToRings(x, y, w, h) {
  return [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
}

function pointsAttrToRings(attr) {
  const nums = attr.trim().split(/[\s,]+/).map(Number);
  const ring = [];
  for (let i = 0; i + 1 < nums.length; i += 2) ring.push([nums[i], nums[i + 1]]);
  return [ring];
}

export function elementToRings(el, tol = 1) {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'path': return pathToRings(el.getAttribute('d') || '', tol);
    case 'rect': {
      const x = +( el.getAttribute('x') || 0);
      const y = +( el.getAttribute('y') || 0);
      const w = +( el.getAttribute('width') || 0);
      const h = +( el.getAttribute('height') || 0);
      return w > 0 && h > 0 ? rectToRings(x, y, w, h) : [];
    }
    case 'circle': {
      const cx = +(el.getAttribute('cx') || 0);
      const cy = +(el.getAttribute('cy') || 0);
      const r  = +(el.getAttribute('r')  || 0);
      return r > 0 ? circleToRings(cx, cy, r) : [];
    }
    case 'ellipse': {
      const cx = +(el.getAttribute('cx') || 0);
      const cy = +(el.getAttribute('cy') || 0);
      const rx = +(el.getAttribute('rx') || 0);
      const ry = +(el.getAttribute('ry') || 0);
      return rx > 0 && ry > 0 ? ellipseToRings(cx, cy, rx, ry) : [];
    }
    case 'polygon':
    case 'polyline': return pointsAttrToRings(el.getAttribute('points') || '');
    default: return [];
  }
}

// ── SVG element → path d string (for PathKit — preserves curves) ──────────────

function elementToPathD(el) {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'path': return el.getAttribute('d') || '';
    case 'rect': {
      const x = +(el.getAttribute('x') || 0), y = +(el.getAttribute('y') || 0);
      const w = +(el.getAttribute('width') || 0), h = +(el.getAttribute('height') || 0);
      if (w <= 0 || h <= 0) return '';
      let rxA = el.getAttribute('rx'), ryA = el.getAttribute('ry');
      let rx = rxA != null ? +rxA : (ryA != null ? +ryA : 0);
      let ry = ryA != null ? +ryA : rx;
      rx = Math.min(Math.abs(rx), w / 2); ry = Math.min(Math.abs(ry), h / 2);
      if (rx === 0 || ry === 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
      return `M${x+rx},${y}h${w-2*rx}a${rx},${ry},0,0,1,${rx},${ry}` +
             `v${h-2*ry}a${rx},${ry},0,0,1,${-rx},${ry}` +
             `h${-(w-2*rx)}a${rx},${ry},0,0,1,${-rx},${-ry}` +
             `v${-(h-2*ry)}a${rx},${ry},0,0,1,${rx},${-ry}Z`;
    }
    case 'circle': {
      const cx = +(el.getAttribute('cx') || 0), cy = +(el.getAttribute('cy') || 0);
      const r = +(el.getAttribute('r') || 0);
      if (r <= 0) return '';
      return `M${cx-r},${cy}a${r},${r},0,1,0,${2*r},0a${r},${r},0,1,0,${-2*r},0Z`;
    }
    case 'ellipse': {
      const cx = +(el.getAttribute('cx') || 0), cy = +(el.getAttribute('cy') || 0);
      const rx = +(el.getAttribute('rx') || 0), ry = +(el.getAttribute('ry') || 0);
      if (rx <= 0 || ry <= 0) return '';
      return `M${cx-rx},${cy}a${rx},${ry},0,1,0,${2*rx},0a${rx},${ry},0,1,0,${-2*rx},0Z`;
    }
    case 'polygon': {
      const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (nums.length < 4) return '';
      let pd = `M${nums[0]},${nums[1]}`;
      for (let k = 2; k + 1 < nums.length; k += 2) pd += `L${nums[k]},${nums[k+1]}`;
      return pd + 'Z';
    }
    case 'polyline': {
      const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (nums.length < 4) return '';
      let pd = `M${nums[0]},${nums[1]}`;
      for (let k = 2; k + 1 < nums.length; k += 2) pd += `L${nums[k]},${nums[k+1]}`;
      return pd;
    }
    default: return '';
  }
}

// ── Transform application ─────────────────────────────────────────────────────

export function applyTransformToRings(rings, tx, ty, scale) {
  return rings.map(ring => ring.map(([px, py]) => [px * scale + tx, py * scale + ty]));
}

// ── Full SVG transform matrix support ────────────────────────────────────────

function parseSvgTransform(str) {
  let m = [1, 0, 0, 1, 0, 0]; // identity [a,b,c,d,e,f]
  if (!str) return m;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(str)) !== null) {
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    let t;
    switch (match[1]) {
      case 'translate': t = [1, 0, 0, 1, args[0], args[1] || 0]; break;
      case 'scale':     t = [args[0], 0, 0, args[1] ?? args[0], 0, 0]; break;
      case 'matrix':    t = args.slice(0, 6); break;
      case 'rotate': {
        const ang = args[0] * Math.PI / 180, cos = Math.cos(ang), sin = Math.sin(ang);
        const cx = args[1] || 0, cy = args[2] || 0;
        t = [cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos];
        break;
      }
      case 'skewX': { const ta = Math.tan(args[0] * Math.PI / 180); t = [1, 0, ta, 1, 0, 0]; break; }
      case 'skewY': { const ta = Math.tan(args[0] * Math.PI / 180); t = [1, ta, 0, 1, 0, 0]; break; }
      default: continue;
    }
    m = [
      m[0]*t[0] + m[2]*t[1], m[1]*t[0] + m[3]*t[1],
      m[0]*t[2] + m[2]*t[3], m[1]*t[2] + m[3]*t[3],
      m[0]*t[4] + m[2]*t[5] + m[4], m[1]*t[4] + m[3]*t[5] + m[5],
    ];
  }
  return m;
}

function applyMatrix(rings, [a, b, c, d, e, f]) {
  return rings.map(ring => ring.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]));
}

function resolveFill(el, parentFill) {
  const style = el.getAttribute?.('style') || '';
  const fromStyle = style.match(/\bfill\s*:\s*([^;}\s]+)/)?.[1];
  const fromAttr = el.getAttribute?.('fill');
  const raw = fromStyle || fromAttr;
  if (!raw || raw === 'inherit') return parentFill;
  return raw;
}

const SKIP_TAGS = new Set(['defs','clippath','mask','symbol','filter','style','title','desc','linearGradient','radialGradient','pattern']);

export function extractShapesFromSVG(svgEl) {
  const shapes = [];
  // Iterative DFS — same pattern as separateByColourSVG to avoid call-stack overflow.
  const stack = [];
  const identity = [1, 0, 0, 1, 0, 0];
  for (let i = svgEl.children.length - 1; i >= 0; i--)
    stack.push({ el: svgEl.children[i], matrix: identity, fill: '#000000' });

  while (stack.length > 0) {
    const { el, matrix: parentMatrix, fill: parentFill } = stack.pop();
    const tag = el.tagName?.toLowerCase?.();
    if (!tag || SKIP_TAGS.has(tag)) continue;

    const local = parseSvgTransform(el.getAttribute?.('transform'));
    const composed = [
      parentMatrix[0]*local[0] + parentMatrix[2]*local[1],
      parentMatrix[1]*local[0] + parentMatrix[3]*local[1],
      parentMatrix[0]*local[2] + parentMatrix[2]*local[3],
      parentMatrix[1]*local[2] + parentMatrix[3]*local[3],
      parentMatrix[0]*local[4] + parentMatrix[2]*local[5] + parentMatrix[4],
      parentMatrix[1]*local[4] + parentMatrix[3]*local[5] + parentMatrix[5],
    ];

    const fill = resolveFill(el, parentFill);

    if (tag === 'g' || tag === 'svg') {
      for (let i = el.children.length - 1; i >= 0; i--)
        stack.push({ el: el.children[i], matrix: composed, fill });
      continue;
    }

    if (!['path','rect','circle','ellipse','polygon','polyline'].includes(tag)) continue;
    if (!fill || fill === 'none' || fill === 'transparent') continue;

    const [a, b, c, d] = composed;
    const matrixScale = (Math.sqrt(a*a + b*b) + Math.sqrt(c*c + d*d)) / 2;
    const tol = matrixScale > 0 ? Math.max(0.05, 0.5 / matrixScale) : 0.5;
    const rings = elementToRings(el, tol);
    if (!rings.length) continue;
    shapes.push({ rings: applyMatrix(rings, composed), fill: fill.toLowerCase() });
  }

  return shapes;
}

// ── Extract shapes as path strings (for PathKit ops — curves preserved) ──────
// Returns {d, fill, matrix, bbox}[]. d is the raw path d string (untransformed);
// matrix is the composed SVG transform; bbox is in canvas coords for overlap tests.

export function extractShapesAsPaths(svgEl, startMatrix = [1, 0, 0, 1, 0, 0]) {
  const shapes = [];
  const stack = [];
  for (let i = svgEl.children.length - 1; i >= 0; i--)
    stack.push({ el: svgEl.children[i], matrix: startMatrix, fill: '#000000' });

  while (stack.length > 0) {
    const { el, matrix: parentMatrix, fill: parentFill } = stack.pop();
    const tag = el.tagName?.toLowerCase?.();
    if (!tag || SKIP_TAGS.has(tag)) continue;

    const local = parseSvgTransform(el.getAttribute?.('transform'));
    const composed = [
      parentMatrix[0]*local[0] + parentMatrix[2]*local[1],
      parentMatrix[1]*local[0] + parentMatrix[3]*local[1],
      parentMatrix[0]*local[2] + parentMatrix[2]*local[3],
      parentMatrix[1]*local[2] + parentMatrix[3]*local[3],
      parentMatrix[0]*local[4] + parentMatrix[2]*local[5] + parentMatrix[4],
      parentMatrix[1]*local[4] + parentMatrix[3]*local[5] + parentMatrix[5],
    ];

    const fill = resolveFill(el, parentFill);

    if (tag === 'g' || tag === 'svg') {
      for (let i = el.children.length - 1; i >= 0; i--)
        stack.push({ el: el.children[i], matrix: composed, fill });
      continue;
    }

    if (!['path','rect','circle','ellipse','polygon','polyline'].includes(tag)) continue;
    if (!fill || fill === 'none' || fill === 'transparent') continue;

    const pathD = elementToPathD(el);
    if (!pathD) continue;

    // Quick bbox via rings (coarse approx) — only used for overlap filtering
    const rings = elementToRings(el, 4);
    const bbox = rings.length ? getBBox(applyMatrix(rings, composed)) : null;

    shapes.push({ d: pathD, fill: fill.toLowerCase(), matrix: composed, bbox });
  }

  return shapes;
}

// ── SVG-mask colour separation (preserves original curves) ───────────────────
//
// For each shape in z-order, builds a <mask> that hides areas where higher-z
// shapes are painted — so curves are never converted to polygons.

export function separateByColourSVG(svgEl, canvasWidth, canvasHeight, canvasBg) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const items = []; // { el, fill, matrix, bbox }

  // Iterative DFS — avoids call-stack overflow on deeply nested SVGs.
  // Children are pushed in reverse so they're popped in document (z) order.
  const stack = [];
  const identity = [1, 0, 0, 1, 0, 0];
  for (let i = svgEl.children.length - 1; i >= 0; i--)
    stack.push({ el: svgEl.children[i], matrix: identity, fill: '#000000' });

  while (stack.length > 0) {
    const { el, matrix: parentMatrix, fill: parentFill } = stack.pop();

    const tag = el.tagName?.toLowerCase?.();
    if (!tag || SKIP_TAGS.has(tag)) continue;

    const local = parseSvgTransform(el.getAttribute?.('transform'));
    const composed = [
      parentMatrix[0]*local[0] + parentMatrix[2]*local[1],
      parentMatrix[1]*local[0] + parentMatrix[3]*local[1],
      parentMatrix[0]*local[2] + parentMatrix[2]*local[3],
      parentMatrix[1]*local[2] + parentMatrix[3]*local[3],
      parentMatrix[0]*local[4] + parentMatrix[2]*local[5] + parentMatrix[4],
      parentMatrix[1]*local[4] + parentMatrix[3]*local[5] + parentMatrix[5],
    ];

    const fill = resolveFill(el, parentFill);

    if (tag === 'g' || tag === 'svg') {
      for (let i = el.children.length - 1; i >= 0; i--)
        stack.push({ el: el.children[i], matrix: composed, fill });
      continue;
    }

    if (!['path','rect','circle','ellipse','polygon','polyline'].includes(tag)) continue;
    if (!fill || fill === 'none' || fill === 'transparent') continue;

    const rings = elementToRings(el, 4);
    if (!rings.length) continue;
    const bbox = getBBox(applyMatrix(rings, composed));
    items.push({ el, fill: fill.toLowerCase(), matrix: composed, bbox });
  }

  // Build output SVG
  const out = document.createElementNS(svgNS, 'svg');
  out.setAttribute('xmlns', svgNS);
  out.setAttribute('width',   String(canvasWidth));
  out.setAttribute('height',  String(canvasHeight));
  out.setAttribute('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`);

  const defs = document.createElementNS(svgNS, 'defs');
  out.appendChild(defs);

  const bg = document.createElementNS(svgNS, 'rect');
  bg.setAttribute('width',  String(canvasWidth));
  bg.setAttribute('height', String(canvasHeight));
  bg.setAttribute('fill',   canvasBg ?? '#ffffff');
  out.appendChild(bg);

  const colourOrder  = [];
  const colourLayers = new Map();

  items.forEach((item, i) => {
    const { el, fill, matrix, bbox } = item;

    // Shapes above this one whose bbox overlaps → they paint over this shape
    const above = items.slice(i + 1).filter(s => bboxOverlap(bbox, s.bbox));

    let maskId = null;
    if (above.length > 0) {
      maskId = `sm${i}`;
      const mask = document.createElementNS(svgNS, 'mask');
      mask.setAttribute('id', maskId);

      // White = show everything
      const white = document.createElementNS(svgNS, 'rect');
      white.setAttribute('x', '0'); white.setAttribute('y', '0');
      white.setAttribute('width',  String(canvasWidth));
      white.setAttribute('height', String(canvasHeight));
      white.setAttribute('fill', 'white');
      mask.appendChild(white);

      // Black for each shape above = cut those areas out of this shape
      for (const s of above) {
        const wg = document.createElementNS(svgNS, 'g');
        wg.setAttribute('transform', `matrix(${s.matrix.join(',')})`);
        const clone = document.importNode(s.el, true);
        clone.setAttribute('fill', 'black');
        clone.removeAttribute('stroke');
        clone.removeAttribute('stroke-width');
        clone.removeAttribute('style');
        wg.appendChild(clone);
        mask.appendChild(wg);
      }
      defs.appendChild(mask);
    }

    if (!colourLayers.has(fill)) {
      colourOrder.push(fill);
      const layer = document.createElementNS(svgNS, 'g');
      layer.setAttribute('id', `layer-${fill.replace(/[^a-zA-Z0-9]/g, '_')}`);
      layer.setAttribute('data-colour', fill);
      colourLayers.set(fill, layer);
    }

    // Outer group carries the mask; inner group carries the transform
    const outer = document.createElementNS(svgNS, 'g');
    if (maskId) outer.setAttribute('mask', `url(#${maskId})`);

    const inner = document.createElementNS(svgNS, 'g');
    inner.setAttribute('transform', `matrix(${matrix.join(',')})`);

    const clone = document.importNode(el, true);
    clone.setAttribute('fill', fill);
    clone.removeAttribute('stroke');
    clone.removeAttribute('stroke-width');
    clone.removeAttribute('style');
    inner.appendChild(clone);
    outer.appendChild(inner);
    colourLayers.get(fill).appendChild(outer);
  });

  for (const fill of colourOrder) out.appendChild(colourLayers.get(fill));
  return out;
}

// ── Bounding box helpers ──────────────────────────────────────────────────────

function getBBox(rings) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const ring of rings)
    for (const [x, y] of ring) {
      if (x < x1) x1 = x; if (y < y1) y1 = y;
      if (x > x2) x2 = x; if (y > y2) y2 = y;
    }
  return [x1, y1, x2, y2];
}

function bboxOverlap([ax1, ay1, ax2, ay2], [bx1, by1, bx2, by2]) {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

// ── Skia PathOps pipeline (PathKit WASM) ──────────────────────────────────────
// Receives shapes from extractShapesAsPaths. PathKit must be pre-initialised
// and passed in (the worker does this asynchronously at startup).
// Operates on native Bezier curves throughout — no polygon approximation —
// via Skia's PathOps boolean engine (the same engine behind Illustrator-style
// Divide/Unite, just curve-native instead of polygon-based).
// Returns {order, united} where united[fill] is an SVG path d string.

export function divideGroupUnite(shapes, PathKit, onProgress) {
  const total = shapes.length;
  const { UNION, DIFFERENCE } = PathKit.PathOp;

  function toTransformedPKPath(pathD, matrix) {
    const p = PathKit.FromSVGString(pathD);
    if (!p) return null;
    const [m0, m1, m2, m3, m4, m5] = matrix;
    const isIdentity = m0===1 && m1===0 && m2===0 && m3===1 && m4===0 && m5===0;
    if (!isIdentity) {
      p.transform(m0, m2, m4, m1, m3, m5, 0, 0, 1);
    }
    return p;
  }

  // Convert every shape to a canvas-space path up front — boolean ops need
  // real geometry, so transforms can't be deferred to the end. `paths[i]` is
  // nulled out once its ownership transfers elsewhere, so the cleanup sweep
  // below only deletes what's still unclaimed.
  const paths = shapes.map(s => toTransformedPKPath(s.d, s.matrix));

  // Step 1: Divide — subtract the union of higher-z shapes of a different
  // colour from each shape (cutting against their original geometry, same as
  // Illustrator's Divide). Same-colour shapes are skipped: they merge in
  // unite anyway, and clipping along shared boundaries creates degenerate
  // fragments.
  const divided = shapes.map((shape, i) => {
    onProgress?.(Math.round((i / total) * 60));
    const subject = paths[i];
    if (!subject) return null;

    const above = [];
    for (let j = i + 1; j < shapes.length; j++) {
      if (paths[j] && shapes[j].fill !== shape.fill && bboxOverlap(shape.bbox, shapes[j].bbox))
        above.push(paths[j]);
    }

    if (!above.length) {
      paths[i] = null; // ownership transfers to `divided[i]`
      return { fill: shape.fill, path: subject };
    }

    // SkOpBuilder.resolve() returns null when fed only a single path (it needs
    // at least one combination to occur), so a lone "above" shape is used
    // directly as the cutter rather than routed through the builder.
    let cutter, cutterBorrowed;
    if (above.length === 1) {
      cutter = above[0];
      cutterBorrowed = true;
    } else {
      const cutterBuilder = new PathKit.SkOpBuilder();
      for (const p of above) cutterBuilder.add(p, UNION);
      cutter = cutterBuilder.resolve();
      cutterBuilder.delete();
      cutterBorrowed = false;
    }

    const result = cutter ? PathKit.MakeFromOp(subject, cutter, DIFFERENCE) : null;
    if (!cutterBorrowed) cutter?.delete();

    if (result) return { fill: shape.fill, path: result };
    paths[i] = null; // fall back to the untouched subject; it now owns the path
    return { fill: shape.fill, path: subject };
  });

  // Whatever remains in `paths` was only ever read as cutter input (or
  // superseded by a MakeFromOp result) — safe to free now.
  for (const p of paths) p?.delete();

  onProgress?.(60);

  // Step 2: Group by colour
  const groups = {};
  const order = [];
  for (const entry of divided) {
    if (!entry?.path) continue;
    if (!groups[entry.fill]) { groups[entry.fill] = []; order.push(entry.fill); }
    groups[entry.fill].push(entry.path);
  }

  // Step 3: Unite same-colour shapes — one SkOpBuilder per colour batched into
  // a single resolve(). Batching (rather than chaining pairwise op() unions)
  // is what avoids the winding corruption that touching/coincident edges
  // trigger when paths are combined one pair at a time.
  const united = {};
  const colourCount = order.length;
  order.forEach((colour, ci) => {
    const groupPaths = groups[colour];
    let result;
    if (groupPaths.length === 1) {
      result = groupPaths[0];
    } else {
      const builder = new PathKit.SkOpBuilder();
      for (const p of groupPaths) builder.add(p, UNION);
      result = builder.resolve();
      builder.delete();
      for (const p of groupPaths) p.delete();
    }

    if (result) {
      united[colour] = result.toSVGString();
      result.delete();
    } else {
      united[colour] = null;
    }
    onProgress?.(60 + Math.round(((ci + 1) / colourCount) * 40));
  });

  onProgress?.(100);
  return { order, united };
}
