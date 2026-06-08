import { useRef, useEffect } from 'react';
import { simplex2 } from '../utils/noise';
import { getShapeCache, buildUrlMulti } from '../utils/shapeLibraryRender';

// ── Colour helpers ─────────────────────────────────────────────────────────────

// Map a 0–1 value to a palette colour by dividing the range into equal bands.
// Only exact palette colours are returned — no interpolation between them.
function palettePick(pal, t) {
  return pal[Math.min(Math.floor(t * pal.length), pal.length - 1)];
}

// Continuous animations repaint every cell every frame, so the colour of every
// slot is recomputed regardless — these are rendered inline (see PlacedBlocks'
// AnimatedShapeImage) so colour changes are plain `element.style.fill` writes
// rather than data-URI rebuild + <image> redecode. `flicker` only repaints a
// random fraction of cells per tick and must preserve the real static colour
// at rest, so it stays on the <image>/href-swap path via imageRefsMap.
const INLINE_ANIM_TYPES = new Set(['noise', 'gradientSweep', 'paletteWave']);

// ── Letterbox helper ───────────────────────────────────────────────────────────
// Replicates the preserveAspectRatio="xMidYMid meet" geometry from renderImageFrame
// so slot viewbox coords map to the correct canvas position.
function letterboxTransform(entry, cell) {
  const [vbX, vbY, vbW, vbH] = entry.vb;
  const { cellX, cellY, cellW, cellH } = cell;
  const blockScale = Math.min(cellW / vbW, cellH / vbH);
  const baseX      = cellX + (cellW - vbW * blockScale) / 2 - vbX * blockScale;
  const baseY      = cellY + (cellH - vbH * blockScale) / 2 - vbY * blockScale;
  return { blockScale, baseX, baseY };
}

// ── Exported constants ─────────────────────────────────────────────────────────

export const ANIM_DEFAULTS = {
  enabled:       false,
  type:          'noise',
  speed:         0.5,
  noise:         { scale: 0.18, octaves: 3 },
  gradientSweep: {},
  paletteWave:   { wavelength: 4 },
  hueDrift:      { range: 120, intensity: 0.65 },
  warp:          { scale: 18, frequency: 0.006 },
  flicker:       { density: 0.07 },
};

export const ANIM_FILTER_ID = {
  hueDrift: 'gb-anim-hue-filter',
  warp:     'gb-anim-warp-filter',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function AnimationLayer({
  animSettings,
  gridCells,
  palette,
  workArea,
  gridComputed,
  shapeLibrary,
  imageRefsMap,
  slotRefsMap,
}) {
  const { enabled, type } = animSettings;
  const shapeLib = shapeLibrary?.shapes;

  const settingsRef = useRef(animSettings);
  const paletteRef  = useRef(palette);
  const cellsRef    = useRef(gridCells);
  const gridRef     = useRef(gridComputed);
  const waRef       = useRef(workArea);
  settingsRef.current = animSettings;
  paletteRef.current  = palette;
  cellsRef.current    = gridCells;
  gridRef.current     = gridComputed;
  waRef.current       = workArea;

  const hueMatrixRef = useRef(null);
  const warpTurbRef  = useRef(null);

  // Per-cell letterbox geometry (blockScale/baseX/baseY) only changes when the
  // grid layout changes, not every frame — cache it keyed by cell id and
  // invalidate by comparing against the gridCells array reference (a fresh
  // array is only produced by buildGridCells' useMemo when blocks/grid change).
  const geomCacheRef = useRef(new Map());
  const geomCellsRef = useRef(null);

  useEffect(() => {
    if (!animSettings.enabled) return;

    const isFilterType = animSettings.type === 'hueDrift' || animSettings.type === 'warp';

    let rafId;
    let startTime     = null;
    let lastFlicker   = -1;
    let prevFlickered = [];

    const tick = (ts) => {
      if (!startTime) startTime = ts;
      const elapsed = (ts - startTime) * 0.001;
      const s     = settingsRef.current;
      const pal   = paletteRef.current;
      const cells = cellsRef.current;
      const grid  = gridRef.current;
      const wa    = waRef.current;
      const phase = elapsed * (s.speed * 2);

      if (!pal?.length || !shapeLib) { rafId = requestAnimationFrame(tick); return; }

      // ── Filter-based ──────────────────────────────────────────────────────────
      if (isFilterType) {
        if (s.type === 'hueDrift' && hueMatrixRef.current) {
          const deg = (phase * (s.hueDrift?.range ?? 120)) % 360;
          hueMatrixRef.current.setAttribute('values', deg.toFixed(1));
        } else if (s.type === 'warp' && warpTurbRef.current) {
          warpTurbRef.current.setAttribute('seed', Math.floor(phase * 6) % 1024);
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      // ── Colour-replacement ────────────────────────────────────────────────────
      const isInlineType = INLINE_ANIM_TYPES.has(s.type);
      if (!cells?.length || (isInlineType ? !slotRefsMap : !imageRefsMap)) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const cellSize = grid?.cellSize ?? 80;
      const wa_w    = wa?.width  ?? 800;
      const wa_h    = wa?.height ?? 600;
      const cx      = wa_w / 2;
      const cy      = wa_h / 2;
      const refs     = imageRefsMap?.current;
      const slotRefs = slotRefsMap?.current;

      if (geomCellsRef.current !== cells) {
        geomCacheRef.current = new Map();
        geomCellsRef.current = cells;
      }
      const geomCache = geomCacheRef.current;
      const getCellGeometry = (cell, entry) => {
        let geom = geomCache.get(cell.id);
        if (!geom) {
          geom = letterboxTransform(entry, cell);
          geomCache.set(cell.id, geom);
        }
        return geom;
      };

      // Shared: compute a colour for a canvas-space position using the active algorithm
      const colourAt = (() => {
        switch (s.type) {

          case 'noise': {
            const scale   = s.noise?.scale   ?? 0.18;
            const octaves = Math.max(1, Math.min(4, s.noise?.octaves ?? 3));
            return (canvasX, canvasY) => {
              const bx = canvasX / cellSize;
              const by = canvasY / cellSize;
              let v = 0, amp = 1, freq = 1, maxAmp = 0;
              for (let o = 0; o < octaves; o++) {
                v      += simplex2(bx * scale * freq + phase * 0.4, by * scale * freq) * amp;
                maxAmp += amp; amp *= 0.5; freq *= 2;
              }
              const t = (v / maxAmp + 1) / 2;
              return palettePick(pal, t);
            };
          }

          case 'gradientSweep': {
            const angle   = phase * Math.PI * 2;
            const cos_a   = Math.cos(angle);
            const sin_a   = Math.sin(angle);
            const maxProj = Math.sqrt(cx * cx + cy * cy);
            return (canvasX, canvasY) => {
              const proj = (canvasX - cx) * cos_a + (canvasY - cy) * sin_a;
              const t    = Math.max(0, Math.min((proj + maxProj) / (2 * maxProj), 1));
              return palettePick(pal, t);
            };
          }

          case 'paletteWave': {
            const wl = s.paletteWave?.wavelength ?? 4;
            return (canvasX, canvasY) => {
              const t    = (canvasX / cellSize + canvasY / cellSize) / wl + phase;
              const frac = t - Math.floor(t);
              return palettePick(pal, frac);
            };
          }

          default:
            return null;
        }
      })();

      if (!colourAt && s.type !== 'flicker') { rafId = requestAnimationFrame(tick); return; }

      // ── Per-block loop ────────────────────────────────────────────────────────
      if (s.type === 'flicker') {
        const density = s.flicker?.density ?? 0.07;
        if (elapsed - lastFlicker >= 1 / 8) {
          lastFlicker = elapsed;

          // Restore previous flickered blocks
          for (const id of prevFlickered) {
            const el   = refs[id];
            const orig = el?.getAttribute('data-original-href');
            if (el && orig) el.setAttribute('href', orig);
          }
          prevFlickered = [];

          const count  = Math.max(1, Math.ceil(cells.length * density));
          const picked = new Set();
          while (picked.size < Math.min(count, cells.length)) {
            picked.add(Math.floor(Math.random() * cells.length));
          }
          for (const ci of picked) {
            const cell  = cells[ci];
            const entry = shapeLib[cell.libKey];
            if (!entry) continue;
            const { parts, slotCenters } = getShapeCache(entry, cell.libKey);
            const { blockScale, baseX, baseY } = getCellGeometry(cell, entry);
            // Pick one random palette colour for the block but vary per slot
            const baseColour = pal[Math.floor(Math.random() * pal.length)];
            const colours = slotCenters.map((_, i) => {
              // Shift through palette by slot index so slots stay distinct
              const idx = (pal.indexOf(baseColour) + i) % pal.length;
              return pal[idx];
            });
            const el = refs[cell.id];
            if (el) {
              el.setAttribute('href', buildUrlMulti(parts, colours));
              prevFlickered.push(cell.id);
            }
          }
        }
      } else {
        // Continuous animations — every cell repaints every frame, so they're
        // rendered inline (AnimatedShapeImage) and recoloured by writing
        // straight to each slot element's style.fill: no string rebuild, no
        // <image> href reassignment/redecode — just a cheap DOM property write.
        for (const cell of cells) {
          const entry = shapeLib[cell.libKey];
          if (!entry) continue;
          const { slotCenters } = getShapeCache(entry, cell.libKey);
          const { blockScale, baseX, baseY } = getCellGeometry(cell, entry);
          const slotEls = slotRefs[cell.id];
          if (!slotEls) continue;

          slotCenters.forEach(([scx, scy], i) => {
            const el = slotEls[i];
            if (!el) return;
            const canvasX = baseX + scx * blockScale;
            const canvasY = baseY + scy * blockScale;
            el.style.fill = colourAt(canvasX, canvasY);
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    // Halt the rAF loop while the window is minimized/backgrounded — a
    // desktop app can sit hidden for hours, and there's no point burning
    // CPU/GPU/battery animating something nobody can see. Resuming resets
    // startTime so `phase` continues smoothly from 0 rather than jumping
    // forward by however long the window was hidden.
    const start = () => {
      startTime = null;
      rafId = requestAnimationFrame(tick);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else start();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    start();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(rafId);
      if (imageRefsMap) {
        for (const el of Object.values(imageRefsMap.current)) {
          const orig = el?.getAttribute?.('data-original-href');
          if (orig) el.setAttribute('href', orig);
        }
      }
    };
  }, [animSettings.enabled, animSettings.type, imageRefsMap, slotRefsMap, shapeLib]);

  if (!enabled) return null;
  if (type !== 'hueDrift' && type !== 'warp') return null;

  return (
    <>
      {type === 'hueDrift' && (
        <defs>
          <filter
            id="gb-anim-hue-filter"
            x="0" y="0" width="100%" height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix ref={hueMatrixRef} type="hueRotate" values="0" />
          </filter>
        </defs>
      )}
      {type === 'warp' && (
        <defs>
          <filter id="gb-anim-warp-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              ref={warpTurbRef}
              type="fractalNoise"
              baseFrequency={animSettings.warp?.frequency ?? 0.006}
              numOctaves="2"
              seed="0"
              result="turbulence"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale={animSettings.warp?.scale ?? 18}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      )}
    </>
  );
}
