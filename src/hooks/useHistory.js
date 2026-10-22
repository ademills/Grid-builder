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

// An entry is { blocks, fields?, label, at }. `fields` holds the values other
// document fields had before the step (e.g. a Surprise Me fill also changes
// the fill settings and palette); undoing it puts those back as well.
// `label` names the step ("Fill — Glitch", "Stamp ×12") for the History
// panel. An undo entry holds the state before its step; a redo entry the
// state after it.

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

// Sizes plus step names, for the Edit menu and the History panel.
function summary(stacks) {
  return {
    undo: stacks.undo.length,
    redo: stacks.redo.length,
    undoLabels: stacks.undo.map(e => e.label),
    redoLabels: stacks.redo.map(e => e.label),
    truncated: !!stacks.truncated,
  };
}

// Consecutive pushes with `coalesce` and the same label within this long
// count as one step (e.g. a run of arrow-key nudges).
const COALESCE_MS = 1000;

export function useHistory(docId, setPlacedBlocks) {
  const [historySize, setHistorySize] = useState(() => summary(stacksFor(docId)));

  const syncHistorySize = useCallback(() => {
    setHistorySize(summary(stacksFor(docId)));
  }, [docId]);

  const clearHistory = useCallback(() => {
    const stacks = stacksFor(docId);
    stacks.undo = [];
    stacks.redo = [];
    stacks.truncated = false;
    setHistorySize(summary(stacks));
  }, [docId]);

  // `snapshot` is the block list before the step.
  //   label    — the step's name in the History panel
  //   fields   — other document fields' values before the step
  //   coalesce — merge into the previous step if it has the same label and was recent
  const pushHistory = useCallback((snapshot, { label = 'Edit', fields, coalesce = false } = {}) => {
    const stacks = stacksFor(docId);
    const top = stacks.undo[stacks.undo.length - 1];
    const now = Date.now();
    if (coalesce && top?.coalesce && top.label === label && now - top.at < COALESCE_MS && !stacks.redo.length) {
      top.at = now;
      return;
    }
    const next = [...stacks.undo, { blocks: compress(snapshot), fields, label, at: now, coalesce }];
    if (next.length > HISTORY_LIMIT) stacks.truncated = true;
    stacks.undo = next.slice(-HISTORY_LIMIT);
    stacks.redo = [];
  }, [docId]);

  // Renames the newest step (e.g. "Stamp" → "Stamp ×12" when a drag ends).
  const relabelHistory = useCallback((label) => {
    const top = stacksFor(docId).undo.at(-1);
    if (top) top.label = label;
  }, [docId]);

  // Restores an entry, returning the entry that undoes the restore. Reads the
  // current blocks from the store, not React state, so several restores in a
  // row (History panel jumps) each see the previous one's result.
  const restore = useCallback((entry) => {
    const store = useDocumentStore.getState();
    const current = store.docs[docId]?.state ?? {};
    const back = { blocks: compress(current.placedBlocks ?? []), label: entry.label, at: entry.at };
    if (entry.fields) {
      back.fields = Object.fromEntries(Object.keys(entry.fields).map(k => [k, current[k]]));
      for (const [k, v] of Object.entries(entry.fields)) store.setField(docId, k, v);
    }
    setPlacedBlocks(hydrate(entry.blocks));
    return back;
  }, [docId, setPlacedBlocks]);

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

  // Goes to the state after `steps` undo steps (0 = the oldest kept state).
  const jumpTo = useCallback((steps) => {
    const stacks = stacksFor(docId);
    while (stacks.undo.length > steps && stacks.undo.length) {
      const prev = stacks.undo[stacks.undo.length - 1];
      stacks.undo = stacks.undo.slice(0, -1);
      stacks.redo = [restore(prev), ...stacks.redo];
    }
    while (stacks.undo.length < steps && stacks.redo.length) {
      const next = stacks.redo[0];
      stacks.redo = stacks.redo.slice(1);
      stacks.undo = [...stacks.undo, restore(next)];
    }
    syncHistorySize();
  }, [docId, restore, syncHistorySize]);

  return { pushHistory, relabelHistory, handleUndo, handleRedo, jumpTo, historySize, syncHistorySize, clearHistory };
}
