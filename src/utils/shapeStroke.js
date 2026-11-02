// Shape outlines (5.9) for Grid Pattern shapes: a document-wide outline plus
// per-shape overrides. Width is a percentage of one grid cell, so outlines
// scale with the grid. Align: 'centre' straddles the edge, 'inside' stays
// within the shape, 'outside' sits around it (a sticker look). With fill
// off, shapes are drawn as outlines only (line art), always centred.
//
// Document: shapeStroke = { enabled, width, hex, swatch, align, fill }
// Block:    stroke = undefined (the document's) | { off: true } | { width?, hex?, swatch?, align? }

export const ALIGNS = ['inside', 'centre', 'outside'];

// The outline a block is drawn with — { width (fraction of a cell), colour,
// align, fill } — or null for none.
export function resolveShapeStroke(block, doc, swatchMap = {}) {
  const own = block.stroke;
  if (own?.off) return null;
  const s = own ? { ...doc, enabled: true, ...own } : doc;
  if (!s?.enabled || !(s.width > 0)) return null;
  const fill = doc?.fill !== false;
  return {
    width: s.width / 100,
    colour: (s.swatch && swatchMap[s.swatch]) || s.hex || '#000000',
    align: fill && ALIGNS.includes(s.align) ? s.align : 'centre',
    fill,
  };
}

// SVG attributes for one exported element of a shape whose outline is
// `stroke`: `unitWidth` is one cell in export units, `scale` the shape's fit
// (export units per shape unit). An inside outline also needs a clip path.
export function strokeAttributes(stroke, unitWidth, scale) {
  const attrs = {};
  if (!stroke.fill) attrs.fill = 'none';
  const w = (stroke.width * unitWidth) / scale;
  attrs.stroke = stroke.colour;
  attrs['stroke-width'] = String(+(stroke.align === 'centre' ? w : w * 2).toFixed(3));
  attrs['stroke-linejoin'] = 'round';
  if (stroke.align === 'outside') attrs['paint-order'] = 'stroke';
  return attrs;
}
