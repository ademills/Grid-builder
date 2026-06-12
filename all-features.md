# Grid Builder — Feature Ideas

## Feature Priority List

### 1. High Priority: The Glitch & Slice Engine

- **Combo: Core Glitch & Sorting**
  - **Glitch Fill:** ✅ DONE — Image-driven screen-tear fill.
- **Combo: The Slicer & Scanner**
  - **F1. Strip Fill:** ✅ DONE — Narrow band fill — source of parrot-image look.
  - **F2. Multi-Strip / Slash Fill:** ✅ DONE — Multiple parallel strips at angle.

### 2. High/Medium Priority: The Live Instrument

- **J1. Audio Reactive Mode:** ✅ DONE — Mic/audio drives animation parameters.

### 3. Medium Priority: Image Data Pipeline & Colour Math

- **G2. Pixel Sort Animation:** ✅ DONE — Glitch-art column/row sorting animation.
- **G1. Strip Scan Animation:** ✅ DONE — Sweeping beam animation across grid.
- **Combo: Image Buffer Reading**
  - **C1. Background Image Layer:** ✅ DONE — Reference or backdrop mode.
  - **C2. Palette Extractor:** ✅ DONE — Auto-extract palette from image.
  - **A1. Edge Trace Fill:** ✅ DONE — Sobel gradient detection.
  - **A2. Brightness Fill:** ✅ DONE — Average luminance threshold.
  - **A3. Colour Region Fill:** K-means clustering.
- **Combo: Shape Modifiers**
  - **H1. Block Rotation:** 90° rotation steps per block.
  - **C3. Block Blend Modes:** ✅ DONE (global blend mode only — per-block context menu not implemented) — SVG mix-blend-mode.
  - **H2. Colour Temperature Shift:** ✅ DONE — Global warm/cool grade on all block colours.

### 4. Low Priority: Math Masks & Workflow Overlays

- **Combo: Mathematical Fills**
  - **A4. Noise Field Fill:** ✅ DONE — Reuses simplex2 utility.
  - **A6. Geometric Pattern Fill:** ✅ DONE — Pure geometry, 6 pattern types.
- **Combo: State & Analytics**
  - **I1. Fill Snapshot Variations:** Up to 6 named fill result comparison slots.
  - **D3. Project Gallery:** Home screen with thumbnails.
  - **E1. Shape Usage Stats:** Coverage & balance tools.
  - **I2. Composition Rules Overlay:** Rule of thirds, golden ratio, safe zone guides.
- **Combo: Additional Modifiers**
  - **A7. Symmetry Modifier:** Applied after any fill.
  - **A10. Palette Match Fill:** Palette colour proximity filter.

### 5. Lowest Priority / Deprioritised

- **Workflow Enhancements:** D1. Surprise Me (One-click full randomisation), D2. Custom SVG Import (User-defined shape library), J5. Fill Transition Animation (Cross-fade between two fill states).
- **Workflow/Export Tools:** F4. Reveal / Cutout Mode (Shapes become transparent holes in overlay), A8. Painter Tool (Manual cell-by-cell paint/erase), J8. Batch Export (Multiple formats in one action), B3. Tiling Preview & Export (Seamless repeat tile).
- **Novelty Fills:** J4. Freehand Path Mask Fill (User-drawn region as fill mask), J6. Voronoi Region Fill (Seed-point territorial partitioning), A9. Scatter Decay Fill (Focal-point density falloff), J2. QR Code Fill (Shapes replace QR dark cells), A5. Text Mask Fill (Canvas fillText rasterisation).
- **Architecturally Heavy/Complex:** J3. Multi-Layer Canvas (Stacked independent grid layers), J10. Grid Subdivision (Mixed cell resolution zones), F3. Photo Composite Export (Export shapes composited over reference photo), B1. Raster Export (PNG/JPEG at custom DPI), B2. Animated Export (GIF/MP4 from animation loop), G3. Live Camera Input (Webcam as real-time image colour source).

---

## Full Feature Reference

This document captures features across four rounds of ideation.
The first 10 are image-driven fill methods and compositional modifiers.
The second 10 open the scope to export, workflow, tooling, and canvas capabilities.

Features marked with full specs in `feature-specs.md`:
- **Glitch Fill** (image-driven screen-tear fill)
- **Density Fill** (image complexity fill)

---

## Category A — Image-Driven Fill Methods

### A1. Edge Trace Fill

Runs a Sobel edge-detection pass on the loaded image pixel buffer and places shapes only along the detected contours, so the grid "draws" the outlines of subjects with blocks rather than flooding entire regions.

**How it works:** For each cell, compute the horizontal and vertical gradient magnitude (Gx, Gy) across the pixels in that cell. Cells whose gradient magnitude exceeds a threshold are marked active. The result traces the edges and boundaries in the image with a line of shapes — a face becomes a skeletal outline, architecture becomes a wireframe.

**Key controls:**
- `edgeThreshold` (0–1) — sensitivity. Low = many faint edges included; high = only the sharpest contours.
- `traceWidth` (1–4 cells) — how many cells on either side of a detected edge get populated, controlling line thickness.
- `minEdgeLength` (1–20 cells) — minimum length a connected edge run must be before it gets shapes, filtering out isolated noise cells.
- `direction` — All edges / Horizontal only / Vertical only (useful for specific compositional effects).

**Integration notes:** Reuses the existing `imagePixels` buffer. Pure arithmetic — no DOMParser. Lives in `src/utils/edgeFill.js`. Button in Actions section, disabled without a loaded image.

---

### A2. Brightness Fill

Fills cells based on the average pixel brightness within each cell rather than variance. Unlike Density Fill (which responds to how *complex* an area is), Brightness Fill responds to how *light or dark* it is — letting users decorate only shadows, only highlights, or a specific tonal range.

**How it works:** Each cell gets a brightness score (0–1) derived from the average ITU-R luminance of its pixels. The user selects a target zone: darks (score < low), midtones (low ≤ score ≤ high), or lights (score > high). Cells in the target zone are active.

**Key controls:**
- `targetZone` — Darks / Midtones / Lights / Custom range.
- `lowPoint` / `highPoint` (0–1) — for Custom range, defines the brightness band.
- `invert` — fills the *opposite* of the chosen zone.
- `softEdge` (0–1) — instead of a hard threshold, shapes near the boundary are placed with decreasing probability, producing a feathered edge between filled and empty regions.

**Integration notes:** Extremely fast — one pass over the pixel buffer. No smoothing or blob filtering needed (though both could be added as options). Works especially well for creating stark silhouette compositions or spotlight effects.

---

### A3. Colour Region Fill

Segments the image into dominant colour groups using K-means clustering on the pixel buffer, then lets the user select which colour group(s) to fill. Useful for isolating a specific element — a sky, a face, a background — and decorating only that region.

**How it works:** Run K-means (K = 4–12, user-chosen) on the sampled image pixels to find dominant colour centroids. Each grid cell is assigned to the nearest centroid based on its average pixel colour. The sidebar shows a small palette of the K extracted colours as clickable swatches; toggled swatches activate those cells for filling.

**Key controls:**
- `numClusters` (4–12) — number of colour groups to extract.
- `colourTolerance` — how strictly a cell must match its centroid to be included (controls region edge softness).
- `selectedClusters` — multi-select of which colour swatches trigger fill.
- `recompute` button — re-runs K-means (useful if the image or cluster count changes).

**Integration notes:** K-means on a ≤512px downsampled image is fast enough synchronously for K ≤ 12. For larger K values or future full-resolution support, move to the existing Web Worker. The extracted colour swatches can optionally be auto-applied to the active palette, creating a colour-coherent result with one action.

---

### A4. Noise Field Fill

No image required. A configurable Simplex noise field (reusing the existing `src/utils/noise.js` utility) is used to generate a 2D mask across the grid. Cells where the noise value exceeds a threshold are filled. Produces organic, cloud-like or archipelago-like fill regions that feel natural but are entirely generative.

**How it works:** Sample `simplex2(col * scale, row * scale + seed)` for each cell. Normalise the noise values across the grid to [0, 1], then threshold. Optionally add octaves for more fractal detail. The result is a set of connected organic blobs — nothing sharp, nothing geometric, but not random either.

**Key controls:**
- `scale` (0.05–2.0) — spatial frequency. Low = large sweeping regions; high = fine speckled detail.
- `threshold` (0–1) — what proportion of the grid gets shapes. 0.5 = roughly half the grid is filled.
- `octaves` (1–4) — layered noise for fractal complexity.
- `seed` — deterministic generation. Randomise button.
- `invert` — fills the valleys of the noise field instead of the peaks.

**Integration notes:** Entirely image-independent. Useful as a standalone compositional tool or combined with other fill modes (e.g., run Noise Field Fill then Symmetry Modifier). No new utility file needed — `simplex2` already exists.

---

### A5. Text Mask Fill

The user types a word or short phrase, picks a font size and alignment, and the text is rasterised to a pixel mask. Shapes are placed only in cells that fall inside the letterform silhouettes. The result is the phrase spelled out in shapes, with empty space everywhere else.

**How it works:** Draw the text into an offscreen canvas using `fillText()` at a size that maps the letter height to the work area height. Read back the pixel buffer. For each grid cell, sample the mask pixel at the cell centre — if the pixel is filled (alpha > 0), mark the cell active.

**Key controls:**
- `text` — free text input (1–3 words recommended at typical grid sizes).
- `fontSize` (10–200% of work area height) — scales the text to fill more or less of the canvas.
- `font` — system font family picker (limited to safe fallbacks: Arial, Georgia, Courier, Impact, etc.).
- `alignment` — left / centre / right within the work area.
- `verticalPosition` — top / middle / bottom.
- `tracking` (letter spacing, -20% to +50%) — spread letters apart to let more shapes in.
- `maxScale` / `scaleFreq` — independent scale settings for the bin-packer within the text mask.

**Integration notes:** Uses `document.createElement('canvas')` and `CanvasRenderingContext2D.fillText()` — no external font loading needed for system fonts. The offscreen canvas is the same dimensions as the work area for pixel-accurate cell mapping. No image upload required.

---

### A6. Geometric Pattern Fill

A family of purely mathematical masks — no image, no noise. The user picks a pattern type and only cells that fall inside the pattern geometry receive shapes. Good for structured, decorative layouts and for combining with colour gradients to create precise graphic designs.

**Pattern types (each with its own parameters):**

| Pattern | Controls |
|---------|----------|
| Diagonal stripes | Angle (0–180°), stripe width (cells), gap width (cells) |
| Concentric rings | Centre X/Y (normalised), ring width (cells), gap (cells), inner radius |
| Checkerboard | Tile size (cells), offset X/Y |
| Sunburst / radial lines | Centre X/Y, number of spokes, spoke width (degrees), inner radius |
| Dot grid | Dot radius (cells), spacing X/Y, offset |
| Hexagonal grid | Cell radius, row offset |

A `phase` offset parameter available on all types shifts the pattern across the grid.

**Integration notes:** Pure geometry — each pattern is a function `isActive(col, row, params) → boolean`. Lives in `src/utils/geometricFill.js`. No image dependency. Pairs especially well with gradient colour mode since the pattern creates the occupancy structure while the gradient applies the colour rhythm across it.

---

### A7. Symmetry Modifier

A post-processing step (not a fill itself) that takes the current placed blocks and reflects or rotates them to enforce a chosen symmetry axis. Applied after any fill, or to manually placed blocks. The "source" region is kept; the target region is cleared and mirrored from it.

**Modes:**
- Mirror horizontal — left half reflected to right
- Mirror vertical — top half reflected to bottom
- Four-fold — both axes simultaneously
- Rotational 2-fold — 180° rotation around centre
- Rotational 4-fold — 90° steps
- Point symmetric — each block and its 180° counterpart are matched

**Key controls:**
- `mode` — enum of above options
- `sourceHalf` — which half is treated as the source for mirror modes (left/right/top/bottom)
- `applyToEmpty` — if true, only fills the target half if the source cell is occupied; if false, also removes blocks in the target half that have no source counterpart (strict symmetry)

**Integration notes:** Applied as a `setPlacedBlocks` transformation — fully undoable. Runs after any fill or can be triggered standalone via a button in the Actions section. Does not require an image. If the grid has an odd number of columns/rows, the middle column/row is treated as belonging to both halves (mirrored in place).

---

### A8. Painter Tool

A third interactive tool mode (alongside Select and Hand) that lets users manually paint shapes cell by cell using click-drag gestures. Clicking on empty cells places a shape; clicking on occupied cells removes it. Fills the gap between the algorithmic fill methods and wanting precise manual control.

**How it works:** When Painter is active, pointer events on the canvas map to grid cells instead of blocks. On mousedown, determine whether the user is painting (hit empty cell) or erasing (hit occupied cell) and lock that mode for the drag. On each cell entered during drag, apply the paint/erase operation.

**Key controls (in sidebar):**
- `brushSize` — 1×1 / 2×2 / 3×3 cell footprint. Larger brush places/removes multiple cells per gesture.
- `shapeMode` — Random (cycles through enabled assets per cell) / Fixed (always uses a single user-chosen shape from a small picker)
- `respectExisting` — if true, painting over an occupied cell skips it rather than replacing the shape

**Integration notes:** New `'paint'` value for the `activeTool` state. All paint operations go through `setPlacedBlocks` and are pushed to undo history in batches (one undo step per continuous drag gesture, not per cell). The brush footprint preview (showing which cells would be affected) renders as a subtle highlight overlay on the canvas while Painter is active.

---

### A9. Scatter Decay Fill

Fills with decreasing density radiating outward from a focal point, producing a spotlight or vignette composition — densely packed shapes near the focus thinning to nothing at the edges. The focal point can be placed manually or auto-detected from the loaded image.

**How it works:** For each grid cell, compute its normalised distance from the focal point. Apply a falloff function (linear, quadratic, or exponential) to convert distance to a fill probability. Draw a random value per cell (seeded) and mark the cell active if its probability exceeds the random draw.

**Key controls:**
- `focalX / focalY` — click-to-place on canvas, or drag handle in the work area
- `autoFocal` — when enabled, sets focal point to the centroid of the brightest region of the loaded image
- `radius` (0–1, fraction of work area diagonal) — distance beyond which fill probability reaches zero
- `falloff` — Linear / Quadratic / Exponential
- `minDensity` (0–1) — baseline fill probability at the edge of the radius (prevents the outer ring being completely empty)
- `seed` — for the per-cell probability draws

**Integration notes:** Lives in `src/utils/scatterFill.js`. The focal point can be rendered as a small draggable handle directly on the canvas (like the gradient centre point handles in gradient mode) using a lightweight overlay element.

---

### A10. Palette Match Fill

Fills cells based on how closely their sampled image colour matches one of the currently active palette swatches. Creates a fill that "selects" areas of the image that align with the chosen palette — useful for making shapes appear only where the image is tonally or chromatically consistent with your design palette.

**How it works:** For each grid cell, sample the average colour and compute the RGB Euclidean distance to each enabled palette swatch. If the minimum distance to any swatch falls within `tolerance`, mark the cell active.

**Key controls:**
- `tolerance` (0–255 in RGB Euclidean distance) — how loosely "matching" is defined. Low = only very close matches; high = most cells qualify.
- `perSwatchTolerance` — if enabled, each swatch has an independent tolerance slider, letting some colours be strict and others loose.
- `invert` — fills where colours *don't* match the palette instead.
- Live preview of which cells would qualify updates as the palette or tolerance changes, without re-running the full fill.

**Integration notes:** Depends on both `imagePixels` (for sampling) and the active palette state. The live preview can be implemented as a lightweight `useMemo` pass that recomputes the qualifying cells whenever palette or tolerance changes and renders them as a semi-transparent overlay — similar to the Density Fill heat-map overlay.

---

## Category B — Export & Output

### B1. Raster Export (PNG / JPEG)

Export the current layout as a raster image at a user-specified resolution and DPI — essential for social media sharing, print workflows, and use cases where SVG isn't accepted. The existing flat SVG is rendered to a canvas element and then encoded.

**How it works:** Build the flat SVG using the existing `buildFlatSvgElement` function, serialise it to a string, create a Blob URL, draw it into an offscreen `<canvas>` at the target pixel dimensions using `drawImage`, then call `canvas.toBlob()` for PNG or `canvas.toDataURL('image/jpeg', quality)` for JPEG. In the Tauri shell, write the result with `writeFile`. In the browser, trigger a download.

**Key controls:**
- `format` — PNG / JPEG
- `resolution` — preset multipliers (1×, 2×, 3×, 4× of work area native pixels) plus a custom DPI entry that maps to pixel dimensions based on the work area preset's physical size (e.g., A4 at 300 DPI = 2480 × 3508 px)
- `jpegQuality` (10–100%) — only shown when format is JPEG
- `includeBackground` — whether the outer canvas background colour is included or exported as transparent (PNG only)

**Integration notes:** New "Export PNG/JPEG" button alongside "Export SVG" in the Actions section. The offscreen canvas approach is resolution-limited by browser canvas size limits (~16384 px per dimension on most platforms) — show a warning if the target resolution exceeds this.

---

### B2. Animated Export (GIF / MP4)

Encode the live animation as a downloadable animated GIF or MP4 video file. The animation loop already runs via `requestAnimationFrame` — this feature captures frames from it at a controlled rate and encodes them.

**How it works:** On export start, temporarily redirect the animation output to an offscreen canvas (same technique as raster export). Capture N frames at a fixed interval calculated from `fps` and `duration`. For GIF, use a pure-JS GIF encoder (e.g., `gif.js` or similar lightweight library). For MP4, use the browser's `MediaRecorder` API against a canvas stream — this is natively supported in Chromium (which Tauri uses) and produces H.264 MP4 without any codec dependencies.

**Key controls:**
- `format` — Animated GIF / MP4
- `duration` (0.5–30 seconds)
- `fps` — 12 / 24 / 30 / 60 (GIF practical max is 24)
- `resolution` — same presets as Raster Export
- `loopCount` — 0 = infinite loop, 1–10 = fixed loops (GIF only; MP4 doesn't loop)
- Progress bar shown during encoding — for long/high-res exports this can take several seconds

**Integration notes:** `MediaRecorder` + canvas stream is the cleanest path for MP4 inside Tauri's Chromium runtime. GIF encoding needs a bundled JS library (gif.js is ~100KB, MIT licensed). Both paths produce a file that Tauri writes to disk via the save dialog. Animation must be enabled for this export to be meaningful — show a warning if it isn't.

---

### B3. Tiling / Seamless Repeat Preview & Export

Preview how the current layout tiles as a seamlessly repeating pattern and export it as a ready-to-use tile. Patterns and textiles both require seamless tiling — this makes Grid Builder directly usable for that workflow without post-processing in another tool.

**How it works:** The tiling preview renders a 3×3 repetition of the work area directly on the canvas (as a lightweight SVG `<use>` or `<pattern>` element overlay). Seamless export wraps the shapes that cross the work area boundary — shapes whose bounding boxes extend past an edge are duplicated at the opposite edge, creating a true seamless tile.

**Key controls:**
- `previewGrid` — toggle the 3×3 repeat overlay on the canvas (shows how the tile actually joins)
- `seamlessWrap` — when exporting, duplicate border-crossing shapes on the opposite edge. Toggle on/off.
- `exportFormat` — SVG tile / PNG tile / CSS `background-image` snippet (outputs a base64 `background-image: url(...)` declaration ready to paste into CSS)
- `tileScale` — export the tile at 1×, 2×, or 4× of work area dimensions

**Integration notes:** The 3×3 preview overlay uses a single `<pattern>` element in the SVG canvas and adds no rendering cost. Seamless wrapping on export is a geometric transformation pass on `placedBlocks` — straightforward to implement using the existing grid coordinate system.

---

## Category C — Canvas & Composition

### C1. Background Image Layer

Place a reference photograph behind the grid shapes. Two modes: a non-exportable reference layer for positioning/tracing (visible in-app only) and a backdrop layer that is included in SVG and raster exports behind the shapes.

**How it works:** A `<image>` element is rendered at the bottom of the SVG canvas (below `PlacedBlocks`) covering the work area with `preserveAspectRatio="xMidYMid meet"` (or "cover", user-choosable). The image is stored as a data URL derived from the user's uploaded file. For export, the backdrop image is either included in the SVG as an embedded `<image>` or excluded depending on the mode.

**Key controls:**
- `mode` — Reference (in-app only, shown faintly at reduced opacity) / Backdrop (included in export)
- `opacity` (0–100%) — how visible the image is behind the shapes
- `fit` — Contain / Cover / Stretch
- `tintColour` — optionally tint the background image with a colour overlay at adjustable opacity, useful for blending with the canvas background colour

**Integration notes:** The image used here can be the *same* image as the image colour mode source, or a different one. Share the upload UI (reuse the existing image picker) but maintain separate state for `backdropSrc` vs `imageSrc`. Add `backdropSrc` and `backdropSettings` to project save state.

---

### C2. Palette Extractor from Image

Automatically extract a colour palette from any uploaded image using K-means clustering and apply it directly to the active shape and background colours. Eliminates the need to manually pick colours that work with a reference image — the palette comes from the image itself.

**How it works:** Run K-means (reusing the same clustering logic as Colour Region Fill) on the `imagePixels` buffer to extract N dominant colours. Present them as a set of swatches with toggle controls. The user chooses which extracted colours become shape colours and which become background colours, then applies them in one action.

**Key controls:**
- `numColours` (4–16) — how many colours to extract
- `extractFrom` — the current image colour mode image, or a separately uploaded "palette source" image
- Per-swatch assignment: each swatch can be dragged to "Shape colours", "Background colours", or discarded
- `replaceExisting` — replaces the current palette vs. merges with it
- `saveAsCustomPalette` — immediately saves the extracted palette as a named custom palette entry

**Integration notes:** Reuses the `imagePixels` buffer already in state. The K-means computation is fast enough synchronously at ≤512px. The assignment UI (drag swatches to shape/bg buckets) mirrors the existing swatch drag-reorder interaction already built for shape colours.

---

### C3. Block Blend Modes

Apply CSS/SVG `mix-blend-mode` to blocks, creating painterly overlapping effects without changing any colour logic. Blend modes control how each block's fill colours interact visually with whatever is behind it — other blocks, the background colour, or a background image.

**How it works:** Two levels of control. Global blend mode applies a `mix-blend-mode` style to the main `<g>` wrapper that contains all placed blocks, affecting the whole composition. Per-block blend mode (via context menu) adds an individual `mix-blend-mode` attribute to that block's `<g>` element.

**Available modes:** Normal (default), Multiply, Screen, Overlay, Soft Light, Hard Light, Darken, Lighten, Colour Dodge, Colour Burn, Difference, Exclusion.

**Key controls:**
- Global blend mode dropdown in the Colour Palette section
- Per-block blend mode in the context menu (right-click → "Blend mode →" submenu)
- `blendMode` stored per block in `PlacedBlock` state and in project save

**Integration notes:** SVG `mix-blend-mode` is fully supported in Chromium (Tauri's renderer). The property is added inline on the `<g>` element during rendering in `PlacedBlocks`. The existing `buildFlatSvgElement` export function needs to carry blend mode through to the exported SVG. Note that blend modes interact with the SVG `isolation` property — may need `isolation: isolate` on the parent to scope blending correctly.

---

## Category D — Workflow & UX

### D1. Surprise Me

A single button (or keyboard shortcut `S`) that randomises a configurable set of app parameters simultaneously — intended as an exploration and inspiration tool for when a user wants to break out of a rut or discover unexpected combinations.

**What it randomises (each independently toggleable in a settings sub-panel):**
- Grid column count (random valid value from the work area's valid columns list)
- Work area preset (random from the preset list)
- Active asset set (random 30–70% subset of the built-in library)
- Colour palette (random from all built-in palettes)
- Colour mode (random from none/random/uniform/gradient — never switches to image mode automatically)
- Gradient settings (if gradient mode selected: random angle, mode, scale, repeat)
- Animation type and speed (if animation is already enabled)
- A full Fill Grid is run with the new settings

**Key controls:**
- `surpriseBtn` — main trigger button in Actions section
- `surpriseScope` — a small panel showing which of the above categories are included in the randomisation (each with a toggle). Users can lock certain aspects ("keep my palette, randomise everything else").
- Keyboard shortcut: `S` while no text input is focused

**Integration notes:** Executes a sequence of `setState` calls followed by a debounced `handleFillGrid`. All changes are bundled into a single undo step so one Ctrl+Z reverts the entire Surprise Me action. Should not be triggerable while Auto-fill is active to avoid conflicting re-renders.

---

### D2. Custom SVG Shape Import

Let users add their own SVG files to the shape library at runtime, stored in a "My Shapes" folder that persists across sessions via the Tauri filesystem plugin.

**How it works:** The user opens a file picker (multiple selection) and selects one or more `.svg` files. Each file is read, validated (must be a parseable SVG with at least one fill-bearing element), and stored to the Tauri app data directory. On next launch, `My Shapes` appears in the asset browser tree alongside the built-in themes. Grid size for custom shapes is inferred from the filename if it includes a size token (`myshape-2x1.svg` → 2×1) or defaults to 1×1.

**Key controls:**
- "Import Shapes…" button in the asset browser header
- Validation feedback: shapes that fail (no fills, parse errors) are listed with error reasons
- Per-shape delete option in the asset browser (custom shapes only — built-ins are read-only)
- "Export My Shapes" — zip all custom SVGs for backup/sharing

**Integration notes:** Custom shapes are stored in `{appDataDir}/custom-shapes/`. They are loaded at startup and merged into `ALL_BUILTIN_ASSETS` using the same `builtinAssets.js` tree-building logic. Tauri's `tauri-plugin-fs` is already available. The `shapeLibrary.json` pre-built index does not cover custom shapes — image-mode colorisation for custom shapes falls back to the existing `colorizeSvgByImage` direct path instead of the slot-template path.

---

### D3. Project Gallery & Recent Projects

A home screen (shown on first launch, or accessible from the sidebar) that displays recent projects as visual thumbnail cards. Makes it easy to resume work on a previous design without digging through the filesystem.

**How it works:** When a project is saved or exported, a thumbnail SVG (a small 200×200 rendering of the current layout) is saved alongside the `.json` file in the same directory. On launch (or when the gallery is opened), the app reads the Tauri app data directory for all `.json` / thumbnail pairs and renders them as a grid of cards.

**Each project card shows:**
- Thumbnail preview (SVG rendered inline)
- Project filename
- Work area dimensions and preset name
- Last modified date
- Actions: Open, Duplicate, Rename, Delete

**Key controls:**
- Gallery triggered on launch if no project is open (configurable: "Always show gallery on launch" preference)
- "New Project" card at the start of the grid for starting fresh
- Sort by: Last modified / Name / Work area size
- Search/filter by name

**Integration notes:** Thumbnails are generated using `buildFlatSvgElement` at a small fixed size (no need for full-resolution rendering). Tauri's `fs.readDir` iterates the projects folder. The gallery renders as a modal overlay on top of the main canvas, not a separate route. First implementation can use the existing `app data directory` — no new Tauri plugins needed beyond `tauri-plugin-fs` which is already available.

---

## Category E — Colour & Palette

### E1. Shape Usage Stats

A panel in the asset browser showing a breakdown of which shapes are currently placed on the canvas, their usage counts, and overall grid coverage statistics. Helps users understand and balance their compositions, especially on large grids.

**Displayed information:**
- Total cells occupied vs. total available (coverage %)
- List of placed shapes sorted by count (most → least used), each showing: thumbnail, name, count, % of total placed blocks
- Shapes that are enabled but not placed (potential candidates for fill gaps)
- Most dense area of the grid (which quadrant has the most blocks)

**Actions available from the panel:**
- "Balance" — re-runs Fill Grid with a weighted distribution that prioritises underused shapes to equalise usage across the enabled asset set
- "Highlight" — hovering a shape in the stats list highlights all instances of that shape on the canvas with a coloured outline
- "Swap all" — replaces every instance of one shape with another (pick from a mini asset picker)

**Integration notes:** Stats are derived from `placedBlocks` — a `useMemo` computation. No new state. "Highlight" uses a lightweight Set of IDs passed as a prop to `PlacedBlocks` to add a highlight class to matching blocks. "Balance" modifies the `fillGrid` call to pass a weighted asset array (assets with low counts get higher weights in the bin packer's shuffle).

---

*End of first two rounds — 20 features across 5 categories. See Categories F–I below for the third round (10 more features, inspired by the parrot strip composite image).*

---

## Quick Reference — All 40 Features

| # | Name | Category | Image required | Notes |
|---|------|----------|---------------|-------|
| A1 | Edge Trace Fill | Fill method | Yes | Sobel gradient detection |
| A2 | Brightness Fill | Fill method | Yes | Average luminance threshold |
| A3 | Colour Region Fill | Fill method | Yes | K-means clustering |
| A4 | Noise Field Fill | Fill method | No | Reuses simplex2 utility |
| A5 | Text Mask Fill | Fill method | No | Canvas fillText rasterisation |
| A6 | Geometric Pattern Fill | Fill method | No | Pure geometry, 6 pattern types |
| A7 | Symmetry Modifier | Post-process | No | Applied after any fill |
| A8 | Painter Tool | Tool mode | No | Manual cell-by-cell paint/erase |
| A9 | Scatter Decay Fill | Fill method | Optional | Focal-point density falloff |
| A10 | Palette Match Fill | Fill method | Yes | Palette colour proximity filter |
| B1 | Raster Export | Export | No | PNG/JPEG at custom DPI |
| B2 | Animated Export | Export | No | GIF/MP4 from animation loop |
| B3 | Tiling Preview & Export | Export | No | Seamless repeat tile |
| C1 | Background Image Layer | Composition | Yes | Reference or backdrop mode |
| C2 | Palette Extractor | Colour | Yes | Auto-extract palette from image |
| C3 | Block Blend Modes | Colour | No | SVG mix-blend-mode |
| D1 | Surprise Me | Workflow | No | One-click full randomisation |
| D2 | Custom SVG Import | Workflow | No | User-defined shape library |
| D3 | Project Gallery | Workflow | No | Home screen with thumbnails |
| E1 | Shape Usage Stats | Analytics | No | Coverage & balance tools |

| F1 | Strip Fill | Fill method | Optional | Narrow band fill — source of parrot-image look |
| F2 | Multi-Strip / Slash Fill | Fill method | Optional | Multiple parallel strips at angle |
| F3 | Photo Composite Export | Export | Yes | Export shapes composited over reference photo |
| F4 | Reveal / Cutout Mode | Rendering | Yes | Shapes become transparent holes in overlay |
| G1 | Strip Scan Animation | Animation | No | Sweeping beam animation across grid |
| G2 | Pixel Sort Animation | Animation | No | Glitch-art column/row sorting animation |
| G3 | Live Camera Input | Image source | No | Webcam as real-time image colour source |
| H1 | Block Rotation | Per-block | No | 90° rotation steps per block |
| H2 | Colour Temperature Shift | Colour | No | Global warm/cool grade on all block colours |
| I1 | Fill Snapshot Variations | Workflow | No | Up to 6 named fill result comparison slots |
| I2 | Composition Rules Overlay | Workflow | No | Rule of thirds, golden ratio, safe zone guides |

*Features with full specs (algorithm detail, pseudocode, edge cases): see `feature-specs.md` for Glitch Fill and Density Fill.*

---

## Category F — Strip, Composite & Photo-Integrated Fills
*Inspired by: vertical strip of image-sampled shapes running through a subject photo against a black background — shapes as a selective window into abstraction rather than full-canvas coverage.*

### F1. Strip Fill

Places shapes only within a configurable strip cut across the grid — a narrow band that bisects the work area horizontally, vertically, or at an angle. The direct source of the look in the parrot reference image: most of the canvas stays empty while a tight column of geometric shapes reads as an abstract slice through the subject.

**How it works:** Define a strip by its axis (H/V/angle), centre position, and width in cells. Mark only cells whose centre falls within the strip bounds as active. Run the bin packer against that allow-list. Multiple strips can be stacked (see F2), each independently configured.

**Key controls:**
- `axis` — Horizontal / Vertical / Custom angle (0–180°)
- `position` (0–1) — where the strip sits along the perpendicular axis (0 = left/top, 1 = right/bottom, 0.5 = centred)
- `width` (1–20 cells) — strip thickness
- `feather` (0–5 cells) — cells near the strip edge are populated with decreasing probability, softening the boundary from a hard cut to a gradual fade
- `seed` — for feathering randomisation
- Works best with Image colour mode active so the shapes sample the subject's actual colours

**Integration notes:** Lives in `src/utils/stripFill.js`. The strip position control can optionally be exposed as a draggable line handle on the canvas overlay (like the focal point in Scatter Decay Fill). Saved in project state as `stripSettings`.

---

### F2. Multi-Strip / Slash Fill

An extension of Strip Fill where the user places multiple parallel strips at a shared angle, creating a venetian-blind, sliced, or scan-line fragmentation effect across the photo subject. Each strip can have independent width and position, or the whole set can be evenly distributed.

**How it works:** Generate N strips at a given angle with configurable spacing between them. Each strip is computed exactly as in Strip Fill (F1) but the active cell sets are unioned. In "even distribution" mode, strip centres are spaced `(work area width / N+1)` apart. In "manual" mode, the user positions each strip independently.

**Key controls:**
- `numStrips` (2–12)
- `angle` (0–180°) — shared across all strips
- `stripWidth` (1–10 cells) — uniform width for all strips
- `spacing` — Even distribution / Manual (individual position sliders per strip)
- `stagger` (boolean) — offsets alternating strips by half the strip width, producing a woven/interleaved look
- `feather` — same as Strip Fill, applies to all strips

**Integration notes:** Essentially a loop over Strip Fill's `computeStripMask` with a union of the resulting cell sets. The stagger option produces particularly interesting compositions where alternating strips have opposing colour positions when used with gradient or palette wave colouring.

---

### F3. Photo Composite Export

Export the grid shapes composited on top of the reference image rather than on the flat canvas background colour — producing images in the style of the parrot reference directly from the app, without needing a separate compositing tool.

**How it works:** In `buildFlatSvgElement`, when a reference image is loaded and this export mode is active, embed the `imageSrc` data URL as a full-work-area `<image>` element at the bottom of the export SVG (below all shapes), with `preserveAspectRatio="xMidYMid meet"`. The canvas background colour is not drawn. The shapes then render on top of the photo.

**Key controls:**
- `compositeMode` — Shapes only (current behaviour) / Shapes over photo / Photo only (useful for checking the reference)
- `photoOpacity` (0–100%) — fade the photo relative to the shapes
- `photoFit` — Contain / Cover / Stretch (same options as Background Image Layer C1, but this is the export path)
- `includePhotoInSvg` — if false, only the shapes are exported even in composite mode (the photo is kept as a guide layer only)

**Integration notes:** Reuses the existing `imageSrc` data URL already in state. The only change to `buildFlatSvgElement` is prepending the photo `<image>` element conditional on export mode. For raster export (B1), the same compositing approach applies to the offscreen canvas draw sequence.

---

### F4. Reveal / Cutout Mode

Inverts the usual rendering logic. Instead of shapes appearing on a blank background, a solid colour fill covers the entire work area and the placed blocks become transparent "holes" that reveal the reference image underneath. The shapes act as a perforated mask.

**How it works:** Render the reference photo at the bottom of the SVG stack. On top of it, render a solid `<rect>` covering the full work area in the chosen overlay colour. In the clip/mask layer, the placed block positions are subtracted from the overlay using an SVG `<mask>` or `clipPath` — only the cells occupied by shapes are transparent, letting the photo show through in those shapes' outlines.

**Key controls:**
- `overlayColour` — the solid colour that covers the photo (defaults to canvas background)
- `overlayOpacity` (0–100%) — how opaque the overlay is. At 100% the photo only shows through the shape holes; at lower values the photo is visible through the overlay everywhere, with the shapes as brighter windows
- `shapeStroke` — optionally add a stroke around each revealed shape for definition
- `invertCutout` — instead of shapes as holes in the overlay, render shapes as solid fills on a transparent canvas (composite-only mode)

**Integration notes:** The SVG mask approach is clean and exportable. Each block's outline path is aggregated into a single `<mask>` element. This is the compositional inverse of the standard render and produces completely different aesthetics from the same layout — worth exposing as a quick toggle rather than a separate mode.

---

## Category G — New Animation Types

### G1. Strip Scan Animation

A new animation type where the active fill region (a strip) sweeps continuously across the canvas, creating a scanning-beam effect. Blocks outside the current scan position fade or disappear; blocks within it are lit. A complement to Strip Fill's static placement — the animated version makes the strip feel like a moving search light or data read head crossing the image.

**How it works:** On each rAF tick, compute the current strip centre position as a function of `phase` (same phase variable used by all other animation types). All blocks whose grid column or row falls within the strip's current sweep window have their colours rendered normally via the active colour mode; blocks outside the window are dimmed (their fills shifted toward a near-black or the canvas background colour). The sweep motion is sinusoidal (ping-pong) or wrapping (continuous scroll).

**Key controls (in Animation section):**
- `sweepAxis` — Horizontal / Vertical
- `beamWidth` (1–15 cells) — how wide the lit region is at any moment
- `motionMode` — Ping-pong (sweeps back and forth) / Scroll (wraps from edge to edge)
- `dimStrength` (0–100%) — how dark out-of-beam cells go. 0% = all cells always visible, just the beam is brighter; 100% = out-of-beam cells are fully black
- Speed controlled by the global animation speed multiplier

**Integration notes:** New `'stripScan'` animation type in the `INLINE_ANIM_TYPES` set. Implemented in `AnimationLayer.jsx` using the existing per-slot inline colour-replacement path. Requires `shapeLibrary` to be loaded (same as noise/gradientSweep/paletteWave). Particularly spectacular combined with image colour mode — the beam sweeps across revealing the photo's colours region by region.

---

### G2. Pixel Sort Animation

A new animation type that continuously sorts the block colours in a configurable direction — lightest to darkest, or by hue — with the sort position advancing each frame. This produces the "data sorting" aesthetic common in glitch art, where columns or rows of the composition visually reorder themselves over time.

**How it works:** On each tick, sample the current brightness or hue of all block slots. Sort the sampled values within each row or column. Assign the sorted colours back to the blocks in their sorted positions, but only within a sliding window of `sortWidth` cells that advances with `phase`. Cells outside the sort window retain their natural colours.

**Key controls:**
- `sortAxis` — Sort rows left-to-right / Sort columns top-to-bottom / Diagonal
- `sortBy` — Brightness / Hue / Saturation
- `sortDirection` — Ascending / Descending / Oscillate (reverses each pass)
- `sortWidth` (1–full grid) — how many cells wide the active sort window is
- Speed via global animation speed

**Integration notes:** New `'pixelSort'` animation type, inline colour-replacement path. The sort is computed purely from the current frame's colour values — no additional state beyond what the animation loop already has. Works best with image colour mode (sorts the sampled photo colours within rows) but produces interesting results with all palette modes.

---

### G3. Live Camera Input

Connect the device's webcam as the image source for image colour mode. The pixel buffer updates from a live video feed each frame, so shape colours continuously update from whatever the camera sees in real time — faces, objects, scenes.

**How it works:** Use `navigator.mediaDevices.getUserMedia({ video: true })` to open a camera stream. Draw each frame to an offscreen canvas (same ≤512px downsampled approach as the static image path) and pass the resulting pixel buffer into the existing `renderImageFrame` pipeline in `shapeLibraryRender.js`. The comments in that file already describe this exact video loop pattern as a planned future capability.

**Key controls:**
- "Use Camera" toggle button in the Image colour mode section (replaces the image upload when active)
- `cameraDevice` — dropdown of available cameras (populated from `enumerateDevices`)
- `mirrorCamera` — horizontally flip the input (natural for front-facing cameras)
- `freezeFrame` — pause the live input and treat the current frame as a static image
- The existing `imageColourTolerance` slider continues to work

**Integration notes:** In Tauri, camera access requires adding `camera` permission to `tauri.conf.json` capabilities. The `getUserMedia` approach works natively in Tauri's Chromium runtime. The video-to-pixel pipeline replaces the `img.onload` path in the image processing effect — instead of `setImagePixels` running once on upload, it runs on every rAF tick. This is already architecturally anticipated in `shapeLibraryRender.js`.

---

## Category H — Composition & Rendering

### H1. Block Rotation

Allow individual placed shapes to be rotated in 90° increments, dramatically expanding the compositional possibilities of the existing shape library without adding a single new SVG. A triangle that only pointed up-right now also points up-left, down-right, and down-left — effectively quadrupling the visual variety from the same assets.

**How it works:** Add a `rotation` property (0 / 90 / 180 / 270) to the `PlacedBlock` data shape. In `PlacedBlocks`, apply a CSS `transform: rotate(Ndeg)` or SVG `transform="rotate(N, cx, cy)"` to the block's `<g>` element, rotating around the cell centre. The rotation is baked into the export SVG via an updated `buildFlatSvgElement`.

**Key controls:**
- Right-click context menu: "Rotate 90° CW" / "Rotate 90° CCW" / "Rotate 180°" per block
- Selection toolbar: rotate all selected blocks together
- Global fill option: `randomRotation` toggle — when enabled, Fill Grid/Gaps assigns a random rotation from {0, 90, 180, 270} to each placed block
- `rotationFreq` (0–100%) — what percentage of blocks receive a non-zero rotation when `randomRotation` is on

**Integration notes:** `rotation` is stored per block in state and in project save. It costs no SVG assets and no new rendering infrastructure — just a transform attribute. Particularly impactful for directional shapes (arrows, chevrons, triangles) and creates more organic-feeling full-fills even from small asset sets.

---

### H2. Colour Temperature Shift

A global post-processing colour filter that shifts all currently placed block colours toward warm or cool tones without changing the palette or colour mode. Acts as a final "grade" on the composition — like a photo colour temperature slider applied to the grid.

**How it works:** For each block, after the normal colour is computed, apply a linear blend toward a warm target (orange/amber, e.g. `#FF9500`) or cool target (blue/cyan, e.g. `#0099FF`) by a configurable amount. Applied as a live in-memory transform on the effective palette before it's passed to `colorizeSvg` — not a permanent change to the saved palette.

**Key controls:**
- `temperatureShift` (-100 to +100) — negative = cool, positive = warm, 0 = off
- `tintStrength` (0–100%) — how much the temperature affects the original colours (blending factor)
- `affectDark` / `affectLight` toggles — apply the shift only to darker or lighter colours, leaving the opposite end of the tonal range neutral
- A live preview slider (no confirm button needed — updates in real time as the slider moves)

**Integration notes:** Applied as a transform on `activePalette` before it reaches `PlacedBlocks` — a `useMemo` that blends each palette colour toward the warm/cool target by `tintStrength * |temperatureShift| / 100`. Requires no changes to the colourisation engine. Saved as `temperatureSettings` in project state.

---

## Category I — Workflow

### I1. Fill Snapshot Variations

Store up to 6 named fill results as quick-access snapshots. Users can switch between them instantly to compare — useful when iterating on glitch settings, trying different density thresholds, or A/B testing two colour palettes on the same layout.

**How it works:** After any fill operation, a "Save Snapshot" button (or auto-save prompt) captures the current `placedBlocks` array, `colorMode`, `paletteKey`, and all relevant settings into a named slot. Snapshots appear as small thumbnail previews in a horizontal strip at the bottom of the canvas. Clicking a snapshot instantly swaps `placedBlocks` to that state — it does *not* push to undo history (so Ctrl+Z doesn't cycle through snapshots). A "Restore as current" action promotes a snapshot back into the undo stack.

**Key controls:**
- Up to 6 snapshot slots (named automatically as "Snap 1", "Snap 2", etc. — user can rename)
- Each slot shows: tiny SVG thumbnail, name, fill method used, timestamp
- Swap between snapshots with a single click; current canvas state is held in a temporary "working" slot
- "Clear snapshot" to free a slot
- Snapshots are not saved in project files (session-only) to avoid bloating the JSON

**Integration notes:** Snapshot state lives in `App.jsx` as a `snapshots` array (max 6). Each entry is a compressed `placedBlocks` snapshot using the same SVG-stripping compression from `useHistory`. The thumbnail is generated via `buildFlatSvgElement` at 200×200. The snapshot strip UI is a fixed-position element at the canvas bottom, visible only when snapshots exist.

---

### I2. Composition Rules / Safe Zone Overlay

Overlay configurable compositional guides on the canvas — rule of thirds grid, golden ratio divisions, centre cross, safe zones, or custom guide lines — to help align fill results with classical composition principles. Particularly useful when working toward the parrot-style aesthetic where the strip placement relative to the subject matters a lot.

**How it works:** Render an SVG overlay layer (above everything, below the selection UI) containing thin guide lines and/or semi-transparent zone fills. Guides are defined in normalised canvas coordinates and scale with the work area. The overlay is cosmetic only — never exported.

**Guide types available:**
- Rule of thirds (3×3 grid of lines)
- Golden ratio divisions (horizontal and/or vertical)
- Centre cross (vertical + horizontal midline)
- Safe zone rectangle (user-defined inset percentage — standard print safe area)
- Custom guides (user clicks to add horizontal or vertical lines at any position)
- Phi grid (golden rectangle subdivisions)

**Key controls:**
- `showGuides` toggle (also mapped to keyboard shortcut `G`)
- `guideType` — multi-select of which guide types are shown simultaneously
- `guideColour` and `guideOpacity` — customise guide visibility
- `snapToGuides` — optional: when Painter Tool is active, align strip fill positions to the nearest guide

**Integration notes:** Pure SVG overlay — a `<g data-overlay="true">` sibling of the density map overlay. Uses the same exclusion mechanism from export. Normalised coordinates mean the guides are correctly positioned regardless of work area preset. Custom guides are stored in `guideSettings` in project state.


---

## Category J — Round 4 Features

### J1. Audio Reactive Mode

Connect a microphone or audio file as a live input source. The animation system reads amplitude and frequency spectrum each frame, mapping them to animation parameters — amplitude drives global speed, frequency bands drive palette colours or temperature, and beat detection triggers flicker bursts or snap-to-new-fill events. Makes Grid Builder usable as a live music visualiser or performance tool.

**Key controls:**
- `inputSource` — Microphone / Audio file upload
- `ampMapping` — how amplitude maps to speed (linear / logarithmic / exponential curve)
- `freqBands` — assign specific frequency ranges to palette colour slots, temperature shift, or animation density
- `beatSensitivity` (0–1) — threshold for what counts as a beat; each beat event triggers a configurable action (flicker burst / fill refresh / palette shift)
- `bypass` — freezes the last driven state when audio pauses, so the animation doesn't snap to silence
- `visualiser` — optional small frequency spectrum overlay in the corner of the canvas (in-app only, not exported)

**Integration notes:** Uses `AudioContext` + `AnalyserNode` — fully supported in Tauri's Chromium runtime. Audio permission required in `tauri.conf.json`. The rAF loop in `AnimationLayer.jsx` reads from a shared `audioDataRef` populated by a separate audio analysis effect in `App.jsx`. Mic access is separate from camera (G3) but follows the same permission pattern.

---

### J2. QR Code Fill

Enter a URL or short text; generate a QR code; map its dark/light cell pattern onto the grid so shapes replace the dark squares. The result is a decorative, artwork-quality QR code that scans. Particularly powerful combined with image colour mode (shapes take the photo's colours) or tiling export (QR patterns tile as repeating art).

**How it works:** Compute the QR matrix using a pure-JS library (e.g. `qrcode-generator`, ~12KB, MIT licensed). The matrix is a 2D boolean grid of dark/light cells. Scale it to fit the current grid dimensions and map dark cells to the fill allow-list. Run the bin packer against that list.

**Key controls:**
- `qrContent` — text/URL input
- `errorCorrection` — L / M / Q / H (higher = more redundancy = survives more artistic distortion while still scanning)
- `quietZone` — honour the standard quiet border (recommended) or allow shapes right to the edge
- `cellScale` — how many grid cells one QR module maps to (1 = one shape per module; 2 = each module is a 2×2 block)
- A live "Test scan" button that shows whether the current fill would scan correctly

**Integration notes:** The QR matrix computation is pure JS — no native dependencies. The cell-scale mapping reuses the same allow-list bin-packing path as all other mask fills. Higher `maxScale` settings in Grid Settings will break QR readability — show a warning if `maxScale > 1` is active.

---

### J3. Multi-Layer Canvas

Stack 2–4 independent grid layers, each with its own colour mode, fill method, blend mode, and opacity. Export flattens all visible layers into a single SVG. Enables compositions currently impossible in a single pass — a noise field on layer 1, a strip fill with image colour on layer 2, a geometric pattern in a different palette on layer 3.

**How it works:** Each layer is an independent `{ id, placedBlocks, colorMode, paletteKey, shapeColors, bgColors, blendMode, opacity, visible, locked }` record. Rendering iterates layers bottom-to-top, each as a separate `<g>` element with its own blend mode. The sidebar shows a small layer panel (reorderable drag list). The active layer receives all fill and editing operations.

**Key controls:**
- Add / duplicate / delete layer buttons
- Per-layer: visible toggle, lock toggle (prevents editing), opacity slider, blend mode dropdown, colour mode selector
- Layer reorder via drag
- "Merge down" — flatten the active layer into the one below it
- "Solo" — temporarily hide all other layers

**Integration notes:** `layers` array replaces the current flat `placedBlocks` state in `App.jsx`. The active layer index determines which `placedBlocks` array receives fill/selection/edit operations. Undo/redo operates per-layer. Export (`buildFlatSvgElement`) iterates all visible layers. This is the most architecturally significant feature in the list — worth a significant refactor of App.jsx state shape.

---

### J4. Freehand Path Mask Fill

Draw a freehand region directly on the canvas and use the drawn outline as the fill mask — shapes populate only inside it. The natural evolution of Text Mask Fill, but user-drawn rather than type-set. Draw a rough bird silhouette, a speech bubble, a crescent — any closed shape becomes a fill region.

**How it works:** A dedicated "Draw Mask" mode captures pointer events as a path on an overlay canvas. On close (right-click or double-click), the path is rasterised using `CanvasRenderingContext2D.fill()` to a pixel mask the same dimensions as the work area. Grid cells whose centre pixel is filled are marked active. The bin packer runs against that allow-list.

**Key controls:**
- `drawMode` — Freehand (trace with mouse/pen) / Click-to-place bezier points
- `smoothing` (0–1) — amount of Chaikin curve smoothing applied to the raw path before rasterisation
- `fillRule` — non-zero / even-odd (even-odd enables shapes with holes by drawing an inner and outer path)
- Clear / undo last point buttons
- The drawn path persists in `pathMaskSettings` and can be re-triggered without re-drawing (edit the path, not just its fill result)

**Integration notes:** The overlay drawing canvas sits above the main SVG canvas and below the selection UI. The path data (array of points) is stored separately from the rasterised mask — edits to the path re-rasterise on demand. Bezier mode uses the same quadratic bezier approach as SVG `Q` commands.

---

### J5. Fill Transition Animation

A new animation type that cross-fades the grid between two stored fill states — the current layout and a Snapshot Variations slot. Each block slowly dissolves between its "from" and "to" colour; blocks present in one state but not the other fade in or out. A cinematic drift between two compositions, on a loop.

**How it works:** Uses the inline colour-replacement animation path. On each tick, `phase` (0→1→0) is used to interpolate per-slot colour values between `stateA` and `stateB`. For cells present in one state but not the other, opacity is interpolated toward transparent (or toward the canvas background colour for non-transparent contexts). The interpolation is done in RGB space per colour slot.

**Key controls:**
- `stateA` — "current canvas" or any Snapshot slot
- `stateB` — any different Snapshot slot
- `cycleDuration` (2–60 seconds per half-cycle)
- `easing` — Linear / Ease-in-out / Step (step produces a hard crosscut rather than a dissolve)
- `motionMode` — Ping-pong (A→B→A) / One-way loop (A→B, then snaps back to A)
- `matchStrategy` — how cells are paired between states: by grid position (default) / by shape type (matching shapes fade into each other regardless of position)

**Integration notes:** New `'fillTransition'` animation type. Requires `shapeLibrary` to be loaded. The two state colour arrays are pre-computed at animation start and stored in refs — the rAF loop only does the interpolation arithmetic, which is fast.

---

### J6. Voronoi Region Fill

Place seed points on the canvas; the grid is partitioned into Voronoi regions where each cell belongs to its nearest seed. Each region gets its own shape subset and/or colour palette offset, creating an organic territorial structure with no visible grid lines — regions emerge from proximity, not geometry.

**How it works:** Given N seed points (in normalised canvas coordinates), for each grid cell compute the Euclidean distance to each seed and assign it to the nearest. Group cells by their assigned seed. Run the bin packer within each group independently. Each region receives an index that maps to a colour offset in the active palette.

**Key controls:**
- `numSeeds` (3–30)
- Seed placement mode — Manual (click canvas to place) / Random (seeded) / Image-guided (seeds placed at local brightness peaks of the loaded image)
- `regionColourMode` — Offset (each region shifts along the palette by its index) / Independent (each region has its own randomly-chosen palette subset) / Unified (all regions share the same colour mode, only shapes differ)
- `regionShapeMode` — Shared (all regions draw from all enabled assets) / Exclusive (each region gets a randomly assigned exclusive subset, so different areas use different shape families)
- `seed` — for random placement and subset assignment

**Integration notes:** Voronoi computation for N≤30 seeds over a ≤60×80 grid is O(cells × seeds) — fully synchronous. Lives in `src/utils/voronoiFill.js`. Seeds rendered as small draggable handles on the canvas overlay, same approach as gradient centre and focal point handles.

---

### J7. Per-Block Opacity

Add an `opacity` property to `PlacedBlock`, applied as SVG `opacity` on the block's `<g>` element. Three assignment modes: manual (set via context menu), jitter (random within a min–max range on fill), and image-driven (opacity proportional to image luminance at the block's position).

**Modes in detail:**
- **Manual** — context menu slider sets opacity for a single block; selection toolbar sets it for all selected blocks together
- **Jitter** — during Fill Grid/Gaps, each block's opacity is drawn from `[minOpacity, maxOpacity]` using the block's existing `colorSeed`. Controls: min, max, and a "curve" (flat / bell / inverted bell — controls whether mid-range opacities are more/less common)
- **Image-driven** — opacity = normalised luminance of the block's image sample. Controls: direction (bright=opaque/dark=opaque), gamma correction, range clamp

**Key controls (per-block context menu):** Opacity slider (0–100%), "Match image" shortcut, "Randomise" shortcut.
**Key controls (global in sidebar):** `opacityMode` toggle, jitter min/max sliders, image-driven direction toggle.

**Integration notes:** `opacity` stored per block in state and project save. Defaults to 1 (fully opaque) — backward compatible. Interacts with blend modes (C3): opacity + blend mode combined creates painterly layering effects. Exported correctly via `buildFlatSvgElement`.

---

### J8. Batch Export

Define a named list of export targets and run them all in one click. Eliminates the repetitive format-switching for users who routinely need SVG + PNG@300dpi + animated GIF from every project.

**How it works:** A "Export Targets" panel (in the Actions section or a dedicated modal) shows a list of named export configurations. Each entry specifies: format (SVG/PNG/JPEG/GIF/MP4), resolution, composite mode (shapes only / over photo), JPEG quality if applicable, and a filename suffix. Clicking "Export All" runs each target in sequence, writing each file to the same folder via Tauri save dialog (first run) or the last-used folder (subsequent runs). A progress indicator shows current target and overall progress.

**Key controls:**
- Add / edit / delete / reorder export targets
- Per-target: format, resolution, composite mode, quality, filename suffix
- "Export All" button with progress indicator
- "Export selected" checkbox per target for partial runs
- "Save as preset" — save the current target list as a named export preset, reusable across projects
- Optional: zip all outputs for a single download

**Integration notes:** Export targets stored in `exportTargets` in project save state. Each target calls the same `handleExport`, `handleRasterExport`, or `handleAnimatedExport` functions that individual exports already use. The sequential execution uses `async/await` with a `for...of` loop — no parallelism needed.

---

### J9. Gradient Mesh Colour Mode

A new colour mode with multiple draggable control points on the canvas, each with its own colour. Each cell's colour is computed as the inverse-distance weighted average of all points. Produces complex, multi-directional colour transitions impossible with linear or radial gradients — a three-point mesh gives a triangular gradient, six points can produce swirling, almost painterly colour movement.

**How it works:** Each control point has position `(x, y)` in normalised canvas coordinates and a colour `hex`. For each grid cell, compute the weight for each control point as `w_i = 1 / distance_i^power`. The cell colour is `sum(w_i * colour_i) / sum(w_i)` computed in linear RGB space. With `power = 2` this is standard IDW; higher values create harder territory boundaries.

**Key controls:**
- Click canvas to add control points (rendered as draggable colour-picker handles)
- Per-point: colour picker, delete button
- `weightPower` (0.5–6) — low = smooth, uniform blends; high = hard colour territories centred on each point
- `backgroundPoints` — a separate, lower-weight set of control points for the background layer of dual-layer shapes
- "Convert from gradient" — auto-creates two or three mesh points matching the current linear/radial gradient settings
- `seed` jitter — adds small random per-block perturbation to prevent colour banding at low point counts

**Integration notes:** New `colorMode = 'mesh'` value. `gradientMeshPoints` array stored in state and project save. The IDW computation per cell is O(cells × points) — fast enough synchronously for ≤30 points and ≤60×80 grids. Mesh point handles use the same draggable overlay infrastructure as gradient centre handles.

---

### J10. Grid Subdivision

Different areas of the canvas use different cell resolutions — a coarse 6-column zone for bold background shapes and a fine 24-column zone for detailed foreground elements, coexisting in the same work area. Foreground/background separation through scale alone, without colour or opacity doing the work.

**How it works:** The user defines rectangular sub-grid zones by dragging on the canvas. Each zone has its own column count (and therefore its own `computeGrid` result). The main `placedBlocks` array stores which zone each block belongs to. Zones that don't cover the whole canvas fall back to the global grid settings. Zones can overlap — the topmost zone wins.

**Key controls:**
- "Add zone" button: draws a rectangle on the canvas, then prompts for column count
- Per-zone: column count stepper, delete button, resize handles
- `zoneColour` (in-app only, cosmetic tint to distinguish zones while editing)
- Zones respect all existing fill methods — Fill Grid populates all zones, each with its own geometry
- `inheritColourMode` — whether each zone uses the global colour mode or has an independent one

**Integration notes:** The most architecturally involved feature in Round 4. `zones` is a new array in App.jsx state alongside `gridSettings`. `computeGrid` is called once per zone. `PlacedBlocks` renders each zone's blocks using its zone-specific `gridComputed`. `buildFlatSvgElement` iterates zones during export. Undo/redo covers zone changes as well as block changes.

---

| J1 | Audio Reactive Mode | Animation | No | Mic/audio drives animation parameters |
| J2 | QR Code Fill | Fill | No | Shapes replace QR dark cells |
| J3 | Multi-Layer Canvas | Architecture | No | Stacked independent grid layers |
| J4 | Freehand Path Mask Fill | Fill | No | User-drawn region as fill mask |
| J5 | Fill Transition Animation | Animation | No | Cross-fade between two fill states |
| J6 | Voronoi Region Fill | Fill | Optional | Seed-point territorial partitioning |
| J7 | Per-Block Opacity | Per-block | Optional | Manual/jitter/image-driven opacity |
| J8 | Batch Export | Export | No | Multiple formats in one action |
| J9 | Gradient Mesh Colour Mode | Colour | No | Multi-point IDW colour blending |
| J10 | Grid Subdivision | Architecture | No | Mixed cell resolution zones |
