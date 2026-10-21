import { createContext, useContext } from 'react';
import { useDocumentStore } from './documentStore';

// The document the surrounding editor is bound to. Every editor component
// reads its state through useDocField() rather than holding it locally, so
// switching tabs is just a matter of rendering the editor for another doc.
export const DocContext = createContext(null);

export function useDocId() {
  const id = useContext(DocContext);
  if (!id) throw new Error('useDocField used outside a DocContext provider');
  return id;
}

// Setters are cached per (doc, field) so their identity is stable for the
// lifetime of the document — effects and memoized callbacks can depend on
// them exactly like a useState setter.
const setterCache = new Map();

function getSetter(docId, key) {
  const cacheKey = `${docId}\u0000${key}`;
  let setter = setterCache.get(cacheKey);
  if (!setter) {
    setter = (updater) => useDocumentStore.getState().setField(docId, key, updater);
    setterCache.set(cacheKey, setter);
  }
  return setter;
}

export function forgetDocSetters(docId) {
  for (const k of setterCache.keys()) if (k.startsWith(`${docId}\u0000`)) setterCache.delete(k);
}

// Drop-in replacement for useState(): `const [x, setX] = useDocField('x')`.
export function useDocField(key) {
  const docId = useDocId();
  const value = useDocumentStore(s => s.docs[docId]?.state[key]);
  return [value, getSetter(docId, key)];
}
