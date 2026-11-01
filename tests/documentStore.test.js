import { describe, it, expect, beforeEach } from 'vitest';
import { useDocumentStore } from '../src/store/documentStore';

const store = () => useDocumentStore.getState();

describe('document store', () => {
  beforeEach(() => useDocumentStore.setState({ docs: {}, order: [], activeId: null }));

  it('keeps a restored tab\'s id and unsaved flag', () => {
    const id = store().createDocument('linework', { id: 'abc', name: 'Restored', dirty: true });
    expect(id).toBe('abc');
    expect(store().docs.abc).toMatchObject({ name: 'Restored', dirty: true, mode: 'linework' });
  });

  it('never reuses an id that is already open', () => {
    store().createDocument('linework', { id: 'abc' });
    expect(store().createDocument('linework', { id: 'abc' })).not.toBe('abc');
  });

  it('numbers new untitled tabs after restored ones', () => {
    store().createDocument('knotwork', { name: 'Untitled Meander 41' });
    const id = store().createDocument('knotwork');
    expect(store().docs[id].name).toBe('Untitled Meander 42');
  });

  it('marks a document unsaved on edits but not on view changes', () => {
    const id = store().createDocument('gridBuilder');
    store().setField(id, 'viewTransform', { x: 1, y: 2, k: 1 });
    expect(store().docs[id].dirty).toBe(false);
    store().setField(id, 'gridSettings', g => ({ ...g, borderPct: 7 }));
    expect(store().docs[id].dirty).toBe(true);
  });
});
