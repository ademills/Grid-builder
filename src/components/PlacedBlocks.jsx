import { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { colorizeSvg, PALETTES } from '../utils/colorize';

function DraggableBlock({ block, cellSize, gridOriginX, gridOriginY, viewTransform, activeTool, onDelete, colorMode, paletteKey, bgChoice }) {
  const [hovered, setHovered] = useState(false);

  const { setNodeRef, listeners, attributes, isDragging, transform } = useDraggable({
    id: block.id,
    // Pass block data so drag handlers in App can read it without array lookup
    data: { block },
    disabled: activeTool !== 'select',
  });

  const x = gridOriginX + block.gridCol * cellSize;
  const y = gridOriginY + block.gridRow * cellSize;
  const w = block.cols * cellSize;
  const h = block.rows * cellSize;

  // dnd-kit reports delta in screen (CSS) pixels; divide by scale to get SVG user units
  const svgDx = transform ? transform.x / viewTransform.scale : 0;
  const svgDy = transform ? transform.y / viewTransform.scale : 0;

  const dataUrl = useMemo(() => {
    const palette = PALETTES[paletteKey] ?? PALETTES[Object.keys(PALETTES)[0]];
    const svg = colorMode !== 'none'
      ? colorizeSvg(block.svgContent, colorMode, palette, bgChoice, block.colorSeed ?? 0)
      : block.svgContent;
    const clean = svg
      .replace(/^<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!DOCTYPE[^>]*>\s*/gi, '');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  }, [block.svgContent, block.colorSeed, colorMode, paletteKey, bgChoice]);

  const isInteractive = activeTool === 'select';
  const showOverlay = isInteractive && (hovered || isDragging);

  // Keep chrome (delete button, outlines) at a constant screen size regardless of zoom
  const ui = 1 / viewTransform.scale;
  const delR  = 9 * ui;
  const delCx = x + w - delR * 1.5;
  const delCy = y + delR * 1.5;

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
      {/* Transparent hit-area so the full cell responds to pointer events even
          when the image has empty space due to preserveAspectRatio */}
      <rect
        x={x} y={y} width={w} height={h}
        fill="transparent"
        style={{ pointerEvents: 'all' }}
      />

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

      {/* Delete button — visible on hover, not during drag */}
      {hovered && !isDragging && isInteractive && (
        <g
          data-noexport="true"
          style={{ cursor: 'pointer' }}
          onClick={e => { e.stopPropagation(); onDelete(block.id); }}
          // Stop pointer-down so dnd-kit doesn't treat the delete tap as a drag start
          onPointerDown={e => e.stopPropagation()}
        >
          <circle cx={delCx} cy={delCy} r={delR} fill="rgba(220,38,38,0.9)" />
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
      )}
    </g>
  );
}

export function PlacedBlocks({ placedBlocks, gridComputed, viewTransform, activeTool, onDelete, dragShadow, colorMode, paletteKey, bgChoice }) {
  if (!gridComputed || !placedBlocks || placedBlocks.length === 0) return null;

  const { cellSize, gridOriginX, gridOriginY } = gridComputed;

  return (
    <g
      id="placed-blocks"
      // In hand-tool mode nothing in this layer should intercept pointer events
      style={{ pointerEvents: activeTool === 'hand' ? 'none' : 'auto' }}
    >
      {/* Drop-target shadow rendered first so it appears below all blocks */}
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
          colorMode={colorMode}
          paletteKey={paletteKey}
          bgChoice={bgChoice}
        />
      ))}
    </g>
  );
}
