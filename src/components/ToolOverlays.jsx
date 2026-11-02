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
export function LassoPath({ points }) {
  if (!points || points.length < 2) return null;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z';
  return (
    <g pointerEvents="none" data-noexport="true">
      <path d={d} fill="rgba(124,58,237,0.08)" stroke="#fff" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
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
