import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getShapeModel } from '../utils/shapeModel';
import { blockSlotColours } from '../utils/blockColours';
import { wireframeRects } from '../utils/layouts';
import { makeAnimFrame, FILTER_TYPES } from '../utils/animationFrame';
import { mapAmplitude, blendHexToward } from '../utils/audioAnalysis';
import styles from './Canvas.module.css';

// Draws the artboard and its shapes with the 2D canvas API instead of one SVG
// element per shape. Two canvases sit under the editor's SVG layer:
//   background — artboard colour, background image and grid lines
//   shapes     — every visible shape block, drawn from cached Path2D models
//                (utils/shapeModel.js) in the colours its colour mode gives,
//                plus layout wireframes
// Colour animations redraw the shapes canvas each frame; hue drift and warp
// are CSS filters on it. Image and text blocks, selection outlines and other
// overlays stay in the SVG layer above. Export still builds SVG, so exported
// files don't depend on this renderer.

const BLEND = (mode) => (!mode || mode === 'normal' ? 'source-over' : mode);
const isShape = (b) => !b.type && !b.hidden;

// Block colours change only with the block or the colour settings, so they're
// cached per block object.
const slotCache = new WeakMap();   // block → { ctx, colours }
const imageCache = new WeakMap();  // block → { pixels, remap, colours }

function slotColoursFor(block, colourCtx) {
  const hit = slotCache.get(block);
  if (hit && hit.ctx === colourCtx) return hit.colours;
  const colours = blockSlotColours(block, colourCtx) ?? [];
  slotCache.set(block, { ctx: colourCtx, colours });
  return colours;
}

const toHex = (r, g, b) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Image colour mode: each paintable element takes the average image colour
// at its anchor points, exactly as export (colorizeSvgByImage) samples it.
function imageColoursFor(block, model, box, pixels, remap) {
  const hit = imageCache.get(block);
  if (hit && hit.pixels === pixels && hit.remap === remap) return hit.colours;
  const { data, width, height, scaleX = 1, scaleY = 1 } = pixels;
  const [vbX, vbY, vbW, vbH] = model.vb;
  const s = Math.min(box.w / vbW, box.h / vbH);
  const ox = box.x + (box.w - vbW * s) / 2 - vbX * s;
  const oy = box.y + (box.h - vbH * s) / 2 - vbY * s;
  const colours = model.elements.map(el => {
    if (!el.paintable || !el.pts.length) return el.fixed && remap ? (remap[el.fixed] ?? el.fixed) : el.fixed;
    let r = 0, g = 0, b = 0;
    for (const [x, y] of el.pts) {
      const px = Math.max(0, Math.min(Math.round((ox + x * s) * scaleX), width - 1));
      const py = Math.max(0, Math.min(Math.round((oy + y * s) * scaleY), height - 1));
      const i = (py * width + px) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const n = el.pts.length;
    const hex = toHex(r / n, g / n, b / n);
    return remap ? (remap[hex] ?? hex) : hex;
  });
  imageCache.set(block, { pixels, remap, colours });
  return colours;
}

const imageElements = new Map(); // src → HTMLImageElement
function loadImage(src, onLoad) {
  let img = imageElements.get(src);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = src;
    imageElements.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

function drawBackground(ctx, p, image) {
  const { workArea, canvasBg, backdropSettings: bd, gridComputed, gridSettings } = p;
  ctx.fillStyle = canvasBg ?? '#ffffff';
  ctx.fillRect(0, 0, workArea.width, workArea.height);

  if (image && bd) {
    const { width: W, height: H } = workArea;
    const iw = image.naturalWidth, ih = image.naturalHeight;
    ctx.save();
    ctx.globalAlpha = bd.opacity ?? 1;
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (bd.fit === 'stretch') {
      ctx.drawImage(image, 0, 0, W, H);
    } else {
      const s = bd.fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
      ctx.drawImage(image, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
    }
    ctx.restore();
    if (bd.tintOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = bd.tintOpacity;
      ctx.fillStyle = bd.tintColour;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // Grid lines (never exported).
  if (gridComputed) {
    const { cellSize, rows, cols, gridOriginX: gx, gridOriginY: gy, gridW, gridH } = gridComputed;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) { ctx.moveTo(gx + c * cellSize, gy); ctx.lineTo(gx + c * cellSize, gy + gridH); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(gx, gy + r * cellSize); ctx.lineTo(gx + gridW, gy + r * cellSize); }
    ctx.strokeStyle = 'rgba(0, 100, 220, 0.2)';
    ctx.lineWidth = 0.75;
    ctx.stroke();
    if (gridSettings?.borderPct > 0) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(0, 100, 220, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gridW, gridH);
      ctx.setLineDash([]);
    }
  }
}

// The colour of each element of `block` this frame.
function elementColours(block, model, box, p, frame, flicker) {
  if (frame?.kind === 'position') {
    const [vbX, vbY, vbW, vbH] = model.vb;
    const s = Math.min(box.w / vbW, box.h / vbH);
    const ox = box.x + (box.w - vbW * s) / 2 - vbX * s;
    const oy = box.y + (box.h - vbH * s) / 2 - vbY * s;
    return model.elements.map(el => (el.paintable ? frame.colourAt(ox + el.centre[0] * s, oy + el.centre[1] * s) : el.fixed));
  }
  if (frame?.kind === 'block') {
    const c = frame.colourOf.get(block.id);
    if (c) return model.elements.map(el => (el.paintable ? c : el.fixed));
  }
  if (flicker?.has(block.id)) {
    const pal = flicker.get(block.id);
    let i = 0;
    return model.elements.map(el => (el.paintable ? pal[i++ % pal.length] : el.fixed));
  }
  if (p.colourCtx.colorMode === 'image' && p.imagePixels) {
    return imageColoursFor(block, model, box, p.imagePixels, p.colourRemap);
  }
  const slots = slotColoursFor(block, p.colourCtx);
  return model.elements.map(el => (el.paintable ? (slots[el.slot] ?? el.fixed) : el.fixed));
}

// A block's transform from shape (viewBox) coordinates to artboard
// coordinates, as [a, b, c, d, e, f]: the viewBox fit, then Rotate / Reflect
// about the block centre (as blockTransform.shapeTransform).
function blockMatrix(block, model, box) {
  const [vbX, vbY, vbW, vbH] = model.vb;
  const s = Math.min(box.w / vbW, box.h / vbH);
  let a = s, b = 0, c = 0, d = s;
  let e = box.x + (box.w - vbW * s) / 2 - vbX * s;
  let f = box.y + (box.h - vbH * s) / 2 - vbY * s;
  const r = (((block.rotation ?? 0) % 360) + 360) % 360;
  if (r || block.flipX || block.flipY) {
    // p' = C + F·R·(p − C)
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const cos = Math.round(Math.cos((r * Math.PI) / 180)), sin = Math.round(Math.sin((r * Math.PI) / 180));
    const fx = block.flipX ? -1 : 1, fy = block.flipY ? -1 : 1;
    const m = [fx * cos, fy * sin, -fx * sin, fy * cos];
    [a, b, c, d] = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d];
    const ex = e - cx, ey = f - cy;
    e = m[0] * ex + m[2] * ey + cx;
    f = m[1] * ex + m[3] * ey + cy;
  }
  return [a, b, c, d, e, f];
}

// Paints one block on its own (used for blocks with opacity or a blend mode).
// `base` is the view transform [k, ox, oy]: device px = artboard px × k + offset.
function paintBlock(ctx, block, model, box, colours, base) {
  const [a, b, c, d, e, f] = blockMatrix(block, model, box);
  const [k, ox, oy] = base;
  ctx.setTransform(a * k, b * k, c * k, d * k, e * k + ox, f * k + oy);
  model.elements.forEach((el, i) => {
    if (!colours[i]) return;
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle = colours[i];
    ctx.fill(el.path, el.rule);
  });
  ctx.globalAlpha = 1;
}

// Shapes on a grid never overlap, so paint order only matters within a
// block. That lets every block's n-th element be filled together, one
// combined path per colour: tens of fill calls instead of tens of thousands.
// Batches are in artboard coordinates, so panning and zooming reuse them.
//   layers[n] = Map(key → { path, colour, alpha, rule })
//   own       = blocks with opacity or a blend mode, composited one by one
function buildBatches(p, frame, flicker) {
  const { cellSize, gridOriginX: gx, gridOriginY: gy } = p.gridComputed;
  const layers = [];
  const own = [];
  for (const block of p.blocks) {
    if (!isShape(block)) continue;
    const model = getShapeModel(block.svgContent);
    if (!model) continue;
    const box = { x: gx + block.gridCol * cellSize, y: gy + block.gridRow * cellSize, w: block.cols * cellSize, h: block.rows * cellSize };
    const colours = elementColours(block, model, box, p, frame, flicker);
    if ((block.opacity ?? 1) < 1 || BLEND(block.blendMode) !== 'source-over') {
      own.push({ block, model, box, colours });
      continue;
    }
    const m = new DOMMatrix(blockMatrix(block, model, box));
    model.elements.forEach((el, i) => {
      const colour = colours[i];
      if (!colour) return;
      const layer = layers[i] ??= new Map();
      const key = `${colour}|${el.opacity}|${el.rule}`;
      let batch = layer.get(key);
      if (!batch) layer.set(key, batch = { path: new Path2D(), colour, alpha: el.opacity, rule: el.rule });
      batch.path.addPath(el.path, m);
    });
  }
  return { layers, own };
}

let scratch = null; // reused canvas for blocks drawn with opacity or a blend mode

function drawShapes(ctx, p, batches, view, dpr) {
  const { cellSize, gridOriginX: gx, gridOriginY: gy } = p.gridComputed;
  const k = dpr * view.scale;
  const base = [k, dpr * view.x, dpr * view.y];

  ctx.setTransform(k, 0, 0, k, base[1], base[2]);
  for (const layer of batches.layers) {
    if (!layer) continue;
    for (const batch of layer.values()) {
      ctx.globalAlpha = batch.alpha;
      ctx.fillStyle = batch.colour;
      ctx.fill(batch.path, batch.rule);
    }
  }
  ctx.globalAlpha = 1;

  // Opacity and blend modes apply to a block as a whole (like an SVG group),
  // so those blocks are drawn alone first, then composited.
  const vr = p.visibleRect;
  for (const { block, model, box, colours } of batches.own) {
    if (vr && (box.x + box.w < vr.left || box.x > vr.right || box.y + box.h < vr.top || box.y > vr.bottom)) continue;
    const dx = Math.floor(view.x * dpr + box.x * k), dy = Math.floor(view.y * dpr + box.y * k);
    const dw = Math.ceil(box.w * k) + 2, dh = Math.ceil(box.h * k) + 2;
    if (dw > 4096 || dh > 4096) { paintBlock(ctx, block, model, box, colours, base); continue; }
    scratch ??= document.createElement('canvas');
    if (scratch.width < dw) scratch.width = dw;
    if (scratch.height < dh) scratch.height = dh;
    const sc = scratch.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, dw, dh);
    paintBlock(sc, block, model, box, colours, [k, view.x * dpr - dx, view.y * dpr - dy]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = block.opacity ?? 1;
    ctx.globalCompositeOperation = BLEND(block.blendMode);
    ctx.drawImage(scratch, 0, 0, dw, dh, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // Layout wireframe placeholders paint over the shapes.
  ctx.setTransform(k, 0, 0, k, base[1], base[2]);
  for (const block of p.blocks) {
    if (block.type !== 'wireframe' || block.hidden) continue;
    const x = gx + block.gridCol * cellSize, y = gy + block.gridRow * cellSize, w = block.cols * cellSize, h = block.rows * cellSize;
    ctx.save();
    if (block.rotation) { ctx.translate(x + w / 2, y + h / 2); ctx.rotate((block.rotation * Math.PI) / 180); ctx.translate(-x - w / 2, -y - h / 2); }
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, y, w, h);
    for (const r of wireframeRects(block.slotRole, block.align)) {
      ctx.fillStyle = `rgba(0,0,0,${r.shade})`;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x + r.x * w, y + r.y * h, r.w * w, r.h * h, Math.min(w, h) * 0.015);
      else ctx.rect(x + r.x * w, y + r.y * h, r.w * w, r.h * h);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Sizes a canvas to the viewport at device resolution and sets the view.
function prepare(canvas, viewport, view, dpr) {
  const w = Math.max(1, Math.round(viewport.width * dpr)), h = Math.max(1, Math.round(viewport.height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
  return ctx;
}

export function ShapeCanvas(props) {
  const { viewportSize, animSettings, blendMode } = props;
  const bgRef = useRef(null);
  const fgRef = useRef(null);
  const latest = useRef(props);
  const animState = useRef(null); // { frame, flicker } while animating
  const staticKey = useRef(null);  // batches for the current static content
  const [, setImageTick] = useState(0);
  const animating = !!animSettings?.enabled;
  const filterAnim = animating && FILTER_TYPES.has(animSettings.type);

  const draw = () => {
    const p = latest.current;
    if (!p.viewportSize || !bgRef.current || !fgRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const image = p.backdropSrc ? loadImage(p.backdropSrc, () => setImageTick(t => t + 1)) : null;
    const bg = prepare(bgRef.current, p.viewportSize, p.viewTransform, dpr);
    drawBackground(bg, p, image);
    const fg = prepare(fgRef.current, p.viewportSize, p.viewTransform, dpr);
    if (!p.gridComputed) return;
    // Per-shape blend modes blend with what's behind them, so the background
    // is drawn into the shapes canvas too — unless a whole-layer blend mode or
    // filter animation is in play, which apply to the shapes alone.
    const ownBlend = p.blocks.some(b => isShape(b) && b.blendMode && b.blendMode !== 'normal');
    const layerEffect = (p.blendMode && p.blendMode !== 'normal') || (p.animSettings?.enabled && FILTER_TYPES.has(p.animSettings.type));
    if (ownBlend && !layerEffect) drawBackground(fg, p, image);
    const a = animState.current;
    let batches;
    if (a) {
      batches = buildBatches(p, a.frame, a.flicker);
    } else {
      // Static content: rebuild only when the shapes or their colours change.
      const key = staticKey.current;
      if (!key || key.blocks !== p.blocks || key.colourCtx !== p.colourCtx || key.imagePixels !== p.imagePixels
        || key.colourRemap !== p.colourRemap || key.gridComputed !== p.gridComputed) {
        staticKey.current = {
          blocks: p.blocks, colourCtx: p.colourCtx, imagePixels: p.imagePixels, colourRemap: p.colourRemap,
          gridComputed: p.gridComputed, batches: buildBatches(p, null, null),
        };
      }
      batches = staticKey.current.batches;
    }
    drawShapes(fg, p, batches, p.viewTransform, dpr);
  };

  // Redraw whenever anything drawn changes (React re-renders the editor for
  // each of these). Layout effect, so the canvas and SVG layer stay in step.
  useLayoutEffect(() => {
    latest.current = props;
    if (!animating || FILTER_TYPES.has(props.animSettings.type)) draw();
  });

  // Colour animations: redraw every frame. Hue drift and warp only update the
  // CSS filter on the shapes canvas.
  useEffect(() => {
    if (!animating) { animState.current = null; return; }
    let raf, last = null, phase = 0, lastFlicker = -1, elapsed = 0;
    const tick = (ts) => {
      const p = latest.current;
      const dt = last == null ? 0 : (ts - last) / 1000;
      last = ts;
      elapsed += dt;
      const s = p.animSettings;
      const audio = p.audioSettings;
      const amp = audio?.enabled ? 1 + mapAmplitude(p.audioDataRef?.current?.amplitude ?? 0, audio.ampMapping) * 3 : 1;
      phase += dt * (s.speed * 2) * amp;

      // Audio: bass warms the palette, a beat briefly reverses it.
      let pal = p.colourCtx.palette;
      if (audio?.enabled && pal?.length) {
        const bass = p.audioDataRef?.current?.bands?.[0] ?? 0;
        if (bass > 0.01) pal = pal.map(hex => blendHexToward(hex, '#ff9500', bass * 0.5));
        if (p.audioDataRef?.current?.beat) pal = [...pal].reverse();
      }

      const fg = fgRef.current;
      if (FILTER_TYPES.has(s.type)) {
        if (fg && s.type === 'hueDrift') fg.style.filter = `hue-rotate(${((phase * (s.hueDrift?.range ?? 120)) % 360).toFixed(1)}deg)`;
        if (s.type === 'warp') document.getElementById('gb-anim-warp-turbulence')?.setAttribute('seed', Math.floor(phase * 6) % 1024);
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!pal?.length || !p.gridComputed) { raf = requestAnimationFrame(tick); return; }

      const frame = makeAnimFrame(s, phase, pal, {
        cellSize: p.gridComputed.cellSize, workArea: p.workArea, canvasBg: p.canvasBg, blocks: p.blocks.filter(isShape),
      });
      let flicker = animState.current?.flicker ?? null;
      if (frame?.kind === 'flicker' && elapsed - lastFlicker >= 1 / 8) {
        // ~8 times a second, a random few blocks take shifted palette colours.
        lastFlicker = elapsed;
        const shapes = p.blocks.filter(isShape);
        const count = Math.min(shapes.length, Math.max(1, Math.ceil(shapes.length * (s.flicker?.density ?? 0.07))));
        flicker = new Map();
        while (flicker.size < count) {
          const b = shapes[Math.floor(Math.random() * shapes.length)];
          const start = Math.floor(Math.random() * pal.length);
          flicker.set(b.id, pal.map((_, i) => pal[(start + i) % pal.length]));
        }
      }
      animState.current = { frame: frame?.kind === 'flicker' ? null : frame, flicker };
      draw();
      raf = requestAnimationFrame(tick);
    };
    // Pause while the window is hidden; resume where the phase left off.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = null; raf = requestAnimationFrame(tick); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);
    const fg = fgRef.current;
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      animState.current = null;
      if (fg) fg.style.filter = '';
      draw();
    };
  }, [animating, animSettings?.type]);

  if (!viewportSize) return null;
  const fgStyle = {
    mixBlendMode: blendMode && blendMode !== 'normal' ? blendMode : undefined,
    filter: filterAnim && animSettings.type === 'warp' ? 'url(#gb-anim-warp-filter)' : undefined,
  };
  return (
    <>
      <canvas ref={bgRef} className={styles.layerCanvas} style={{ width: viewportSize.width, height: viewportSize.height }} />
      <canvas ref={fgRef} className={styles.layerCanvas} style={{ width: viewportSize.width, height: viewportSize.height, ...fgStyle }} />
    </>
  );
}
