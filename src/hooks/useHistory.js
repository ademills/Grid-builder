import { useState, useCallback } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';

const HISTORY_LIMIT = 100;

// Pre-built lookup map so hydration is O(1) per block
const assetMap = new Map(ALL_BUILTIN_ASSETS.map(a => [a.id, a]));

// Strip svgContent before storing — re-hydrate from the asset map on restore.
// This saves ~90% of memory per history entry since SVG strings can be large.
const compress = (blocks) => blocks.map(b => {
  if (!('svgContent' in b)) return b;
  const rest = { ...b };
  delete rest.svgContent;
  return rest;
});

const hydrate = (blocks) => blocks.map(b => {
  if (!b.assetId) return b;
  const asset = assetMap.get(b.assetId);
  return { ...b, svgContent: asset?.svgContent ?? '' };
});

// Undo/redo stacks live outside React, keyed by document id, so a document
// keeps its history when its tab is switched away from and back again.
const stacksByDoc = new Map();

function stacksFor(docId) {
  let stacks = stacksByDoc.get(docId);
  if (!stacks) {
    stacks = { undo: [], redo: [] };
    stacksByDoc.set(docId, stacks);
  }
  return stacks;
}

export function forgetDocHistory(docId) {
  stacksByDoc.delete(docId);
}

export function useHistory(docId, placedBlocks, setPlacedBlocks) {
  const [historySize, setHistorySize] = useState(() => {
    const stacks = stacksFor(docId);
    return { undo: stacks.undo.length, redo: stacks.redo.length };
  });

  const syncHistorySize = useCallback(() => {
    const stacks = stacksFor(docId);
    setHistorySize({ undo: stacks.undo.length, redo: stacks.redo.length });
  }, [docId]);

  const clearHistory = useCallback(() => {
    const stacks = stacksFor(docId);
    stacks.undo = [];
    stacks.redo = [];
    setHistorySize({ undo: 0, redo: 0 });
  }, [docId]);

  const pushHistory = useCallback((snapshot) => {
    const stacks = stacksFor(docId);
    stacks.undo = [...stacks.undo, compress(snapshot)].slice(-HISTORY_LIMIT);
    stacks.redo = [];
  }, [docId]);

  const handleUndo = useCallback(() => {
    const stacks = stacksFor(docId);
    if (!stacks.undo.length) return;
    const prev = stacks.undo[stacks.undo.length - 1];
    stacks.undo = stacks.undo.slice(0, -1);
    stacks.redo = [compress(placedBlocks), ...stacks.redo].slice(0, HISTORY_LIMIT);
    setPlacedBlocks(hydrate(prev));
    syncHistorySize();
  }, [docId, placedBlocks, setPlacedBlocks, syncHistorySize]);

  const handleRedo = useCallback(() => {
    const stacks = stacksFor(docId);
    if (!stacks.redo.length) return;
    const next = stacks.redo[0];
    stacks.redo = stacks.redo.slice(1);
    stacks.undo = [...stacks.undo, compress(placedBlocks)].slice(-HISTORY_LIMIT);
    setPlacedBlocks(hydrate(next));
    syncHistorySize();
  }, [docId, placedBlocks, setPlacedBlocks, syncHistorySize]);

  return { pushHistory, handleUndo, handleRedo, historySize, syncHistorySize, clearHistory };
}
