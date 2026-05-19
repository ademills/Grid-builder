import { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { colorizeSvg } from '../utils/colorize';

function DraggableBlock({ block, cellSize, gridOriginX, gridOriginY, viewTransform, activeTool, onDelete, onRefresh, colorMode, effectivePalette, customWhite, customBlack }) {
  const [hovered, setHovered] = useState(false);

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
  const showOverlay   = isInteractive && (hovered || isDragging);
  const showButtons   = hovered && !isDragging && isInteractive;

  // All chrome scales inversely with zoom so it stays a constant screen size
  const ui    = 1 / viewTransform.scale;
  const btnR  = 9 * ui;
  // Delete button — top-right corner
  const delCx = x + w - btnR * 1.5;
  const delCy = y + btnR * 1.5;
  // Refresh button — immediately left of delete
  const refCx = delCx - btnR * 3;
  const refCy = delCy;

  const refreshTitle = colorMode === 'uniform' ? 'Rotate colour order' : 'Recolour';

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
      onMouseEnter={() => isInteractive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={e => {
        if (isInteractive && (e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
          onDelete(block.id);
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
        opacity={isDragging ? 0.5 : 1}
      />

      {/* Hover / drag highlight + outline */}
      {showOverlay && (
        <rect
          x={x} y={y} width={w} height={h}
          fill="rgba(255,255,255,0.08)"
          stroke="rgba(124,58,237,0.9)"
          strokeWidth={2 * ui}
          data-noexport="true"
          pointerEvents="none"
        />
      )}

      {showButtons && (
        <g data-noexport="true">
          {/* Refresh / recolour button */}
          {colorMode !== 'none' && (
            <g
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onRefresh(block.id); }}
              onPointerDown={e => e.stopPropagation()}
            >
              <circle cx={refCx} cy={refCy} r={btnR} fill="rgba(16,185,129,0.9)" />
              <text
                x={refCx} y={refCy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12 * ui}
                fill="white"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
                title={refreshTitle}
              >↺</text>
            </g>
          )}

          {/* Delete button */}
          <g
            style={{ cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onDelete(block.id); }}
            onPointerDown={e => e.stopPropagation()}
          >
            <circle cx={delCx} cy={delCy} r={btnR} fill="rgba(220,38,38,0.9)" />
            <text
              x={delCx} y={delCy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11 * ui}
              fontWeight="700"
              fill="white"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >×</text>
          </g>
        </g>
      )}
    </g>
  );
}

export function PlacedBlocks({ placedBlocks, gridComputed, viewTransform, activeTool, onDelete, onRefresh, dragShadow, colorMode, effectivePalette, customWhite, customBlack }) {
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
          onDelete={onDelete}
          onRefresh={onRefresh}
          colorMode={colorMode}
          effectivePalette={effectivePalette}
          customWhite={customWhite}
          customBlack={customBlack}
        />
      ))}
    </g>
  );
}
