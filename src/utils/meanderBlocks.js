// Turns a composed Meander design (composeKnotworkLayers) into placed
// blocks: one `vector` block per strand / single-cell dot, so each is its
// own selectable layer, plus locked `image` blocks for the centre motif
// drawn under and over the strands.
//
// A vector block is { type: 'vector', d, fill, viewW, viewH, bounds } on
// the usual grid footprint; `d` is in the design's own units (viewW x
// viewH), scaled uniformly into the footprint. `meanderKey` identifies
// which strand/dot (or core layer) a block came from, so regenerating with
// the same seed can carry each one's edits across.

const svgUri = (markup, w, h) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${markup}</svg>`)}`;

export function isMeanderBlock(block) {
  return block.meanderKey != null;
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

// Copies each previous block's layer edits onto its counterpart (same
// meanderKey) in a freshly built design: id (so selection survives),
// visibility, lock, appearance and group -- and its fill too when keepFill,
// i.e. when only the shape changed rather than the colours.
export function carryMeanderEdits(next, prev, { keepFill }) {
  const byKey = new Map(prev.filter(isMeanderBlock).map(b => [b.meanderKey, b]));
  return next.map(b => {
    const old = byKey.get(b.meanderKey);
    if (!old) return b;
    const out = { ...b, id: old.id };
    for (const k of ['hidden', 'locked', 'opacity', 'blendMode', 'groupId']) {
      if (old[k] !== undefined) out[k] = old[k];
    }
    if (keepFill && old.type === 'vector' && b.type === 'vector') out.fill = old.fill;
    return out;
  });
}

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
