import { PALETTES, PALETTE_KEYS } from '../utils/colorize';
import { DEFAULT_ENABLED_IDS } from '../builtinAssets';
import { ANIM_DEFAULTS } from '../components/AnimationLayer';
import { createDefaultEffects } from '../effects/effectDefs';

// Every piece of per-document state the editor reads via useDocField().
// Anything not listed here is either app-level (tools, swatch libraries,
// recent files) or transient editor state (pixel buffers, selection,
// render caches) that's rebuilt when a document's tab is mounted.

const randomSeed = () => Math.floor(Math.random() * 0x80000000);

export const MODES = {
  gridBuilder: { label: 'Grid Pattern', shortLabel: 'Grid' },
  knotwork:    { label: 'Meander',      shortLabel: 'Meander' },
};

// Built fresh per document so every new document gets its own random seeds.
export function createDefaultDocState() {
  return {
    // View — saved with the document but never marks it dirty.
    viewTransform: null,

    // Artboard & grid
    presetKey: 'a4-portrait',
    customSize: { width: 800, height: 600 },
    gridSettings: { cols: 8, borderPct: 5 },
    maxScale: 1,
    scaleFreq: 0,
    autoFill: false,
    // Fills give each new shape a random opacity between min and max.
    fillOpacity: { random: false, min: 0.4, max: 1 },
    // Ruler guides, in artboard px: v = vertical lines (x), h = horizontal (y).
    guides: { v: [], h: [] },
    bgColor: '#2d2d2d',
    canvasBg: '#ffffff',

    // Colour
    colorMode: 'none',
    paletteKey: PALETTE_KEYS[0],
    shapeColors: PALETTES[PALETTE_KEYS[0]].map((hex, i) => ({ id: `p-${i}`, hex, enabled: true, source: 'palette' })),
    bgColors: [
      { id: 'bg-white', hex: '#ffffff', enabled: true  },
      { id: 'bg-black', hex: '#000000', enabled: false },
    ],
    uniformReverse: false,
    randomReverseEnabled: false,
    randomReversePct: 50,
    colorTempShift: 0,
    blendMode: 'normal',
    gradientSettings: {
      angle: 45, gradMode: 'linear', centerX: 0.5, centerY: 0.5, gradScale: 1,
      reverseBg: false, gradBgColors: [{ id: 'grad-bg-1', hex: '#ffffff', enabled: true }],
      jitter: 0, repeat: 1, repeatMode: 'tile',
    },
    meshSettings: {
      points: [
        { id: 'mesh-1', x: 0.15, y: 0.15, hex: '#ff5e5e' },
        { id: 'mesh-2', x: 0.85, y: 0.25, hex: '#5ee0ff' },
        { id: 'mesh-3', x: 0.5,  y: 0.9,  hex: '#ffe35e' },
      ],
      weightPower: 2,
    },
    imageSrc: null,
    imageColourTolerance: 0,
    paletteExtractSettings: { numColours: 6, extractFrom: 'image' },

    // Fills — `activeFill` is the fill the Generate panel's Fill button runs.
    activeFill: 'standard',
    glitchSettings: {
      hBars: 12, vBars: 0, force: 0.35, activeRatio: 0.4, barSizeVariance: 0.5,
      direction: 'h', bidirectional: true, seed: randomSeed(), minDisplacement: 1,
      maxScale: 1, scaleFreq: 0,
    },
    stripSettings: { axis: 'h', angle: 0, position: 0.5, width: 4, feather: 0, seed: randomSeed() },
    multiStripSettings: {
      axis: 'angle', angle: 45, numStrips: 4, stripWidth: 3, spacing: 'even',
      positions: [], stagger: false, feather: 0, seed: randomSeed(),
    },
    edgeSettings: { edgeThreshold: 0.2, traceWidth: 1, minEdgeLength: 1, direction: 'all' },
    brightnessSettings: {
      targetZone: 'lights', lowPoint: 0.33, highPoint: 0.66, invert: false, softEdge: 0, seed: randomSeed(),
    },
    noiseSettings: { scale: 0.2, threshold: 0.5, octaves: 1, invert: false, seed: randomSeed() },
    organicSettings: {
      algorithm: 'reaction', preset: 'maze', feature: 2, iterations: 2500, threshold: 0.5,
      rule: 'cave', density: 0.45, generations: 8, wrap: false,
      symmetry: 'off', invert: false, seed: randomSeed(),
    },
    silhouetteSettings: {
      src: null, fit: 'contain', padding: 0.05, threshold: 0.5, source: 'auto',
      scale: 1, offsetX: 0, offsetY: 0, invert: false,
    },
    geometricSettings: {
      patternType: 'stripes', phase: 0,
      angle: 45, stripeWidth: 2, gapWidth: 2,
      centerX: 0.5, centerY: 0.5, ringWidth: 2, gap: 2, innerRadius: 0,
      tileSize: 2, offsetX: 0, offsetY: 0,
      numSpokes: 8, spokeWidth: 15,
      dotRadius: 1, spacingX: 3, spacingY: 3,
      cellRadius: 2, rowOffset: 0.5,
    },
    halftoneSettings: { dotSpacing: 4, maxRadius: 2, angle: 45, centerX: 0.5, centerY: 0.5, invert: false },
    voronoiSettings: { numPoints: 12, fillRatio: 0.5, borderOnly: false, borderWidth: 1, seed: randomSeed() },
    spiralSettings: { arms: 1, width: 2, tightness: 0.15, centerX: 0.5, centerY: 0.5, direction: 1 },
    flowFieldSettings: { scale: 0.08, numLines: 30, lineLength: 40, lineWidth: 1, seed: randomSeed() },
    fractalSettings: { patternType: 'sierpinski', depth: 3, invert: false },
    mondrianSettings: { minSize: 2, splitVariance: 0.3, seed: randomSeed() },
    goldenSettings: { minSize: 2, maxDepth: 6, alternate: true, seed: randomSeed() },
    activeLayoutId: null,

    // Meander — see knotworkCompose.js for what each field drives.
    knotworkSettings: {
      density: 1, straightBias: 15, wallDensity: 0,
      symmetryMode: 'none', kaleidoscopeFold: 4,
      strandWidthRatio: 0.86,
      showTerminalDots: false,
      // Corner radii (fractions of the cell; see meanderCornerSettings).
      capRoundness: 1, innerRadius: 0.07, outerRadius: 0.93, bendLinked: true,
      seed: randomSeed(), colorSeed: 0,
      seedWord: '',
      inkMode: 'palette',
      widthJitter: 0, tension: 0,
      letterLayout: 'scatter',
      letterArrangementSeed: randomSeed(),
      letterRandomSize: true, letterRandomPlacement: true, letterAlign: 'center',
      weaveAsLetters: false, letterSize: 0.7,
      letterColour: null, letterColourExclusive: false,
    },
    showTilePreview: false,

    // Assets & content
    enabledAssetIds: new Set(DEFAULT_ENABLED_IDS),
    placedBlocks: [],
    // Names of manual groups (Object › Group), by group id — see utils/groups.js.
    groupNames: {},

    // Image layers
    backdropSrc: null,
    backdropSettings: { mode: 'reference', opacity: 0.5, fit: 'contain', tintColour: '#000000', tintOpacity: 0 },

    // Raster effects (Effects panel) — see effects/effectDefs.js.
    effects: createDefaultEffects(),

    // Animation & audio
    animSettings: ANIM_DEFAULTS,
    audioSettings: { enabled: false, inputSource: 'mic', ampMapping: 'linear', beatSensitivity: 0.5 },
  };
}

// Fields that change how the document looks without being part of its
// content — updating them never marks the document as having unsaved changes.
export const NON_DIRTY_FIELDS = new Set(['viewTransform', 'showTilePreview', 'activeFill']);
