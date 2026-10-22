// Artboard overlays drawn for the active tool (never exported).

// Live symmetry axes for Stamp / Eraser / Paint Bucket.
export function SymmetryAxes({ mode, gridComputed }) {
  if (!gridComputed || !mode || mode === 'off') return null;
  const { gridOriginX: x, gridOriginY: y, gridW: w, gridH: h, cols, rows } = gridComputed;
  const cx = x + w / 2, cy = y + h / 2;
  const line = { stroke: '#e0447a', strokeWidth: 1.25, strokeDasharray: '8 5', vectorEffect: 'non-scaling-stroke' };
  const vertical = mode === 'x' || mode === 'xy' || mode === 'radial';
  const horizontal = mode === 'y' || mode === 'xy' || mode === 'radial';
  return (
    <g pointerEvents="none" data-noexport="true" opacity={0.85}>
      {vertical && <line x1={cx} y1={y} x2={cx} y2={y + h} {...line} strokeDasharray={mode === 'radial' ? '2 6' : line.strokeDasharray} />}
      {horizontal && <line x1={x} y1={cy} x2={x + w} y2={cy} {...line} strokeDasharray={mode === 'radial' ? '2 6' : line.strokeDasharray} />}
      {mode === 'radial' && (
        <>
          <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.04} fill="none" {...line} strokeDasharray="none" />
          <text x={cx + Math.min(w, h) * 0.05} y={cy - Math.min(w, h) * 0.05} fill="#e0447a"
            fontSize={Math.min(w, h) * 0.035} style={{ userSelect: 'none' }}>
            {cols === rows ? '×4' : '×2'}
          </text>
        </>
      )}
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
