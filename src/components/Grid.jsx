import { useMemo } from 'react';
import { computeGrid } from '../gridPresets';

export function Grid({ workArea, gridSettings }) {
  const g = useMemo(() => computeGrid(workArea, gridSettings), [workArea, gridSettings]);

  if (!g) return null;

  const { cellSize, rows, cols, gridOriginX, gridOriginY, gridW, gridH } = g;

  const lines = [];
  for (let c = 0; c <= cols; c++) {
    const x = gridOriginX + c * cellSize;
    lines.push(
      <line key={`v${c}`} x1={x} y1={gridOriginY} x2={x} y2={gridOriginY + gridH} />
    );
  }
  for (let r = 0; r <= rows; r++) {
    const y = gridOriginY + r * cellSize;
    lines.push(
      <line key={`h${r}`} x1={gridOriginX} y1={y} x2={gridOriginX + gridW} y2={y} />
    );
  }

  return (
    <g data-noexport="true">
      <g
        stroke="rgba(0, 100, 220, 0.2)"
        strokeWidth={0.75}
        fill="none"
        shapeRendering="crispEdges"
      >
        {lines}
      </g>
      {gridSettings.borderPct > 0 && (
        <rect
          x={gridOriginX}
          y={gridOriginY}
          width={gridW}
          height={gridH}
          fill="none"
          stroke="rgba(0, 100, 220, 0.45)"
          strokeWidth={1}
          strokeDasharray="6 4"
        />
      )}
    </g>
  );
}
