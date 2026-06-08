# Updates / improvement backlog

Running list of things to look at. Not a roadmap — just a place to capture
ideas so they don't get lost.

## Performance

### Throttle continuous colour-animation recompute
`AnimationLayer`'s rAF loop recomputes and writes every slot's fill colour on
every single frame for `noise`, `gradientSweep`, and `paletteWave` (see
`src/components/AnimationLayer.jsx`). On a large grid that's hundreds of
`style.fill` writes per frame, 60 times a second, indefinitely while the
animation is enabled — a real cost for a desktop app that may be expected to
sit in the background for long stretches.

Ideas:
- Gate the colour-recompute step to ~30fps (skip every other frame) when the
  window doesn't have focus, or always — most of these effects don't need a
  full 60fps to read smoothly
- Move the per-slot colour computation to a Web Worker / OffscreenCanvas and
  post back a batch of colours, so the main thread only does the DOM writes
- Consider whether `flicker`'s `Math.random()` block selection could reuse
  the seeded `mulberry32` PRNG already used elsewhere, for reproducibility

### `<image href="data:...">` vs inline SVG rendering
Most blocks render as `<image href="data:image/svg+xml;...">` (a rasterised
data-URI), while continuously-animated blocks render as inline `<svg
dangerouslySetInnerHTML>` so their fills can be mutated directly (see
`AnimatedShapeImage` in `src/components/PlacedBlocks.jsx`). Switching *all*
blocks to the inline-SVG path would remove the data-URI encode/decode step
entirely and let recolouring become plain `style.fill` writes everywhere —
but it changes the rendering pipeline for every block on screen, including
non-animated ones, and needs profiling before committing to it: more inline
DOM nodes could cost more than the data-URI encode it saves on a large grid.
Worth a profiled spike before deciding either way.

## Done

- ~~Removed the canvas background drop-shadow filter~~ (pure cosmetic cost,
  no longer rendered)
- ~~Decoupled `GridBlock` from the view `scale` prop~~ — selection outline now
  uses `vector-effect="non-scaling-stroke"`, lock badge now sized relative to
  `cellSize`; `memo()` no longer re-renders every visible block on every
  zoom/pan tick
- ~~Rewrote `colorizeSvg` to use a per-asset cached string-template~~ instead
  of parsing/mutating/serialising the SVG DOM on every call — colour
  application is now pure string substitution after the first hit per asset
- ~~Precomputed block bounding boxes for viewport culling~~ so the per-frame
  visibility filter in `PlacedBlocks` is pure numeric comparison instead of
  re-deriving geometry for every block on every pan/zoom frame
