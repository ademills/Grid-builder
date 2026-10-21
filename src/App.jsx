import { AppShell } from './shell/AppShell';
import { useDocumentStore } from './store/documentStore';

// Dev builds only: expose the document store for debugging and automated
// UI checks (e.g. window.__mps.docs.getState()).
if (import.meta.env.DEV) window.__mps = { docs: useDocumentStore };

function App() {
  return <AppShell />;
}

export default App;
