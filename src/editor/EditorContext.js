import { createContext, useContext, useCallback } from 'react';
import { useDocField } from '../store/useDocField';

// Everything panels need from the mounted editor that isn't a plain
// document field: derived values (grid geometry, extracted palette…),
// transient editor state (pixel buffers, audio file), and actions that
// touch several fields at once or need history (fills, layouts, flips…).
// Plain fields are read straight from the store with useDocField().
export const EditorContext = createContext(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor used outside DocumentEditor');
  return ctx;
}

// For settings objects that are updated a few keys at a time:
// `const [glitch, setGlitch] = useDocSettings('glitchSettings'); setGlitch({ force: 0.5 })`
export function useDocSettings(key) {
  const [value, setValue] = useDocField(key);
  const merge = useCallback((changes) => setValue(prev => ({ ...prev, ...changes })), [setValue]);
  return [value, merge];
}
