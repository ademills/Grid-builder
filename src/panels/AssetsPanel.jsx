import { useMemo, useState } from 'react';
import { ASSET_FOLDER_TREE } from '../builtinAssets';
import { useDocField } from '../store/useDocField';
import { useEditor } from '../editor/EditorContext';
import { assetThumb as thumbFor } from './panelUtils';
import styles from './Panel.module.css';

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
  const [openFolders, setOpenFolders] = useState(() => new Set(['Default', 'Default/1x1']));
  const q = query.trim().toLowerCase();

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
  const matches = asset => !q || asset.name.toLowerCase().includes(q);

  const enabledCount = enabledAssetIds?.size ?? 0;
  const totalCount = useMemo(() => collectAllIds(ASSET_FOLDER_TREE).length, []);

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
              <div key={asset.id} className={styles.assetItemRow} style={{ paddingLeft: 48 + depth * INDENT }}>
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
                    className={`${styles.assetThumbItem} ${!on ? styles.assetThumbItemOff : ''}`}
                    onClick={() => (on ? disable([asset.id]) : enable([asset.id]))}
                    title={`${asset.name} — click to ${on ? 'disable' : 'enable'}`}
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
      </div>
      <div className={styles.gridNote} style={{ padding: '6px 12px 0' }}>
        {enabledCount} of {totalCount} shapes enabled for fills
      </div>
      {Object.entries(ASSET_FOLDER_TREE.children)
        .sort(([a], [b]) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b)))
        .map(([name, node]) => renderFolderNode(node, name, name, 0))}
    </>
  );
}
