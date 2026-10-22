import {
  SelectIcon, MoveIcon, HandIcon, ZoomIcon, WandIcon, EyedropperIcon, BucketIcon, StampIcon, EraserIcon, RotateIcon, ReflectIcon,
  GridModeMark, MeanderModeMark,
} from '../shell/icons';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { InfoPanel } from '../panels/InfoPanel';
import { HistoryPanel } from '../panels/HistoryPanel';
import { EffectsPanel } from '../panels/EffectsPanel';
import { GeneratePanel, LayoutsPanel } from '../panels/GeneratePanel';
import { ColourPanel } from '../panels/ColourPanel';
import { SwatchesPanel } from '../panels/SwatchesPanel';
import { LayersPanel, MeanderLayersPanel } from '../panels/LayersPanel';
import { AssetsPanel } from '../panels/AssetsPanel';
import { ImagePanel, AnimationPanel, AudioPanel } from '../panels/MediaPanels';
import { MeanderPanel, MeanderThemePanel } from '../panels/MeanderPanels';

// Everything the shell needs to know about a mode: how it's presented on
// the home screen and tabs, which tools appear in the tool bar, and how its
// panels are grouped in the dock while one of its documents is active.
//
// Dock groups: { id, panels: [{ id, title, component, menu? }], defaultCollapsed?, grow? }.
// `menu` lists command ids (shell/commands.js) for the panel's ☰ menu.
// Group ids are shared across modes where the meaning matches (e.g. 'colour')
// so a panel can be revealed with showDockTab(groupId, panelId) in either mode.

// Tool ids in a mode's `tools` list; '|' draws a divider in the tool bar.
export const TOOLS = {
  select:     { id: 'select',     label: 'Selection',   key: 'V', icon: SelectIcon },
  move:       { id: 'move',       label: 'Move',        key: 'M', icon: MoveIcon, hint: 'Drag shapes to other cells · Alt+drag copies · Shift keeps it straight · Esc cancels' },
  wand:       { id: 'wand',       label: 'Magic Wand',  key: 'Y', icon: WandIcon, hint: 'Click a shape to select every shape with the same colour (or shape / size)' },
  stamp:      { id: 'stamp',      label: 'Shape Stamp', key: 'S', icon: StampIcon, hint: 'Click or drag to place shapes; Alt+click to replace' },
  eraser:     { id: 'eraser',     label: 'Eraser',      key: 'E', icon: EraserIcon, hint: 'Click or drag to remove shapes' },
  rotate:     { id: 'rotate',     label: 'Rotate',      key: 'R', icon: RotateIcon, hint: 'Click to rotate 90° clockwise, Alt+click anticlockwise' },
  reflect:    { id: 'reflect',    label: 'Reflect',     key: 'O', icon: ReflectIcon, hint: 'Click to mirror horizontally, Alt+click vertically' },
  bucket:     { id: 'bucket',     label: 'Paint Bucket', key: 'K', icon: BucketIcon, hint: 'Click a part of a shape to paint it; Alt+click to paint every part of that colour' },
  eyedropper: { id: 'eyedropper', label: 'Eyedropper',  key: 'I', icon: EyedropperIcon, hint: 'Click a part of a shape to pick up its colour' },
  hand:       { id: 'hand',       label: 'Hand',        key: 'H', icon: HandIcon, hint: 'Or hold Space with any tool' },
  zoom:       { id: 'zoom',       label: 'Zoom',        key: 'Z', icon: ZoomIcon, hint: 'Click to zoom in, Alt+click to zoom out' },
};

export const MODE_REGISTRY = {
  gridBuilder: {
    id: 'gridBuilder',
    label: 'Grid Pattern',
    tagline: 'Pack and colour SVG shapes on a grid',
    description: 'Fill a grid from the shape library, then colour it with palettes, gradients, images and generative fills.',
    accent: '#7b61ff',
    mark: GridModeMark,
    tools: ['select', 'move', 'wand', '|', 'stamp', 'eraser', 'rotate', 'reflect', '|', 'bucket', 'eyedropper', '|', 'hand', 'zoom'],
    dock: [
      { id: 'properties', panels: [
        { id: 'properties', title: 'Properties', component: PropertiesPanel, menu: ['view.fit', 'generate.fillGaps', 'generate.flipH', 'generate.flipV', 'file.export'] },
        { id: 'layers', title: 'Layers', component: LayersPanel, menu: ['select.all', 'select.none', 'object.showAll', 'object.unlockAll'] },
        { id: 'info', title: 'Info', component: InfoPanel, menu: ['object.randomOpacity', 'object.resetOpacity', 'object.unpin', 'edit.duplicate'] },
        { id: 'history', title: 'History', component: HistoryPanel, menu: ['edit.undo', 'edit.redo'] },
      ], grow: 3 },
      { id: 'generate', panels: [
        { id: 'generate', title: 'Generate', component: GeneratePanel, menu: ['generate.fill', 'generate.fillGaps', 'generate.surprise', 'generate.clear'] },
        { id: 'layouts', title: 'Layouts', component: LayoutsPanel, menu: ['generate.clearLayout'] },
      ], grow: 3 },
      { id: 'colour', panels: [
        { id: 'colour', title: 'Colour', component: ColourPanel, menu: ['colour.shuffle', 'colour.saveSwatches'] },
        { id: 'swatches', title: 'Swatches', component: SwatchesPanel, menu: ['colour.importSwatches', 'colour.saveSwatches'] },
      ], grow: 3 },
      { id: 'assets', panels: [{ id: 'assets', title: 'Assets', component: AssetsPanel, menu: ['assets.enableAll', 'assets.disableAll', 'assets.enableUsed'] }], defaultCollapsed: true, grow: 3 },
      { id: 'effects', panels: [{ id: 'effects', title: 'Effects', component: EffectsPanel, menu: ['view.effects', 'file.export'] }], defaultCollapsed: true, grow: 2 },
      { id: 'image', panels: [{ id: 'image', title: 'Image', component: ImagePanel }], defaultCollapsed: true },
      { id: 'motion', panels: [
        { id: 'animation', title: 'Animation', component: AnimationPanel },
        { id: 'audio', title: 'Audio', component: AudioPanel },
      ], defaultCollapsed: true },
    ],
  },
  knotwork: {
    id: 'knotwork',
    label: 'Meander',
    tagline: 'Generate knot and key patterns',
    description: 'Seeded meander walker with symmetry, word-seeded designs, image-sampled colour and seamless tiling.',
    accent: '#e0a33a',
    mark: MeanderModeMark,
    tools: ['select', 'hand', 'zoom'],
    dock: [
      { id: 'properties', panels: [
        { id: 'properties', title: 'Properties', component: PropertiesPanel, menu: ['view.fit', 'file.export'] },
        { id: 'layers', title: 'Layers', component: MeanderLayersPanel },
        { id: 'history', title: 'History', component: HistoryPanel, menu: ['edit.undo', 'edit.redo'] },
      ], grow: 2 },
      { id: 'meander', panels: [{ id: 'meander', title: 'Meander', component: MeanderPanel, menu: ['meander.fill', 'meander.recolour'] }], grow: 4 },
      { id: 'colour', panels: [
        { id: 'colour', title: 'Colour', component: MeanderThemePanel, menu: ['colour.saveSwatches'] },
        { id: 'swatches', title: 'Swatches', component: SwatchesPanel, menu: ['colour.importSwatches', 'colour.saveSwatches'] },
      ], grow: 2 },
      { id: 'effects', panels: [{ id: 'effects', title: 'Effects', component: EffectsPanel, menu: ['view.effects', 'file.export'] }], defaultCollapsed: true, grow: 2 },
      { id: 'image', panels: [{ id: 'image', title: 'Image', component: ImagePanel }], defaultCollapsed: true },
    ],
  },
};

export const MODE_ORDER = ['gridBuilder', 'knotwork'];
