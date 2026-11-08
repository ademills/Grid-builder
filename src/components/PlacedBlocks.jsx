import { useMemo, memo } from 'react';
import { vectorTransform } from '../utils/meanderBlocks';

// The SVG part of the placed blocks. Shape blocks and layout wireframes are
// drawn by ShapeCanvas; this layer draws what the canvas doesn't:
//   - image, text and vector blocks (e.g. Meander strands), with their own
//     click / right-click handling -- vector blocks hit-test on the path
//     itself rather than their footprint
//   - selection outlines, Layers-panel hover outlines and colour-lock badges

function blockBox(block, { cellSize, gridOriginX, gridOriginY }) {
  return {
    x: gridOriginX + block.gridCol * cellSize,
    y: gridOriginY + block.gridRow * cellSize,
    w: block.cols * cellSize,
    h: block.rows * cellSize,
  };
}

// View › Outline: what a vector block, image or text box is drawn as.
const OUTLINE = { fill: 'none', stroke: '#1b1b1b', strokeWidth: 1, vectorEffect: 'non-scaling-stroke' };

const ContentBlock = memo(function ContentBlock({ block, box, activeTool, onSelect, onContextMenu, ghost, outline }) {
  const { x, y, w, h } = box;
  // Locked blocks (Layers panel) can't be selected or edited on the canvas.
  const interactive = activeTool === 'select' && !block.locked;
  return (
    <g
      opacity={outline ? undefined : block.opacity ?? undefined}
      style={!outline && block.blendMode && block.blendMode !== 'normal' ? { mixBlendMode: block.blendMode } : undefined}
      onClick={e => { if (interactive) { e.stopPropagation(); onSelect(block.id, e.shiftKey); } }}
      onContextMenu={e => {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(block, e.clientX, e.clientY);
      }}
    >
      {block.type !== 'vector' && <rect x={x} y={y} width={w} height={h} fill="transparent" style={{ pointerEvents: 'all' }} />}
      {outline ? (
        block.type === 'vector' ? (
          // Clicks still land anywhere inside the path ('fill' ignores fill="none").
          <path d={block.d} transform={vectorTransform(block, box)} {...OUTLINE} style={{ pointerEvents: 'fill' }} />
        ) : (
          <g style={{ pointerEvents: 'none' }} {...OUTLINE}>
            <rect x={x} y={y} width={w} height={h} />
            <path d={`M${x} ${y}L${x + w} ${y + h}M${x + w} ${y}L${x} ${y + h}`} />
          </g>
        )
      ) : block.type === 'vector' ? (
        <>
          {block.blur > 0 && (
            <defs>
              <filter id={`vblur-${block.id}`} x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation={block.blur} />
              </filter>
            </defs>
          )}
          {/* ghost: live effects draw the strand on the canvas; this copy only catches clicks. */}
          <path d={block.d} fill={block.fill} fillOpacity={ghost ? 0 : undefined} transform={vectorTransform(block, box)}
            filter={block.blur > 0 ? `url(#vblur-${block.id})` : undefined}
            style={{ pointerEvents: block.blur > 0 ? 'none' : 'fill' }} />
        </>
      ) : block.type === 'text' ? (
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
  selectedIds, onSelect, onContextMenu, blendMode, highlightIds, hideImages = false, outline = false,
}) {
  // Image and text blocks, culled to the visible area.
  const content = useMemo(() => {
    if (!gridComputed) return [];
    return placedBlocks
      // With live effects on, image blocks are drawn (with the effects) by ShapeCanvas.
      .filter(b => !b.hidden && ((b.type === 'image' && !hideImages) || b.type === 'text' || b.type === 'vector'))
      .map(block => ({ block, box: blockBox(block, gridComputed) }))
      .filter(({ box }) => !visibleRect || (box.x + box.w >= visibleRect.left && box.x <= visibleRect.right
        && box.y + box.h >= visibleRect.top && box.y <= visibleRect.bottom));
  }, [placedBlocks, gridComputed, visibleRect, hideImages]);

  // A dashed box around each group with a selected member (Object › Group).
  const groupBoxes = useMemo(() => {
    if (!gridComputed || !selectedIds?.size) return [];
    const boxes = new Map();
    for (const b of placedBlocks) {
      if (!b.groupId || b.hidden) continue;
      let g = boxes.get(b.groupId);
      if (!g) boxes.set(b.groupId, g = { c0: Infinity, r0: Infinity, c1: -Infinity, r1: -Infinity, selected: false });
      g.c0 = Math.min(g.c0, b.gridCol); g.r0 = Math.min(g.r0, b.gridRow);
      g.c1 = Math.max(g.c1, b.gridCol + b.cols); g.r1 = Math.max(g.r1, b.gridRow + b.rows);
      if (selectedIds.has(b.id)) g.selected = true;
    }
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    return [...boxes].filter(([, g]) => g.selected).map(([id, g]) => ({
      id, x: gridOriginX + g.c0 * cellSize, y: gridOriginY + g.r0 * cellSize, w: (g.c1 - g.c0) * cellSize, h: (g.r1 - g.r0) * cellSize,
    }));
  }, [placedBlocks, gridComputed, selectedIds]);

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
            mixBlendMode: !outline && blendMode && blendMode !== 'normal' ? blendMode : undefined,
            isolation: !outline && blendMode && blendMode !== 'normal' ? 'isolate' : undefined,
          }}
        >
          {content.map(({ block, box }) => (
            <ContentBlock key={block.id} block={block} box={box} activeTool={activeTool}
              onSelect={onSelect} onContextMenu={onContextMenu} ghost={hideImages && block.type === 'vector'} outline={outline} />
          ))}
        </g>
      )}
      <g pointerEvents="none" data-noexport="true">
        {groupBoxes.map(g => (
          <rect key={g.id} x={g.x} y={g.y} width={g.w} height={g.h} fill="none" stroke="#7c3aed"
            strokeWidth={1.25} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        ))}
        {marked.map(({ block, box: { x, y, w, h } }) => (
          <g key={block.id}>
            {selectedIds?.has(block.id) && block.type === 'vector' && (
              <path d={block.d} transform={vectorTransform(block, { x, y, w, h })}
                fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            )}
            {selectedIds?.has(block.id) && block.type !== 'vector' && (
              <rect x={x} y={y} width={w} height={h}
                fill="rgba(124,58,237,0.07)" stroke="#7c3aed" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            )}
            {highlightIds?.has(block.id) && !selectedIds?.has(block.id) && block.type === 'vector' && (
              <path d={block.d} transform={vectorTransform(block, { x, y, w, h })}
                fill="none" stroke="#7b61ff" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
            )}
            {highlightIds?.has(block.id) && !selectedIds?.has(block.id) && block.type !== 'vector' && (
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
