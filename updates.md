# Updates / improvement backlog

Running list of things to look at. Not a roadmap — just a place to capture
ideas so they don't get lost.

## Performance

### Animation frame rate on very large grids
Colour animations redraw every shape each frame. On an 80-column A4 grid
(~9,400 shapes) the canvas renderer reaches about 25 fps; smaller grids run
at the display rate. If very large animated grids matter, options are:
- Cap the animation at 30 fps (most effects read smoothly there)
- Render the animated frame at a lower resolution while zoomed out
- Use the seeded `mulberry32` PRNG for `flicker` instead of `Math.random()`,
  so a recorded animation is reproducible (also needed for animated export)

## Done

- ~~Canvas renderer~~ — shapes are drawn with the 2D canvas API
  (`components/ShapeCanvas.jsx`) instead of one SVG `<image>` (or inline SVG,
  while animating) per shape. Each shape is parsed once into `Path2D`s
  (`utils/shapeModel.js`) and fills are batched by layer and colour. This
  replaced the data-URI vs inline-SVG question and the animation DOM writes.
  Export still builds SVG, so exported files are unchanged.
- ~~PNG/JPEG export in Rust~~ (`src-tauri/src/raster.rs`, resvg) — no 16,384 px
  canvas cap (PNG up to 32,768 px a side, rendered in strips), off the UI
  thread. The browser build keeps the canvas path.
- ~~Fills in a Web Worker~~ (`workers/fillWorker.js`) — the interface stays
  responsive while large or image-based fills compute.
- ~~Removed the canvas background drop-shadow filter~~ (pure cosmetic cost,
  no longer rendered)
- ~~Rewrote `colorizeSvg` to use a per-asset cached string-template~~ instead
  of parsing/mutating/serialising the SVG DOM on every call — colour
  application is now pure string substitution after the first hit per asset
