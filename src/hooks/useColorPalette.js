import { useMemo, useCallback } from 'react';
import { PALETTES } from '../utils/colorize';
import { useDocField } from '../store/useDocField';

// The document's colour state: mode, swatches (shape colours) and block
// backgrounds, plus the palettes the colour modes draw from. Saved swatch
// libraries live in store/libraryStore.js and are managed by the Swatches
// panel.
export function useColorPalette() {
  const [colorMode, setColorMode] = useDocField('colorMode');
  const [paletteKey, setPaletteKey] = useDocField('paletteKey');
  const [shapeColors, setShapeColors] = useDocField('shapeColors');
  const [bgColors, setBgColors] = useDocField('bgColors');

  // Swap in a built-in palette, keeping swatches the user added themselves.
  const handlePaletteKeyChange = useCallback((key) => {
    setPaletteKey(key);
    setShapeColors(prev => {
      const custom  = prev.filter(c => c.source === 'custom');
      const palette = (PALETTES[key] ?? []).map((hex, i) => ({
        id: `p-${key}-${i}`, hex, enabled: true, source: 'palette',
      }));
      return [...palette, ...custom];
    });
  }, [setPaletteKey, setShapeColors]);

  // Swatches flagged "not in palette" are kept for pins but skipped here.
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
  };
}
