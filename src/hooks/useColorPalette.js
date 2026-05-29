import { useState, useMemo, useCallback, useEffect } from 'react';
import { PALETTE_KEYS, PALETTES } from '../utils/colorize';

export function useColorPalette() {
  const [colorMode, setColorMode] = useState('none');
  const [paletteKey, setPaletteKey] = useState(PALETTE_KEYS[0]);
  const [shapeColors, setShapeColors] = useState(
    () => PALETTES[PALETTE_KEYS[0]].map((hex, i) => ({ id: `p-${i}`, hex, enabled: true, source: 'palette' }))
  );
  const [bgColors, setBgColors] = useState([
    { id: 'bg-white', hex: '#ffffff', enabled: true  },
    { id: 'bg-black', hex: '#000000', enabled: false },
  ]);
  const [customPalettes, setCustomPalettes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gb-custom-palettes') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('gb-custom-palettes', JSON.stringify(customPalettes));
  }, [customPalettes]);

  const handlePaletteKeyChange = useCallback((key) => {
    setPaletteKey(key);
    setShapeColors(prev => {
      const custom  = prev.filter(c => c.source === 'custom');
      const palette = (PALETTES[key] ?? []).map((hex, i) => ({
        id: `p-${key}-${i}`, hex, enabled: true, source: 'palette',
      }));
      return [...palette, ...custom];
    });
  }, []);

  const handleSaveCustomPalette = useCallback((name) => {
    if (!name.trim()) return;
    const colors = shapeColors.filter(c => c.enabled).map(c => c.hex);
    if (!colors.length) return;
    setCustomPalettes(prev => [
      ...prev.filter(p => p.name !== name.trim()),
      { name: name.trim(), colors },
    ]);
  }, [shapeColors]);

  const handleDeleteCustomPalette = useCallback((name) => {
    setCustomPalettes(prev => prev.filter(p => p.name !== name));
  }, []);

  const handleApplyCustomPalette = useCallback((palette) => {
    setShapeColors(palette.colors.map((hex, i) => ({
      id: `cp-${palette.name}-${i}`, hex, enabled: true, source: 'palette',
    })));
  }, []);

  const effectivePalette = useMemo(() => {
    const active = shapeColors.filter(c => c.enabled).map(c => c.hex);
    return active.length ? active : shapeColors.map(c => c.hex);
  }, [shapeColors]);

  const activeBgColors = useMemo(
    () => bgColors.filter(c => c.enabled).map(c => c.hex),
    [bgColors]
  );

  return {
    colorMode, setColorMode,
    paletteKey, setPaletteKey, handlePaletteKeyChange,
    shapeColors, setShapeColors,
    bgColors, setBgColors,
    effectivePalette,
    activeBgColors,
    customPalettes,
    handleSaveCustomPalette,
    handleDeleteCustomPalette,
    handleApplyCustomPalette,
  };
}
