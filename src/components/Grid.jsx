import { useMemo } from 'react';
import { computeGrid } from '../gridPresets';

export function Grid({ workArea, gridSettings }) {
  const g = useMemo(() => computeGrid(workArea, gridSettings), [workArea, gridSettings]);

  if (!g) return null;

  const { cellSize, rows, cols, gridOriginX, gridOriginY, gridW, gridH } = g;

  const dParts = [];
  for (let c = 0; c <= cols; c++) {
    const x = gridOriginX + c * cellSize;
    dParts.push(`M${x},${gridOriginY}V${gridOriginY + gridH}`);
  }
  for (let r = 0; r <= rows; r++) {
    const y = gridOriginY + r * cellSize;
    dParts.push(`M${gridOriginX},${y}H${gridOriginX + gridW}`);
  }

  return (
    <g data-noexport="true">
      <path
        d={dParts.join(' ')}
        stroke="rgba(0, 100, 220, 0.2)"
        strokeWidth={0.75}
        fill="none"
        shapeRendering="crispEdges"
      />
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
