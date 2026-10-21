import { simplex2 } from './noise';
import { blendHexToward } from './audioAnalysis';

// Colour animations as pure functions of time, drawn by the canvas renderer
// (components/ShapeCanvas.jsx). Moved out of AnimationLayer, which used to
// write these colours into thousands of SVG elements every frame.
//
// makeAnimFrame returns, for the given phase:
//   { kind: 'position', colourAt(x, y) }   — colour by artboard position
//                                             (noise, gradientSweep, paletteWave, stripScan)
//   { kind: 'block', colourOf: Map }       — one colour per block id (pixelSort)
//   { kind: 'flicker' }                    — handled by the renderer, which keeps
//                                             the flicker state between frames
//   null                                   — nothing to recolour (filter types)

// Map a 0–1 value to a palette colour by dividing the range into equal bands.
export function palettePick(pal, t) {
  return pal[Math.min(Math.floor(t * pal.length), pal.length - 1)];
}

export const POSITION_TYPES = new Set(['noise', 'gradientSweep', 'paletteWave', 'stripScan']);
export const FILTER_TYPES = new Set(['hueDrift', 'warp']);

export function makeAnimFrame(s, phase, pal, { cellSize, workArea, canvasBg, blocks }) {
  const w = workArea?.width ?? 800;
  const h = workArea?.height ?? 600;
  const cx = w / 2, cy = h / 2;

  switch (s.type) {
    case 'noise': {
      const scale = s.noise?.scale ?? 0.18;
      const octaves = Math.max(1, Math.min(4, s.noise?.octaves ?? 3));
      return {
        kind: 'position',
        colourAt: (x, y) => {
          const bx = x / cellSize, by = y / cellSize;
          let v = 0, amp = 1, freq = 1, maxAmp = 0;
          for (let o = 0; o < octaves; o++) {
            v += simplex2(bx * scale * freq + phase * 0.4, by * scale * freq) * amp;
            maxAmp += amp; amp *= 0.5; freq *= 2;
          }
          return palettePick(pal, (v / maxAmp + 1) / 2);
        },
      };
    }

    case 'gradientSweep': {
      const angle = phase * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const maxProj = Math.sqrt(cx * cx + cy * cy);
      return {
        kind: 'position',
        colourAt: (x, y) => {
          const proj = (x - cx) * cos + (y - cy) * sin;
          return palettePick(pal, Math.max(0, Math.min((proj + maxProj) / (2 * maxProj), 1)));
        },
      };
    }

    case 'paletteWave': {
      const wl = s.paletteWave?.wavelength ?? 4;
      return {
        kind: 'position',
        colourAt: (x, y) => {
          const t = (x / cellSize + y / cellSize) / wl + phase;
          return palettePick(pal, t - Math.floor(t));
        },
      };
    }

    case 'stripScan': {
      const ss = s.stripScan ?? {};
      const axis = ss.sweepAxis ?? 'h';
      const beamPx = Math.max(1, ss.beamWidth ?? 4) * cellSize;
      const dim = Math.min(1, Math.max(0, ss.dimStrength ?? 0.7));
      const bg = canvasBg || '#000000';
      const axisLen = axis === 'h' ? w : h;
      let centre;
      if ((ss.motionMode ?? 'pingpong') === 'scroll') {
        centre = ((phase * cellSize * 2) % (axisLen + beamPx)) - beamPx / 2;
      } else {
        // Ping-pong: a triangle wave bouncing the beam between the edges.
        const t = (phase * 0.5) % 2;
        centre = (t <= 1 ? t : 2 - t) * axisLen;
      }
      return {
        kind: 'position',
        colourAt: (x, y) => {
          const pos = axis === 'h' ? x : y;
          const t = axis === 'h' ? y / h : x / w;
          const base = palettePick(pal, Math.max(0, Math.min(t, 1)));
          return Math.abs(pos - centre) <= beamPx / 2 ? base : blendHexToward(base, bg, dim);
        },
      };
    }

    case 'pixelSort': {
      const ps = s.pixelSort ?? {};
      const sortAxis = ps.sortAxis ?? 'row';
      const sortBy = ps.sortBy ?? 'brightness';
      const sortDirection = ps.sortDirection ?? 'ascending';
      const sortWidth = Math.max(1, ps.sortWidth ?? 8);
      const noiseOffset = sortBy === 'hue' ? 100 : sortBy === 'saturation' ? 200 : 0;

      // Group blocks into lines (rows, columns or diagonals) and give each a
      // stable "pixel" value from a noise field for the sort to reorder.
      const lines = new Map();
      for (const b of blocks) {
        const col = b.gridCol, row = b.gridRow;
        let key, pos;
        if (sortAxis === 'column') { key = col; pos = row; }
        else if (sortAxis === 'diagonal') { key = col - row; pos = col; }
        else { key = row; pos = col; }
        const value = (simplex2((col + noiseOffset) * 0.3, (row + noiseOffset) * 0.3) + 1) / 2;
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push({ id: b.id, pos, value });
      }
      const flip = sortDirection === 'oscillate' && Math.floor(phase) % 2 === 1;
      const descending = sortDirection === 'descending' || flip;
      const colourOf = new Map();
      for (const line of lines.values()) {
        line.sort((a, b) => a.pos - b.pos);
        const len = line.length;
        if (len < 2) { for (const it of line) colourOf.set(it.id, palettePick(pal, it.value)); continue; }
        const winLen = Math.min(sortWidth, len);
        const shift = Math.floor(phase * 4) % len;
        const inWindow = new Set();
        for (let i = 0; i < winLen; i++) inWindow.add((shift + i) % len);
        const sorted = [...inWindow].map(i => line[i].value).sort((a, b) => (descending ? b - a : a - b));
        let vi = 0;
        line.forEach((it, i) => colourOf.set(it.id, palettePick(pal, inWindow.has(i) ? sorted[vi++] : it.value)));
      }
      return { kind: 'block', colourOf };
    }

    case 'flicker':
      return { kind: 'flicker' };

    default:
      return null;
  }
}
