import { FILL_SCHEMAS } from './schema';

// Every Grid Pattern fill, in Generate-panel order. `settingsKey` is the
// document field holding its settings, and `schema` describes them
// (schema.js); the editor maps each id to the handler that runs it
// (DocumentEditor → fillActions).
//   image: 'required' — needs an image loaded in Image colour mode
//          'suggested' — works without one, but is designed around it
export const FILLS = [
  { id: 'standard',   label: 'Standard',     group: 'Fills' },
  { id: 'glitch',     label: 'Glitch',       group: 'Fills', settingsKey: 'glitchSettings',     image: 'suggested' },
  { id: 'strip',      label: 'Strip',        group: 'Fills', settingsKey: 'stripSettings',      image: 'suggested' },
  { id: 'multiStrip', label: 'Multi-Strip',  group: 'Fills', settingsKey: 'multiStripSettings', image: 'suggested' },
  { id: 'edge',       label: 'Edge Trace',   group: 'Fills', settingsKey: 'edgeSettings',       image: 'required' },
  { id: 'brightness', label: 'Brightness',   group: 'Fills', settingsKey: 'brightnessSettings', image: 'required' },
  { id: 'noise',      label: 'Noise Field',  group: 'Fills', settingsKey: 'noiseSettings' },
  { id: 'geometric',  label: 'Geometric',    group: 'Fills', settingsKey: 'geometricSettings' },
  { id: 'organic',    label: 'Organic',      group: 'Fills', settingsKey: 'organicSettings' },
  // Needs a file loaded first, so Surprise Me skips it.
  { id: 'silhouette', label: 'Silhouette',   group: 'Fills', settingsKey: 'silhouetteSettings', surprise: false },

  { id: 'halftone',   label: 'Halftone',     group: 'Experimental', settingsKey: 'halftoneSettings' },
  { id: 'voronoi',    label: 'Voronoi',      group: 'Experimental', settingsKey: 'voronoiSettings' },
  { id: 'spiral',     label: 'Spiral',       group: 'Experimental', settingsKey: 'spiralSettings' },
  { id: 'flowField',  label: 'Flow Field',   group: 'Experimental', settingsKey: 'flowFieldSettings' },
  { id: 'fractal',    label: 'Fractal',      group: 'Experimental', settingsKey: 'fractalSettings' },
  { id: 'mondrian',   label: 'Mondrian',     group: 'Experimental', settingsKey: 'mondrianSettings' },
  { id: 'golden',     label: 'Golden Ratio', group: 'Experimental', settingsKey: 'goldenSettings' },
];

for (const f of FILLS) if (FILL_SCHEMAS[f.id]) f.schema = FILL_SCHEMAS[f.id];

export const FILLS_BY_ID = Object.fromEntries(FILLS.map(f => [f.id, f]));
