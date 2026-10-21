import {
  GlitchSettings, StripSettings, MultiStripSettings, EdgeSettings, BrightnessSettings, NoiseSettings,
  GeometricSettings, HalftoneSettings, VoronoiSettings, SpiralSettings, FlowFieldSettings, FractalSettings,
  MondrianSettings, GoldenSettings,
} from '../../panels/fillSettings';

// Every Grid Pattern fill, in Generate-panel order. `settingsKey` is the
// document field holding its settings; the editor maps each id to the
// handler that runs it (DocumentEditor → fillActions).
//   image: 'required' — needs an image loaded in Image colour mode
//          'suggested' — works without one, but is designed around it
export const FILLS = [
  { id: 'standard',   label: 'Standard',     group: 'Fills' },
  { id: 'glitch',     label: 'Glitch',       group: 'Fills', settingsKey: 'glitchSettings',     Settings: GlitchSettings,     image: 'suggested' },
  { id: 'strip',      label: 'Strip',        group: 'Fills', settingsKey: 'stripSettings',      Settings: StripSettings,      image: 'suggested' },
  { id: 'multiStrip', label: 'Multi-Strip',  group: 'Fills', settingsKey: 'multiStripSettings', Settings: MultiStripSettings, image: 'suggested' },
  { id: 'edge',       label: 'Edge Trace',   group: 'Fills', settingsKey: 'edgeSettings',       Settings: EdgeSettings,       image: 'required' },
  { id: 'brightness', label: 'Brightness',   group: 'Fills', settingsKey: 'brightnessSettings', Settings: BrightnessSettings, image: 'required' },
  { id: 'noise',      label: 'Noise Field',  group: 'Fills', settingsKey: 'noiseSettings',      Settings: NoiseSettings },
  { id: 'geometric',  label: 'Geometric',    group: 'Fills', settingsKey: 'geometricSettings',  Settings: GeometricSettings },

  { id: 'halftone',   label: 'Halftone',     group: 'Experimental', settingsKey: 'halftoneSettings',  Settings: HalftoneSettings },
  { id: 'voronoi',    label: 'Voronoi',      group: 'Experimental', settingsKey: 'voronoiSettings',   Settings: VoronoiSettings },
  { id: 'spiral',     label: 'Spiral',       group: 'Experimental', settingsKey: 'spiralSettings',    Settings: SpiralSettings },
  { id: 'flowField',  label: 'Flow Field',   group: 'Experimental', settingsKey: 'flowFieldSettings', Settings: FlowFieldSettings },
  { id: 'fractal',    label: 'Fractal',      group: 'Experimental', settingsKey: 'fractalSettings',   Settings: FractalSettings },
  { id: 'mondrian',   label: 'Mondrian',     group: 'Experimental', settingsKey: 'mondrianSettings',  Settings: MondrianSettings },
  { id: 'golden',     label: 'Golden Ratio', group: 'Experimental', settingsKey: 'goldenSettings',    Settings: GoldenSettings },
];

export const FILLS_BY_ID = Object.fromEntries(FILLS.map(f => [f.id, f]));
