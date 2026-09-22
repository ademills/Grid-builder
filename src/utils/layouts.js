// Predetermined wireframe layouts. Each layout is a set of proportional slots
// (0–1, relative to the grid). At apply-time slots are quantised to grid cells.
//
// Slot roles:
//   grid     — left empty and armed as a fill mask for the main Fill button
//   headline — large title placeholder (thick grey bars)
//   copy     — body-text placeholder (thin grey lines)
//   meta     — small print / logo placeholder (small box + short bar)

export const LAYOUT_CATEGORIES = ['Poster', 'Cover', 'Editorial', 'Social', 'Card', 'Grid-led'];

export const LAYOUTS = [
  // ── Poster ──────────────────────────────────────────────────────────────
  { id: 'poster-hero', name: 'Hero', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.60 },
    { role: 'headline', x: 0.05, y: 0.64, w: 0.90, h: 0.14 },
    { role: 'copy', x: 0.05, y: 0.80, w: 0.62, h: 0.13 },
    { role: 'meta', x: 0.70, y: 0.80, w: 0.25, h: 0.13 },
  ] },
  { id: 'poster-band', name: 'Title Band', category: 'Poster', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.90, h: 0.16, align: 'center' },
    { role: 'grid', x: 0, y: 0.24, w: 1, h: 0.62 },
    { role: 'meta', x: 0.05, y: 0.89, w: 0.90, h: 0.06 },
  ] },
  { id: 'poster-split', name: 'Split', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.55, h: 1 },
    { role: 'headline', x: 0.60, y: 0.08, w: 0.36, h: 0.22 },
    { role: 'copy', x: 0.60, y: 0.34, w: 0.36, h: 0.40 },
    { role: 'meta', x: 0.60, y: 0.80, w: 0.36, h: 0.12 },
  ] },
  { id: 'poster-footer', name: 'Footer', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.74 },
    { role: 'headline', x: 0.05, y: 0.78, w: 0.60, h: 0.14 },
    { role: 'meta', x: 0.68, y: 0.78, w: 0.27, h: 0.14 },
  ] },
  { id: 'poster-stack', name: 'Stack', category: 'Poster', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.90, h: 0.14 },
    { role: 'grid', x: 0.05, y: 0.22, w: 0.90, h: 0.50 },
    { role: 'copy', x: 0.05, y: 0.75, w: 0.55, h: 0.18 },
    { role: 'meta', x: 0.64, y: 0.75, w: 0.31, h: 0.18 },
  ] },
  { id: 'poster-bigtype', name: 'Big Type', category: 'Poster', slots: [
    { role: 'headline', x: 0.05, y: 0.06, w: 0.90, h: 0.38 },
    { role: 'grid', x: 0, y: 0.48, w: 1, h: 0.52 },
  ] },
  { id: 'poster-corner', name: 'Corner Tag', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.05, y: 0.05, w: 0.45, h: 0.16 },
    { role: 'meta', x: 0.62, y: 0.86, w: 0.33, h: 0.09 },
  ] },
  { id: 'poster-topstrip', name: 'Top Strip', category: 'Poster', slots: [
    { role: 'meta', x: 0.05, y: 0.04, w: 0.90, h: 0.06 },
    { role: 'headline', x: 0.05, y: 0.13, w: 0.90, h: 0.16 },
    { role: 'grid', x: 0, y: 0.33, w: 1, h: 0.67 },
  ] },
  { id: 'poster-duo', name: 'Duo', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.49, h: 0.7 },
    { role: 'grid', x: 0.51, y: 0, w: 0.49, h: 0.7 },
    { role: 'headline', x: 0.05, y: 0.74, w: 0.90, h: 0.18, align: 'center' },
  ] },
  { id: 'poster-centerhero', name: 'Centre Hero', category: 'Poster', slots: [
    { role: 'headline', x: 0.1, y: 0.06, w: 0.8, h: 0.12, align: 'center' },
    { role: 'grid', x: 0.12, y: 0.22, w: 0.76, h: 0.54 },
    { role: 'copy', x: 0.2, y: 0.8, w: 0.6, h: 0.14, align: 'center' },
  ] },
  { id: 'poster-festival', name: 'Festival', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.55 },
    { role: 'headline', x: 0.05, y: 0.58, w: 0.90, h: 0.20, align: 'center' },
    { role: 'meta', x: 0.05, y: 0.82, w: 0.27, h: 0.12 },
    { role: 'meta', x: 0.37, y: 0.82, w: 0.27, h: 0.12 },
    { role: 'meta', x: 0.68, y: 0.82, w: 0.27, h: 0.12 },
  ] },
  { id: 'poster-rail', name: 'Left Rail', category: 'Poster', slots: [
    { role: 'headline', x: 0.04, y: 0.06, w: 0.22, h: 0.5 },
    { role: 'meta', x: 0.04, y: 0.6, w: 0.22, h: 0.34 },
    { role: 'grid', x: 0.3, y: 0.06, w: 0.66, h: 0.88 },
  ] },
  { id: 'poster-index', name: 'Index', category: 'Poster', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.9, h: 0.5 },
    { role: 'copy', x: 0.05, y: 0.73, w: 0.43, h: 0.2 },
    { role: 'copy', x: 0.52, y: 0.73, w: 0.43, h: 0.2 },
  ] },
  { id: 'poster-minimal', name: 'Minimal', category: 'Poster', slots: [
    { role: 'grid', x: 0.3, y: 0.2, w: 0.4, h: 0.4 },
    { role: 'headline', x: 0.1, y: 0.66, w: 0.8, h: 0.12, align: 'center' },
    { role: 'meta', x: 0.35, y: 0.82, w: 0.3, h: 0.08 },
  ] },
  { id: 'poster-ribbon', name: 'Ribbon', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.45 },
    { role: 'headline', x: 0, y: 0.45, w: 1, h: 0.12, align: 'center' },
    { role: 'grid', x: 0, y: 0.57, w: 1, h: 0.43 },
  ] },
  { id: 'poster-quote', name: 'Statement', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.28 },
    { role: 'headline', x: 0.08, y: 0.34, w: 0.84, h: 0.34, align: 'center' },
    { role: 'meta', x: 0.08, y: 0.74, w: 0.45, h: 0.1 },
  ] },

  // ── Cover ───────────────────────────────────────────────────────────────
  { id: 'cover-centered', name: 'Centred', category: 'Cover', slots: [
    { role: 'headline', x: 0.1, y: 0.08, w: 0.8, h: 0.14, align: 'center' },
    { role: 'grid', x: 0.12, y: 0.26, w: 0.76, h: 0.5 },
    { role: 'meta', x: 0.3, y: 0.82, w: 0.4, h: 0.08 },
  ] },
  { id: 'cover-frame', name: 'Framed', category: 'Cover', slots: [
    { role: 'grid', x: 0.08, y: 0.08, w: 0.84, h: 0.66 },
    { role: 'headline', x: 0.08, y: 0.78, w: 0.84, h: 0.1, align: 'center' },
    { role: 'meta', x: 0.25, y: 0.9, w: 0.5, h: 0.05 },
  ] },
  { id: 'cover-topstrip', name: 'Top Mark', category: 'Cover', slots: [
    { role: 'meta', x: 0.05, y: 0.04, w: 0.9, h: 0.06 },
    { role: 'headline', x: 0.05, y: 0.13, w: 0.9, h: 0.16 },
    { role: 'grid', x: 0, y: 0.33, w: 1, h: 0.67 },
  ] },
  { id: 'cover-fullbleed', name: 'Full Bleed', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.08, y: 0.08, w: 0.7, h: 0.16 },
    { role: 'meta', x: 0.08, y: 0.86, w: 0.4, h: 0.08 },
  ] },
  { id: 'cover-masthead', name: 'Masthead', category: 'Cover', slots: [
    { role: 'headline', x: 0.04, y: 0.04, w: 0.92, h: 0.1, align: 'center' },
    { role: 'grid', x: 0, y: 0.16, w: 1, h: 0.74 },
    { role: 'meta', x: 0.04, y: 0.92, w: 0.92, h: 0.05 },
  ] },
  { id: 'cover-spinelabel', name: 'Spine', category: 'Cover', slots: [
    { role: 'grid', x: 0.16, y: 0, w: 0.84, h: 1 },
    { role: 'headline', x: 0.02, y: 0.1, w: 0.12, h: 0.6 },
    { role: 'meta', x: 0.02, y: 0.74, w: 0.12, h: 0.2 },
  ] },
  { id: 'cover-lower', name: 'Lower Title', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.68 },
    { role: 'headline', x: 0.06, y: 0.72, w: 0.88, h: 0.16, align: 'center' },
    { role: 'meta', x: 0.3, y: 0.9, w: 0.4, h: 0.06 },
  ] },
  { id: 'cover-inset', name: 'Inset Panel', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.15, y: 0.38, w: 0.7, h: 0.14, align: 'center' },
    { role: 'copy', x: 0.25, y: 0.54, w: 0.5, h: 0.12, align: 'center' },
  ] },
  { id: 'cover-twoband', name: 'Two Band', category: 'Cover', slots: [
    { role: 'headline', x: 0.05, y: 0.06, w: 0.9, h: 0.12 },
    { role: 'grid', x: 0, y: 0.22, w: 1, h: 0.5 },
    { role: 'copy', x: 0.05, y: 0.76, w: 0.9, h: 0.18 },
  ] },
  { id: 'cover-emblem', name: 'Emblem', category: 'Cover', slots: [
    { role: 'meta', x: 0.4, y: 0.06, w: 0.2, h: 0.14 },
    { role: 'grid', x: 0.1, y: 0.24, w: 0.8, h: 0.5 },
    { role: 'headline', x: 0.1, y: 0.78, w: 0.8, h: 0.14, align: 'center' },
  ] },
  { id: 'cover-edge', name: 'Edge Title', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.05, y: 0.04, w: 0.9, h: 0.12 },
    { role: 'headline', x: 0.05, y: 0.84, w: 0.9, h: 0.12, align: 'right' },
  ] },

  // ── Editorial ───────────────────────────────────────────────────────────
  { id: 'ed-masthead', name: 'Masthead', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.55, h: 0.7 },
    { role: 'copy', x: 0.64, y: 0.2, w: 0.31, h: 0.5 },
    { role: 'meta', x: 0.64, y: 0.74, w: 0.31, h: 0.16 },
  ] },
  { id: 'ed-twocol', name: 'Two Column', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.13 },
    { role: 'grid', x: 0.05, y: 0.21, w: 0.9, h: 0.45 },
    { role: 'copy', x: 0.05, y: 0.69, w: 0.43, h: 0.22 },
    { role: 'copy', x: 0.52, y: 0.69, w: 0.43, h: 0.22 },
  ] },
  { id: 'ed-sidebar', name: 'Sidebar', category: 'Editorial', slots: [
    { role: 'copy', x: 0.05, y: 0.08, w: 0.26, h: 0.6 },
    { role: 'meta', x: 0.05, y: 0.72, w: 0.26, h: 0.2 },
    { role: 'headline', x: 0.35, y: 0.08, w: 0.6, h: 0.12 },
    { role: 'grid', x: 0.35, y: 0.23, w: 0.6, h: 0.69 },
  ] },
  { id: 'ed-feature', name: 'Feature', category: 'Editorial', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.45 },
    { role: 'headline', x: 0.05, y: 0.49, w: 0.9, h: 0.12 },
    { role: 'copy', x: 0.05, y: 0.64, w: 0.43, h: 0.28 },
    { role: 'copy', x: 0.52, y: 0.64, w: 0.43, h: 0.28 },
  ] },
  { id: 'ed-threecol', name: 'Three Column', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12 },
    { role: 'copy', x: 0.05, y: 0.2, w: 0.28, h: 0.72 },
    { role: 'grid', x: 0.36, y: 0.2, w: 0.28, h: 0.72 },
    { role: 'copy', x: 0.67, y: 0.2, w: 0.28, h: 0.72 },
  ] },
  { id: 'ed-pullquote', name: 'Pull Quote', category: 'Editorial', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.34 },
    { role: 'headline', x: 0.1, y: 0.38, w: 0.8, h: 0.16, align: 'center' },
    { role: 'copy', x: 0.05, y: 0.58, w: 0.43, h: 0.34 },
    { role: 'copy', x: 0.52, y: 0.58, w: 0.43, h: 0.34 },
  ] },
  { id: 'ed-gallery', name: 'Gallery', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.1 },
    { role: 'grid', x: 0.05, y: 0.18, w: 0.43, h: 0.36 },
    { role: 'grid', x: 0.52, y: 0.18, w: 0.43, h: 0.36 },
    { role: 'grid', x: 0.05, y: 0.57, w: 0.43, h: 0.36 },
    { role: 'copy', x: 0.52, y: 0.57, w: 0.43, h: 0.36 },
  ] },
  { id: 'ed-interview', name: 'Interview', category: 'Editorial', slots: [
    { role: 'grid', x: 0.05, y: 0.08, w: 0.3, h: 0.5 },
    { role: 'headline', x: 0.4, y: 0.08, w: 0.55, h: 0.16 },
    { role: 'copy', x: 0.4, y: 0.28, w: 0.55, h: 0.3 },
    { role: 'copy', x: 0.05, y: 0.62, w: 0.9, h: 0.3 },
  ] },
  { id: 'ed-review', name: 'Review', category: 'Editorial', slots: [
    { role: 'grid', x: 0.05, y: 0.06, w: 0.4, h: 0.46 },
    { role: 'headline', x: 0.5, y: 0.06, w: 0.45, h: 0.14 },
    { role: 'meta', x: 0.5, y: 0.22, w: 0.45, h: 0.3 },
    { role: 'copy', x: 0.05, y: 0.56, w: 0.9, h: 0.36 },
  ] },
  { id: 'ed-listicle', name: 'Listicle', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.35, h: 0.72 },
    { role: 'copy', x: 0.44, y: 0.2, w: 0.51, h: 0.22 },
    { role: 'copy', x: 0.44, y: 0.45, w: 0.51, h: 0.22 },
    { role: 'copy', x: 0.44, y: 0.7, w: 0.51, h: 0.22 },
  ] },
  { id: 'ed-spread', name: 'Spread', category: 'Editorial', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.5, h: 1 },
    { role: 'headline', x: 0.54, y: 0.08, w: 0.42, h: 0.14 },
    { role: 'copy', x: 0.54, y: 0.26, w: 0.42, h: 0.34 },
    { role: 'grid', x: 0.54, y: 0.62, w: 0.42, h: 0.3 },
  ] },
  { id: 'ed-deck', name: 'Deck', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.06, w: 0.9, h: 0.14 },
    { role: 'copy', x: 0.05, y: 0.22, w: 0.9, h: 0.1 },
    { role: 'grid', x: 0.05, y: 0.36, w: 0.9, h: 0.56 },
  ] },
  { id: 'ed-bylinetop', name: 'Byline Top', category: 'Editorial', slots: [
    { role: 'meta', x: 0.05, y: 0.05, w: 0.9, h: 0.07 },
    { role: 'headline', x: 0.05, y: 0.14, w: 0.9, h: 0.16 },
    { role: 'grid', x: 0.05, y: 0.34, w: 0.6, h: 0.58 },
    { role: 'copy', x: 0.68, y: 0.34, w: 0.27, h: 0.58 },
  ] },
  { id: 'ed-framed', name: 'Framed Text', category: 'Editorial', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.5 },
    { role: 'headline', x: 0.1, y: 0.55, w: 0.8, h: 0.12, align: 'center' },
    { role: 'copy', x: 0.15, y: 0.7, w: 0.7, h: 0.22, align: 'center' },
  ] },

  // ── Social ──────────────────────────────────────────────────────────────
  { id: 'soc-lower', name: 'Lower Third', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.05, y: 0.7, w: 0.7, h: 0.14 },
    { role: 'meta', x: 0.05, y: 0.86, w: 0.4, h: 0.07 },
  ] },
  { id: 'soc-top', name: 'Top Banner', category: 'Social', slots: [
    { role: 'headline', x: 0.05, y: 0.06, w: 0.9, h: 0.16 },
    { role: 'grid', x: 0, y: 0.26, w: 1, h: 0.74 },
  ] },
  { id: 'soc-quote', name: 'Quote', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.22 },
    { role: 'headline', x: 0.1, y: 0.3, w: 0.8, h: 0.3, align: 'center' },
    { role: 'meta', x: 0.1, y: 0.66, w: 0.45, h: 0.08 },
  ] },
  { id: 'soc-fullbleed', name: 'Full Bleed', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.08, y: 0.4, w: 0.84, h: 0.2, align: 'center' },
  ] },
  { id: 'soc-story', name: 'Story', category: 'Social', slots: [
    { role: 'meta', x: 0.05, y: 0.04, w: 0.9, h: 0.05 },
    { role: 'grid', x: 0, y: 0.12, w: 1, h: 0.6 },
    { role: 'headline', x: 0.06, y: 0.76, w: 0.88, h: 0.14 },
  ] },
  { id: 'soc-carousel', name: 'Carousel', category: 'Social', slots: [
    { role: 'headline', x: 0.06, y: 0.08, w: 0.88, h: 0.16 },
    { role: 'grid', x: 0.06, y: 0.28, w: 0.88, h: 0.5 },
    { role: 'meta', x: 0.4, y: 0.84, w: 0.2, h: 0.06 },
  ] },
  { id: 'soc-splitstory', name: 'Split Story', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.5 },
    { role: 'headline', x: 0.06, y: 0.55, w: 0.88, h: 0.16, align: 'center' },
    { role: 'copy', x: 0.15, y: 0.74, w: 0.7, h: 0.18, align: 'center' },
  ] },
  { id: 'soc-tag', name: 'Tagged', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'meta', x: 0.05, y: 0.05, w: 0.35, h: 0.1 },
    { role: 'headline', x: 0.05, y: 0.78, w: 0.9, h: 0.16 },
  ] },
  { id: 'soc-promo', name: 'Promo', category: 'Social', slots: [
    { role: 'headline', x: 0.06, y: 0.08, w: 0.88, h: 0.2, align: 'center' },
    { role: 'grid', x: 0.1, y: 0.32, w: 0.8, h: 0.4 },
    { role: 'meta', x: 0.25, y: 0.78, w: 0.5, h: 0.12 },
  ] },
  { id: 'soc-event', name: 'Event', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.45 },
    { role: 'headline', x: 0.06, y: 0.5, w: 0.88, h: 0.16 },
    { role: 'meta', x: 0.06, y: 0.7, w: 0.42, h: 0.22 },
    { role: 'copy', x: 0.52, y: 0.7, w: 0.42, h: 0.22 },
  ] },
  { id: 'soc-profile', name: 'Profile', category: 'Social', slots: [
    { role: 'grid', x: 0.32, y: 0.1, w: 0.36, h: 0.36 },
    { role: 'headline', x: 0.1, y: 0.52, w: 0.8, h: 0.12, align: 'center' },
    { role: 'copy', x: 0.2, y: 0.68, w: 0.6, h: 0.18, align: 'center' },
  ] },
  { id: 'soc-banner', name: 'Wide Banner', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.4, h: 1 },
    { role: 'headline', x: 0.45, y: 0.3, w: 0.5, h: 0.2 },
    { role: 'meta', x: 0.45, y: 0.54, w: 0.5, h: 0.16 },
  ] },

  // ── Card ────────────────────────────────────────────────────────────────
  { id: 'card-simple', name: 'Simple', category: 'Card', slots: [
    { role: 'grid', x: 0.06, y: 0.06, w: 0.88, h: 0.54 },
    { role: 'headline', x: 0.06, y: 0.64, w: 0.88, h: 0.12 },
    { role: 'copy', x: 0.06, y: 0.78, w: 0.7, h: 0.14 },
  ] },
  { id: 'card-portrait', name: 'Portrait', category: 'Card', slots: [
    { role: 'grid', x: 0.1, y: 0.06, w: 0.8, h: 0.46 },
    { role: 'headline', x: 0.1, y: 0.56, w: 0.8, h: 0.1, align: 'center' },
    { role: 'copy', x: 0.1, y: 0.68, w: 0.8, h: 0.16 },
    { role: 'meta', x: 0.1, y: 0.86, w: 0.5, h: 0.06 },
  ] },
  { id: 'card-side', name: 'Side', category: 'Card', slots: [
    { role: 'grid', x: 0.05, y: 0.1, w: 0.42, h: 0.8 },
    { role: 'headline', x: 0.52, y: 0.14, w: 0.43, h: 0.14 },
    { role: 'copy', x: 0.52, y: 0.32, w: 0.43, h: 0.4 },
    { role: 'meta', x: 0.52, y: 0.76, w: 0.43, h: 0.12 },
  ] },
  { id: 'card-banner', name: 'Banner', category: 'Card', slots: [
    { role: 'headline', x: 0.06, y: 0.08, w: 0.88, h: 0.16 },
    { role: 'grid', x: 0.06, y: 0.28, w: 0.88, h: 0.5 },
    { role: 'meta', x: 0.06, y: 0.82, w: 0.88, h: 0.1 },
  ] },
  { id: 'card-overlay', name: 'Overlay', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.08, y: 0.66, w: 0.84, h: 0.14 },
    { role: 'meta', x: 0.08, y: 0.84, w: 0.5, h: 0.08 },
  ] },
  { id: 'card-ticket', name: 'Ticket', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.66, h: 1 },
    { role: 'headline', x: 0.7, y: 0.12, w: 0.26, h: 0.3 },
    { role: 'meta', x: 0.7, y: 0.5, w: 0.26, h: 0.38 },
  ] },
  { id: 'card-stat', name: 'Stat', category: 'Card', slots: [
    { role: 'headline', x: 0.08, y: 0.1, w: 0.84, h: 0.3, align: 'center' },
    { role: 'grid', x: 0.1, y: 0.44, w: 0.8, h: 0.34 },
    { role: 'copy', x: 0.1, y: 0.82, w: 0.8, h: 0.1, align: 'center' },
  ] },
  { id: 'card-product', name: 'Product', category: 'Card', slots: [
    { role: 'grid', x: 0.1, y: 0.08, w: 0.8, h: 0.5 },
    { role: 'headline', x: 0.08, y: 0.62, w: 0.6, h: 0.12 },
    { role: 'meta', x: 0.7, y: 0.62, w: 0.22, h: 0.12 },
    { role: 'copy', x: 0.08, y: 0.78, w: 0.84, h: 0.14 },
  ] },
  { id: 'card-quotecard', name: 'Quote Card', category: 'Card', slots: [
    { role: 'headline', x: 0.1, y: 0.16, w: 0.8, h: 0.4, align: 'center' },
    { role: 'grid', x: 0.4, y: 0.6, w: 0.2, h: 0.16 },
    { role: 'meta', x: 0.3, y: 0.82, w: 0.4, h: 0.08 },
  ] },
  { id: 'card-splitcard', name: 'Split', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.5 },
    { role: 'headline', x: 0.08, y: 0.56, w: 0.84, h: 0.14 },
    { role: 'copy', x: 0.08, y: 0.72, w: 0.84, h: 0.2 },
  ] },
  { id: 'card-badge', name: 'Badge', category: 'Card', slots: [
    { role: 'meta', x: 0.38, y: 0.08, w: 0.24, h: 0.16 },
    { role: 'grid', x: 0.12, y: 0.28, w: 0.76, h: 0.42 },
    { role: 'headline', x: 0.12, y: 0.74, w: 0.76, h: 0.16, align: 'center' },
  ] },
  { id: 'card-thumb', name: 'Thumb Row', category: 'Card', slots: [
    { role: 'headline', x: 0.06, y: 0.08, w: 0.88, h: 0.16 },
    { role: 'copy', x: 0.06, y: 0.28, w: 0.88, h: 0.3 },
    { role: 'grid', x: 0.06, y: 0.62, w: 0.28, h: 0.3 },
    { role: 'grid', x: 0.36, y: 0.62, w: 0.28, h: 0.3 },
    { role: 'grid', x: 0.66, y: 0.62, w: 0.28, h: 0.3 },
  ] },

  // ── Grid-led ────────────────────────────────────────────────────────────
  { id: 'gl-full', name: 'Full Grid', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
  ] },
  { id: 'gl-sidebar', name: 'Sidebar', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.8, h: 1 },
    { role: 'headline', x: 0.83, y: 0.06, w: 0.14, h: 0.3 },
    { role: 'copy', x: 0.83, y: 0.4, w: 0.14, h: 0.4 },
    { role: 'meta', x: 0.83, y: 0.84, w: 0.14, h: 0.1 },
  ] },
  { id: 'gl-header', name: 'Header', category: 'Grid-led', slots: [
    { role: 'headline', x: 0.04, y: 0.04, w: 0.62, h: 0.1 },
    { role: 'meta', x: 0.7, y: 0.04, w: 0.26, h: 0.1 },
    { role: 'grid', x: 0, y: 0.18, w: 1, h: 0.82 },
  ] },
  { id: 'gl-twin', name: 'Twin', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.49, h: 1 },
    { role: 'grid', x: 0.51, y: 0, w: 0.49, h: 0.78 },
    { role: 'headline', x: 0.51, y: 0.8, w: 0.49, h: 0.12 },
  ] },
  { id: 'gl-footer', name: 'Footer Bar', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.86 },
    { role: 'meta', x: 0.05, y: 0.89, w: 0.5, h: 0.07 },
    { role: 'headline', x: 0.6, y: 0.88, w: 0.35, h: 0.08 },
  ] },
  { id: 'gl-quad', name: 'Quad', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.49, h: 0.49 },
    { role: 'grid', x: 0.51, y: 0, w: 0.49, h: 0.49 },
    { role: 'grid', x: 0, y: 0.51, w: 0.49, h: 0.49 },
    { role: 'grid', x: 0.51, y: 0.51, w: 0.49, h: 0.49 },
  ] },
  { id: 'gl-mosaic', name: 'Mosaic', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.66, h: 0.66 },
    { role: 'grid', x: 0.68, y: 0, w: 0.32, h: 0.32 },
    { role: 'grid', x: 0.68, y: 0.34, w: 0.32, h: 0.32 },
    { role: 'grid', x: 0, y: 0.68, w: 0.32, h: 0.32 },
    { role: 'grid', x: 0.34, y: 0.68, w: 0.66, h: 0.32 },
  ] },
  { id: 'gl-tstack', name: 'Title Stack', category: 'Grid-led', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.1 },
    { role: 'grid', x: 0, y: 0.18, w: 1, h: 0.64 },
    { role: 'meta', x: 0.05, y: 0.85, w: 0.9, h: 0.08 },
  ] },
  { id: 'gl-lcaption', name: 'Captioned', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.82 },
    { role: 'copy', x: 0.05, y: 0.85, w: 0.9, h: 0.1 },
  ] },
  { id: 'gl-band', name: 'Mid Band', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.4 },
    { role: 'headline', x: 0.05, y: 0.44, w: 0.9, h: 0.12, align: 'center' },
    { role: 'grid', x: 0, y: 0.6, w: 1, h: 0.4 },
  ] },
  { id: 'gl-lshape', name: 'L-Shape', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.62 },
    { role: 'grid', x: 0, y: 0.64, w: 0.6, h: 0.36 },
    { role: 'headline', x: 0.64, y: 0.66, w: 0.32, h: 0.14 },
    { role: 'meta', x: 0.64, y: 0.82, w: 0.32, h: 0.12 },
  ] },
  { id: 'gl-columns', name: 'Columns', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.32, h: 1 },
    { role: 'grid', x: 0.34, y: 0, w: 0.32, h: 1 },
    { role: 'grid', x: 0.68, y: 0, w: 0.32, h: 1 },
  ] },
  { id: 'gl-rows', name: 'Rows', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.32 },
    { role: 'grid', x: 0, y: 0.34, w: 1, h: 0.32 },
    { role: 'grid', x: 0, y: 0.68, w: 1, h: 0.32 },
  ] },
  { id: 'gl-bigsmall', name: 'Big + Small', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.66 },
    { role: 'grid', x: 0, y: 0.68, w: 0.32, h: 0.32 },
    { role: 'grid', x: 0.34, y: 0.68, w: 0.32, h: 0.32 },
    { role: 'grid', x: 0.68, y: 0.68, w: 0.32, h: 0.32 },
  ] },
  { id: 'gl-stagger', name: 'Stagger', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.48, h: 0.55 },
    { role: 'grid', x: 0.52, y: 0.12, w: 0.48, h: 0.55 },
    { role: 'grid', x: 0, y: 0.6, w: 0.48, h: 0.4 },
    { role: 'headline', x: 0.52, y: 0.72, w: 0.44, h: 0.16 },
  ] },

  // ── Extra / experimental ──────────────────────────────────────────────────
  { id: 'poster-triptych', name: 'Triptych', category: 'Poster', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12, align: 'center' },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.28, h: 0.6 },
    { role: 'grid', x: 0.36, y: 0.2, w: 0.28, h: 0.6 },
    { role: 'grid', x: 0.67, y: 0.2, w: 0.28, h: 0.6 },
    { role: 'meta', x: 0.3, y: 0.84, w: 0.4, h: 0.08 },
  ] },
  { id: 'poster-diagsteps', name: 'Steps', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.5, h: 0.4 },
    { role: 'grid', x: 0.5, y: 0.2, w: 0.5, h: 0.4 },
    { role: 'grid', x: 0, y: 0.6, w: 0.5, h: 0.4 },
    { role: 'headline', x: 0.52, y: 0.66, w: 0.44, h: 0.28 },
  ] },
  { id: 'poster-asym', name: 'Asymmetric', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.62, h: 0.7 },
    { role: 'headline', x: 0.66, y: 0.06, w: 0.3, h: 0.5 },
    { role: 'copy', x: 0.05, y: 0.74, w: 0.6, h: 0.2 },
    { role: 'meta', x: 0.68, y: 0.6, w: 0.27, h: 0.34 },
  ] },
  { id: 'poster-spotlight', name: 'Spotlight', category: 'Poster', slots: [
    { role: 'grid', x: 0.22, y: 0.14, w: 0.56, h: 0.5 },
    { role: 'headline', x: 0.1, y: 0.68, w: 0.8, h: 0.16, align: 'center' },
    { role: 'meta', x: 0.35, y: 0.88, w: 0.3, h: 0.06 },
  ] },
  { id: 'cover-splitv', name: 'Vertical Split', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.5 },
    { role: 'headline', x: 0.08, y: 0.56, w: 0.84, h: 0.18, align: 'center' },
    { role: 'meta', x: 0.3, y: 0.8, w: 0.4, h: 0.1 },
  ] },
  { id: 'cover-cornertitle', name: 'Corner Title', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.06, y: 0.62, w: 0.5, h: 0.3 },
  ] },
  { id: 'cover-stripe', name: 'Stripe', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.34 },
    { role: 'headline', x: 0.06, y: 0.4, w: 0.88, h: 0.16 },
    { role: 'grid', x: 0, y: 0.6, w: 1, h: 0.4 },
  ] },
  { id: 'ed-photoessay', name: 'Photo Essay', category: 'Editorial', slots: [
    { role: 'grid', x: 0.05, y: 0.06, w: 0.55, h: 0.5 },
    { role: 'grid', x: 0.63, y: 0.06, w: 0.32, h: 0.24 },
    { role: 'grid', x: 0.63, y: 0.32, w: 0.32, h: 0.24 },
    { role: 'headline', x: 0.05, y: 0.6, w: 0.9, h: 0.12 },
    { role: 'copy', x: 0.05, y: 0.74, w: 0.9, h: 0.18 },
  ] },
  { id: 'ed-qa', name: 'Q & A', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.12 },
    { role: 'copy', x: 0.05, y: 0.2, w: 0.9, h: 0.16 },
    { role: 'grid', x: 0.05, y: 0.4, w: 0.4, h: 0.52 },
    { role: 'copy', x: 0.5, y: 0.4, w: 0.45, h: 0.52 },
  ] },
  { id: 'ed-timeline', name: 'Timeline', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.9, h: 0.1 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.18, h: 0.72 },
    { role: 'copy', x: 0.28, y: 0.2, w: 0.67, h: 0.2 },
    { role: 'copy', x: 0.28, y: 0.44, w: 0.67, h: 0.2 },
    { role: 'copy', x: 0.28, y: 0.68, w: 0.67, h: 0.2 },
  ] },
  { id: 'soc-grid9', name: 'Grid Nine', category: 'Social', slots: [
    { role: 'grid', x: 0.04, y: 0.04, w: 0.29, h: 0.29 },
    { role: 'grid', x: 0.355, y: 0.04, w: 0.29, h: 0.29 },
    { role: 'grid', x: 0.67, y: 0.04, w: 0.29, h: 0.29 },
    { role: 'grid', x: 0.04, y: 0.355, w: 0.29, h: 0.29 },
    { role: 'grid', x: 0.355, y: 0.355, w: 0.29, h: 0.29 },
    { role: 'grid', x: 0.67, y: 0.355, w: 0.29, h: 0.29 },
    { role: 'headline', x: 0.04, y: 0.7, w: 0.92, h: 0.24, align: 'center' },
  ] },
  { id: 'soc-testimonial', name: 'Testimonial', category: 'Social', slots: [
    { role: 'grid', x: 0.36, y: 0.08, w: 0.28, h: 0.28 },
    { role: 'headline', x: 0.1, y: 0.42, w: 0.8, h: 0.3, align: 'center' },
    { role: 'meta', x: 0.3, y: 0.78, w: 0.4, h: 0.1 },
  ] },
  { id: 'soc-countdown', name: 'Countdown', category: 'Social', slots: [
    { role: 'headline', x: 0.06, y: 0.1, w: 0.88, h: 0.2, align: 'center' },
    { role: 'grid', x: 0.06, y: 0.34, w: 0.42, h: 0.42 },
    { role: 'grid', x: 0.52, y: 0.34, w: 0.42, h: 0.42 },
    { role: 'meta', x: 0.3, y: 0.82, w: 0.4, h: 0.1 },
  ] },
  { id: 'card-polaroid', name: 'Polaroid', category: 'Card', slots: [
    { role: 'grid', x: 0.1, y: 0.08, w: 0.8, h: 0.62 },
    { role: 'headline', x: 0.1, y: 0.76, w: 0.8, h: 0.16, align: 'center' },
  ] },
  { id: 'card-listcard', name: 'List', category: 'Card', slots: [
    { role: 'headline', x: 0.06, y: 0.06, w: 0.88, h: 0.14 },
    { role: 'copy', x: 0.06, y: 0.24, w: 0.88, h: 0.12 },
    { role: 'copy', x: 0.06, y: 0.4, w: 0.88, h: 0.12 },
    { role: 'copy', x: 0.06, y: 0.56, w: 0.88, h: 0.12 },
    { role: 'meta', x: 0.06, y: 0.74, w: 0.88, h: 0.18 },
  ] },
  { id: 'card-herocard', name: 'Hero Card', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.62 },
    { role: 'headline', x: 0.06, y: 0.66, w: 0.88, h: 0.14 },
    { role: 'copy', x: 0.06, y: 0.82, w: 0.6, h: 0.12 },
    { role: 'meta', x: 0.7, y: 0.82, w: 0.24, h: 0.12 },
  ] },
  { id: 'gl-pinwheel', name: 'Pinwheel', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.62, h: 0.38 },
    { role: 'grid', x: 0.64, y: 0, w: 0.36, h: 0.62 },
    { role: 'grid', x: 0.38, y: 0.64, w: 0.62, h: 0.36 },
    { role: 'grid', x: 0, y: 0.4, w: 0.36, h: 0.6 },
  ] },
  { id: 'gl-brick', name: 'Brick', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.32, h: 0.49 },
    { role: 'grid', x: 0.34, y: 0, w: 0.32, h: 0.49 },
    { role: 'grid', x: 0.68, y: 0, w: 0.32, h: 0.49 },
    { role: 'grid', x: 0.16, y: 0.51, w: 0.32, h: 0.49 },
    { role: 'grid', x: 0.52, y: 0.51, w: 0.32, h: 0.49 },
  ] },
  { id: 'gl-bothrails', name: 'Both Rails', category: 'Grid-led', slots: [
    { role: 'meta', x: 0.03, y: 0.1, w: 0.13, h: 0.8 },
    { role: 'grid', x: 0.2, y: 0.06, w: 0.6, h: 0.88 },
    { role: 'copy', x: 0.84, y: 0.1, w: 0.13, h: 0.8 },
  ] },
  { id: 'gl-offsetquad', name: 'Offset Quad', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.58, h: 0.58 },
    { role: 'grid', x: 0.6, y: 0, w: 0.4, h: 0.4 },
    { role: 'grid', x: 0.6, y: 0.42, w: 0.4, h: 0.58 },
    { role: 'grid', x: 0, y: 0.6, w: 0.58, h: 0.4 },
  ] },

  // ── Experimental / rotated ────────────────────────────────────────────────
  { id: 'poster-vertical-title', name: 'Vertical Title', category: 'Poster', slots: [
    { role: 'grid', x: 0.26, y: 0, w: 0.74, h: 1 },
    { role: 'headline', x: -0.18, y: 0.41, w: 0.6, h: 0.18, rotation: -90, align: 'center' },
    { role: 'meta', x: 0.02, y: 0.86, w: 0.2, h: 0.1 },
  ] },
  { id: 'poster-tilt', name: 'Tilted Tag', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.08, y: 0.1, w: 0.5, h: 0.16, rotation: -8 },
    { role: 'meta', x: 0.6, y: 0.78, w: 0.32, h: 0.12, rotation: 6 },
  ] },
  { id: 'poster-diagonal-band', name: 'Diagonal Band', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.05, y: 0.42, w: 0.9, h: 0.16, rotation: -18, align: 'center' },
  ] },
  { id: 'poster-skew-stack', name: 'Skew Stack', category: 'Poster', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.6 },
    { role: 'headline', x: 0.06, y: 0.64, w: 0.6, h: 0.14, rotation: -4 },
    { role: 'copy', x: 0.06, y: 0.8, w: 0.55, h: 0.14, rotation: 3 },
    { role: 'meta', x: 0.7, y: 0.7, w: 0.24, h: 0.22 },
  ] },
  { id: 'poster-cross', name: 'Cross Axis', category: 'Poster', slots: [
    { role: 'grid', x: 0.18, y: 0.2, w: 0.64, h: 0.6 },
    { role: 'headline', x: 0.05, y: 0.04, w: 0.9, h: 0.1, align: 'center' },
    { role: 'headline', x: -0.18, y: 0.41, w: 0.6, h: 0.1, rotation: 90, align: 'center' },
  ] },
  { id: 'cover-side-spine', name: 'Side Spine', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: -0.2, y: 0.4, w: 0.7, h: 0.14, rotation: -90, align: 'center' },
  ] },
  { id: 'cover-rot-emblem', name: 'Rotated Emblem', category: 'Cover', slots: [
    { role: 'grid', x: 0.1, y: 0.12, w: 0.8, h: 0.56 },
    { role: 'meta', x: 0.4, y: 0.02, w: 0.2, h: 0.16, rotation: 45 },
    { role: 'headline', x: 0.1, y: 0.74, w: 0.8, h: 0.16, align: 'center' },
  ] },
  { id: 'cover-angled', name: 'Angled Title', category: 'Cover', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.62 },
    { role: 'headline', x: 0.06, y: 0.66, w: 0.7, h: 0.2, rotation: -6 },
    { role: 'meta', x: 0.06, y: 0.9, w: 0.5, h: 0.06 },
  ] },
  { id: 'ed-sidecaption', name: 'Side Caption', category: 'Editorial', slots: [
    { role: 'headline', x: 0.05, y: 0.05, w: 0.78, h: 0.12 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.78, h: 0.72 },
    { role: 'copy', x: 0.52, y: 0.5, w: 0.72, h: 0.12, rotation: -90 },
  ] },
  { id: 'ed-rot-folio', name: 'Folio', category: 'Editorial', slots: [
    { role: 'meta', x: 0.82, y: 0.42, w: 0.16, h: 0.16, rotation: 90 },
    { role: 'headline', x: 0.05, y: 0.06, w: 0.72, h: 0.12 },
    { role: 'grid', x: 0.05, y: 0.2, w: 0.72, h: 0.6 },
    { role: 'copy', x: 0.05, y: 0.82, w: 0.72, h: 0.12 },
  ] },
  { id: 'ed-zigzag', name: 'Zig Zag', category: 'Editorial', slots: [
    { role: 'grid', x: 0.05, y: 0.06, w: 0.5, h: 0.4 },
    { role: 'copy', x: 0.58, y: 0.1, w: 0.37, h: 0.32, rotation: 4 },
    { role: 'copy', x: 0.05, y: 0.52, w: 0.37, h: 0.32, rotation: -4 },
    { role: 'grid', x: 0.45, y: 0.5, w: 0.5, h: 0.44 },
  ] },
  { id: 'soc-tilt-quote', name: 'Tilt Quote', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.1, y: 0.32, w: 0.8, h: 0.3, rotation: -10, align: 'center' },
    { role: 'meta', x: 0.32, y: 0.74, w: 0.36, h: 0.08 },
  ] },
  { id: 'soc-corner-flags', name: 'Corner Flags', category: 'Social', slots: [
    { role: 'grid', x: 0.12, y: 0.12, w: 0.76, h: 0.76 },
    { role: 'headline', x: 0.0, y: 0.02, w: 0.4, h: 0.1, rotation: -30 },
    { role: 'meta', x: 0.6, y: 0.88, w: 0.38, h: 0.08, rotation: -30 },
  ] },
  { id: 'soc-sticker', name: 'Sticker', category: 'Social', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'meta', x: 0.58, y: 0.08, w: 0.3, h: 0.2, rotation: 12 },
    { role: 'headline', x: 0.06, y: 0.66, w: 0.7, h: 0.18, rotation: -5 },
  ] },
  { id: 'soc-marquee', name: 'Marquee', category: 'Social', slots: [
    { role: 'headline', x: 0.04, y: 0.06, w: 0.92, h: 0.12, align: 'center' },
    { role: 'grid', x: 0.04, y: 0.22, w: 0.92, h: 0.5 },
    { role: 'copy', x: 0.04, y: 0.76, w: 0.92, h: 0.18, align: 'center' },
  ] },
  { id: 'card-rot-badge', name: 'Rotated Badge', category: 'Card', slots: [
    { role: 'grid', x: 0.08, y: 0.08, w: 0.84, h: 0.58 },
    { role: 'meta', x: 0.62, y: 0.04, w: 0.26, h: 0.18, rotation: 14 },
    { role: 'headline', x: 0.08, y: 0.7, w: 0.84, h: 0.2, align: 'center' },
  ] },
  { id: 'card-twopanel', name: 'Two Panel', category: 'Card', slots: [
    { role: 'grid', x: 0.06, y: 0.1, w: 0.42, h: 0.5 },
    { role: 'grid', x: 0.5, y: 0.1, w: 0.42, h: 0.5 },
    { role: 'headline', x: 0.1, y: 0.66, w: 0.8, h: 0.16, align: 'center' },
    { role: 'meta', x: 0.32, y: 0.86, w: 0.36, h: 0.08 },
  ] },
  { id: 'card-corner-fold', name: 'Corner Fold', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.7 },
    { role: 'meta', x: 0.74, y: 0.04, w: 0.2, h: 0.14, rotation: 45 },
    { role: 'headline', x: 0.06, y: 0.74, w: 0.88, h: 0.18 },
  ] },
  { id: 'card-diag-title', name: 'Diagonal Title', category: 'Card', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'headline', x: 0.05, y: 0.4, w: 0.9, h: 0.16, rotation: -12, align: 'center' },
  ] },
  { id: 'gl-stamp', name: 'Stamp', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'meta', x: 0.66, y: 0.06, w: 0.26, h: 0.16, rotation: -12 },
  ] },
  { id: 'gl-diaglabel', name: 'Diagonal Label', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 1 },
    { role: 'meta', x: -0.18, y: 0.45, w: 0.5, h: 0.1, rotation: -90 },
  ] },
  { id: 'gl-bevel', name: 'Bevel', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.66, h: 0.66 },
    { role: 'grid', x: 0.68, y: 0, w: 0.32, h: 1 },
    { role: 'headline', x: 0.02, y: 0.72, w: 0.62, h: 0.12, rotation: -3 },
    { role: 'meta', x: 0.02, y: 0.88, w: 0.62, h: 0.08 },
  ] },
  { id: 'gl-spiralish', name: 'Spiral', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 0.7, h: 0.7 },
    { role: 'grid', x: 0.72, y: 0, w: 0.28, h: 0.7 },
    { role: 'grid', x: 0.3, y: 0.72, w: 0.7, h: 0.28 },
    { role: 'grid', x: 0, y: 0.72, w: 0.28, h: 0.28 },
  ] },
  { id: 'gl-banner-rot', name: 'Banner Rotate', category: 'Grid-led', slots: [
    { role: 'grid', x: 0, y: 0, w: 1, h: 0.78 },
    { role: 'headline', x: 0.05, y: 0.82, w: 0.6, h: 0.12, rotation: -3 },
    { role: 'meta', x: 0.7, y: 0.82, w: 0.25, h: 0.12 },
  ] },
  { id: 'gl-windowpane', name: 'Windowpane', category: 'Grid-led', slots: [
    { role: 'grid', x: 0.04, y: 0.04, w: 0.44, h: 0.28 },
    { role: 'grid', x: 0.52, y: 0.04, w: 0.44, h: 0.28 },
    { role: 'grid', x: 0.04, y: 0.36, w: 0.92, h: 0.28 },
    { role: 'grid', x: 0.04, y: 0.68, w: 0.44, h: 0.28 },
    { role: 'grid', x: 0.52, y: 0.68, w: 0.44, h: 0.28 },
  ] },
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Quantise a layout's proportional slots to integer grid cells.
export function computeLayoutRegions(layout, gridComputed) {
  if (!layout || !gridComputed) return [];
  const { cols, rows } = gridComputed;
  return layout.slots.map(s => {
    const rotation = s.rotation ?? 0;
    // Rotated, non-grid overlay slots may legitimately extend beyond the grid
    // before rotation (e.g. a wide-short box rotated 90° into a vertical spine),
    // so they bypass the in-bounds clamp. Grid slots always stay axis-aligned
    // and clamped since they feed the fill mask.
    if (rotation && s.role !== 'grid') {
      return {
        role: s.role,
        align: s.align ?? 'left',
        rotation,
        x: Math.round(s.x * cols),
        y: Math.round(s.y * rows),
        w: Math.max(1, Math.round(s.w * cols)),
        h: Math.max(1, Math.round(s.h * rows)),
      };
    }
    const x = clamp(Math.round(s.x * cols), 0, cols - 1);
    const y = clamp(Math.round(s.y * rows), 0, rows - 1);
    return {
      role: s.role,
      align: s.align ?? 'left',
      rotation,
      x, y,
      w: clamp(Math.round(s.w * cols), 1, cols - x),
      h: clamp(Math.round(s.h * rows), 1, rows - y),
    };
  });
}

// Union of all `grid` slot cells → the fill mask for the main Fill button.
export function computeGridMask(layout, gridComputed) {
  const regions = computeLayoutRegions(layout, gridComputed);
  const cells = new Set();
  for (const r of regions) {
    if (r.role !== 'grid') continue;
    for (let row = r.y; row < r.y + r.h; row++)
      for (let col = r.x; col < r.x + r.w; col++)
        cells.add(`${col},${row}`);
  }
  return cells;
}

// Build wireframe placeholder blocks for the non-grid slots.
export function buildWireframeBlocks(layout, gridComputed) {
  const regions = computeLayoutRegions(layout, gridComputed);
  return regions
    .filter(r => r.role !== 'grid')
    .map(r => ({
      id: crypto.randomUUID(),
      type: 'wireframe',
      slotRole: r.role,
      align: r.align,
      rotation: r.rotation,
      cols: r.w,
      rows: r.h,
      gridCol: r.x,
      gridRow: r.y,
    }));
}

// Returns grey placeholder rects (proportional 0–1 within the slot box) for a
// role, honouring horizontal alignment ('left' | 'center' | 'right'). Shared by
// the canvas renderer, picker thumbnails, and SVG export.
// Each rect: { x, y, w, h, shade } where shade 0–1 maps to grey darkness.
export function wireframeRects(role, align = 'left') {
  const pad = 0.08;
  const iw = 1 - pad * 2;
  // x-position for a bar of width w under the current alignment.
  const ax = (w) => align === 'center' ? pad + (iw - w) / 2
                  : align === 'right'  ? pad + (iw - w)
                  : pad;
  if (role === 'headline') {
    const w2 = iw * 0.7;
    return [
      { x: ax(iw), y: 0.22, w: iw, h: 0.26, shade: 0.55 },
      { x: ax(w2), y: 0.56, w: w2, h: 0.22, shade: 0.55 },
    ];
  }
  if (role === 'copy') {
    const lines = [];
    const n = 5;
    const gap = 0.04;
    const lh = (1 - pad * 2 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const w = last ? iw * 0.55 : iw;
      lines.push({ x: last ? ax(w) : pad, y: pad + i * (lh + gap), w, h: lh, shade: 0.32 });
    }
    return lines;
  }
  if (role === 'meta') {
    // logo box + two short lines, kept as a left-anchored cluster (small print).
    return [
      { x: pad, y: 0.30, w: 0.22, h: 0.40, shade: 0.45 },
      { x: pad + 0.28, y: 0.34, w: iw - 0.28, h: 0.14, shade: 0.3 },
      { x: pad + 0.28, y: 0.54, w: (iw - 0.28) * 0.7, h: 0.12, shade: 0.3 },
    ];
  }
  return [];
}
