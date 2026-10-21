import { blockColourBreakdown, dominantColour, isShapeBlock } from './blockColours';

// Groups placed blocks for the Layers panel.
//   by 'colour' — each block's biggest foreground colour (see dominantColour)
//   by 'shape'  — the asset it was placed from
//   by 'size'   — its footprint in cells
// Non-shape blocks (layout placeholders, images, text) always get their own
// groups. Groups are sorted biggest first.

const SPECIAL_LABELS = { wireframe: 'Layout placeholders', image: 'Images', text: 'Text' };

export function groupBlocks(blocks, by, colourCtx) {
  const groups = new Map();
  const add = (key, init, item) => {
    let g = groups.get(key);
    if (!g) { g = { key, ...init, items: [] }; groups.set(key, g); }
    g.items.push(item);
  };

  for (const block of blocks) {
    if (!isShapeBlock(block)) {
      const type = block.type ?? 'other';
      add(`type:${type}`, { kind: 'special', label: SPECIAL_LABELS[type] ?? 'Other' }, { block, colours: [] });
      continue;
    }
    const colours = blockColourBreakdown(block, colourCtx);
    if (by === 'colour') {
      const dominant = dominantColour(colours) ?? 'none';
      add(`colour:${dominant.toLowerCase()}`, { kind: 'colour', hex: dominant, label: dominant }, { block, colours });
    } else if (by === 'shape') {
      add(`shape:${block.assetId}`, { kind: 'shape', label: block.name ?? block.assetId, svgContent: block.svgContent }, { block, colours });
    } else {
      add(`size:${block.cols}x${block.rows}`, { kind: 'size', label: `${block.cols} × ${block.rows}` }, { block, colours });
    }
  }

  return [...groups.values()]
    .map(g => ({
      ...g,
      ids: g.items.map(i => i.block.id),
      hiddenCount: g.items.filter(i => i.block.hidden).length,
      lockedCount: g.items.filter(i => i.block.locked).length,
      pinnedCount: g.items.filter(i => i.block.slotPins && Object.keys(i.block.slotPins).length).length,
    }))
    .sort((a, b) => (a.kind === 'special') - (b.kind === 'special') || b.items.length - a.items.length);
}

// Colours used in a generated Meander design (stroke/fill attributes in its
// SVG), with how many elements use each. Most used first.
export function designColours(svgMarkup) {
  const counts = new Map();
  for (const m of svgMarkup.matchAll(/(?:stroke|fill)="(#[0-9a-fA-F]{3,8})"/g)) {
    const hex = m[1].toLowerCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count);
}
