import { useState, useCallback } from 'react';
import { Canvas } from './components/Canvas';
import { FloatingPanel } from './components/FloatingPanel';
import './App.css';
import styles from './App.module.css';

// Placeholder work area — Phase 2 will let the user choose presets
const DEFAULT_WORK_AREA = { width: 800, height: 600 };

function App() {
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState('select');
  const [bgColor, setBgColor] = useState('#2d2d2d');
  const [workArea] = useState(DEFAULT_WORK_AREA);

  const handleZoom = useCallback((direction) => {
    const factor = direction > 0 ? 1.2 : 1 / 1.2;
    setViewTransform(prev => {
      const newScale = Math.min(Math.max(prev.scale * factor, 0.05), 20);
      // Zoom towards canvas centre
      const cx = prev.x + (workArea.width * prev.scale) / 2;
      const cy = prev.y + (workArea.height * prev.scale) / 2;
      const sf = newScale / prev.scale;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * sf,
        y: cy - (cy - prev.y) * sf,
      };
    });
  }, [workArea]);

  const handleResetView = useCallback(() => {
    // Re-center; Canvas also does this on mount, so we replicate the logic
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewTransform({
      x: (vw - workArea.width) / 2,
      y: (vh - workArea.height) / 2,
      scale: 1,
    });
  }, [workArea]);

  // Placeholders — wired up in later phases
  const handleFillGrid = () => {};
  const handleExport = () => {};

  return (
    <div className={styles.app}>
      <Canvas
        viewTransform={viewTransform}
        setViewTransform={setViewTransform}
        activeTool={activeTool}
        bgColor={bgColor}
        workArea={workArea}
      />
      <FloatingPanel
        activeTool={activeTool}
        onToolChange={setActiveTool}
        bgColor={bgColor}
        onBgColorChange={setBgColor}
        viewTransform={viewTransform}
        onZoom={handleZoom}
        onResetView={handleResetView}
        onFillGrid={handleFillGrid}
        onExport={handleExport}
        canFill={false}
        canExport={false}
      />
    </div>
  );
}

export default App;