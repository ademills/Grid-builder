// Colour animations are drawn by ShapeCanvas (frame colours come from
// utils/animationFrame.js). This component only supplies the SVG filter the
// Warp animation applies to the shapes canvas; ShapeCanvas animates its
// turbulence seed. Hue Drift is a plain CSS hue-rotate on the canvas.

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
  pixelSort:     { sortAxis: 'row', sortBy: 'brightness', sortDirection: 'ascending', sortWidth: 8 },
  stripScan:     { sweepAxis: 'h', beamWidth: 4, motionMode: 'pingpong', dimStrength: 0.7 },
};

export function AnimationLayer({ animSettings }) {
  if (!animSettings.enabled || animSettings.type !== 'warp') return null;
  return (
    <defs>
      <filter id="gb-anim-warp-filter" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence
          id="gb-anim-warp-turbulence"
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
  );
}
