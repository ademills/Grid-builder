// Generated vector layers, shared by the generator modes (Meander, Linework).
//
// A vector block is { type: 'vector', d, fill, viewW, viewH, bounds } on
// the usual grid footprint; `d` is in the design's own units (viewW x
// viewH), scaled uniformly into the footprint. Optional: `fillSwatch` (the
// document swatch its colour is pinned to -- Paint Bucket, Layers recolour),
// `fillFixed` (a colour picked outside the swatches, kept as it is)
// and `blur` (a soft-edged layer such as a plate's shadow, in design units).
//
// `meanderKey` (Meander) or `genKey` (Linework) identifies which part of the
// design a block came from, so regenerating with the same seed can carry
// each one's edits across.
//
// buildMeanderBlocks turns a composed Meander design (composeKnotworkLayers)
// into one block per strand / single-cell dot, plus locked `image` blocks
// for the centre motif drawn under and over the strands.

const svgUri = (markup, w, h) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${markup}</svg>`)}`;

export function isMeanderBlock(block) {
  return block.meanderKey != null;
}

const genKeyOf = (b) => b.meanderKey ?? b.genKey;
export function isGeneratedBlock(block) {
  return genKeyOf(block) != null;
}

export function buildMeanderBlocks(layers, gridComputed) {
  const { width: w, height: h, items, coreUnder, coreOver } = layers;
  const footprint = { gridCol: 0, gridRow: 0, cols: gridComputed.cols, rows: gridComputed.rows };
  const core = (key, name, markup) => markup ? [{
    id: crypto.randomUUID(), type: 'image', ...footprint, imageSrc: svgUri(markup, w, h), imageFit: 'contain',
    name, locked: true, meanderKey: key,
  }] : [];
  let strand = 0, dot = 0;
  return [
    ...core('coreUnder', 'Centre (under)', coreUnder),
    ...items.map(item => ({
      id: crypto.randomUUID(), type: 'vector', ...footprint,
      d: item.d, fill: item.fill, viewW: w, viewH: h, bounds: item.bounds,
      name: item.kind === 'dot' ? `Dot ${++dot}` : `${item.letter ? 'Letter strand' : 'Strand'} ${++strand}`,
      meanderKey: item.key,
    })),
    ...core('coreOver', 'Centre', coreOver),
  ];
}

// Copies each previous block's layer edits onto its counterpart in a
// freshly built design: id (so selection survives), visibility, lock,
// appearance and group -- its fill too when keepFill, i.e. when only the
// shape changed rather than the colours. A fill pinned to a swatch always
// carries across, taking the swatch's current colour (swatchMap: id → hex).
//
// Counterparts share a key. With byPosition (a Linework design whose size
// changed, e.g. more columns), the tiles are laid out afresh and keys no
// longer line up, so each edited block's edits go to the block now at the
// same place in the design instead (matchByPlace). Edited blocks with
// nothing there lose their edits; the rest start fresh.
export function carryGeneratedEdits(next, prev, { keepFill, swatchMap = {}, byPosition = false }) {
  const carry = (b, old) => {
    const out = { ...b, id: old.id };
    for (const k of ['hidden', 'locked', 'opacity', 'blendMode', 'groupId']) {
      if (old[k] !== undefined) out[k] = old[k];
    }
    if (old.type === 'vector' && b.type === 'vector') {
      if (old.fillSwatch) {
        out.fillSwatch = old.fillSwatch;
        out.fill = swatchMap[old.fillSwatch] ?? old.fill;
      } else if (old.fillFixed) {
        out.fillFixed = true;
        out.fill = old.fill;
      } else if (keepFill) {
        out.fill = old.fill;
      }
    }
    return out;
  };
  const generated = prev.filter(isGeneratedBlock);
  if (byPosition) {
    const match = matchByPlace(next, generated);
    return next.map(b => (match.has(b) ? carry(b, match.get(b)) : b));
  }
  const byKey = new Map(generated.map(b => [genKeyOf(b), b]));
  return next.map(b => {
    const old = byKey.get(genKeyOf(b));
    return old ? carry(b, old) : b;
  });
}

const isEdited = b => !!(b.fillSwatch || b.fillFixed || b.hidden || b.locked || b.opacity != null || b.blendMode);

// A block's centre as a share of the design's width and height, and its size.
function placeOf(b) {
  if (!b.bounds) return null;
  const { x, y, w, h } = b.bounds;
  return { u: (x + w / 2) / b.viewW, v: (y + h / 2) / b.viewH, w, h };
}

// For each edited old block, the closest unused new block of the same layer
// and kind to the same share of the design, if its centre is within half the
// old block's size. Returns Map(new block → old block).
function matchByPlace(next, prev) {
  const groups = new Map();
  for (const b of next) {
    const p = placeOf(b);
    if (!p) continue;
    const g = `${b.lwLayer}|${b.lwKind}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ b, p, used: false });
  }
  const match = new Map();
  for (const old of prev) {
    const p = placeOf(old);
    const list = p && isEdited(old) && groups.get(`${old.lwLayer}|${old.lwKind}`);
    if (!list) continue;
    let best = null, bestD = Infinity;
    for (const c of list) {
      if (c.used) continue;
      const d = Math.hypot((c.p.u - p.u) * c.b.viewW, (c.p.v - p.v) * c.b.viewH);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best && bestD <= Math.max(p.w, p.h) / 2) { best.used = true; match.set(best.b, old); }
  }
  return match;
}

export const carryMeanderEdits = carryGeneratedEdits;

// Uniform scale + offset that fits a vector block's design units into a
// footprint box (the same 'contain' fit image blocks use).
export function vectorFit(block, box) {
  const s = Math.min(box.w / block.viewW, box.h / block.viewH);
  return {
    s,
    tx: box.x + (box.w - block.viewW * s) / 2,
    ty: box.y + (box.h - block.viewH * s) / 2,
  };
}

export function vectorTransform(block, box) {
  const { s, tx, ty } = vectorFit(block, box);
  return `translate(${tx} ${ty}) scale(${s})`;
}

// The block's tight bounds in the same space as `box`.
export function vectorBounds(block, box) {
  if (!block.bounds) return box;
  const { s, tx, ty } = vectorFit(block, box);
  return { x: tx + block.bounds.x * s, y: ty + block.bounds.y * s, w: block.bounds.w * s, h: block.bounds.h * s };
}

// ── Hit testing ──────────────────────────────────────────────────────────────
// Vector layers overlap (they all share the grid footprint), so tools find
// them by their actual shape rather than the cell under the pointer.

const hitPaths = new WeakMap(); // block → Path2D
let hitCtx = null;

export function vectorPath(block) {
  let p = hitPaths.get(block);
  if (!p) hitPaths.set(block, p = new Path2D(block.d));
  return p;
}

// The topmost visible vector block whose shape contains artboard point `pt`.
export function vectorAt(pt, blocks, gridComputed) {
  if (!pt || !gridComputed) return null;
  hitCtx ??= document.createElement('canvas').getContext('2d');
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== 'vector' || b.hidden || b.blur) continue;
    const box = { x: gridOriginX + b.gridCol * cellSize, y: gridOriginY + b.gridRow * cellSize, w: b.cols * cellSize, h: b.rows * cellSize };
    const { s, tx, ty } = vectorFit(b, box);
    if (hitCtx.isPointInPath(vectorPath(b), (pt.x - tx) / s, (pt.y - ty) / s)) return b;
  }
  return null;
}
