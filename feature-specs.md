# Grid Builder — Feature Specifications

## Clarification: What is "screen-tear glitch"?

Screen tearing is when a display renders two frames simultaneously, creating a visible horizontal split. In glitch art this is stylised into a pattern where the image is sliced into horizontal (and/or vertical) bands, and some of those bands are shifted sideways (or up/down) from their original position — as if a corrupted signal randomly displaced chunks of the signal mid-transmission. The effect looks like pieces of the image have "slid" left or right, leaving gaps where they were and overlapping where they landed. Classic examples have thin, closely-spaced scan-line offsets at one extreme, and wide torn chunks at the other.

In Grid Builder's version, the image itself doesn't visually render — the *grid occupancy map* is what gets glitched. Only the grid cells that fall inside displaced bar regions receive shapes; everything else is left empty, so the underlying image (set via the existing Image colour mode) shows through unobstructed in the untouched areas.

---

## Feature 1 — Glitch Fill

### Summary

A new fill method that analyses a reference image and places shapes only in the cells that correspond to "screen-tear" displaced bar regions. The bars are horizontal and/or vertical slices of the grid; a random subset of them are offset by a computed displacement amount. The result is a grid that looks as if it has been corrupted — clusters of shapes appear in jagged horizontal and vertical bands across an otherwise empty canvas.

### Core Concept

1. Divide the grid into a set of horizontal **scan bands** and/or vertical **scan columns** — conceptually the same as the lines a CRT scans.
2. For each band, decide (using a seeded RNG) whether it is **displaced** (glitched) or **stable** (untouched).
3. For displaced bands, compute an **offset** — the number of cells the band has shifted along its axis (e.g., a horizontal band shifts left or right by N columns).
4. Mark every grid cell that the displaced band now covers in its new position as **active**.
5. Run the bin packer against only the active cells (passing them as an allow-list into a modified `fillGrid`).
6. Leave all non-active cells empty.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|--------|---------|-------------|
| `hBars` | integer | 0–60 | 12 | Number of horizontal scan bands to divide the grid into. More bars = finer, denser scan lines. 0 disables horizontal glitching entirely. |
| `vBars` | integer | 0–60 | 0 | Number of vertical scan columns to divide the grid into. Combine with hBars for a grid-tear effect. |
| `force` | float | 0–1 | 0.35 | Maximum displacement distance as a fraction of the total grid width (for H bars) or height (for V bars). A force of 0.3 on a 20-column grid means bars can shift up to 6 cells. Higher force = more dramatic, wider displaced bands reaching further across the canvas. |
| `activeRatio` | float | 0–1 | 0.4 | Probability that any given bar is displaced (glitched) rather than left in place. 0 = nothing glitches; 1 = every bar is displaced. Low values produce a sparse, surgical glitch; high values produce a chaotic, heavily corrupted look. |
| `barSizeVariance` | float | 0–1 | 0.5 | Controls whether bars are uniform thickness or vary in height/width. 0 = all bars are exactly `gridRows / hBars` cells tall; 1 = each bar's thickness is drawn from a random distribution (some bars are 1 cell, some are 5), simulating the irregular scan-line corruption of real glitch artefacts. |
| `direction` | enum | `h`, `v`, `both` | `h` | Which axes are glitched. `h` = horizontal bars shift sideways; `v` = vertical columns shift up/down; `both` = independent passes on each axis, their active cells are unioned. |
| `bidirectional` | boolean | — | true | If true, each displaced bar can shift in either direction along its axis (some go left, some go right, drawn from the RNG). If false, all bars shift in the same direction (positive only), creating a unidirectional "data corruption" feel. |
| `seed` | integer | 0–2³¹ | random | Seed for the RNG that drives bar thickness, active/stable decisions, and displacement amounts. Same seed + same parameters always produces the same glitch pattern. A **Randomise** button picks a new seed without changing any other setting. |
| `minDisplacement` | integer | 1–10 | 1 | Minimum number of cells a displaced bar must shift. Prevents bars being displaced by a sub-cell amount that has no visible effect on the grid. |
| `maxScale` | integer | 1–4 | inherits global | Maximum block size (in cells) used by the bin packer within glitch-active cells. Allows the glitch fill to use different scale behaviour than the global grid setting — e.g., larger blocks to read as chunky corrupted tiles. |
| `scaleFreq` | integer | 0–100 | inherits global | Scale frequency specifically for this fill. Works identically to the global scaleFreq but scoped to glitch fill. |

### Algorithm Detail

```
function computeGlitchMask(gridComputed, settings):
  { cols, rows } = gridComputed
  { hBars, vBars, force, activeRatio, barSizeVariance, bidirectional, seed, minDisplacement } = settings
  rng = seededRandom(seed)
  activeCells = new Set()   // Set of "col,row" strings

  // ── Horizontal pass ──────────────────────────────────────────────
  if direction includes 'h' and hBars > 0:
    bands = generateBands(rows, hBars, barSizeVariance, rng)
    // bands = array of { startRow, endRow } — may be unequal heights if variance > 0
    for each band:
      if rng() > activeRatio: continue   // stable band, skip
      maxShift = max(minDisplacement, floor(cols * force))
      shift = minDisplacement + floor(rng() * (maxShift - minDisplacement + 1))
      if bidirectional and rng() > 0.5: shift = -shift
      for r = band.startRow to band.endRow:
        for c = 0 to cols-1:
          destCol = c + shift
          if destCol >= 0 and destCol < cols:
            activeCells.add(`${destCol},${r}`)

  // ── Vertical pass (symmetric, operates on columns) ───────────────
  if direction includes 'v' and vBars > 0:
    [symmetric logic on cols/rows axes]

  return activeCells   // only these cells will be populated
```

`generateBands` splits the row/column range into `barCount` segments. With `barSizeVariance = 0` each segment is exactly `total / barCount` cells. With higher variance, segment heights are drawn from a uniform distribution then normalised to sum to `total`, simulating the uneven scan-line corruption seen in real glitch artefacts.

The resulting `activeCells` set is passed into a modified `fillGrid` (or a new `fillGlitch` utility) that skips any anchor cell not in the set and never marks non-set cells as occupied during spread (so multi-cell blocks can only grow into other active cells).

### Integration Points

- Lives alongside `fillGrid` / `fillGaps` in `src/utils/binPack.js` as a new exported `fillGlitch(assets, gridComputed, activeCells, maxScale, scaleFreq)` function.
- `computeGlitchMask` is a pure function in a new `src/utils/glitchFill.js` utility file.
- New `glitchSettings` state in `App.jsx` (analogous to `gradientSettings`).
- New "Glitch Fill" button in FloatingPanel → Actions section, enabled when an image is loaded, assets are enabled, and `gridComputed` is valid.
- The glitch settings panel appears inside a collapsible sub-section of Actions (or a dedicated "Glitch" section), only visible when the image colour mode is active (since the visual effect relies on sampling the image at displaced positions).
- The existing **Image** colour mode should be active for the result to be visually meaningful — when the user triggers Glitch Fill, if colour mode is not `image`, show an inline notice: *"Glitch Fill works best with Image colour mode active."* Still run the fill regardless.
- Seed has a small **⟳ Randomise** icon button next to it.
- Re-running Glitch Fill (with the same seed) produces an identical result — this is important for iterative tweaking.

### UI Layout (FloatingPanel)

```
▼ Actions
  [Fill Grid]  [Fill Gaps]  [Glitch Fill]

▼ Glitch Settings               (visible only when Glitch Fill was last used / toggle)
  Direction:   [H]  [V]  [Both]
  H Bars:      ━━━━●━━━  12
  V Bars:      ●━━━━━━━   0
  Force:       ━━━●━━━━  35%
  Active ratio:━━●━━━━━  40%
  Bar variance:━━━●━━━━  50%
  Min shift:   [stepper]  1
  Bidirectional: [toggle] On
  Max scale:   [1×][2×][3×][4×]
  Scale freq:  ━━━━●━━━  50%
  Seed:        [123456789] [⟳]
```

### Edge Cases

- If `activeCells` is empty after the mask computation (e.g., `activeRatio` is 0 or all displaced bars fell outside the grid bounds after shifting), show a brief toast: *"No glitch cells generated — try increasing Force or Active Ratio."*
- If `force` is so high that displaced bars extend beyond the grid boundary, those out-of-bounds cells are simply skipped (clipped to grid bounds).
- Multi-cell blocks (maxScale > 1) must have their entire footprint within `activeCells`. The packer should not allow a block to "grow" into a non-active neighbour.

---

## Feature 2 — Density Fill

### Summary

A new fill method that analyses a reference image and places shapes only in grid cells that correspond to areas of high visual complexity — regions with lots of detail, contrast, edges, or colour variety. The result is a grid that "traces" the interesting parts of an image, leaving flat/empty areas of the image unpopulated. Unlike Glitch Fill (which is spatially shifted), Density Fill is positionally faithful — shapes appear directly where the image is most detailed.

### Core Concept

1. For each grid cell, compute a **density score** by analysing the pixels that fall within that cell's bounding box on the image.
2. Build a **density map** — a 2D grid of scores (one per cell), normalised 0–1.
3. Optionally **smooth** the density map (Gaussian blur equivalent applied to cell scores) to produce organic region boundaries rather than jagged per-cell decisions.
4. Apply an **intensity threshold**: cells scoring above the threshold are **active**, the rest are left empty.
5. Optionally enforce a **minimum blob size** — connected regions of active cells smaller than N cells are discarded (removes single-cell noise).
6. Run the bin packer against only the active cells.

### Density Score Computation

Three modes, user-selectable:

| Mode | What is measured | Good for |
|------|-----------------|----------|
| **Contrast** | Luminance standard deviation within the cell's pixel region | High-contrast edges, black-and-white photography, architectural images |
| **Colour complexity** | Mean Euclidean colour variance across R, G, B channels within the cell | Colourful, saturated images with varied hues |
| **Combined** (default) | Weighted average of luminance variance and colour variance (0.6 luminance + 0.4 colour) | General purpose; works well on most photographs |

Each mode produces a score in [0, 1] per cell.

**Luminance variance** per cell:
```
pixels = all pixels in the cell's bounding box (from imagePixels buffer)
L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i]   // ITU-R luma
mean_L = average(L)
variance = average((L[i] - mean_L)²)
score = min(1, sqrt(variance) / 128)   // normalise; 128 = half of 255
```

**Colour variance** per cell:
```
mean_R, mean_G, mean_B = channel averages
variance = average( (R[i]-mean_R)² + (G[i]-mean_G)² + (B[i]-mean_B)² )
score = min(1, sqrt(variance / 3) / 128)
```

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|--------|---------|-------------|
| `intensity` | float | 0–1 | 0.5 | The density threshold. Only cells with a score ≥ intensity are populated. 0 = fill everything (ignores density); 1 = only the single most dense cell qualifies. Acts as an inverse coverage control: low intensity = lots of shapes, high intensity = shapes only in the most complex parts. |
| `detectionMode` | enum | `contrast`, `colour`, `combined` | `combined` | Which density metric to use (see above). |
| `smoothing` | float | 0–1 | 0.3 | Controls a blur pass applied to the raw per-cell density scores before thresholding. 0 = no smoothing (sharp, cell-accurate placement); 1 = heavy blur (large, organic blobs that encompass the neighbourhood of dense regions). Implemented as a box blur with radius = `round(smoothing * 3)` cells. |
| `minBlobSize` | integer | 1–20 | 3 | Minimum number of connected active cells required to keep a region. Regions smaller than this are discarded. Prevents single isolated cells from being populated in otherwise empty areas. Set to 1 to disable. |
| `maxScale` | integer | 1–4 | 2 | Maximum block size (cells) for the bin packer within density-active regions. Independent from the global maxScale so density fill can use bigger blocks than the rest of the grid. Larger values make dense areas "chunkier" and more readable. |
| `scaleFreq` | integer | 0–100 | 60 | How often the packer prefers larger blocks over 1×1. Higher = denser coverage with larger shapes in complex areas. |
| `scaleBias` | enum | `dense`, `uniform` | `dense` | `dense` — larger blocks preferentially anchor in the highest-scoring active cells within a region; `uniform` — scale is assigned randomly as per normal bin-packing. Makes high-detail areas feel "heavier". |
| `seed` | integer | 0–2³¹ | random | RNG seed for shape selection and placement order. Same seed = reproducible result. **⟳ Randomise** button. |
| `showDensityMap` | boolean | — | false | Toggles a semi-transparent heat-map overlay on the canvas showing the computed (and smoothed) density scores — red = high density, transparent = low. Useful for understanding why certain areas were chosen. Overlay is rendered on top of the grid and does not affect export. |

### Algorithm Detail

```
function computeDensityMask(imagePixels, gridComputed, settings):
  { intensity, detectionMode, smoothing, minBlobSize } = settings
  { cols, rows, cellSize, gridOriginX, gridOriginY } = gridComputed
  { data, width: iW, height: iH, scaleX, scaleY } = imagePixels

  // Step 1: Raw density score per cell
  scores[rows][cols] = 0
  for r = 0 to rows-1:
    for c = 0 to cols-1:
      cellPixels = sampleCellPixels(c, r, gridComputed, imagePixels)
      scores[r][c] = computeScore(cellPixels, detectionMode)

  // Step 2: Optional smoothing (box blur on the scores grid)
  if smoothing > 0:
    radius = round(smoothing * 3)   // 0–3 cell radius
    scores = boxBlur2D(scores, radius)

  // Step 3: Threshold
  activeCells = new Set()
  for r, c:
    if scores[r][c] >= intensity:
      activeCells.add(`${c},${r}`)

  // Step 4: Minimum blob size filter (flood-fill connected components)
  if minBlobSize > 1:
    components = findConnectedComponents(activeCells, cols, rows)
    for each component:
      if component.size < minBlobSize:
        remove all cells in component from activeCells

  return { activeCells, scoresGrid: scores }   // scoresGrid used by heat-map overlay
```

`sampleCellPixels` maps a grid cell's canvas bounding box back to pixel coordinates in the (already-downsampled) imagePixels buffer using the same letterbox geometry as `shapeLibraryRender.js`. This reuses existing coordinate math.

### Scale Bias Implementation

When `scaleBias = 'dense'`, before running the bin packer, sort the active cells by their density score descending. Pass this sorted order as the scan sequence to `fillGrid` (instead of the normal row-major top-left→bottom-right order). The bin packer's greedy strategy then anchors larger blocks first in the highest-scoring cells, naturally placing the largest shapes in the most visually complex parts of the image.

### Integration Points

- New `computeDensityMask` function in a new `src/utils/densityFill.js` file.
- New `fillDensity(assets, gridComputed, activeCells, sortedCells, maxScale, scaleFreq, scaleBias)` in `src/utils/binPack.js` (thin wrapper over the existing packer with a custom scan order and allow-list).
- New `densitySettings` state in `App.jsx`.
- New **Density Fill** button in FloatingPanel → Actions section, enabled when an image is loaded, assets are enabled, and `gridComputed` is valid.
- The density map overlay (`showDensityMap`) is rendered as a separate `<g>` layer inside the SVG canvas, above `PlacedBlocks` but below the selection highlights. Each cell that has a density score renders a `<rect>` with `fill="red"` and `opacity = score * 0.6`. The overlay only shows in-app; it is excluded from SVG export.
- The computation should be done synchronously (it's O(cols × rows × pixelsPerCell) — for a 512px downsampled image and a 20×28 grid, this is fast enough). If a future stress test shows lag, defer to a `useEffect` + `useState` pattern (same as `imageColourRemap` already does).
- No new Web Worker needed at current grid sizes. Add a `// TODO: worker` comment noting it may be needed for grids above 60 columns.

### UI Layout (FloatingPanel)

```
▼ Actions
  [Fill Grid]  [Fill Gaps]  [Density Fill]  [Glitch Fill]

▼ Density Settings              (collapsible, shown when image is loaded)
  Detection:   [Contrast] [Colour] [Combined✓]
  Intensity:   ━━━━●━━━━  50%
  Smoothing:   ━━●━━━━━━  30%
  Min region:  [stepper]  3 cells
  Max scale:   [1×][2×✓][3×][4×]
  Scale freq:  ━━━━━●━━━  60%
  Scale bias:  [Dense✓]  [Uniform]
  Seed:        [987654321] [⟳]
  Show density map: [toggle] Off
```

### Edge Cases

- If the image hasn't been loaded/processed yet (`imagePixels` is null), the Density Fill button is disabled with tooltip: *"Load an image to use Density Fill."*
- If after thresholding and blob filtering `activeCells` is empty, show a toast: *"No dense regions found — try lowering Intensity."*
- If the entire canvas qualifies (all cells exceed threshold), Density Fill behaves identically to Fill Grid — no special handling needed.
- The density map overlay should be excluded from the `handleExport` SVG build (it must not appear in the exported file). Mark the overlay `<g>` with a `data-overlay="true"` attribute and filter it out in `buildFlatSvgElement`.
- `showDensityMap` should automatically turn off if the user switches away from Image colour mode (since the overlay would be meaningless without the image reference).

---

## Shared Considerations for Both Features

### Image Dependency

Both features require `imagePixels` to be populated (i.e., an image must be loaded and processed). Both buttons should be disabled — and show a tooltip explaining why — when no image is available. Consider grouping them visually in the UI under an "Image-driven fill" sub-heading within the Actions section.

### Colour Mode Recommendation

Both features produce their most useful visual results when the Image colour mode is active, since the placed shapes then sample colours from the corresponding image position. However, neither feature should *force* the colour mode to change — the user's current palette mode is respected. The panel should display a soft inline hint *"Image colour mode recommended"* when either fill is triggered with a non-image colour mode active.

### Interaction with Undo/Redo

Both fills replace `placedBlocks` entirely (they are not incremental like Fill Gaps). The result should be pushed onto the undo stack exactly like Fill Grid is today. One undo step returns to the state before the fill was run.

### Interaction with Auto-fill

Auto-fill (the toggle that re-runs the fill on grid change) should **not** automatically re-trigger Glitch Fill or Density Fill — these are intentional, parameter-driven operations. Auto-fill remains exclusive to standard Fill Grid.

### Project Save / Load

`glitchSettings` and `densitySettings` should be added to the project save state (version bump to `2`), allowing users to reload a project and re-run either fill with the same parameters. The `seed` is saved, so the fill is exactly reproducible.

### Naming Conventions

Follow the existing codebase patterns:
- Settings objects: `glitchSettings` / `densitySettings` in App.jsx state
- Handler: `handleGlitchFill` / `handleDensityFill` in App.jsx
- Utility files: `src/utils/glitchFill.js` / `src/utils/densityFill.js`
- Settings panel props follow the `onGradientSettingsChange` pattern: `glitchSettings`, `onGlitchSettingsChange`, `densitySettings`, `onDensitySettingsChange`
