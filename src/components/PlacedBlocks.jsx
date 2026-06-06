import { useMemo, useRef, useCallback, useEffect, memo } from 'react';
import { colorizeSvg } from '../utils/colorize';

const GridBlock = memo(function GridBlock({
  block, cellSize, gridOriginX, gridOriginY,
  scale, activeTool,
  isSelected, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions,
  gridCols, gridRows, gradientSettings, imageDataUrls,
  randomReverseEnabled,
  imageRefsMap,
}) {
  const x = gridOriginX + block.gridCol * cellSize;
  const y = gridOriginY + block.gridRow * cellSize;
  const w = block.cols * cellSize;
  const h = block.rows * cellSize;

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
    const svg = colorMode !== 'none'
      ? colorizeSvg(block.svgContent, colorMode, blockPalette, block.colorSeed ?? 0, block.colorOffset ?? 0, bgOptions, gradPos)
      : block.svgContent;
    const clean = svg.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  }, [block.svgContent, block.id, block.colorSeed, block.colorOffset, block.reverseColor,
      block.gridCol, block.gridRow, colorMode, effectivePalette, bgOptions,
      gridCols, gridRows, gradientSettings, randomReverseEnabled]);

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
  const ui = 1 / scale;

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

      {dataUrl && (
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
          strokeWidth={2.5 * ui}
          data-noexport="true"
          pointerEvents="none"
        />
      )}

      {block.colorLocked && (
        <text
          x={x + w - 4 * ui}
          y={y + 4 * ui}
          fontSize={10 * ui}
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
  placedBlocks, gridComputed, viewScale, activeTool,
  selectedIds, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions, gradientSettings, imageDataUrls,
  randomReverseEnabled,
  filterUrl,
  imageRefsMap,
}) {
  if (!gridComputed || !placedBlocks || placedBlocks.length === 0) return null;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;

  return (
    <g
      id="placed-blocks"
      style={{ pointerEvents: activeTool === 'hand' ? 'none' : 'auto' }}
      filter={filterUrl || undefined}
    >
      {placedBlocks.map(block => (
        <GridBlock
          key={block.id}
          block={block}
          cellSize={cellSize}
          gridOriginX={gridOriginX}
          gridOriginY={gridOriginY}
          scale={viewScale}
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
          imageDataUrls={imageDataUrls}
          randomReverseEnabled={randomReverseEnabled}
          imageRefsMap={imageRefsMap}
        />
      ))}
    </g>
  );
});
