import { describe, it, expect } from 'vitest';
import { serializeProject, parseProject } from '../src/store/projectFormat';
import { createDefaultDocState } from '../src/store/docDefaults';
import { useShapeStore } from '../src/store/shapeStore';
import { assetById } from '../src/utils/assetRegistry';
import { suggestSize } from '../src/utils/svgImport';

describe('user shapes', () => {
  it('travel with a project file to a machine that lacks them', () => {
    const shape = useShapeStore.getState().addShape({ name: 'Eyes', cols: 2, rows: 1, svgContent: '<svg data-x="eyes"/>', tags: [' Curves ', 'curves', 'Heavy'] });
    expect(shape.tags).toEqual(['curves', 'heavy']);
    const state = createDefaultDocState('gridBuilder');
    state.enabledAssetIds = new Set([shape.id]);
    state.placedBlocks = [{ id: 'b1', assetId: shape.id, gridCol: 0, gridRow: 0, cols: 2, rows: 1, svgContent: shape.svgContent }];
    const text = serializeProject({ id: 'x', mode: 'gridBuilder', name: 'T', state });
    expect(JSON.parse(text).state.userShapes[shape.id].svgContent).toBe('<svg data-x="eyes"/>');

    useShapeStore.getState().deleteShape(shape.id);
    expect(assetById(shape.id)).toBeNull();
    const parsed = parseProject(text);
    expect(parsed.state.placedBlocks[0].svgContent).toBe('<svg data-x="eyes"/>');
    expect(assetById(shape.id)?.name).toBe('Eyes');
  });

  it('suggests a grid size from the artwork proportions', () => {
    expect(suggestSize(100, 100)).toEqual({ cols: 1, rows: 1 });
    expect(suggestSize(200, 95)).toEqual({ cols: 2, rows: 1 });
    expect(suggestSize(50, 160)).toEqual({ cols: 1, rows: 3 });
  });

  it('removes a deleted shape from packs', () => {
    const { addShape, addPack, deleteShape } = useShapeStore.getState();
    const s = addShape({ name: 'A', cols: 1, rows: 1, svgContent: '<svg/>' });
    const p = addPack('Mine', [s.id, 'builtin::x']);
    deleteShape(s.id);
    expect(useShapeStore.getState().packs.find(x => x.id === p.id).assetIds).toEqual(['builtin::x']);
  });
});
