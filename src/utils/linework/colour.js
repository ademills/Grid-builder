// Colours for a composed Linework design's items. Lines take the document's
// colour mode, applied per line group by its centre:
//   none     — the single ink colour
//   uniform  — the palette in order, one colour per group
//   random   — a seeded random palette colour per group
//   gradient / mesh — the colour at the group's position
//   image    — the Image colour mode's picture under the group
// "Ink from image" (Image panel) samples the backdrop picture instead.
// A layer can have a colour mode and shuffle seed of its own (cfg.colorMode,
// cfg.colourSeed; null follows the document's). Uniform counts each such
// layer's groups on their own.
// Grounds, shadows and rims take their colour roles; a plate set to swap
// ink and ground swaps them for its own items.

import { gradientT, meshColourAt } from '../colorize';
import { sampleStrandColours } from '../knotworkImageSample';
import { hash } from './geometry';

// ctx: { colorMode, palette, ink, ground, shadow, gradient, mesh,
//        imagePixels, toArtboard(x, y), backdropPixels, backdropFit,
//        inkFromImage, colourSeed, width, height, layers }
export function colourItems(items, ctx) {
  const { colorMode, palette, width, height } = ctx;
  const pal = palette?.length ? palette : [ctx.ink];
  let n = 0;
  const own = {}; // groups counted so far in each layer with its own mode
  const backdropSamples = ctx.inkFromImage && ctx.backdropPixels
    ? sampleStrandColours(items.map(it => [{ x: it.centre[0], y: it.centre[1] }]), ctx.backdropPixels, width, height, ctx.backdropFit, [ctx.ink])
    : null;

  return items.map((it, idx) => {
    const swap = !!ctx.layers?.[it.layer]?.invert;
    const ink = swap ? ctx.ground : ctx.ink;
    const ground = swap ? ctx.ink : ctx.ground;
    if (it.kind === 'ground') return ground;
    if (it.kind === 'shadow') return ctx.shadow;
    if (it.kind === 'rim') return ctx.layers?.[it.layer]?.rimInk ? ink : ground;
    if (it.kind === 'outline') return it.onGround ? ground : ink;
    const cfg = ctx.layers?.[it.layer];
    const mode = cfg?.colorMode ?? colorMode;
    const seed = cfg?.colourSeed ?? ctx.colourSeed ?? 0;
    const i = cfg?.colorMode ? (own[it.layer] = (own[it.layer] ?? -1) + 1) : n++;
    if (backdropSamples) return backdropSamples[idx];
    const [x, y] = it.centre;
    const nx = width ? x / width : 0.5, ny = height ? y / height : 0.5;
    switch (mode) {
      case 'uniform': return pal[i % pal.length];
      case 'random': return pal[hash(seed, ...[...it.key].map(c => c.charCodeAt(0))) % pal.length];
      case 'gradient': return pal[Math.round(gradientT(nx, ny, ctx.gradient ?? {}, seed) * (pal.length - 1))];
      case 'mesh': return ctx.mesh?.points?.length ? meshColourAt(ctx.mesh.points, nx, ny, ctx.mesh.weightPower) : ink;
      case 'image': return ctx.imagePixels ? samplePixels(ctx.imagePixels, ...ctx.toArtboard(x, y)) : ink;
      default: return ink;
    }
  });
}

// The Image colour mode's buffer is the artboard downsampled by scaleX/Y.
function samplePixels(px, ax, ay) {
  const { data, width, height, scaleX = 1, scaleY = 1 } = px;
  const x = Math.max(0, Math.min(width - 1, Math.round(ax * scaleX)));
  const y = Math.max(0, Math.min(height - 1, Math.round(ay * scaleY)));
  const i = (y * width + x) * 4;
  const h = v => v.toString(16).padStart(2, '0');
  return `#${h(data[i])}${h(data[i + 1])}${h(data[i + 2])}`;
}
