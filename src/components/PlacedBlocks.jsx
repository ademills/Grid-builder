import { useMemo, useRef, useCallback, useEffect, memo } from 'react';
import { colorizeSvg } from '../utils/colorize';
import { assetIdToLibKey, getShapeCache } from '../utils/shapeLibraryRender';

// Animation types that repaint every cell every frame — for these, blocks are
// rendered as inline SVG (below) so AnimationLayer can recolour them via plain
// `element.style.fill` writes instead of rebuilding+redecoding <image> hrefs.
// See AnimationLayer.jsx's matching INLINE_ANIM_TYPES for the full rationale.
const CONTINUOUS_COLOUR_ANIM_TYPES = new Set(['noise', 'gradientSweep', 'paletteWave', 'pixelSort', 'stripScan']);

// Renders a shape inline (nested <svg> with real DOM elements carrying
// style="fill:...") instead of as a rasterised <image href="data:...">.
// A nested <svg> with x/y/width/height/viewBox/preserveAspectRatio letterboxes
// identically to <image> — so geometry matches exactly — but its fills can be
// mutated directly per frame, which is what makes continuous colour animation cheap.
const AnimatedShapeImage = memo(function AnimatedShapeImage({ entry, libKey, x, y, w, h, blockId, slotRefsMap }) {
  const { innerMarkup } = getShapeCache(entry, libKey);
  const [vbX, vbY, vbW, vbH] = entry.vb;

  const setSlotRefs = useCallback((node) => {
    if (!slotRefsMap) return;
    if (node) {
      const slotEls = [];
      node.querySelectorAll('[data-slot]').forEach((el) => {
        slotEls[+el.getAttribute('data-slot')] = el;
      });
      slotRefsMap.current[blockId] = slotEls;
    } else {
      delete slotRefsMap.current[blockId];
    }
  }, [blockId, slotRefsMap]);

  return (
    <svg
      ref={setSlotRefs}
      x={x} y={y} width={w} height={h}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ pointerEvents: 'none' }}
      dangerouslySetInnerHTML={{ __html: innerMarkup }}
    />
  );
});

const GridBlock = memo(function GridBlock({
  block, cellSize, gridOriginX, gridOriginY,
  activeTool,
  isSelected, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions,
  gridCols, gridRows, gradientSettings, meshSettings, imageDataUrls,
  randomReverseEnabled,
  imageRefsMap,
  animSettings,
  slotRefsMap,
  shapeLibrary,
}) {
  const x = gridOriginX + block.gridCol * cellSize;
  const y = gridOriginY + block.gridRow * cellSize;
  const w = block.cols * cellSize;
  const h = block.rows * cellSize;

  // While a continuous colour-replacement animation is running, every block is
  // repainted every frame regardless of colorMode — render inline so the
  // animation can mutate fills directly rather than rebuilding <image> hrefs.
  const useAnimatedInline = animSettings?.enabled && CONTINUOUS_COLOUR_ANIM_TYPES.has(animSettings.type) && !!shapeLibrary;
  const libKey = useAnimatedInline ? assetIdToLibKey(block.assetId) : null;
  const shapeEntry = useAnimatedInline ? shapeLibrary.shapes[libKey] : null;

  // Cheap image-mode lookup — does NOT trigger palette re-computation
  const imageDataUrl = colorMode === 'image' ? (imageDataUrls?.[block.id] ?? null) : null;

  // Expensive colour computation — imageDataUrls intentionally excluded from deps
  const colorDataUrl = useMemo(() => {
    if (colorMode === 'image') return null;
    const blockPalette = (randomReverseEnabled && block.reverseColor)
      ? [...effectivePalette].reverse()
      : effectivePalette;
    const gradPos = colorMode === 'gradient'
      ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols, gridRows, ...(gradientSettings ?? {}) }
      : null;
    const meshPos = colorMode === 'mesh'
      ? { gridCol: block.gridCol, gridRow: block.gridRow, gridCols, gridRows, ...(meshSettings ?? {}) }
      : null;
    const svg = colorMode !== 'none'
      ? colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, bgOptions, gradPos, meshPos)
      : block.svgContent;
    const clean = svg.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  }, [block.svgContent, block.id, block.colorSeed, block.colorOffset, block.reverseColor,
      block.gridCol, block.gridRow, colorMode, effectivePalette, bgOptions,
      gridCols, gridRows, gradientSettings, meshSettings, randomReverseEnabled]);

  const dataUrl = colorMode === 'image' ? imageDataUrl : colorDataUrl;

  const imageElRef = useRef(null);

  const setImageRef = useCallback((el) => {
    imageElRef.current = el;
    if (imageRefsMap) {
      if (el) imageRefsMap.current[block.id] = el;
      else delete imageRefsMap.current[block.id];
    }
  }, [block.id, imageRefsMap]);

  // Keep data-original-href up-to-date so animation can restore it on stop
  useEffect(() => {
    if (imageElRef.current) {
      imageElRef.current.setAttribute('data-original-href', dataUrl);
    }
  }, [dataUrl]);

  const isInteractive = activeTool === 'select';
  // Lock-badge size as a fraction of the cell — scales with the grid rather
  // than the view, which (unlike 1/viewScale) keeps GridBlock's props stable
  // across zoom so memo() can skip re-rendering every visible block per tick.
  const badge = cellSize * 0.12;

  return (
    <g
      style={{ cursor: 'default', outline: 'none' }}
      onClick={e => {
        if (isInteractive) {
          e.stopPropagation();
          onSelect(block.id, e.shiftKey);
        }
      }}
      onContextMenu={e => {
        if (isInteractive) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(block, e.clientX, e.clientY);
        }
      }}
      onKeyDown={e => {
        if (isInteractive && (e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
          onSelect(block.id, false);
        }
      }}
    >
      {/* Transparent hit-area */}
      <rect x={x} y={y} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all' }} />

      {useAnimatedInline && shapeEntry ? (
        <AnimatedShapeImage
          entry={shapeEntry}
          libKey={libKey}
          x={x} y={y} w={w} h={h}
          blockId={block.id}
          slotRefsMap={slotRefsMap}
        />
      ) : dataUrl && (
        <image
          ref={setImageRef}
          href={dataUrl}
          x={x} y={y}
          width={w} height={h}
          preserveAspectRatio="xMidYMid meet"
          opacity={1}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {isSelected && (
        <rect
          x={x} y={y} width={w} height={h}
          fill="rgba(124,58,237,0.07)"
          stroke="#7c3aed"
          strokeWidth={2.5}
          vectorEffect="non-scaling-stroke"
          data-noexport="true"
          pointerEvents="none"
        />
      )}

      {block.colorLocked && (
        <text
          x={x + w - badge * 0.4}
          y={y + badge * 0.4}
          fontSize={badge}
          textAnchor="end"
          dominantBaseline="hanging"
          data-noexport="true"
          pointerEvents="none"
          style={{ userSelect: 'none' }}
        >🔒</text>
      )}
    </g>
  );
});

export const PlacedBlocks = memo(function PlacedBlocks({
  placedBlocks, visibleRect, gridComputed, activeTool,
  selectedIds, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions, gradientSettings, meshSettings, imageDataUrls,
  randomReverseEnabled,
  filterUrl,
  imageRefsMap,
  animSettings,
  slotRefsMap,
  shapeLibrary,
  blendMode,
}) {
  // Bounding boxes only change with block/grid geometry, not on every pan/zoom
  // frame — precomputing them here means the (per-frame) visibility filter below
  // is pure numeric comparison instead of re-deriving bx/by/bw/bh for every
  // block on every visibleRect change.
  const blockBounds = useMemo(() => {
    if (!gridComputed || !placedBlocks?.length) return null;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    return placedBlocks.map(block => {
      const left = gridOriginX + block.gridCol * cellSize;
      const top  = gridOriginY + block.gridRow * cellSize;
      return { block, left, top, right: left + block.cols * cellSize, bottom: top + block.rows * cellSize };
    });
  }, [placedBlocks, gridComputed]);

  // Render only blocks that intersect the visible viewport (+ overscan margin
  // baked into visibleRect by App). Selection/export/history all operate on
  // `placedBlocks` data directly, not on mounted DOM, so culling off-screen
  // blocks here is purely a render-cost reduction with no behavioural effect.
  const visibleBlocks = useMemo(() => {
    if (!blockBounds) return null;
    if (!visibleRect) return placedBlocks;
    const result = [];
    for (const { block, left, top, right, bottom } of blockBounds) {
      if (right >= visibleRect.left && left <= visibleRect.right &&
          bottom >= visibleRect.top && top <= visibleRect.bottom) {
        result.push(block);
      }
    }
    return result;
  }, [blockBounds, visibleRect, placedBlocks]);

  if (!gridComputed || !placedBlocks || placedBlocks.length === 0) return null;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;

  return (
    <g
      id="placed-blocks"
      style={{
        pointerEvents: activeTool === 'hand' ? 'none' : 'auto',
        mixBlendMode: blendMode && blendMode !== 'normal' ? blendMode : undefined,
        isolation: blendMode && blendMode !== 'normal' ? 'isolate' : undefined,
      }}
      filter={filterUrl || undefined}
    >
      {visibleBlocks.map(block => (
        <GridBlock
          key={block.id}
          block={block}
          cellSize={cellSize}
          gridOriginX={gridOriginX}
          gridOriginY={gridOriginY}
          activeTool={activeTool}
          isSelected={selectedIds?.has(block.id) ?? false}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          colorMode={colorMode}
          effectivePalette={effectivePalette}
          bgOptions={bgOptions}
          gridCols={gridComputed.cols}
          gridRows={gridComputed.rows}
          gradientSettings={gradientSettings}
          meshSettings={meshSettings}
          imageDataUrls={imageDataUrls}
          randomReverseEnabled={randomReverseEnabled}
          imageRefsMap={imageRefsMap}
          animSettings={animSettings}
          slotRefsMap={slotRefsMap}
          shapeLibrary={shapeLibrary}
        />
      ))}
    </g>
  );
});
