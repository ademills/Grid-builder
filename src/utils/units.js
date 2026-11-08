// Document units (v1.16): px, mm or inches. Artboard sizes are stored in
// points, as Illustrator does (1 px = 1 pt = 1/72 in: A4 is 595 × 842), so
// a unit only changes what's shown and typed, never the artwork.

export const UNITS = {
  px: { label: 'px', perPt: 1, decimals: 0, fine: 1 },
  mm: { label: 'mm', perPt: 25.4 / 72, decimals: 1, fine: 2 },
  in: { label: 'in', perPt: 1 / 72, decimals: 2, fine: 3 },
};
export const UNIT_KEYS = Object.keys(UNITS);
const TYPED = { mm: 25.4 / 72, cm: 2.54 / 72, in: 1 / 72, pt: 1, px: 1 };

const unitOf = (unit) => UNITS[unit] ?? UNITS.px;

// Artboard units (pt) → the document unit, and back.
export const fromArt = (v, unit) => v * unitOf(unit).perPt;
export const toArt = (v, unit) => v / unitOf(unit).perPt;

// A typed value with a suffix (210mm, 8.5in) in the field's unit -- for
// evalNumber's toUnit.
export const typedToUnit = (unit) => (v, typed) => (TYPED[typed] ? fromArt(v / TYPED[typed], unit) : v);

// "210 mm", "8.27 in", "595 px". fine: more decimals, for small sizes
// (a cell, a line's width).
export function formatLength(v, unit, { fine = false, suffix = true } = {}) {
  const u = unitOf(unit);
  const n = fromArt(v, unit);
  let d = fine ? u.fine : u.decimals;
  // Keep at least two significant figures for tiny lengths.
  while (d < 4 && n !== 0 && Math.abs(n) < 10 ** (1 - d)) d++;
  const text = String(+n.toFixed(d));
  return suffix ? `${text} ${u.label}` : text;
}

// An SVG's width / height attribute: a real size for mm and in, so print and
// plotter software take the artwork at its size; plain numbers for px, as
// before.
export function svgLength(v, unit) {
  if (unit !== 'mm' && unit !== 'in') return String(v);
  return `${+fromArt(v, unit).toFixed(unit === 'mm' ? 3 : 4)}${unit}`;
}
