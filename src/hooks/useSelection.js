import { useState, useMemo, useCallback } from 'react';

export function useSelection({
  placedBlocks, setPlacedBlocks,
  gridComputed, viewTransform,
  activeAssets, colorMode,
  pushHistory, syncHistorySize,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);

  const selectedBlocks = useMemo(
    () => placedBlocks.filter(b => selectedIds.has(b.id)),
    [placedBlocks, selectedIds]
  );

  const handleSelectBlock = useCallback((id, addToSelection) => {
    setSelectedIds(prev => {
      if (addToSelection) {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }
      return new Set([id]);
    });
  }, []);

  const handleDeselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const handleOpenContextMenu = useCallback((block, x, y) => {
    setSelectedIds(prev => prev.has(block.id) ? prev : new Set([block.id]));
    setContextMenu({ block, x, y });
  }, []);

  const handleContextRefresh = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    setPlacedBlocks(prev => prev.map(b => {
      if (b.id !== id || b.colorLocked) return b;
      if (colorMode === 'random') return { ...b, colorSeed: Math.floor(Math.random() * 0x80000000) };
      return { ...b, colorOffset: (b.colorOffset ?? 0) + 1 };
    }));
  }, [contextMenu, colorMode, setPlacedBlocks]);

  const handleContextRandomise = useCallback(() => {
    if (!contextMenu || !activeAssets.length) return;
    const id = contextMenu.block.id;
    const pick = activeAssets[Math.floor(Math.random() * activeAssets.length)];
    setPlacedBlocks(prev => prev.map(b =>
      b.id === id ? {
        ...b,
        svgContent: pick.svgContent,
        name: pick.name,
        assetId: pick.id,
        colorSeed: Math.floor(Math.random() * 0x80000000),
        colorOffset: 0,
      } : b
    ));
  }, [contextMenu, activeAssets, setPlacedBlocks]);

  const handleContextToggleLock = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    setPlacedBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, colorLocked: !b.colorLocked } : b
    ));
  }, [contextMenu, setPlacedBlocks]);

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    const id = contextMenu.block.id;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    syncHistorySize();
  }, [contextMenu, placedBlocks, pushHistory, setPlacedBlocks, syncHistorySize]);

  const handleMarqueeSelect = useCallback(({ x1, y1, x2, y2 }) => {
    if (!gridComputed) return;
    const { cellSize, gridOriginX, gridOriginY } = gridComputed;
    const { x: panX, y: panY, scale } = viewTransform;
    const svgX1 = (x1 - panX) / scale;
    const svgY1 = (y1 - panY) / scale;
    const svgX2 = (x2 - panX) / scale;
    const svgY2 = (y2 - panY) / scale;
    const hits = placedBlocks.filter(b => {
      const bx = gridOriginX + b.gridCol * cellSize;
      const by = gridOriginY + b.gridRow * cellSize;
      const bw = b.cols * cellSize;
      const bh = b.rows * cellSize;
      return bx < svgX2 && bx + bw > svgX1 && by < svgY2 && by + bh > svgY1;
    });
    setSelectedIds(new Set(hits.map(b => b.id)));
  }, [gridComputed, viewTransform, placedBlocks]);

  const handleDeleteSelected = useCallback(() => {
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.filter(b => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
    syncHistorySize();
  }, [selectedIds, placedBlocks, pushHistory, setPlacedBlocks, syncHistorySize]);

  const handleRefreshSelected = useCallback(() => {
    setPlacedBlocks(prev => prev.map(b => {
      if (!selectedIds.has(b.id) || b.colorLocked) return b;
      if (colorMode === 'random') return { ...b, colorSeed: Math.floor(Math.random() * 0x80000000) };
      return { ...b, colorOffset: (b.colorOffset ?? 0) + 1 };
    }));
  }, [selectedIds, colorMode, setPlacedBlocks]);

  const handleRandomiseSelected = useCallback(() => {
    if (!activeAssets.length) return;
    setPlacedBlocks(prev => prev.map(b => {
      if (!selectedIds.has(b.id) || b.colorLocked) return b;
      const sameSize = activeAssets.filter(a => a.cols === b.cols && a.rows === b.rows);
      if (!sameSize.length) return b;
      const pick = sameSize[Math.floor(Math.random() * sameSize.length)];
      return {
        ...b,
        svgContent: pick.svgContent,
        name: pick.name,
        assetId: pick.id,
        colorSeed: Math.floor(Math.random() * 0x80000000),
        colorOffset: 0,
      };
    }));
  }, [selectedIds, activeAssets, setPlacedBlocks]);

  const handleFlipH = useCallback(() => {
    if (!gridComputed) return;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      gridCol: gridComputed.cols - b.gridCol - b.cols,
    })));
    syncHistorySize();
  }, [gridComputed, placedBlocks, pushHistory, setPlacedBlocks, syncHistorySize]);

  const handleFlipV = useCallback(() => {
    if (!gridComputed) return;
    pushHistory(placedBlocks);
    setPlacedBlocks(prev => prev.map(b => ({
      ...b,
      gridRow: gridComputed.rows - b.gridRow - b.rows,
    })));
    syncHistorySize();
  }, [gridComputed, placedBlocks, pushHistory, setPlacedBlocks, syncHistorySize]);

  const handleToggleLockSelected = useCallback(() => {
    const allLocked = [...selectedIds].every(id => {
      const b = placedBlocks.find(bl => bl.id === id);
      return b?.colorLocked;
    });
    setPlacedBlocks(prev => prev.map(b =>
      selectedIds.has(b.id) ? { ...b, colorLocked: !allLocked } : b
    ));
  }, [selectedIds, placedBlocks, setPlacedBlocks]);

  const handleSwapSelected = useCallback((asset) => {
    setPlacedBlocks(prev => {
      let result = prev;
      for (const id of selectedIds) {
        const block = result.find(b => b.id === id);
        if (!block) continue;
        const newCols = asset.cols ?? block.cols;
        const newRows = asset.rows ?? block.rows;
        const overlapIds = new Set(
          result
            .filter(b =>
              b.id !== id &&
              b.gridCol < block.gridCol + newCols && b.gridCol + b.cols > block.gridCol &&
              b.gridRow < block.gridRow + newRows && b.gridRow + b.rows > block.gridRow
            )
            .map(b => b.id)
        );
        result = result
          .filter(b => !overlapIds.has(b.id))
          .map(b => b.id === id ? {
            ...b,
            cols: newCols,
            rows: newRows,
            svgContent: asset.svgContent,
            name: asset.name,
            assetId: asset.id,
            colorSeed: Math.floor(Math.random() * 0x80000000),
            colorOffset: 0,
          } : b);
      }
      return result;
    });
  }, [selectedIds, setPlacedBlocks]);

  return {
    selectedIds, setSelectedIds,
    selectedBlocks,
    contextMenu, setContextMenu,
    handleSelectBlock,
    handleDeselectAll,
    handleOpenContextMenu,
    handleContextRefresh,
    handleContextRandomise,
    handleContextToggleLock,
    handleContextDelete,
    handleMarqueeSelect,
    handleDeleteSelected,
    handleRefreshSelected,
    handleRandomiseSelected,
    handleFlipH,
    handleFlipV,
    handleToggleLockSelected,
    handleSwapSelected,
  };
}
