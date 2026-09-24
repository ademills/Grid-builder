# Mills Pattern Studio

A Windows desktop app for building pattern artwork. Two modes share one
canvas: **Grid Builder** mode packs a library of SVG shapes onto a
configurable grid and colourizes/animates them; **Meander** mode generates
Celtic/Kufic-style knot and key patterns from a seeded procedural walker.

Built with React 19 + Vite, packaged as a native Windows app with
[Tauri 2](https://v2.tauri.app/).

## Features

- **Grid layout** — pack a library of ~112 built-in SVG shapes onto a
  configurable grid, with auto-fill, gap-filling, flip H/V, and undo/redo
- **Colour modes** — `none`, `random`, `uniform`, `gradient` (linear/radial,
  angle/scale/repeat/jitter controls), and `image` (sample colours from a
  reference image)
- **Animation** — continuous colour-replacement effects (noise, gradient
  sweep, palette wave, flicker) and filter-based effects (hue drift, warp)
- **Selection & editing** — marquee/click select, lock individual blocks'
  colours, per-block context menu actions
- **Export** — export the finished pattern as an SVG file
- **Project save/load** — persist and restore a layout
- **Meander mode** — a separate generative-pattern mode: seeded meander/key walker with adjustable density, symmetry (mirror/rotate/kaleidoscope), strand width and roundness, word/name-seeded designs, image-sampled strand colour, and single-motif seamless tiling

## Development

```sh
npm install
npm run dev          # Vite dev server
npm run tauri dev    # run inside the Tauri shell (native window)
```

## Building

```sh
npm run build        # production frontend build
npm run tauri build  # produce a native Windows installer/binary
```

Release builds are versioned and published via `npm run release:minor` /
`npm run release:major` (see `scripts/release.js`), which bump the version
and drive the GitHub Actions release workflow.

## Project structure

- `src/components/` — Canvas, grid rendering (`PlacedBlocks`, `Grid`), the
  animation layer, floating panels, selection toolbar, context menu
- `src/hooks/` — colour palette, selection, and undo/redo history state
- `src/utils/` — shape-library rendering/caching, colourizing, colour
  separation, bin-packing, noise generation
- `src/workers/` — off-main-thread colour separation
- `src-tauri/` — the Rust/Tauri shell that wraps the frontend into a native
  Windows app (window config, capabilities, updater, release packaging)

## Tracking improvements

Planned performance and feature work is tracked in [updates.md](updates.md).
