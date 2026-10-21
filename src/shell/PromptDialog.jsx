import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import styles from './Shell.module.css';

// Renders whichever prompt the app store is currently asking. Prompts are
// raised with useAppStore.getState().ask(kind, data) and resolve to the
// chosen action.
const PROMPTS = {
  unsaved: ({ docName }) => ({
    title: `Save changes to “${docName}”?`,
    body: 'Your changes will be lost if you don’t save them.',
    actions: [
      { value: 'discard', label: 'Don’t Save', left: true },
      { value: 'cancel', label: 'Cancel', cancel: true },
      { value: 'save', label: 'Save', primary: true },
    ],
  }),
  quit: ({ count }) => ({
    title: `${count} ${count === 1 ? 'document has' : 'documents have'} unsaved changes`,
    body: 'Quit anyway and lose those changes, or cancel to go back and save them.',
    actions: [
      { value: 'cancel', label: 'Cancel', cancel: true },
      { value: 'quit', label: 'Quit Without Saving', primary: true },
    ],
  }),
};

export function PromptDialog() {
  const prompt = useAppStore(s => s.prompt);
  const answer = useAppStore(s => s.answer);
  const spec = prompt ? PROMPTS[prompt.kind]?.(prompt) : null;

  useEffect(() => {
    if (!spec) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); answer(spec.actions.find(a => a.cancel)?.value ?? null); }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); answer(spec.actions.find(a => a.primary)?.value ?? null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [spec, answer]);

  if (!spec) return null;
  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) answer('cancel'); }}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="prompt-title">
        <h2 id="prompt-title" className={styles.dialogTitle}>{spec.title}</h2>
        <p className={styles.dialogBody}>{spec.body}</p>
        <div className={styles.dialogActions}>
          {spec.actions.map(a => (
            <button
              key={a.value}
              className={`${styles.btn} ${a.primary ? styles.btnPrimary : ''} ${a.left ? styles.btnLeft : ''}`}
              onClick={() => answer(a.value)}
              autoFocus={a.primary}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
