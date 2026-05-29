import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { colorizeSvg } from '../utils/colorize';

function DraggableBlock({
  block, cellSize, gridOriginX, gridOriginY,
  viewTransform, activeTool,
  isSelected, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions,
  gridCols, gridRows, gradientSettings, imageDataUrls,
  randomReverseEnabled,
}) {
  const { setNodeRef, listeners, attributes, isDragging, transform } = useDraggable({
    id: block.id,
    data: { block },
    disabled: activeTool !== 'select',
  });

  const x = gridOriginX + block.gridCol * cellSize;
  const y = gridOriginY + block.gridRow * cellSize;
  const w = block.cols * cellSize;
  const h = block.rows * cellSize;

  const svgDx = transform ? transform.x / viewTransform.scale : 0;
  const svgDy = transform ? transform.y / viewTransform.scale : 0;

  const dataUrl = useMemo(() => {
    // Image mode: use the pre-computed data URL from App.jsx (computed off the render cycle).
    // Fall back to the raw SVG while computation is still in progress.
    if (colorMode === 'image') {
      const precomputed = imageDataUrls?.[block.id];
      if (precomputed) return precomputed;
      const clean = block.svgContent.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/gi, '');
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
    }
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
  }, [block.svgContent, block.id, block.colorSeed, block.colorOffset, block.reverseColor, block.gridCol, block.gridRow, colorMode, effectivePalette, bgOptions, gridCols, gridRows, gradientSettings, imageDataUrls, randomReverseEnabled]);

  const isInteractive = activeTool === 'select';
  const ui = 1 / viewTransform.scale;

  return (
    <g
      ref={setNodeRef}
      {...(isInteractive ? listeners : {})}
      {...(isInteractive ? attributes : {})}
      transform={`translate(${svgDx},${svgDy})`}
      style={{
        cursor: !isInteractive ? 'default' : isDragging ? 'grabbing' : 'grab',
        outline: 'none',
      }}
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

      <image
        href={dataUrl}
        x={x} y={y}
        width={w} height={h}
        preserveAspectRatio="xMidYMid meet"
        opacity={isDragging ? 0.45 : 1}
      />

      {/* Selection highlight */}
      {isSelected && !isDragging && (
        <rect
          x={x} y={y} width={w} height={h}
          fill="rgba(124,58,237,0.07)"
          stroke="#7c3aed"
          strokeWidth={2.5 * ui}
          data-noexport="true"
          pointerEvents="none"
        />
      )}

      {/* Color lock badge */}
      {block.colorLocked && !isDragging && (
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

      {/* Drag ghost outline */}
      {isDragging && (
        <rect
          x={x} y={y} width={w} height={h}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(124,58,237,0.5)"
          strokeWidth={2 * ui}
          strokeDasharray={`${6 * ui} ${3 * ui}`}
          data-noexport="true"
          pointerEvents="none"
        />
      )}
    </g>
  );
}

export function PlacedBlocks({
  placedBlocks, gridComputed, viewTransform, activeTool,
  dragShadow,
  selectedIds, onSelect, onContextMenu,
  colorMode, effectivePalette, bgOptions, gradientSettings, imageDataUrls,
  randomReverseEnabled,
}) {
  if (!gridComputed || !placedBlocks || placedBlocks.length === 0) return null;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;

  return (
    <g
      id="placed-blocks"
      style={{ pointerEvents: activeTool === 'hand' ? 'none' : 'auto' }}
    >
      {dragShadow && (
        <rect
          x={gridOriginX + dragShadow.gridCol * cellSize}
          y={gridOriginY + dragShadow.gridRow * cellSize}
          width={dragShadow.cols * cellSize}
          height={dragShadow.rows * cellSize}
          fill="rgba(124,58,237,0.1)"
          stroke="rgba(124,58,237,0.65)"
          strokeWidth={2}
          strokeDasharray="5 3"
          data-noexport="true"
          pointerEvents="none"
        />
      )}

      {placedBlocks.map(block => (
        <DraggableBlock
          key={block.id}
          block={block}
          cellSize={cellSize}
          gridOriginX={gridOriginX}
          gridOriginY={gridOriginY}
          viewTransform={viewTransform}
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
        />
      ))}
    </g>
  );
}
