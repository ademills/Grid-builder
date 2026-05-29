import { useRef, useState, useCallback } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';

const HISTORY_LIMIT = 100;

// Pre-built lookup map so hydration is O(1) per block
const assetMap = new Map(ALL_BUILTIN_ASSETS.map(a => [a.id, a]));

// Strip svgContent before storing — re-hydrate from the asset map on restore.
// This saves ~90% of memory per history entry since SVG strings can be large.
const compress = (blocks) => blocks.map(({ svgContent: _, ...b }) => b);

const hydrate = (blocks) => blocks.map(b => {
  const asset = assetMap.get(b.assetId);
  return { ...b, svgContent: asset?.svgContent ?? '' };
});

export function useHistory(placedBlocks, setPlacedBlocks) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });

  const syncHistorySize = useCallback(() => {
    setHistorySize({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistorySize({ undo: 0, redo: 0 });
  }, []);

  const pushHistory = useCallback((snapshot) => {
    undoStack.current = [...undoStack.current, compress(snapshot)].slice(-HISTORY_LIMIT);
    redoStack.current = [];
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    const prev = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [compress(placedBlocks), ...redoStack.current].slice(0, HISTORY_LIMIT);
    setPlacedBlocks(hydrate(prev));
    syncHistorySize();
  }, [placedBlocks, setPlacedBlocks, syncHistorySize]);

  const handleRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    const next = redoStack.current[0];
    redoStack.current = redoStack.current.slice(1);
    undoStack.current = [...undoStack.current, compress(placedBlocks)].slice(-HISTORY_LIMIT);
    setPlacedBlocks(hydrate(next));
    syncHistorySize();
  }, [placedBlocks, setPlacedBlocks, syncHistorySize]);

  return { pushHistory, handleUndo, handleRedo, historySize, syncHistorySize, clearHistory };
}
