# Roadmap candidates

Compiled 2026-10-21. This is a long list on purpose so it can be cut down.
Nothing here is committed to.

**Sources**
- **Backlog**: `all-features.md` items not yet built
- **Ideas**: `ideas.md`, collected during the workspace refactor
- **Perf**: `updates.md`
- **VC**: VectorCraft (github.com/storytold/vectorcraft)
- **EC**: EffectCraft, the ArtCraft motion graphics app
- **AC**: the wider ArtCraft suite (getartcraft.com): AI compositing, shared CLI/MCP/command-registry architecture
- **New**: new suggestions that fit the app

**Complexity** (relative effort)
- **S**: an afternoon to a day
- **M**: a few days
- **L**: one to two weeks
- **XL**: architectural, multi-week, touches most of the app

Each item ends with **Needs from you**: the decisions or inputs required before it can be built.

---

## Quick index

| ID | Item | Cx | Source |
|----|------|----|--------|
| **0. Foundations & housekeeping** ||||
| 0.1 | Verify refactor in a real Tauri build, then commit | S | Ideas |
| 0.2 | Fix Animation › Intensity (NaN%) | S | Ideas |
| 0.3 | Confirm file-write permissions in packaged app | S | Ideas |
| 0.4 | Per-document error boundary | S | Ideas |
| 0.5 | Persisted file scope for recent files | S | Ideas |
| 0.6 | Throttle continuous colour animations | M | Perf |
| 0.7 | Inline-SVG vs data-URI rendering spike | M | Perf |
| 0.8 | Move heavy fills to a Web Worker | M | Perf/New |
| 0.9 | Automated tests incl. project round-trip | M | VC |
| 0.10 | Central command registry | M | AC/VC |
| **1. Shell, documents & workspace** ||||
| 1.1 | Session restore + autosave + crash recovery | M | Ideas |
| 1.2 | Duplicate / Save a Copy | S | Ideas |
| 1.3 | Tab context menu | S | Ideas |
| 1.4 | Drag a file onto the window to open | S | Ideas |
| 1.5 | Window title shows active document | S | Ideas |
| 1.6 | Tab hover thumbnails | S | Ideas |
| 1.7 | Project gallery on Home | M | Backlog D3 |
| 1.8 | Command palette (Ctrl+K) | M | Ideas |
| 1.9 | Panel ☰ menus | S | Ideas |
| 1.10 | Workspace presets | M | Ideas |
| 1.11 | Drag panels between groups / float them | L | Ideas |
| 1.12 | Light theme + theme switch | M | VC |
| 1.13 | Preferences dialog | M | New |
| 1.14 | Custom keyboard shortcuts | M | New |
| 1.15 | Templates & sample projects on Home | S | New |
| 1.16 | Localisation | L | VC |
| 1.17 | Onboarding tour / contextual help | S | New |
| **2. Undo & history** ||||
| 2.1 | Undo for settings changes | M | Ideas |
| 2.2 | History panel | M | Ideas |
| 2.3 | Fill snapshot variations | M | Backlog I1 |
| 2.4 | Named checkpoints / version history in file | M | New |
| **3. Selection, tools & navigation** ||||
| 3.1 | Drag to move selected shapes | M | Ideas |
| 3.2 | Lasso select + Select Inverse | M | Ideas |
| 3.3 | Brush size for Stamp / Eraser | S | Ideas |
| 3.4 | Stamp at size (2×2 / 3×3) | S | Ideas |
| 3.5 | Zoom rectangle + Alt+scroll zoom | S | Ideas |
| 3.6 | Eyedropper Alt+click applies to selection | S | Ideas |
| 3.7 | Tool presets | M | Ideas |
| 3.8 | Live symmetry while painting | M | New |
| 3.9 | More Select › Same (size, rotation, pinned) | S | Ideas |
| 3.10 | Rulers, guides and snapping | M | VC |
| 3.11 | Numeric Transform / Info panel | S | VC |
| 3.12 | Meander seed brush + strand recolour | L | Ideas |
| 3.13 | Copy / paste / duplicate shapes | S | New |
| 3.14 | Group / ungroup blocks | M | VC |
| **4. Fill methods & generation** ||||
| 4.1 | Density Fill (already specced) | M | Backlog |
| 4.2 | Colour Region Fill (k-means) | M | Backlog A3 |
| 4.3 | Text Mask Fill | M | Backlog A5 |
| 4.4 | Symmetry Modifier (post-process) | M | Backlog A7 |
| 4.5 | Scatter Decay Fill | M | Backlog A9 |
| 4.6 | Palette Match Fill | M | Backlog A10 |
| 4.7 | QR Code Fill | M | Backlog J2 |
| 4.8 | Freehand Path Mask Fill | M | Backlog J4 |
| 4.9 | Grid Subdivision | L | Backlog J10 |
| 4.10 | Surprise Me | S | Backlog D1 |
| 4.11 | Fills respect locked layers | M | Ideas |
| 4.12 | Consistent seed behaviour | S | Ideas |
| 4.13 | Live preview of fill settings | M | Ideas |
| 4.14 | SVG silhouette as fill mask | M | VC/New |
| 4.15 | Truchet / edge-matching tile fill | M | New |
| 4.16 | Wave Function Collapse fill | L | New |
| 4.17 | Reaction-diffusion / cellular-automata fill | M | New |
| 4.18 | Hex, triangle and isometric grids | XL | New |
| 4.19 | Depth-map–driven fills | L | AC |
| 4.20 | Fill along a path / radial-polar grid | L | New |
| **5. Shapes & assets** ||||
| 5.1 | Custom SVG shape import | M | Backlog D2 |
| 5.2 | Shape usage stats | S | Backlog E1 |
| 5.3 | Asset library management (tags, favourites, packs) | M | New |
| 5.4 | Per-block opacity | S | Backlog J7 |
| 5.5 | Per-block blend modes | S | Backlog C3 |
| 5.6 | In-app shape editor (pen + pathfinder) | XL | VC |
| 5.7 | Merge adjacent blocks into single paths | L | VC |
| 5.8 | Image trace into new shapes | L | VC |
| 5.9 | Shape stroke / outline style | M | VC/EC |
| **6. Colour & swatches** ||||
| 6.1 | Recent colours row | S | Ideas |
| 6.2 | Auto document swatches | S | Ideas |
| 6.3 | Swatch library thumbnails on Home | S | Ideas |
| 6.4 | Swatch groups + Colour Guide (harmonies) | M | Ideas |
| 6.5 | Library sync with .ase on disk | M | Ideas |
| 6.6 | Pins in Image + animation modes | M | Ideas |
| 6.7 | Recolour Artwork dialog | L | VC/New |
| 6.8 | Gradient mesh colour mode | L | Backlog J9/VC |
| 6.9 | Colour-blind and contrast preview | S | New |
| 6.10 | CMYK / spot colours for print | L | VC |
| **7. Layers, composition & effects** ||||
| 7.1 | Multi-layer canvas | XL | Backlog J3 |
| 7.2 | Multiple artboards | L | VC |
| 7.3 | Reveal / Cutout mode | M | Backlog F4 |
| 7.4 | Composition overlays | S | Backlog I2 |
| 7.5 | Structured Meander layers | L | Ideas |
| 7.6 | Text layers | L | VC |
| 7.7 | Appearance stack (non-destructive recipe) | XL | VC |
| 7.8 | Layer styles: shadow, glow, bevel | M | EC |
| 7.9 | Raster effect filters (grain, halftone, posterise…) | M | VC |
| 7.10 | Meander 3D: extrude / revolve / Blender bridge | L | VC/existing |
| 7.11 | Envelope / perspective warp | L | VC |
| 7.12 | Product mockup preview | M | New |
| **8. Export & output** ||||
| 8.1 | Animated export: GIF / MP4 / WebM | L | Backlog B2/EC |
| 8.2 | PNG image sequence export | M | EC |
| 8.3 | Lottie export | L | EC |
| 8.4 | Tiling preview & seamless tile export | M | Backlog B3 |
| 8.5 | Batch export / export all tabs | M | Backlog J8/Ideas |
| 8.6 | Export for Screens (1×/2×/3×) | S | Ideas/VC |
| 8.7 | Photo composite export | S | Backlog F3 |
| 8.8 | PDF export (vector) | M | VC |
| 8.9 | DXF / plotter / laser-cut export | M | VC |
| 8.10 | Print with tiling | M | VC |
| 8.11 | Cleaner SVG output (layers, reuse, optimise) | M | New |
| 8.12 | Copy as SVG to clipboard | S | New |
| 8.13 | Send to Figma | M | New |
| **9. Animation & live performance** ||||
| 9.1 | Live camera input | L | Backlog G3 |
| 9.2 | Fill transition animation | M | Backlog J5 |
| 9.3 | Loop length + easing control | M | EC |
| 9.4 | Keyframe timeline | XL | EC |
| 9.5 | MIDI controller input | M | New |
| 9.6 | Performance / second-screen output | M | New |
| 9.7 | Spout / NDI output for VJ software | L | New |
| **10. Automation & AI** ||||
| 10.1 | MCP server (Claude drives the app) | L | VC/AC |
| 10.2 | Headless CLI renderer | L | AC |
| 10.3 | Actions / macro recording | L | AC/New |
| 10.4 | Data-driven batch (CSV → designs) | M | VC (Variables) |
| 10.5 | AI palette from a prompt | M | AC |
| 10.6 | AI "describe a pattern" → settings | M | AC |
| 10.7 | AI-generated source image | M | AC |
| 10.8 | Background removal / subject mask | M | AC |
| 10.9 | AI critique / suggestion pass | M | New |
| **11. Platform & distribution** ||||
| 11.1 | Web build | M | VC |
| 11.2 | macOS / Linux builds | M | VC |
| 11.3 | Code signing | S | VC |
| 11.4 | Telemetry-free crash log export | S | EC |

---

## 0. Foundations & housekeeping

These are mostly prerequisites. Several later items depend on 0.10.

### 0.1 Verify refactor in a real Tauri build, then commit
**Source:** Ideas / refactor notes · **Cx:** S
All five refactor phases (doc store, shell, dock, layers, swatches, tools) are complete but uncommitted. They have only been tested in the browser through Playwright. Run `tauri dev` and a release build, then smoke-test open, save, export, swatch import and the tools. After that, commit in logical chunks so the work is protected before anything below starts.
**Needs from you:** permission to commit, and whether you want one squash commit or one commit per phase. Also whether this lands on `main` or stays on `refactor/workspace-ui` for a while.

### 0.2 Fix Animation › Intensity (NaN%)
**Source:** Ideas · **Cx:** S
The slider reads `animSettings.intensity`, which has no default, and no effect uses it. Either remove the slider or make it a global multiplier for every animation's amplitude.
**Needs from you:** remove or wire up? Wiring it up is more useful, especially for audio-reactive mode.

### 0.3 Confirm file-write permissions in the packaged app
**Source:** Ideas · **Cx:** S
In earlier packaged builds, Save and Export may have failed silently. The capability is now scoped to `$HOME/**`. This needs confirming in an installed build, and errors should surface as a visible toast rather than a silent failure.
**Needs from you:** are you happy with home-folder-only scope? Saving to another drive (an external disk, or D:) would need a wider scope or 0.5.

### 0.4 Per-document error boundary
**Source:** Ideas · **Cx:** S
If one tab's editor crashes, show "This document hit an error — Reload / Close" inside that tab instead of a blank app. Pairs with 1.1 so nothing is lost.
**Needs from you:** nothing.

### 0.5 Persisted file scope for recent files
**Source:** Ideas · **Cx:** S
Use `tauri-plugin-persisted-scope` so recent files on other drives still open after a restart.
**Needs from you:** nothing.

### 0.6 Throttle continuous colour animations
**Source:** Perf · **Cx:** M
Noise, gradient sweep and palette wave rewrite every slot's fill on every frame. Options: cap at 30 fps, pause when the window is unfocused or minimised, move colour maths to a worker, and use the seeded PRNG for flicker so it is reproducible. This matters for animated export (8.1), which needs deterministic frames.
**Needs from you:** should animations keep running in the background (for example on a second-screen display, 9.6), or pause when the window is unfocused?

### 0.7 Inline-SVG vs data-URI rendering spike
**Source:** Perf · **Cx:** M
Profile rendering every block as inline SVG versus the current `<image href=data:>` path on a large grid. If inline wins, recolouring becomes plain style writes everywhere, which also helps 5.4, 5.5, 7.8 and 6.7.
**Needs from you:** a "worst realistic" project to use as the benchmark (largest grid and shape count you actually use).

### 0.8 Move heavy fills to a Web Worker
**Source:** Perf / New · **Cx:** M
Image-driven fills (edge, brightness, density, colour region) and Meander generation run on the main thread. A worker keeps the UI responsive and makes live preview (4.13) feasible. A spinner and a cancel option come with it.
**Needs from you:** nothing. This is internal.

### 0.9 Automated tests incl. project round-trip
**Source:** VC (property-tested file round trips) · **Cx:** M
There are no tests today. Start with the parts most likely to break silently:
- Save → load → save produces identical files.
- Old (pre-swatch) projects still load.
- `.ase`/`.gpl` import → export round-trips.
- Fills are deterministic for a given seed.

Vitest suits the Vite setup.
**Needs from you:** a handful of real old project files to use as fixtures.

### 0.10 Central command registry
**Source:** AC/VC: "menus, dialogs, CLI and agents all call one command registry" · **Cx:** M
Today the menu calls functions on the editor bridge (`cmds.*`), and the context menu and shortcuts each wire their own handlers. A single registry would give every command an id, label, shortcut, enabled-check and handler. This is the most leveraged item on the list, because it directly unlocks:
- command palette (1.8)
- custom shortcuts (1.14)
- tool presets (3.7)
- macros (10.3)
- the MCP server (10.1)
- the CLI (10.2)
- the History panel's step names (2.2)

**Needs from you:** nothing up front. It is a refactor with no visible change.

---

## 1. Shell, documents & workspace

### 1.1 Session restore + autosave + crash recovery
**Source:** Ideas · **Cx:** M
Autosave every open document, including unsaved ones, to app-data every N seconds. On launch, reopen the previous tabs and offer to recover any document that crashed.
**Needs from you:** autosave interval; whether to restore silently or ask first; how long to keep orphaned autosaves.

### 1.2 Duplicate / Save a Copy
**Source:** Ideas · **Cx:** S
File › Duplicate opens the current document in a new untitled tab. Save a Copy writes a file without switching the tab to it. Useful for "fork this design and try something else".
**Needs from you:** nothing.

### 1.3 Tab context menu
**Source:** Ideas · **Cx:** S
Close, Close Others, Close to the Right, Duplicate, Reveal in Explorer, Copy Path.
**Needs from you:** nothing.

### 1.4 Drag a file onto the window to open
**Source:** Ideas · **Cx:** S
Dropping a project opens it in a tab. Dropping an image could also load it as the reference image, dropping an `.ase` file could import swatches, and dropping an `.svg` could import shapes (5.1).
**Needs from you:** what each dropped file type should do.

### 1.5 Window title shows active document
**Source:** Ideas · **Cx:** S
`Name • — Mills Pattern Studio`, with a dot when there are unsaved changes.
**Needs from you:** nothing.

### 1.6 Tab hover thumbnails
**Source:** Ideas · **Cx:** S
Reuse the recent-file thumbnail as a tooltip preview on tab hover.
**Needs from you:** nothing.

### 1.7 Project gallery on Home
**Source:** Backlog D3 · **Cx:** M
Expand Home from recent files to a proper gallery:
- thumbnails, search and sort
- pin favourites
- watch a folder of projects
- show mode, grid size and last-edited date

**Needs from you:** should the gallery scan a "projects folder" you choose, or only show files you have opened?

### 1.8 Command palette (Ctrl+K)
**Source:** Ideas · **Cx:** M (S after 0.10)
Fuzzy search across every command, fill method, panel and recent file. Its value grows as the feature list grows.
**Needs from you:** shortcut preference (Ctrl+K or Ctrl+Shift+P).

### 1.9 Panel ☰ menus
**Source:** Ideas (Illustrator pattern) · **Cx:** S
Each dock group gets a menu of panel-specific actions, for example Swatches › Import .ase, Assets › Enable All, Layers › Collapse All.
**Needs from you:** nothing.

### 1.10 Workspace presets
**Source:** Ideas · **Cx:** M
Save and restore dock arrangements per mode, such as Essentials, Colour, Generate and Performance (big canvas, Audio panel open). Use Window › Workspace › Reset to get back to a sane layout.
**Needs from you:** which presets you would actually use.

### 1.11 Drag panels between groups / float them
**Source:** Ideas · **Cx:** L
Real docking: drag a tab into another group, or tear it out as a floating window. This needs drag-and-drop work and layout persistence.
**Needs from you:** is floating important, or is rearranging within the dock enough? The second is about half the work.

### 1.12 Light theme + theme switch
**Source:** VC (light and dark themes) · **Cx:** M
Move chrome colours to CSS tokens (partly done), add a light theme, and follow the OS setting or a manual toggle. Also restyle the selection toolbar and context menu, which still use the old light style (an item in Ideas).
**Needs from you:** whether you want light at all, or just consistency within dark.

### 1.13 Preferences dialog
**Source:** New · **Cx:** M
One place for:
- default grid size
- autosave interval
- default export format and scale
- UI scale
- canvas background colour
- animation FPS cap
- undo depth
- default swatch library

**Needs from you:** the list of defaults you find yourself changing every time.

### 1.14 Custom keyboard shortcuts
**Source:** New · **Cx:** M (after 0.10)
An editable shortcut table with conflict detection and export/import.
**Needs from you:** low priority unless shortcuts clash with other tools you use.

### 1.15 Templates & sample projects on Home
**Source:** New · **Cx:** S
"New from template" with preset grid sizes for common outputs (Instagram square/portrait, A4/A3 print, 4K wallpaper, phone wallpaper, fabric repeat) plus a few finished example projects.
**Needs from you:** your list of real-world output sizes, and any example projects you'd like to ship.

### 1.16 Localisation
**Source:** VC (19 languages) · **Cx:** L
Extract all UI strings into a translation layer. Translation itself is cheap with Claude; the extraction is the work.
**Needs from you:** is this app ever going beyond you and a few people? If not, cut it.

### 1.17 Onboarding tour / contextual help
**Source:** New · **Cx:** S
A first-run walkthrough of the dock, tools and fills, plus a "?" on each fill method explaining what it does, with an example thumbnail.
**Needs from you:** whether other people will use the app.

---

## 2. Undo & history

### 2.1 Undo for settings changes
**Source:** Ideas · **Cx:** M
Today undo covers placed blocks. Snapshot the whole `doc.state` so palette, gradient, grid, fill-setting and Meander changes are undoable. Slider drags need to coalesce into a single step.
**Needs from you:** should every slider move be undoable, or only "committed" changes (mouse-up)?

### 2.2 History panel
**Source:** Ideas · **Cx:** M
A list of named undo steps ("Fill — Glitch", "Recolour", "Stamp ×12"). Click a step to jump back. Pairs with 2.1 and 0.10.
**Needs from you:** nothing.

### 2.3 Fill snapshot variations
**Source:** Backlog I1 · **Cx:** M
Keep up to six named variants of a fill result side by side as thumbnails, then pick one or compare them. Could also be a "generate 6 seeds" contact sheet.
**Needs from you:** side-by-side grid view, or a strip of thumbnails you click between?

### 2.4 Named checkpoints / version history in file
**Source:** New · **Cx:** M
"Save checkpoint" stores a named snapshot inside the project file, so you can return to "the blue version from Tuesday".
**Needs from you:** is file size a concern? Each checkpoint stores full block data.

---

## 3. Selection, tools & navigation

### 3.1 Drag to move selected shapes
**Source:** Ideas · **Cx:** M
Drag selected blocks to new cells, with cell snapping and collision handling.
**Needs from you:** what happens when you drop onto occupied cells: swap, replace, or refuse?

### 3.2 Lasso select + Select Inverse
**Source:** Ideas · **Cx:** M
A freehand lasso (Q) for irregular areas, plus Select › Inverse.
**Needs from you:** nothing.

### 3.3 Brush size for Stamp / Eraser
**Source:** Ideas · **Cx:** S
Paint or erase in 1×1, 2×2, 3×3 or a round brush, with `[` and `]` to change size.
**Needs from you:** nothing.

### 3.4 Stamp at size
**Source:** Ideas · **Cx:** S
Stamp 2×2 or 3×3 versions of a shape, the same way Max scale works for fills.
**Needs from you:** nothing.

### 3.5 Zoom rectangle + Alt+scroll zoom
**Source:** Ideas · **Cx:** S
Drag with the Zoom tool to zoom to a rectangle, and Alt+scroll to zoom around the cursor.
**Needs from you:** nothing.

### 3.6 Eyedropper Alt+click applies to selection
**Source:** Ideas · **Cx:** S
Illustrator behaviour: Alt+click samples a colour and applies it directly to the selection.
**Needs from you:** nothing. Alt+click currently does nothing for the Eyedropper, so it is free to use.

### 3.7 Tool presets
**Source:** Ideas · **Cx:** M
Save a stamp shape + size + paint colour as a named preset.
**Needs from you:** worth it only if you find yourself switching shapes and colours often.

### 3.8 Live symmetry while painting
**Source:** New · **Cx:** M
Mirror stamps, erases and paints across 2 or 4 axes, or radially, as you work. Meander already has symmetry modes; this gives Grid mode the same.
**Needs from you:** nothing.

### 3.9 More Select › Same
**Source:** Ideas · **Cx:** S
Same Colour and Same Shape exist. Add Same Size, Same Rotation/Reflection and Same Pin state.
**Needs from you:** nothing.

### 3.10 Rulers, guides and snapping
**Source:** VC (smart guides, dimension tool) · **Cx:** M
Rulers in cells, px or mm; draggable guides; and a measure tool that shows the cell span. Most useful once there are print outputs (8.8–8.10).
**Needs from you:** do you work to physical sizes (mm/inches)?

### 3.11 Numeric Transform / Info panel
**Source:** VC (properties panel) · **Cx:** S
Show the selected block's cell, size, rotation, shape name and slot colours, all editable. Also a cursor read-out of cell and colour under the pointer.
**Needs from you:** nothing.

### 3.12 Meander seed brush + strand recolour
**Source:** Ideas · **Cx:** L
- Paint over a region to regenerate only that part of the Meander.
- Click a single strand to recolour it.

Depends on 7.5 (structured strands).
**Needs from you:** how important is local editing for Meander compared with re-rolling the seed?

### 3.13 Copy / paste / duplicate shapes
**Source:** New · **Cx:** S
Ctrl+C/V/D for blocks within a document and between tabs, including pins and rotation.
**Needs from you:** nothing.

### 3.14 Group / ungroup blocks
**Source:** VC (object hierarchy) · **Cx:** M
Group blocks so they select and move together, with groups shown in Layers.
**Needs from you:** this overlaps with colour-grouped Layers. Do you want manual groups as well?

---

## 4. Fill methods & generation

### 4.1 Density Fill
**Source:** Backlog (fully specced in `feature-specs.md`) · **Cx:** M
Places shapes where the image has the most detail, with a heat-map overlay. The spec, edge cases and UI are all written.
**Needs from you:** confirm the spec is still what you want. It was written before the dock refactor, so the UI section moves to the Generate panel.

### 4.2 Colour Region Fill (k-means)
**Source:** Backlog A3 · **Cx:** M
Cluster the image into N colour regions; each region gets its own shape subset, scale or density. k-means already exists for the palette extractor.
**Needs from you:** what a region should control: shape set, scale, or both.

### 4.3 Text Mask Fill
**Source:** Backlog A5 · **Cx:** M
Type a word; shapes fill only the letterforms (or only the background). `knotworkTextMask.js` already rasterises text for Meander and can be reused.
**Needs from you:** font choice. Should it use system fonts or bundle a few?

### 4.4 Symmetry Modifier
**Source:** Backlog A7 · **Cx:** M
A post-process after any fill: mirror H, V, quad, or rotational. Blocks are flipped or rotated so shapes mirror properly.
**Needs from you:** nothing.

### 4.5 Scatter Decay Fill
**Source:** Backlog A9 · **Cx:** M
Density falls off from one or more focal points you click. Good for "explosion" compositions.
**Needs from you:** nothing.

### 4.6 Palette Match Fill
**Source:** Backlog A10 · **Cx:** M
Only fill cells whose image colour is close to the chosen palette colours.
**Needs from you:** nothing.

### 4.7 QR Code Fill
**Source:** Backlog J2 · **Cx:** M
Generate a scannable QR code from text or a URL, where shapes replace the dark modules. Needs a QR library and the finder patterns kept solid.
**Needs from you:** is this for a real use (merch, posters)? If not, cut it.

### 4.8 Freehand Path Mask Fill
**Source:** Backlog J4 · **Cx:** M
Draw a closed shape on the canvas; fill only inside or outside it.
**Needs from you:** nothing. It shares code with the lasso (3.2).

### 4.9 Grid Subdivision
**Source:** Backlog J10 · **Cx:** L
Zones with finer cells, such as a 2× subdivided centre. This changes the grid model from uniform to mixed, which affects packing, selection and export.
**Needs from you:** is this a real need? It is architecturally heavy.

### 4.10 Surprise Me
**Source:** Backlog D1 · **Cx:** S
Randomise fill method, palette, seed and grid in one click, within sensible limits.
**Needs from you:** which settings are off-limits (for example, keep my grid size).

### 4.11 Fills respect locked layers
**Source:** Ideas · **Cx:** M
Fill currently replaces locked blocks too. Keep locked blocks and pack around them, which Fill Gaps already supports.
**Needs from you:** nothing. This is arguably a bug.

### 4.12 Consistent seed behaviour
**Source:** Ideas · **Cx:** S
Only some fills re-run when the seed changes. Make every seeded fill re-run, behind a "Live" toggle.
**Needs from you:** live by default, or off?

### 4.13 Live preview of fill settings
**Source:** Ideas · **Cx:** M
Re-fill while dragging sliders. Needs 0.8 (worker) for heavy fills.
**Needs from you:** nothing.

### 4.14 SVG silhouette as fill mask
**Source:** VC (SVG import) / New · **Cx:** M
Import any SVG or PNG silhouette (a logo, an animal outline) and use it as the fill mask. It differs from 4.8 because the shape comes from a file, so it is precise and reusable.
**Needs from you:** nothing.

### 4.15 Truchet / edge-matching tile fill
**Source:** New · **Cx:** M
Treat shapes as tiles whose edges connect, so lines flow continuously across cells. Many of your 1×1 shapes look suited to this. Each shape needs edge metadata (which edges have a line, and where).
**Needs from you:** tag which shapes connect on which edges. A small one-off tagging UI could help.

### 4.16 Wave Function Collapse fill
**Source:** New · **Cx:** L
The generalised form of 4.15: define adjacency rules ("shape A may sit to the right of B"), or learn them from an example you paint, then generate large coherent patterns.
**Needs from you:** whether you'd rather paint an example or define rules.

### 4.17 Reaction-diffusion / cellular-automata fill
**Source:** New · **Cx:** M
Organic Turing patterns or Game-of-Life generations decide which cells are filled (and at what scale). Can be animated.
**Needs from you:** nothing.

### 4.18 Hex, triangle and isometric grids
**Source:** New · **Cx:** XL
New grid geometries. Every packer, the hit-testing and the export assume square cells, and the shapes need variants for the new geometry.
**Needs from you:** do you have, or want, a hex/triangle shape library? Without one, cut this.

### 4.19 Depth-map–driven fills
**Source:** AC (depth-based 3D compositing) · **Cx:** L
Estimate a depth map from the reference image (local ONNX model or API), then use it to drive scale (near = big), density or colour.
**Needs from you:** local model (installer grows roughly 50–100 MB) or a cloud API?

### 4.20 Fill along a path / radial-polar grid
**Source:** New · **Cx:** L
Lay cells along a spiral, circle or drawn curve instead of a rectangle.
**Needs from you:** is non-rectilinear layout in scope at all? It interacts with 4.18.

---

## 5. Shapes & assets

### 5.1 Custom SVG shape import
**Source:** Backlog D2 · **Cx:** M
Import your own SVGs as shapes. This needs:
- normalising viewBoxes
- detecting colour slots so swatches and pins work
- choosing a size (1×1, 2×1…)
- saving into a user library

**Needs from you:** how colour slots are defined. Auto-detect by fill colour, or a naming convention in Illustrator such as `slot-1`?

### 5.2 Shape usage stats
**Source:** Backlog E1 · **Cx:** S
A panel showing how often each shape and colour appears, its coverage %, and an imbalance warning. Click a row to select those blocks.
**Needs from you:** nothing.

### 5.3 Asset library management
**Source:** New · **Cx:** M
Tags, favourites, search and user-made shape packs ("Curves only", "Heavy blocks") switchable per document. This is a natural home for the `1x1/` artboards folder.
**Needs from you:** how you mentally group your shapes.

### 5.4 Per-block opacity
**Source:** Backlog J7 · **Cx:** S
An opacity value per block, editable in Properties, with a fill option to randomise it.
**Needs from you:** nothing.

### 5.5 Per-block blend modes
**Source:** Backlog C3 (global done) · **Cx:** S
Finish C3 with a blend mode per block or per layer.
**Needs from you:** nothing.

### 5.6 In-app shape editor (pen + pathfinder)
**Source:** VC (pen, pathfinder, shape builder) · **Cx:** XL
Draw or edit shapes inside the app, snapped to a cell, with Bézier pen, union/subtract and slot assignment. Illustrator already does this well, so 5.1 plus an "Edit in Illustrator" round-trip is probably the better route.
**Needs from you:** whether you'd ever draw shapes in-app rather than Illustrator. Likely cut.

### 5.7 Merge adjacent blocks into single paths
**Source:** VC (pathfinder / exact booleans) · **Cx:** L
At export, union same-coloured touching shapes into single paths. This gives cleaner SVGs, cleaner Illustrator editing, and is essential for cutting and plotting (8.9). Needs a robust boolean library (for example paper.js or clipper).
**Needs from you:** is the output going to cutters/plotters, or into Illustrator for further work?

### 5.8 Image trace into new shapes
**Source:** VC (trace crate) · **Cx:** L
Turn a bitmap (a sketch or photo) into vector shapes to add to the library.
**Needs from you:** likely low value next to Illustrator's Image Trace.

### 5.9 Shape stroke / outline style
**Source:** VC/EC (stroke, layer styles) · **Cx:** M
Add an outline stroke per block or globally: width, colour, and inside/outside alignment. Gives "sticker" and line-art looks.
**Needs from you:** nothing.

---

## 6. Colour & swatches

### 6.1 Recent colours row
**Source:** Ideas · **Cx:** S
The last 10 colours used, shown above the swatches.
**Needs from you:** nothing.

### 6.2 Auto document swatches
**Source:** Ideas · **Cx:** S
Automatically add the palette a fill or the extractor last used as a document swatch group.
**Needs from you:** automatic, or a one-click "Add to swatches" prompt?

### 6.3 Swatch library thumbnails on Home
**Source:** Ideas · **Cx:** S
Start a new document from a palette.
**Needs from you:** nothing.

### 6.4 Swatch groups + Colour Guide
**Source:** Ideas · **Cx:** M
Groups within a document, plus harmony generation (complementary, triads, analogous, tints and shades) from a selected swatch.
**Needs from you:** nothing.

### 6.5 Library sync with .ase on disk
**Source:** Ideas · **Cx:** M
Watch an `.ase` file and refresh the library when Illustrator saves it.
**Needs from you:** do you keep palettes in Illustrator as the master copy?

### 6.6 Pins in Image + animation modes
**Source:** Ideas · **Cx:** M
Pinned colours currently do nothing in Image mode and in continuous animations. Layer the pins on top of both.
**Needs from you:** nothing. This is arguably a bug.

### 6.7 Recolour Artwork dialog
**Source:** VC / Illustrator · **Cx:** L
A table of every colour in the artwork mapped to a target colour, with harmony locks, a colour wheel, "reduce to N colours" and preview. Global swatches make this possible now.
**Needs from you:** worth confirming it would replace how you currently recolour.

### 6.8 Gradient mesh colour mode
**Source:** Backlog J9 / VC (gradient mesh) · **Cx:** L
A 2D grid of draggable colour points; blocks sample the smoothly interpolated mesh. Richer than linear or radial.
**Needs from you:** nothing.

### 6.9 Colour-blind and contrast preview
**Source:** New · **Cx:** S
A view toggle that simulates deuteranopia, protanopia, tritanopia or greyscale, plus a "low-contrast neighbours" warning.
**Needs from you:** nothing.

### 6.10 CMYK / spot colours for print
**Source:** VC (PDF/X, print) · **Cx:** L
CMYK swatch values, out-of-gamut warnings and spot-colour export, for screen printing, textiles or risograph.
**Needs from you:** do you print? If not, cut it.

---

## 7. Layers, composition & effects

### 7.1 Multi-layer canvas
**Source:** Backlog J3 · **Cx:** XL
Stack independent grid layers, each with its own grid size, fill, palette and blend mode, for example a big-shape layer under a fine-shape layer. This changes the document model (`placedBlocks` becomes per layer) and touches nearly everything.
**Needs from you:** how layers relate to today's colour-grouped Layers panel. Probably "grid layers" containing colour groups.

### 7.2 Multiple artboards
**Source:** VC · **Cx:** L
Several canvases in one document: variants, sizes, or a series sharing swatches.
**Needs from you:** does tabs + Duplicate (1.2) already cover this?

### 7.3 Reveal / Cutout mode
**Source:** Backlog F4 · **Cx:** M
Shapes become holes in a solid overlay, so the reference photo shows through the shapes.
**Needs from you:** nothing.

### 7.4 Composition overlays
**Source:** Backlog I2 · **Cx:** S
Non-exporting guides for rule of thirds, golden ratio, centre lines and social-media safe zones (for example the Instagram UI crop).
**Needs from you:** which safe zones matter to you.

### 7.5 Structured Meander layers
**Source:** Ideas · **Cx:** L
Have the Meander generator report its strands so Layers can hide, lock or recolour each strand. Prerequisite for 3.12.
**Needs from you:** nothing.

### 7.6 Text layers
**Source:** VC (type tools) · **Cx:** L
Add titles or captions over the pattern: font, size, tracking and colour from swatches. Useful for posters.
**Needs from you:** do you add type later in Illustrator? If so, cut it.

### 7.7 Appearance stack (non-destructive recipe)
**Source:** VC (Appearance panel, live effects) · **Cx:** XL
The document becomes a re-runnable stack: Fill (Glitch, seed 42) → Symmetry → Recolour → Glow. Change any step and everything downstream re-runs. Fills, modifiers and colour today are partly separate and partly destructive; this unifies them.
**Needs from you:** a big conceptual change. Worth discussing before 4.4 and 7.8, because both would slot in as steps.

### 7.8 Layer styles: shadow, glow, bevel
**Source:** EC (nine layer styles) · **Cx:** M
SVG filter-based drop shadow, inner/outer glow and bevel per layer or globally. Exportable in SVG; rasterised for PNG.
**Needs from you:** nothing.

### 7.9 Raster effect filters
**Source:** VC (effect gallery: grain, halftone, posterise, neon glow, photocopy…) · **Cx:** M
A post-effect pass on the rendered canvas (WebGL or canvas) for grain, risograph misregistration, halftone dots, CRT scanlines and chromatic aberration. These fit the glitch aesthetic well. Shown on export and optionally live.
**Needs from you:** pick 5–8 effects you would actually use.

### 7.10 Meander 3D: extrude / revolve / Blender bridge
**Source:** VC (3D revolve) + existing `experiment/meander-3d-depth` branch and Blender add-on · **Cx:** L
Bring the 3D depth experiment into the main app: a 3D preview of extruded strands with lighting, plus a one-click export to the Blender add-on.
**Needs from you:** the state of the experiment branch and where you want it to go. Memory notes say not to touch that branch without you.

### 7.11 Envelope / perspective warp
**Source:** VC (envelope distort, perspective grid) · **Cx:** L
Warp the whole pattern onto a curved envelope or a perspective plane. Good for mockups and dynamic posters.
**Needs from you:** nothing.

### 7.12 Product mockup preview
**Source:** New · **Cx:** M
Preview the pattern on a T-shirt, tote, phone case, wallpaper or tiled wall, using a displacement map and multiply blend.
**Needs from you:** which products. You may have mockup photos to supply.

---

## 8. Export & output

### 8.1 Animated export: GIF / MP4 / WebM
**Source:** Backlog B2 / EC · **Cx:** L
Record N seconds of the animation as GIF, MP4 or WebM. Options:
- WebCodecs in WebView2 (no install; H.264/VP9)
- an ffmpeg sidecar (bigger installer)
- gif.js for GIFs

Needs deterministic frame stepping rather than real time, which ties to 0.6 and 9.3.
**Needs from you:** target formats; max resolution and length; whether audio-reactive renders need the audio track muxed in.

### 8.2 PNG image sequence export
**Source:** EC · **Cx:** M
Export frames as numbered PNGs for After Effects, Premiere or EffectCraft. Easier than 8.1 and a good first step.
**Needs from you:** nothing.

### 8.3 Lottie export
**Source:** EC (Lottie import/export) · **Cx:** L
Export animations as Lottie JSON for web and apps. Only some effects map cleanly; colour cycles do, filter warps don't.
**Needs from you:** is web or app animation a target?

### 8.4 Tiling preview & seamless tile export
**Source:** Backlog B3 · **Cx:** M
Preview the pattern tiled 3×3 and export a seamless repeat (straight, half-drop or brick) for fabric and wallpaper. Meander already has motif tiling; this is the Grid-mode equivalent.
**Needs from you:** which repeat types; Spoonflower-style DPI requirements.

### 8.5 Batch export / export all tabs
**Source:** Backlog J8 / Ideas · **Cx:** M
One action exports several formats and sizes, for one or all open documents, with filename templates (`{name}_{w}x{h}.{ext}`).
**Needs from you:** your usual output set.

### 8.6 Export for Screens (1×/2×/3×)
**Source:** Ideas / VC · **Cx:** S
Multi-scale PNG in one go. Becomes a preset of 8.5.
**Needs from you:** nothing.

### 8.7 Photo composite export
**Source:** Backlog F3 · **Cx:** S
Export the shapes composited over the reference photo, flattened.
**Needs from you:** nothing.

### 8.8 PDF export (vector)
**Source:** VC · **Cx:** M
Print-ready vector PDF with page size, bleed and crop marks (svg2pdf / jsPDF, or Rust-side).
**Needs from you:** print workflow? Pairs with 6.10.

### 8.9 DXF / plotter / laser-cut export
**Source:** VC (DXF) · **Cx:** M
Export outlines for laser cutters, vinyl cutters and pen plotters (AxiDraw, Cricut), with optional single-line output for Meander strands. Works best with 5.7.
**Needs from you:** any cutting or plotting hardware?

### 8.10 Print with tiling
**Source:** VC · **Cx:** M
Print large designs across several sheets with overlap marks.
**Needs from you:** likely cut unless you print at home.

### 8.11 Cleaner SVG output
**Source:** New · **Cx:** M
- Group by layer and colour, named so Illustrator shows meaningful layers.
- Use `<symbol>/<use>` for repeated shapes (much smaller files).
- Run an optional svgo pass.
- Optionally reference swatches as CSS variables.

**Needs from you:** what you do with exported SVGs downstream.

### 8.12 Copy as SVG to clipboard
**Source:** New · **Cx:** S
Ctrl+Shift+C copies the selection or artboard as SVG, ready to paste into Illustrator or Figma.
**Needs from you:** nothing.

### 8.13 Send to Figma
**Source:** New · **Cx:** M
Push the artboard into a Figma file through the plugin API or import. Low value unless Figma is part of your flow.
**Needs from you:** do you use Figma?

---

## 9. Animation & live performance

### 9.1 Live camera input
**Source:** Backlog G3 · **Cx:** L
A webcam feed as a live colour source. The grid recolours in real time, which suits installations and VJ sets.
**Needs from you:** frame-rate expectations; whether fills (not just colours) should react live.

### 9.2 Fill transition animation
**Source:** Backlog J5 · **Cx:** M
Animate from one fill state or snapshot (2.3) to another: cross-fade, cell-by-cell wipe, or a scale pop.
**Needs from you:** nothing.

### 9.3 Loop length + easing control
**Source:** EC (graph editor, easing) · **Cx:** M
Set an exact loop duration so exports loop seamlessly, with easing curves per animation.
**Needs from you:** nothing. It is a prerequisite for good 8.1 output.

### 9.4 Keyframe timeline
**Source:** EC · **Cx:** XL
Keyframe any parameter (palette, gradient angle, density, seed morph) on a timeline. This makes the app a motion tool.
**Needs from you:** is motion design a direction you want, or should the animation stay as ambient effects?

### 9.5 MIDI controller input
**Source:** New (extends audio-reactive mode) · **Cx:** M
Map MIDI knobs and pads to parameters with Web MIDI, which WebView2 supports. A natural partner to audio-reactive mode for live sets.
**Needs from you:** do you own a controller? A MIDI-learn UI would be the main work.

### 9.6 Performance / second-screen output
**Source:** New · **Cx:** M
A chrome-free fullscreen output window on a second monitor or projector, with controls left on the main screen.
**Needs from you:** is live use real?

### 9.7 Spout / NDI output for VJ software
**Source:** New · **Cx:** L
Send frames to Resolume or TouchDesigner via Spout (Windows) or NDI. Needs Rust-side work in Tauri.
**Needs from you:** only if 9.6 is real.

---

## 10. Automation & AI

The ArtCraft apps are built so that every menu item can be driven by a CLI, by scripts and by AI agents over MCP, all through one command registry. That design depends on 0.10.

### 10.1 MCP server
**Source:** VC / AC · **Cx:** L
Expose the commands to Claude: "Make a 40×40 glitch fill using my Autumn swatches, export 3 seeds as PNG." In Tauri this would be a local MCP server (stdio or HTTP) bridged to the webview.
**Needs from you:** do you want Claude driving the app? Also security scope: which folders it may read and write.

### 10.2 Headless CLI renderer
**Source:** AC · **Cx:** L
`mills render project.mps --seed 1..50 --out ./variants/` renders without opening the UI. Good for bulk variations and print-on-demand catalogues. The hard part is running the render code outside the webview (Node plus a DOM shim, or a hidden window).
**Needs from you:** is bulk generation a real workflow?

### 10.3 Actions / macro recording
**Source:** AC / New · **Cx:** L
Record a sequence of commands, such as "Fill Strip → Symmetry → Recolour Autumn → Export PNG 2×", and replay it on any document.
**Needs from you:** nothing beyond 0.10.

### 10.4 Data-driven batch (CSV → designs)
**Source:** VC (Variables) · **Cx:** M
A CSV of names or words → one Meander word-weave per row, auto-exported. Good for personalised products, event badges and wedding pieces.
**Needs from you:** is personalisation a product use?

### 10.5 AI palette from a prompt
**Source:** AC · **Cx:** M
"Moody Scandinavian winter" → five swatches via the Claude API, added as a swatch group.
**Needs from you:** API key handling (your key in Preferences, stored in the OS keychain) and cost tolerance.

### 10.6 AI "describe a pattern" → settings
**Source:** AC · **Cx:** M
A text box: "dense glitchy strips in warm colours" → Claude chooses fill method, settings and palette through the command registry. A lighter version of 10.1 inside the app.
**Needs from you:** same as 10.5.

### 10.7 AI-generated source image
**Source:** AC (ArtCraft core: image generation) · **Cx:** M
Generate the reference image from a prompt inside the app (any image API), then use it for Image colour mode and image-driven fills.
**Needs from you:** which provider, and whether you are comfortable with a paid API dependency.

### 10.8 Background removal / subject mask
**Source:** AC (background removal) · **Cx:** M
Cut out the subject of the reference image automatically, then fill only the subject or only the background. This strengthens Strip, Reveal (7.3) and Density fills. It could run locally with an ONNX model (adds size) or through an API.
**Needs from you:** local or cloud.

### 10.9 AI critique / suggestion pass
**Source:** New · **Cx:** M
Send a render to Claude for composition feedback and three suggested tweaks, applied with one click.
**Needs from you:** gimmick or useful? Easy to cut.

---

## 11. Platform & distribution

### 11.1 Web build
**Source:** VC (WASM web build) · **Cx:** M
The app is React, so a browser build is close already; `fileIO.js` has a non-Tauri fallback path. Host it as a demo or as a lighter companion.
**Needs from you:** is anyone besides you going to use it?

### 11.2 macOS / Linux builds
**Source:** VC · **Cx:** M
Tauri supports both. The work is CI matrix builds and testing, and the Mac build needs an Apple developer account.
**Needs from you:** any non-Windows users?

### 11.3 Code signing
**Source:** VC · **Cx:** S
Signed Windows installers so SmartScreen stops warning. Costs money for a certificate (or Azure Trusted Signing).
**Needs from you:** only matters if you distribute the app.

### 11.4 Telemetry-free crash log export
**Source:** EC ("private by default") · **Cx:** S
Help › Export Diagnostics writes logs, version and recent errors to a zip for debugging, with no telemetry sent anywhere.
**Needs from you:** nothing.

---

## Dependencies worth knowing when cutting

- **0.10 Command registry** unlocks 1.8, 1.14, 2.2, 3.7, 10.1, 10.2, 10.3 and 10.6. Keep it if any of those survive.
- **0.8 Workers** are needed for 4.13 and make 4.1, 4.2 and 4.19 pleasant to use.
- **0.6 + 9.3** come before 8.1, 8.2 and 8.3. Export needs deterministic, loopable frames.
- **7.5** comes before 3.12.
- **5.7 (path merge)** makes 8.9 and 8.11 much better.
- **7.7 (appearance stack)** changes how 4.4, 7.8, 7.9 and 6.7 would be built, so decide on it early or rule it out.
- **7.1 (multi-layer)** and **4.18 (new grid geometries)** are the two most invasive changes. Decide yes or no before building much else on the document model.

---

## v1.2.0 first pass

Chosen 2026-10-21. Scoped for v1.2.0, not built yet. Grouped by the code they touch.

1. **Block properties** (block data model, `projectFormat.js`, `PlacedBlocks.jsx`, Properties panel): 5.4 Per-block opacity → 3.13 Copy / paste / duplicate → 3.11 Info / Transform panel.
2. **Canvas tools & view** (tool handlers in `DocumentEditor.jsx`, `Canvas.jsx`, View menu): 3.5 Zoom rectangle + Alt+scroll, 3.6 Eyedropper Alt+click, 7.4 Composition overlays.
3. **Panels & generation** (`Dock.jsx`, mode registry, Generate panel): 1.9 Panel ☰ menus → 4.10 Surprise Me.
4. **Shell & files** (`AppShell.jsx`, `fileIO.js`, Tauri capabilities, `HomeScreen.jsx`): 1.5 Window title, 1.4 Drag a file onto the window, 6.3 Swatch library thumbnails on Home.
