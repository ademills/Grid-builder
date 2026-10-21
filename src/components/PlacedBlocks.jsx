import { useMemo, memo } from 'react';

// The SVG part of the placed blocks. Shape blocks and layout wireframes are
// drawn by ShapeCanvas; this layer draws what the canvas doesn't:
//   - image and text blocks (e.g. a generated Meander design), with their
//     own click / right-click handling
//   - selection outlines, Layers-panel hover outlines and colour-lock badges

function blockBox(block, { cellSize, gridOriginX, gridOriginY }) {
  return {
    x: gridOriginX + block.gridCol * cellSize,
    y: gridOriginY + block.gridRow * cellSize,
    w: block.cols * cellSize,
    h: block.rows * cellSize,
  };
}

const ContentBlock = memo(function ContentBlock({ block, box, activeTool, onSelect, onContextMenu }) {
  const { x, y, w, h } = box;
  // Locked blocks (Layers panel) can't be selected or edited on the canvas.
  const interactive = activeTool === 'select' && !block.locked;
  return (
    <g
      opacity={block.opacity ?? undefined}
      style={block.blendMode && block.blendMode !== 'normal' ? { mixBlendMode: block.blendMode } : undefined}
      onClick={e => { if (interactive) { e.stopPropagation(); onSelect(block.id, e.shiftKey); } }}
      onContextMenu={e => {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(block, e.clientX, e.clientY);
      }}
    >
      <rect x={x} y={y} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all' }} />
      {block.type === 'text' ? (
        <foreignObject x={x} y={y} width={w} height={h} style={{ pointerEvents: 'none', overflow: 'visible' }}
          transform={block.rotation ? `rotate(${block.rotation} ${x + w / 2} ${y + h / 2})` : undefined}>
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: block.textAlign === 'left' ? 'flex-start' : block.textAlign === 'right' ? 'flex-end' : 'center',
              justifyContent: block.textVAlign === 'flex-start' ? 'flex-start' : block.textVAlign === 'flex-end' ? 'flex-end' : 'center',
              fontFamily: block.fontFamily ?? 'sans-serif',
              fontSize: block.fontSize === 'auto' || !block.fontSize ? Math.max(8, Math.min(w, h) * 0.35) : block.fontSize,
              fontWeight: block.fontWeight ?? 700,
              fontStyle: block.fontStyle ?? 'normal',
              color: block.textColor ?? '#000000',
              textAlign: block.textAlign ?? 'center',
              lineHeight: block.lineHeight ?? 1.15,
              padding: `${h * 0.06}px ${w * 0.06}px`,
              boxSizing: 'border-box',
              wordBreak: 'break-word',
              letterSpacing: block.letterSpacing != null ? `${block.letterSpacing}em` : undefined,
              textTransform: block.textTransform ?? 'none',
            }}
          >
            {block.text}
          </div>
        </foreignObject>
      ) : block.imageSrc && (
        <image
          href={block.imageSrc}
          x={x} y={y} width={w} height={h}
          preserveAspectRatio={block.imageFit === 'cover' ? 'xMidYMid slice' : block.imageFit === 'stretch' ? 'none' : 'xMidYMid meet'}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
});

export const PlacedBlocks = memo(function PlacedBlocks({
  placedBlocks, visibleRect, gridComputed, activeTool,
  selectedIds, onSelect, onContextMenu, blendMode, highlightIds,
}) {
  // Image and text blocks, culled to the visible area.
  const content = useMemo(() => {
    if (!gridComputed) return [];
    return placedBlocks
      .filter(b => !b.hidden && (b.type === 'image' || b.type === 'text'))
      .map(block => ({ block, box: blockBox(block, gridComputed) }))
      .filter(({ box }) => !visibleRect || (box.x + box.w >= visibleRect.left && box.x <= visibleRect.right
        && box.y + box.h >= visibleRect.top && box.y <= visibleRect.bottom));
  }, [placedBlocks, gridComputed, visibleRect]);

  // Outlines and badges: only the few blocks that need one.
  const marked = useMemo(() => {
    if (!gridComputed) return [];
    return placedBlocks
      .filter(b => !b.hidden && (selectedIds?.has(b.id) || highlightIds?.has(b.id) || b.colorLocked))
      .map(block => ({ block, box: blockBox(block, gridComputed) }));
  }, [placedBlocks, gridComputed, selectedIds, highlightIds]);

  if (!gridComputed) return null;
  const badge = gridComputed.cellSize * 0.12;

  return (
    <>
      {content.length > 0 && (
        <g
          id="placed-blocks"
          style={{
            pointerEvents: activeTool === 'hand' ? 'none' : 'auto',
            mixBlendMode: blendMode && blendMode !== 'normal' ? blendMode : undefined,
            isolation: blendMode && blendMode !== 'normal' ? 'isolate' : undefined,
          }}
        >
          {content.map(({ block, box }) => (
            <ContentBlock key={block.id} block={block} box={box} activeTool={activeTool}
              onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </g>
      )}
      <g pointerEvents="none" data-noexport="true">
        {marked.map(({ block, box: { x, y, w, h } }) => (
          <g key={block.id}>
            {selectedIds?.has(block.id) && (
              <rect x={x} y={y} width={w} height={h}
                fill="rgba(124,58,237,0.07)" stroke="#7c3aed" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            )}
            {highlightIds?.has(block.id) && !selectedIds?.has(block.id) && (
              <rect x={x} y={y} width={w} height={h}
                fill="none" stroke="#7b61ff" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
            {block.colorLocked && (
              <text x={x + w - badge * 0.4} y={y + badge * 0.4} fontSize={badge} textAnchor="end"
                dominantBaseline="hanging" style={{ userSelect: 'none' }}>🔒</text>
            )}
          </g>
        ))}
      </g>
    </>
  );
});
