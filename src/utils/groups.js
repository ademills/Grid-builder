// Manual groups (Object › Group, Ctrl+G). A grouped block carries
// `groupId`; clicking any member selects the whole group, and the Move tool
// moves it together. Group names live in the document's `groupNames` field
// ({ [groupId]: name }); a group without one is named by its position.

const selectable = (b) => !b.hidden && !b.locked;

// `ids` plus every selectable block that shares a group with one of them.
export function expandToGroups(ids, blocks) {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  const groups = new Set();
  for (const b of blocks) if (b.groupId && idSet.has(b.id)) groups.add(b.groupId);
  if (!groups.size) return idSet;
  const out = new Set(idSet);
  for (const b of blocks) if (b.groupId && groups.has(b.groupId) && selectable(b)) out.add(b.id);
  return out;
}

// The selectable members of the group `block` belongs to (just the block if ungrouped).
export function groupMembers(block, blocks) {
  if (!block.groupId) return [block.id];
  return blocks.filter(b => b.groupId === block.groupId && selectable(b)).map(b => b.id);
}

// Groups in first-appearance order: [{ id, name, ids, hiddenCount, lockedCount }].
export function listGroups(blocks, names = {}) {
  const byId = new Map();
  for (const b of blocks) {
    if (!b.groupId) continue;
    let g = byId.get(b.groupId);
    if (!g) byId.set(b.groupId, g = { id: b.groupId, ids: [], hiddenCount: 0, lockedCount: 0 });
    g.ids.push(b.id);
    if (b.hidden) g.hiddenCount++;
    if (b.locked) g.lockedCount++;
  }
  return [...byId.values()].map((g, i) => ({ ...g, name: names[g.id] || `Group ${i + 1}` }));
}

// Puts `ids` into one new group. Groups left with a single member dissolve.
// Returns { blocks, groupId }.
export function groupBlocksTogether(blocks, ids) {
  const idSet = new Set(ids);
  const groupId = crypto.randomUUID();
  const next = blocks.map(b => (idSet.has(b.id) ? { ...b, groupId } : b));
  return { blocks: dissolveSingletons(next), groupId };
}

// Removes every group that any of `ids` belongs to.
export function ungroupBlocks(blocks, ids) {
  const idSet = new Set(ids);
  const groups = new Set(blocks.filter(b => idSet.has(b.id) && b.groupId).map(b => b.groupId));
  if (!groups.size) return blocks;
  return blocks.map(b => {
    if (!groups.has(b.groupId)) return b;
    const rest = { ...b };
    delete rest.groupId;
    return rest;
  });
}

export function dissolveSingletons(blocks) {
  const counts = new Map();
  for (const b of blocks) if (b.groupId) counts.set(b.groupId, (counts.get(b.groupId) ?? 0) + 1);
  if (![...counts.values()].some(n => n < 2)) return blocks;
  return blocks.map(b => {
    if (!b.groupId || counts.get(b.groupId) > 1) return b;
    const rest = { ...b };
    delete rest.groupId;
    return rest;
  });
}

// Gives pasted / copied blocks fresh group ids so they form new groups
// instead of joining the originals. Returns { blocks, renamed: Map(old → new) }.
export function regroupCopies(blocks) {
  const renamed = new Map();
  const out = blocks.map(b => {
    if (!b.groupId) return b;
    if (!renamed.has(b.groupId)) renamed.set(b.groupId, crypto.randomUUID());
    return { ...b, groupId: renamed.get(b.groupId) };
  });
  return { blocks: out, renamed };
}
