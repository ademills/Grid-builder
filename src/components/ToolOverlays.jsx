import { CELL as LINEWORK_CELL } from '../utils/linework/compose';
import { normaliseSymmetry } from '../utils/symmetry';
import { useAppStore } from '../store/appStore';
import { brushCells, brushOrigin, clampBrush } from '../utils/brush';

// Artboard overlays drawn for the active tool (never exported).

// Live symmetry axes for Stamp / Eraser / Paint Bucket.
export function SymmetryAxes({ mode: rawMode, gridComputed }) {
  const mode = normaliseSymmetry(rawMode);
  if (!gridComputed || mode === 'none') return null;
  const { gridOriginX: x, gridOriginY: y, gridW: w, gridH: h, cols, rows } = gridComputed;
  const cx = x + w / 2, cy = y + h / 2;
  const line = { stroke: '#e0447a', strokeWidth: 1.25, strokeDasharray: '8 5', vectorEffect: 'non-scaling-stroke' };
  const rotational = mode === 'rotate2' || mode === 'rotate4';
  const diag = mode === 'mirror-diag' && cols === rows;
  const vertical = mode === 'mirror-x' || mode === 'mirror-both' || mode === 'mirror-diag' || rotational;
  const horizontal = mode === 'mirror-y' || mode === 'mirror-both' || mode === 'mirror-diag' || rotational;
  const dash = rotational ? '2 6' : line.strokeDasharray;
  const copies = mode === 'rotate4' && cols === rows ? 4 : 2;
  return (
    <g pointerEvents="none" data-noexport="true" opacity={0.85}>
      {vertical && <line x1={cx} y1={y} x2={cx} y2={y + h} {...line} strokeDasharray={dash} />}
      {horizontal && <line x1={x} y1={cy} x2={x + w} y2={cy} {...line} strokeDasharray={dash} />}
      {diag && (
        <>
          <line x1={x} y1={y} x2={x + w} y2={y + h} {...line} />
          <line x1={x + w} y1={y} x2={x} y2={y + h} {...line} />
        </>
      )}
      {rotational && (
        <>
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.04} fill="none" {...line} strokeDasharray="none" />
          <text x={cx + Math.min(w, h) * 0.05} y={cy - Math.min(w, h) * 0.05} fill="#e0447a"
            fontSize={Math.min(w, h) * 0.035} style={{ userSelect: 'none' }}>
            ×{copies}
          </text>
        </>
      )}
    </g>
  );
}

// The Stamp / Eraser brush under the pointer: the footprint a 1×1 shape
// stamps at, or the cells the Eraser clears.
export function BrushOutline({ tool, gridComputed }) {
  const cursor = useAppStore(s => s.cursor);
  const size = useAppStore(s => clampBrush(s.toolOptions.brushSize));
  const shape = useAppStore(s => s.toolOptions.brushShape);
  if (!gridComputed || cursor?.col == null || (size === 1 && tool === 'stamp')) return null;
  const { cellSize, gridOriginX, gridOriginY, cols, rows } = gridComputed;
  const cells = tool === 'stamp'
    ? [brushOrigin(cursor.col, cursor.row, size, size, cols, rows)].map(o => ({ ...o, w: size, h: size }))
    : brushCells(cursor.col, cursor.row, size, shape, cols, rows).map(c => ({ ...c, w: 1, h: 1 }));
  const colour = tool === 'eraser' ? '#e5484d' : '#7c3aed';
  return (
    <g pointerEvents="none" data-noexport="true">
      {cells.map((c, i) => (
        <rect key={i} x={gridOriginX + c.col * cellSize} y={gridOriginY + c.row * cellSize}
          width={c.w * cellSize} height={c.h * cellSize}
          fill={tool === 'eraser' ? 'rgba(229,72,77,0.10)' : 'rgba(124,58,237,0.06)'}
          stroke={colour} strokeWidth={1} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

// The Lasso's loop while it's being drawn.
// (open: a line rather than a loop, for the Weave tool's drag.)
export function LassoPath({ points, open = false }) {
  if (!points || points.length < 2) return null;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + (open ? '' : 'Z');
  return (
    <g pointerEvents="none" data-noexport="true">
      <path d={d} fill={open ? 'none' : 'rgba(124,58,237,0.08)'} stroke="#fff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#7c3aed" strokeWidth={1.25} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

// Where dragged shapes will land (Move tool): purple when the drop works,
// red when it can't (locked shapes in the way, or no room to swap).
export function MoveGhost({ plan, gridComputed }) {
  if (!plan || !gridComputed) return null;
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const colour = plan.ok ? '#7c3aed' : '#e5484d';
  return (
    <g pointerEvents="none" data-noexport="true">
      {plan.targets.map((b, i) => (
        <rect key={i}
          x={gridOriginX + b.gridCol * cellSize} y={gridOriginY + b.gridRow * cellSize}
          width={b.cols * cellSize} height={b.rows * cellSize}
          fill={plan.ok ? 'rgba(124,58,237,0.06)' : 'rgba(229,72,77,0.18)'}
          stroke={colour} strokeWidth={1.5} strokeDasharray={plan.ok ? '5 3' : undefined}
          vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

// Linework plates under the Move tool (utils/linework/plateDrag.js): the
// plate being edited, with its resize handles, or while dragging, where it
// was (faint), where it will land and the lines it snaps to. Boxes in cells.
export function PlateGhost({ ghost, editBox, handles, gridComputed, workArea, scale = 1 }) {
  if (!gridComputed || (!ghost && !editBox)) return null;
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const X = v => gridOriginX + v * cellSize, Y = v => gridOriginY + v * cellSize;
  const poly = (box) => {
    const a = (box.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      .map(([u, v]) => [box.cx + c * u * box.w / 2 - s * v * box.h / 2, box.cy + s * u * box.w / 2 + c * v * box.h / 2])
      .map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  };
  const accent = 'var(--chrome-accent, #7c3aed)';
  const hs = 7 / scale;
  return (
    <g pointerEvents="none" data-noexport="true">
      {ghost && <polygon points={poly(ghost.from)} fill="none" stroke={accent} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      {ghost?.guides.map((g, i) => (g.x != null
        ? <line key={i} x1={X(g.x)} x2={X(g.x)} y1={0} y2={workArea.height} stroke="#ff3d9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        : <line key={i} y1={Y(g.y)} y2={Y(g.y)} x1={0} x2={workArea.width} stroke="#ff3d9a" strokeWidth={1} vectorEffect="non-scaling-stroke" />))}
      {(ghost?.box ?? editBox) && (
        <polygon points={poly(ghost?.box ?? editBox)} fill={ghost ? 'rgba(124,58,237,0.08)' : 'none'}
          stroke={accent} strokeWidth={1.5} strokeDasharray={ghost ? '5 3' : undefined} vectorEffect="non-scaling-stroke" />
      )}
      {!ghost && handles?.map(h => (
        <rect key={h.key} x={X(h.x) - hs / 2} y={Y(h.y) - hs / 2} width={hs} height={hs}
          fill="#fff" stroke={accent} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

// Linework cells picked in Select's Cell mode (and their mirror images),
// from the probe's polygons in design units: purple, dashed amber when locked.
export function CellPicks({ cells, gridComputed }) {
  if (!cells?.length || !gridComputed) return null;
  const { cellSize, gridOriginX, gridOriginY } = gridComputed;
  const px = ([x, y]) => `${(gridOriginX + (x / LINEWORK_CELL) * cellSize).toFixed(2)} ${(gridOriginY + (y / LINEWORK_CELL) * cellSize).toFixed(2)}`;
  const dOf = (P) => P.map((v, i) => `${i ? 'L' : 'M'}${px(v)}`).join('') + 'Z';
  return (
    <g pointerEvents="none" data-noexport="true">
      {cells.map(c => c.polys.map((P, k) => (
        <g key={`${c.id}:${k}`} opacity={k ? 0.55 : 1}>
          <path d={dOf(P)} fill={c.locked ? 'rgba(245,158,11,0.10)' : 'rgba(124,58,237,0.12)'} stroke="#fff" strokeWidth={3} vectorEffect="non-scaling-stroke" />
          <path d={dOf(P)} fill="none" stroke={c.locked ? '#d97706' : '#7c3aed'} strokeWidth={1.5}
            strokeDasharray={c.locked ? '4 3' : undefined} vectorEffect="non-scaling-stroke" />
        </g>
      )))}
    </g>
  );
}

// The Shape Builder's drag box (artboard px): purple to merge, red to split.
export function ShapeBox({ box }) {
  if (!box || (box.w < 1 && box.h < 1)) return null;
  const colour = box.split ? '#e5484d' : '#7c3aed';
  return (
    <g pointerEvents="none" data-noexport="true">
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={box.split ? 'rgba(229,72,77,0.08)' : 'rgba(124,58,237,0.08)'}
        stroke={colour} strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
    </g>
  );
}
