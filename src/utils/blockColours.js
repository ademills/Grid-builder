import { resolveSlotColours, getColourTemplate } from './colorize';
import { getSlotCoverage } from './slotCoverage';

// One place that answers "what colour is each part of this block?", shared
// by the canvas, export and the Layers panel so they always agree.

// Document swatches by id (shape colours + block backgrounds). Pins point at
// these ids, so editing a swatch recolours every block pinned to it.
export function buildSwatchMap(shapeColors, bgColors) {
  const map = {};
  for (const c of shapeColors ?? []) map[c.id] = c.hex;
  for (const c of bgColors ?? []) map[c.id] = c.hex;
  return map;
}

// { slotIndex: hex } for a block's pins, dropping pins to deleted swatches.
export function resolvePins(block, swatchMap) {
  if (!block.slotPins) return null;
  let out = null;
  for (const [slot, swatchId] of Object.entries(block.slotPins)) {
    const hex = swatchMap[swatchId];
    if (hex) (out ??= {})[slot] = hex;
  }
  return out;
}

export function isShapeBlock(block) {
  return !block.type && !!block.svgContent;
}

// Everything the colour modes need, bundled so callers pass one object.
//   { colorMode, palette, bgOptions, gridComputed, gradientSettings,
//     meshSettings, randomReverseEnabled, swatchMap }
export function blockSlotColours(block, ctx) {
  if (!isShapeBlock(block)) return null;
  const { colorMode, palette, bgOptions, gridComputed, gradientSettings, meshSettings, randomReverseEnabled, swatchMap } = ctx;
  const blockPalette = (randomReverseEnabled && block.reverseColor) ? [...palette].reverse() : palette;
  const pos = gridComputed
    ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols: gridComputed.cols, gridRows: gridComputed.rows }
    : null;
  return resolveSlotColours(
    block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, bgOptions,
    colorMode === 'gradient' && pos ? { ...pos, ...gradientSettings } : null,
    colorMode === 'mesh' && pos ? { ...pos, ...meshSettings } : null,
    resolvePins(block, swatchMap ?? {}),
  );
}

// [{ hex, weight, slots: [slotIndex], background }] for a block's visible
// colours, biggest first. Weights are visible-area fractions once the
// shape's coverage has been measured (slotCoverage.js), else one per slot.
// `background` marks colours used only by the shape's background layer (the
// tile behind the motif in layered artwork).
export function blockColourBreakdown(block, ctx) {
  const colours = blockSlotColours(block, ctx);
  if (!colours) return [];
  const template = getColourTemplate(block.svgContent);
  const coverage = getSlotCoverage(block.svgContent);
  const byHex = new Map();
  for (const slot of template?.paintable ?? []) {
    const hex = colours[slot];
    if (!hex) continue;
    const w = coverage ? coverage[slot] : 1;
    if (coverage && w <= 0) continue; // fully hidden part
    const isBg = !!template.hasLayers && template.slotMeta[slot]?.group === 'bg';
    const entry = byHex.get(hex) ?? { hex, weight: 0, slots: [], background: true };
    entry.weight += w;
    entry.slots.push(slot);
    entry.background = entry.background && isBg;
    byHex.set(hex, entry);
  }
  return [...byHex.values()].sort((a, b) => b.weight - a.weight);
}

// The colour a block is filed under in Layers: its biggest foreground
// colour, so a motif on a large background tile groups by the motif.
export function dominantColour(breakdown) {
  return (breakdown.find(c => !c.background) ?? breakdown[0])?.hex ?? null;
}
