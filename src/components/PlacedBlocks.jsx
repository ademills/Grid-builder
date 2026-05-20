import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { colorizeSvg } from '../utils/colorize';

function DraggableBlock({
  block, cellSize, gridOriginX, gridOriginY,
  viewTransform, activeTool,
  isSelected, onSelect,
  colorMode, effectivePalette, customWhite, customBlack,
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
    const svg = colorMode !== 'none'
      ? colorizeSvg(block.svgContent, colorMode, effectivePalette, block.colorSeed ?? 0, block.colorOffset ?? 0, customWhite, customBlack)
      : block.svgContent;
    const clean = svg
      .replace(/^<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  }, [block.svgContent, block.colorSeed, block.colorOffset, colorMode, effectivePalette, customWhite, customBlack]);

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
  selectedIds, onSelect,
  colorMode, effectivePalette, customWhite, customBlack,
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
          colorMode={colorMode}
          effectivePalette={effectivePalette}
          customWhite={customWhite}
          customBlack={customBlack}
        />
      ))}
    </g>
  );
}
