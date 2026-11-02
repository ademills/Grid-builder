import { AppShell } from './shell/AppShell';
import { useDocumentStore } from './store/documentStore';
import { useAppStore } from './store/appStore';
import { useShapeStore } from './store/shapeStore';

// Dev builds only: expose the stores for debugging and automated UI checks
// (e.g. window.__mps.docs.getState()).
if (import.meta.env.DEV) window.__mps = { docs: useDocumentStore, app: useAppStore, shapes: useShapeStore };

function App() {
  return <AppShell />;
}

export default App;
