# Ideas that would slot in well

A running list kept during the Illustrator-style workspace refactor. These
aren't committed to. Each one fits the new structure without much rework.
Grouped by where it would land.

## Shell & documents
- **Session restore:** reopen the tabs that were open when the app last closed, including unsaved ones (autosave to app-data every N seconds). This also gives crash recovery.
- **File > Duplicate / Save a Copy:** clone the active document into a new tab.
- **Tab context menu:** Close Others, Close to the Right, Reveal in Explorer, Copy Path.
- **Drag a project file onto the window to open it** (Tauri drag-drop event).
- **Window title shows the active document:** `Name — Mills Pattern Studio`. Needs `core:window:allow-set-title`.
- **Per-editor error boundary:** if one document's editor throws, show a recover/close message in that tab instead of crashing the shell.
- **Persisted file scope** (`tauri-plugin-persisted-scope`): recent files saved outside your home folder (another drive) currently can't be reopened after a restart.
- **Hover preview on tabs:** reuse the recent-file thumbnail.

## Tools & navigation
- **Hold Space for a temporary Hand tool;** hold Ctrl+Space for Zoom (Illustrator muscle memory).
- **Zoom tool drag-to-zoom-rectangle.**
- **Command palette (Ctrl+K):** every menu item is already a function on the editor bridge, so this is mostly a list plus a search box.
- **Select menu > Same:** Fill Colour / Shape / Size. This fits naturally once blocks store resolved colours (Phase 3 layers).
- **Magic Wand tool:** click a block to select every block with the same dominant colour or the same asset.

## Undo
- **Undo for settings changes** (palette, gradient, grid), not just placed blocks. The store makes this easier: snapshot `doc.state` instead of `placedBlocks`.
- **History panel:** a list of the undo stack with named steps ("Fill — Glitch", "Recolour").

## Export
- **Export all open tabs** in one action. Ties into backlog item J8 (Batch Export).
- **Export for Screens-style multi-size export** from one document (PNG at 1×, 2× and 3× in one go).

## Swatches (Phase 4)
- **Auto-add "document swatches"** from whatever palette a fill or the extractor last used.
- **Recent colours row.**
- **Swatch library thumbnails** on the home screen, so you can start a new document from a palette.

## Panels & dock (from Phase 2)
- **Panel menus:** a ☰ on each dock group, Illustrator-style, with panel-specific actions (e.g. Palettes > Import .ase, Assets > Enable all).
- **Workspace presets:** Essentials / Colour / Generate dock arrangements, saved and switchable from Window > Workspace.
- **Drag a panel tab into another group,** or tear it out as a floating panel.
- **Consistent seed behaviour:** changing the seed re-runs the fill for Glitch, Strip, Multi-Strip, Brightness and Noise only. Either all seeded fills should re-run, or none should (with a "live" toggle).
- **Live preview of fill settings:** re-fill as you drag sliders, like Auto-fill does for grid settings.
- **Restyle the selection toolbar and right-click menu** to match the dark chrome. They're still the old light style; this fits with the Phase 5 contextual task bar.

## Layers & swatches (from Phases 3–4)
- **Fills that respect locked layers:** Fill currently replaces everything, locked blocks included. The bin-packer already supports "fill around existing blocks" (that's how Fill Gaps works), so Fill could keep locked blocks and pack the rest.
- **Pins in Image and animation modes:** Image colour mode and the continuous colour animations ignore pinned colours. Pins could be layered on top of both.
- **Paint Bucket tool (Phase 5):** click a block on the canvas to pin it to the selected swatch, or drop a swatch straight onto a canvas block.
- **Select Same Colour** from a block's right-click menu: selects its Layers group.
- **Swatch groups inside the document,** and a Colour Guide (harmony rules: complementary, triads, tints and shades) generating swatches from the selected one.
- **Structured Meander layers:** have the generator report its strands so Layers can hide or lock individual strands, not just replace colours.
- **Library sync:** watch an `.ase` file on disk and refresh the library when it changes (handy with Illustrator open side by side).

## Tools (from Phase 5)
- **Brush size for Stamp and Eraser:** paint 2×2 / 3×3 cells at once.
- **Stamp at size:** let the Stamp place 2×2 or 3×3 versions of 1×1 shapes, the same as Max scale does for fills.
- **Lasso selection** (Q) for irregular areas, and **Select Inverse**.
- **Drag to move selected shapes** with the Selection tool. Nudging with the arrow keys works today, dragging doesn't.
- **Zoom tool drag-rectangle,** and Alt+scroll to zoom.
- **Eyedropper Alt+click** to apply the picked colour straight to the selection, as Illustrator does.
- **Tool presets:** save a stamp shape and paint colour combination.
- **Meander tools:** a "seed brush" that regenerates just one region, and click-to-recolour a single strand.

## Found along the way
- **Animation > Intensity slider does nothing and shows "NaN%".** Nothing reads `animSettings.intensity`, which also has no default. This was already the case before the refactor; remove the slider or wire it into the animation effects.
- The packaged app's Save Project / Export may have been failing silently. `fs:default` only allows reading app folders, and the write commands were never granted. Fixed in `src-tauri/capabilities/default.json`, with scope limited to `$HOME/**`. This still needs confirming in a real `tauri dev` build.
