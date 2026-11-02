import { useMemo, useState } from 'react';
import { ASSET_FOLDER_TREE } from '../builtinAssets';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { useShapeStore, isUserShape } from '../store/shapeStore';
import { useAllAssets, assetTags } from '../utils/assetRegistry';
import { importShapes } from '../shell/commands';
import { assetThumb as thumbFor } from './panelUtils';
import styles from './Panel.module.css';

// The user's imported shapes as a folder node, by size.
function userFolder(shapes) {
  const node = { sizes: {}, children: {} };
  for (const s of shapes) (node.sizes[s.size] ??= []).push(s);
  for (const list of Object.values(node.sizes)) list.sort((a, b) => a.name.localeCompare(b.name));
  return node;
}

// Shape packs (5.3): named sets of shapes a document switches on in one go.
function Packs({ enabledAssetIds, setEnabledAssetIds }) {
  const packs = useShapeStore(s => s.packs);
  const { addPack, updatePack, deletePack } = useShapeStore.getState();
  const [renaming, setRenaming] = useState(null);
  const sameSet = p => p.assetIds.length === enabledAssetIds.size && p.assetIds.every(id => enabledAssetIds.has(id));
  return (
    <div className={styles.packs}>
      <div className={styles.packsHeader}>
        <span>Packs</span>
        <button className={styles.addQuickBtn} disabled={!enabledAssetIds.size}
          onClick={() => { const name = prompt('Pack name', 'My pack'); if (name?.trim()) addPack(name.trim(), [...enabledAssetIds]); }}
          title="Save the enabled shapes as a pack">+ Pack</button>
      </div>
      {!packs.length && <div className={styles.gridNote} style={{ margin: '2px 0 4px' }}>Save the enabled shapes as a pack to switch between sets of shapes.</div>}
      {packs.map(p => (
        <div key={p.id} className={`${styles.packRow} ${sameSet(p) ? styles.packRowActive : ''}`}>
          {renaming === p.id ? (
            <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} autoFocus defaultValue={p.name}
              onBlur={e => { if (e.target.value.trim()) updatePack(p.id, { name: e.target.value.trim() }); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
          ) : (
            <span className={styles.packName} onDoubleClick={() => setRenaming(p.id)} title="Double-click to rename">{p.name}</span>
          )}
          <span className={styles.assetGroupCount}>{p.assetIds.length}</span>
          <button className={styles.addQuickBtn} onClick={() => setEnabledAssetIds(new Set(p.assetIds))} title="Use only this pack's shapes">Use</button>
          <button className={styles.addQuickBtn} onClick={() => setEnabledAssetIds(prev => new Set([...prev, ...p.assetIds]))} title="Add this pack's shapes to the enabled ones">+</button>
          <button className={styles.addQuickBtn} onClick={() => updatePack(p.id, { assetIds: [...enabledAssetIds] })} title="Replace the pack with the enabled shapes">Update</button>
          <button className={styles.addQuickBtn} onClick={() => { if (confirm(`Delete the pack “${p.name}”?`)) deletePack(p.id); }} title="Delete pack">✕</button>
        </div>
      ))}
    </div>
  );
}

// Tags and (for imported shapes) name of the shape being edited.
function ShapeEditor({ asset, onClose }) {
  const builtinTags = useShapeStore(s => s.builtinTags);
  const { setTags, updateShape, deleteShape } = useShapeStore.getState();
  const user = isUserShape(asset.id);
  return (
    <div className={styles.shapeEditor}>
      <img src={thumbFor(asset)} alt="" />
      <div className={styles.shapeEditorFields}>
        {user
          ? <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} defaultValue={asset.name} key={asset.id}
              onBlur={e => e.target.value.trim() && updateShape(asset.id, { name: e.target.value.trim() })} title="Name" />
          : <span className={styles.assetItemName}>{asset.name}</span>}
        <input className={styles.hexInput} style={{ fontFamily: 'inherit' }} key={`${asset.id}-tags`}
          defaultValue={assetTags(asset, builtinTags).join(', ')} placeholder="Tags, comma separated"
          onBlur={e => setTags(asset.id, e.target.value.split(','))}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </div>
      <div className={styles.shapeEditorActions}>
        {user && <button className={styles.addQuickBtn} onClick={() => { if (confirm(`Delete “${asset.name}” from your shapes?`)) { deleteShape(asset.id); onClose(); } }}>Delete</button>}
        <button className={styles.addQuickBtn} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

const INDENT = 16;

function collectAllIds(node) {
  const ids = [];
  for (const assets of Object.values(node.sizes)) for (const a of assets) ids.push(a.id);
  for (const child of Object.values(node.children)) ids.push(...collectAllIds(child));
  return ids;
}

// Shape library browser: folders → size groups → shapes. Enabled shapes are
// the ones fills pick from; the badge shows how many of each are placed.
export function AssetsPanel() {
  const { assetUsageCounts } = useEditor();
  const [enabledAssetIds, setEnabledAssetIds] = useDocField('enabledAssetIds');
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [openFolders, setOpenFolders] = useState(() => new Set(['Default', 'Default/1x1', 'My shapes']));
  const [editing, setEditing] = useState(null);   // asset id whose tags are being edited
  const assets = useAllAssets();
  const builtinTags = useShapeStore(s => s.builtinTags);
  const myShapes = useMemo(() => userFolder(assets.filter(a => !a.builtin)), [assets]);
  const allTags = useMemo(() => [...new Set(assets.flatMap(a => assetTags(a, builtinTags)))].sort(), [assets, builtinTags]);
  const q = query.trim().toLowerCase();
  const tagQuery = q.startsWith('#') ? q.slice(1) : null;

  const toggleFolder = path => setOpenFolders(p => {
    const n = new Set(p);
    n.has(path) ? n.delete(path) : n.add(path);
    return n;
  });
  const enable = ids => setEnabledAssetIds(prev => new Set([...prev, ...ids]));
  const disable = ids => setEnabledAssetIds(prev => {
    const next = new Set(prev);
    ids.forEach(id => next.delete(id));
    return next;
  });
  const groupState = ids => {
    const on = ids.filter(id => enabledAssetIds?.has(id)).length;
    return on === 0 ? 'off' : on === ids.length ? 'on' : 'partial';
  };
  const toggleIds = (ids, state) => (state === 'off' ? enable(ids) : disable(ids));
  // Search matches names and tags; "#tag" matches that tag only.
  const matches = asset => {
    if (!q) return true;
    const tags = assetTags(asset, builtinTags);
    if (tagQuery != null) return tags.includes(tagQuery);
    return asset.name.toLowerCase().includes(q) || tags.some(t => t.includes(q));
  };

  const enabledCount = enabledAssetIds?.size ?? 0;
  const totalCount = assets.length;

  const renderSizes = (node, path, depth) =>
    Object.entries(node.sizes).map(([sz, szAssets]) => {
      const shown = szAssets.filter(matches);
      if (!shown.length) return null;
      const sizeIds = szAssets.map(a => a.id);
      const sizeKey = `${path}/${sz}`;
      const sizeState = groupState(sizeIds);
      const open = q ? true : openFolders.has(sizeKey);
      return (
        <div key={sizeKey}>
          <div className={styles.assetThemeRow} style={{ paddingLeft: 30 + depth * INDENT }}>
            <button
              className={`${styles.assetToggle} ${styles[`assetToggle_${sizeState}`]}`}
              onClick={() => toggleIds(sizeIds, sizeState)}
              title={sizeState === 'off' ? 'Enable all' : 'Disable all'}
            />
            <button className={styles.assetGroupLabel} onClick={() => toggleFolder(sizeKey)}>
              <span>{sz}</span>
              <span className={styles.assetGroupCount}>{shown.length}</span>
              <span className={styles.assetGroupArrow}>{open ? '▼' : '▶'}</span>
            </button>
          </div>

          {open && view === 'list' && shown.map(asset => {
            const on = enabledAssetIds?.has(asset.id);
            const count = assetUsageCounts?.[asset.id];
            return (
              <div key={asset.id} className={styles.assetItemRow} style={{ paddingLeft: 48 + depth * INDENT }}
                onContextMenu={e => { e.preventDefault(); setEditing(asset.id); }}>
                <button
                  className={`${styles.assetToggle} ${styles[on ? 'assetToggle_on' : 'assetToggle_off']}`}
                  onClick={() => (on ? disable([asset.id]) : enable([asset.id]))}
                />
                <span className={`${styles.assetItemName} ${!on ? styles.assetItemDisabled : ''}`}>{asset.name}</span>
                {count > 0 && <span className={styles.usageBadge}>{count}</span>}
              </div>
            );
          })}

          {open && view === 'grid' && (
            <div className={styles.assetThumbGrid}>
              {shown.map(asset => {
                const on = enabledAssetIds?.has(asset.id);
                const count = assetUsageCounts?.[asset.id];
                return (
                  <button
                    key={asset.id}
                    className={`${styles.assetThumbItem} ${!on ? styles.assetThumbItemOff : ''} ${editing === asset.id ? styles.assetThumbItemEditing : ''}`}
                    onClick={() => (on ? disable([asset.id]) : enable([asset.id]))}
                    onContextMenu={e => { e.preventDefault(); setEditing(asset.id); }}
                    title={`${asset.name} — click to ${on ? 'disable' : 'enable'}, right-click for tags`}
                  >
                    <img src={thumbFor(asset)} alt={asset.name} className={styles.assetThumbImg} loading="lazy" />
                    <span className={styles.assetThumbName}>{asset.name}</span>
                    {count > 0 && <span className={styles.usageBadge}>{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    });

  const renderFolderNode = (node, name, path, depth) => {
    const allIds = collectAllIds(node);
    if (q && !allIds.some(id => matches(assets.find(a => a.id === id)))) return null;
    const nodeState = groupState(allIds);
    const isOpen = q ? true : openFolders.has(path);
    const childNames = Object.keys(node.children).sort((a, b) => a.localeCompare(b));
    const children = isOpen && (
      <>
        {childNames.map(c => renderFolderNode(node.children[c], c, `${path}/${c}`, depth + 1))}
        {renderSizes(node, path, depth)}
      </>
    );
    return (
      <div key={path}>
        <div
          className={depth === 0 ? styles.assetSizeRow : styles.assetThemeRow}
          style={{ paddingLeft: depth === 0 ? 12 : 30 + (depth - 1) * INDENT }}
        >
          <button
            className={`${styles.assetToggle} ${styles[`assetToggle_${nodeState}`]}`}
            onClick={() => toggleIds(allIds, nodeState)}
            title={nodeState === 'off' ? 'Enable all' : 'Disable all'}
          />
          <button className={styles.assetGroupLabel} onClick={() => toggleFolder(path)}>
            <span>{name}</span>
            <span className={styles.assetGroupCount}>{allIds.length}</span>
            <span className={styles.assetGroupArrow}>{isOpen ? '▼' : '▶'}</span>
          </button>
        </div>
        {children}
      </div>
    );
  };

  return (
    <>
      <div className={styles.assetToolbar}>
        <input className={styles.hexInput} placeholder="Search shapes…" value={query}
          onChange={e => setQuery(e.target.value)} spellCheck={false} />
        <button
          className={styles.assetViewToggleBtn}
          onClick={() => setView(v => (v === 'list' ? 'grid' : 'list'))}
          title={view === 'list' ? 'Thumbnail view' : 'List view'}
        >{view === 'list' ? '⊞' : '☰'}</button>
        <button className={styles.assetViewToggleBtn} style={{ width: 'auto', padding: '0 8px' }} onClick={importShapes}
          title="Import SVG files as shapes (or drop them on the window)">Import…</button>
      </div>
      {allTags.length > 0 && (
        <div className={styles.tagChips}>
          {allTags.map(t => (
            <button key={t} className={`${styles.tagChip} ${tagQuery === t ? styles.tagChipActive : ''}`}
              onClick={() => setQuery(tagQuery === t ? '' : `#${t}`)}>{t}</button>
          ))}
        </div>
      )}
      {editing && assets.find(a => a.id === editing) && (
        <ShapeEditor asset={assets.find(a => a.id === editing)} onClose={() => setEditing(null)} />
      )}
      <Packs enabledAssetIds={enabledAssetIds ?? new Set()} setEnabledAssetIds={setEnabledAssetIds} />
      <div className={styles.gridNote} style={{ padding: '6px 12px 0' }}>
        {enabledCount} of {totalCount} shapes enabled for fills
      </div>
      {Object.keys(myShapes.sizes).length > 0 && renderFolderNode(myShapes, 'My shapes', 'My shapes', 0)}
      {Object.entries(ASSET_FOLDER_TREE.children)
        .sort(([a], [b]) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b)))
        .map(([name, node]) => renderFolderNode(node, name, name, 0))}
    </>
  );
}
