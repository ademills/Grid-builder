import { useState, useCallback } from 'react';
import { ALL_BUILTIN_ASSETS } from '../builtinAssets';
import { useDocumentStore } from '../store/documentStore';

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

// An entry is { blocks, fields? }. `fields` holds the values other document
// fields had before the step (e.g. a Surprise Me fill also changes the fill
// settings and palette); undoing it puts those back as well.

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

  const pushHistory = useCallback((snapshot, fields) => {
    const stacks = stacksFor(docId);
    stacks.undo = [...stacks.undo, { blocks: compress(snapshot), fields }].slice(-HISTORY_LIMIT);
    stacks.redo = [];
  }, [docId]);

  // Restores an entry, returning the entry that undoes the restore.
  const restore = useCallback((entry) => {
    const store = useDocumentStore.getState();
    const current = store.docs[docId]?.state ?? {};
    const back = { blocks: compress(placedBlocks) };
    if (entry.fields) {
      back.fields = Object.fromEntries(Object.keys(entry.fields).map(k => [k, current[k]]));
      for (const [k, v] of Object.entries(entry.fields)) store.setField(docId, k, v);
    }
    setPlacedBlocks(hydrate(entry.blocks));
    return back;
  }, [docId, placedBlocks, setPlacedBlocks]);

  const handleUndo = useCallback(() => {
    const stacks = stacksFor(docId);
    if (!stacks.undo.length) return;
    const prev = stacks.undo[stacks.undo.length - 1];
    stacks.undo = stacks.undo.slice(0, -1);
    stacks.redo = [restore(prev), ...stacks.redo].slice(0, HISTORY_LIMIT);
    syncHistorySize();
  }, [docId, restore, syncHistorySize]);

  const handleRedo = useCallback(() => {
    const stacks = stacksFor(docId);
    if (!stacks.redo.length) return;
    const next = stacks.redo[0];
    stacks.redo = stacks.redo.slice(1);
    stacks.undo = [...stacks.undo, restore(next)].slice(-HISTORY_LIMIT);
    syncHistorySize();
  }, [docId, restore, syncHistorySize]);

  return { pushHistory, handleUndo, handleRedo, historySize, syncHistorySize, clearHistory };
}
