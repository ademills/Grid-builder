#!/usr/bin/env node
/**
 * scripts/generate-shape-library.js
 *
 * Offline pre-computation of SVG shape anchor points and fill templates.
 * Eliminates DOMParser from the runtime hot path, enabling 30-60fps video sampling.
 *
 * SETUP (one-time):
 *   npm install --save-dev @xmldom/xmldom
 *
 * USAGE:
 *   node scripts/generate-shape-library.js --new     # add/update changed files only
 *   node scripts/generate-shape-library.js --all     # full rebuild of every SVG
 *
 * OUTPUT:
 *   src/assets/shapeLibrary.json
 *
 * JSON schema per shape entry:
 * {
 *   "vb": [x, y, w, h],          // SVG viewBox values
 *   "slots": [                    // one entry per colourable shape element
 *     { "tag": "path", "pts": [[ax, ay], ...] }  // accumulated-transform coords in viewBox space
 *   ],
 *   "template": "<svg...>__SLOT_0__...</svg>",   // serialised SVG with fill slots pre-stamped
 *   "hash": "sha256 prefix"       // used by --new to skip unchanged files
 * }
 *
 * The render engine converts viewBox-space pts to canvas pixels with:
 *   blockScale = min(cellW / vbW, cellH / vbH)       // preserveAspectRatio="xMidYMid meet"
 *   baseX = cellX + (cellW - vbW * blockScale) / 2 - vbX * blockScale
 *   canvasX = baseX + pt[0] * blockScale
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// ── Paths ────────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT      = join(__dirname, '..');
const SVG_DIR   = join(ROOT, 'src', 'assets', 'svgs');
const OUT_FILE  = join(ROOT, 'src', 'assets', 'shapeLibrary.json');

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (!args.includes('--all') && !args.includes('--new')) {
  console.error('Usage: node scripts/generate-shape-library.js [--all | --new]');
  process.exit(1);
}
const mode = args.includes('--all') ? 'all' : 'new';
console.log(`\n[shape-library] mode=${mode}  source=${SVG_DIR}\n`);

// ── File helpers ─────────────────────────────────────────────────────────────

function sha256Short(str) {
  return createHash('sha256').update(str).digest('hex').slice(0, 16);
}

function walkSvgs(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory())                                  results.push(...walkSvgs(full));
    else if (entry.isFile() && /\.svg$/i.test(entry.name))   results.push(full);
  }
  return results;
}

// Derive the library key from an absolute SVG path.
// "…/svgs/Default/1x1/Basic Geometric 1.svg"  →  "Default/1x1/Basic Geometric 1"
// "…/svgs/Basketball/Spurs/1x1/Por Vida 1.svg" →  "Basketball/Spurs/1x1/Por Vida 1"
function fileToLibKey(absPath) {
  return relative(SVG_DIR, absPath).replace(/\\/g, '/').replace(/\.svg$/i, '');
}

// ── Transform math (ported verbatim from src/utils/colorize.js) ──────────────

function parseTransformMatrix(str) {
  const identity = [1, 0, 0, 1, 0, 0];
  if (!str) return identity;
  const mul = (m1, m2) => [
    m1[0]*m2[0] + m1[2]*m2[1],  m1[1]*m2[0] + m1[3]*m2[1],
    m1[0]*m2[2] + m1[2]*m2[3],  m1[1]*m2[2] + m1[3]*m2[3],
    m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
    m1[1]*m2[4] + m1[3]*m2[5] + m1[5],
  ];
  let cur = [...identity];
  for (const [, type, raw] of str.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = raw.trim().split(/[\s,]+/).map(Number);
    let m;
    switch (type) {
      case 'translate': m = [1,0,0,1, a[0]||0, a[1]||0]; break;
      case 'scale':     { const sx=a[0]||1, sy=a[1]!==undefined?a[1]:sx; m=[sx,0,0,sy,0,0]; break; }
      case 'rotate':    {
        const r=(a[0]||0)*Math.PI/180, cx=a[1]||0, cy=a[2]||0;
        const c=Math.cos(r), s=Math.sin(r);
        m=[c,s,-s,c, cx-c*cx+s*cy, cy-s*cx-c*cy];
        break;
      }
      case 'matrix':    m=[a[0]||1,a[1]||0,a[2]||0,a[3]||1,a[4]||0,a[5]||0]; break;
      default: continue;
    }
    cur = mul(cur, m);
  }
  return cur;
}

function concatMat(p, c) {
  return [
    p[0]*c[0]+p[2]*c[1],  p[1]*c[0]+p[3]*c[1],
    p[0]*c[2]+p[2]*c[3],  p[1]*c[2]+p[3]*c[3],
    p[0]*c[4]+p[2]*c[5]+p[4],
    p[1]*c[4]+p[3]*c[5]+p[5],
  ];
}

function applyMat(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

// ── Shape-point extraction (ported verbatim from src/utils/colorize.js) ──────

function getShapePoints(el) {
  const tag = (el.tagName || '').toLowerCase().split(':').pop();
  const f = attr => parseFloat(el.getAttribute(attr)) || 0;

  if (tag === 'rect') {
    return [[f('x') + f('width') / 2, f('y') + f('height') / 2]];
  }
  if (tag === 'circle' || tag === 'ellipse') {
    return [[f('cx'), f('cy')]];
  }
  if (tag === 'line') {
    return [[(f('x1') + f('x2')) / 2, (f('y1') + f('y2')) / 2]];
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const nums = (el.getAttribute('points') || '')
      .trim().split(/[\s,]+/).map(Number).filter(v => !isNaN(v));
    const pts = [];
    for (let i = 0; i < nums.length - 1; i += 2) pts.push([nums[i], nums[i + 1]]);
    if (!pts.length) return [];
    const step = Math.max(1, Math.floor(pts.length / 4));
    return pts.filter((_, i) => i % step === 0).slice(0, 4);
  }
  if (tag === 'path') {
    const d = el.getAttribute('d') || '';
    const pts = [];
    for (const [, x, y] of d.matchAll(/M\s*([\d.eE+-]+)[,\s]+([\d.eE+-]+)/g)) {
      pts.push([parseFloat(x), parseFloat(y)]);
      if (pts.length >= 5) break;
    }
    if (pts.length) return pts;
    // Fallback: first few raw number pairs
    const nums = (d.match(/[\d.]+/g) || []).map(Number).filter(v => !isNaN(v));
    const fb = [];
    for (let i = 0; i < Math.min(nums.length - 1, 8); i += 2) fb.push([nums[i], nums[i + 1]]);
    return fb.slice(0, 3);
  }
  return [];
}

// ── Fill application (ported verbatim from src/utils/colorize.js) ─────────────

function buildClassFillMap(root) {
  const map = {};
  const styleEls = root.getElementsByTagName('style');
  for (let i = 0; i < styleEls.length; i++) {
    const text = styleEls[i].textContent || '';
    for (const [, cls, fill] of text.matchAll(/\.([^{,\s]+)[^{]*\{[^}]*\bfill\s*:\s*([^;}\s]+)/gs)) {
      const f = fill.trim();
      if (f !== 'none' && f !== 'transparent') map[cls] = f;
    }
  }
  return map;
}

function applyFill(el, color, classFillMap) {
  const fill  = el.getAttribute('fill');
  const style = el.getAttribute('style') || '';

  if (fill && fill !== 'none' && fill !== 'transparent') {
    el.setAttribute('fill', color);
    return;
  }
  if (/\bfill\s*:/.test(style)) {
    el.setAttribute('style', style.replace(
      /\bfill\s*:\s*([^;'"]+)/g,
      (_, v) => (v.trim() !== 'none' && v.trim() !== 'transparent') ? `fill:${color}` : `fill:${v}`
    ));
    return;
  }
  const cls = el.getAttribute('class') || '';
  if (cls && classFillMap) {
    const hasFillClass = cls.trim().split(/\s+/).some(c => classFillMap[c]);
    if (hasFillClass) {
      el.setAttribute('style', `${style}${style ? ';' : ''}fill:${color}`);
    }
  }
}

// ── Core extractor ───────────────────────────────────────────────────────────

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);

function extractShape(svgContent) {
  // xmldom 0.9.x uses onError callback instead of errorHandler object
  let parseError = null;
  const parser = new DOMParser({
    onError: (level, msg) => {
      if (level === 'error' || level === 'fatalError') parseError = String(msg);
    },
  });

  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  if (parseError) return { error: parseError };

  const root = doc.documentElement;
  if (!root) return { error: 'no root element' };

  const classFillMap = buildClassFillMap(root);

  // Parse viewBox
  let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
  const vbStr = root.getAttribute('viewBox');
  if (vbStr) {
    const p = vbStr.trim().split(/[\s,]+/).map(Number);
    [vbX, vbY, vbW, vbH] = p;
  } else {
    vbW = parseFloat(root.getAttribute('width'))  || 500;
    vbH = parseFloat(root.getAttribute('height')) || 500;
  }

  const slots = [];

  // Walk the DOM tree, accumulating transforms, collecting shape anchor points,
  // and stamping fill slots into the document in one pass.
  const walk = (node, parentMat) => {
    if (!node || node.nodeType !== 1) return; // ELEMENT_NODE = 1
    const localMat = parseTransformMatrix(node.getAttribute('transform') || '');
    const mat      = concatMat(parentMat, localMat);

    const tag = (node.tagName || '').toLowerCase().split(':').pop();
    if (SHAPE_TAGS.has(tag)) {
      const localPts = getShapePoints(node);
      if (localPts.length) {
        // Apply accumulated transforms to get viewBox-space coordinates
        const pts = localPts.map(([x, y]) => applyMat(mat, x, y));
        const slotIdx = slots.length;
        slots.push({ tag, pts });
        applyFill(node, `__SLOT_${slotIdx}__`, classFillMap);
      }
    }

    const children = node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) walk(children[i], mat);
    }
  };

  walk(root, [1, 0, 0, 1, 0, 0]);

  // Serialise the mutated document to get the template string
  const serializer = new XMLSerializer();
  let template = serializer.serializeToString(doc);
  // Strip XML declaration and DOCTYPE — matches the cleanup in colorize.js
  template = template
    .replace(/^<\?xml[^>]*\?>\s*/i, '')
    .replace(/<!DOCTYPE[^>]*>\s*/gi, '');

  return { vb: [vbX, vbY, vbW, vbH], slots, template };
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Load existing library for --new mode (preserves entries for unchanged files)
const existing = (mode === 'new' && existsSync(OUT_FILE))
  ? (() => { try { return JSON.parse(readFileSync(OUT_FILE, 'utf-8')); } catch { return { shapes: {} }; } })()
  : { shapes: {} };

const library = {
  version: 1,
  generatedAt: new Date().toISOString(),
  shapes: mode === 'new' ? { ...existing.shapes } : {},
};

const svgFiles = walkSvgs(SVG_DIR);
let processed = 0, skipped = 0, failed = 0;

for (const absPath of svgFiles) {
  const key     = fileToLibKey(absPath);
  const content = readFileSync(absPath, 'utf-8');
  const hash    = sha256Short(content);

  // --new: skip files whose content hash matches the existing entry
  if (mode === 'new' && library.shapes[key]?.hash === hash) {
    skipped++;
    continue;
  }

  try {
    const result = extractShape(content);
    if (result.error) {
      console.warn(`  [SKIP] ${key}  — parse error: ${result.error}`);
      failed++;
      continue;
    }
    library.shapes[key] = { vb: result.vb, slots: result.slots, template: result.template, hash };
    processed++;
    console.log(`  [OK]   ${key}  (${result.slots.length} slot${result.slots.length !== 1 ? 's' : ''})`);
  } catch (err) {
    console.warn(`  [ERR]  ${key}  — ${err.message}`);
    failed++;
  }
}

writeFileSync(OUT_FILE, JSON.stringify(library, null, 2), 'utf-8');

const totalShapes = Object.keys(library.shapes).length;
console.log(`\n[shape-library] done`);
console.log(`  processed : ${processed}`);
console.log(`  skipped   : ${skipped}`);
console.log(`  failed    : ${failed}`);
console.log(`  total in library: ${totalShapes}`);
console.log(`  output    : ${OUT_FILE}\n`);
