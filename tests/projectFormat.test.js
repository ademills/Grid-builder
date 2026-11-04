import { describe, it, expect } from 'vitest';
import { serializeProject, parseProject, PROJECT_VERSION, fileNameFromPath } from '../src/store/projectFormat';
import { createDefaultDocState } from '../src/store/docDefaults';

const MODES = ['gridBuilder', 'knotwork', 'linework'];
const docOf = (mode, state = createDefaultDocState(mode)) => ({ id: 'x', mode, name: `Test ${mode}`, state });

describe('project files', () => {
  it.each(MODES)('save → open → save gives the same file (%s)', (mode) => {
    const first = serializeProject(docOf(mode));
    const { mode: m, name, state } = parseProject(first);
    expect(m).toBe(mode);
    expect(name).toBe(`Test ${mode}`);
    expect(serializeProject({ id: 'x', mode: m, name, state })).toBe(first);
  });

  it('keeps placed shapes and drops their SVG markup from the file', () => {
    const state = createDefaultDocState('gridBuilder');
    const block = { id: 'b1', type: 'shape', assetId: 'not-a-real-asset', gridCol: 2, gridRow: 3, cols: 1, rows: 1, svgContent: '<svg/>' };
    const text = serializeProject(docOf('gridBuilder', { ...state, placedBlocks: [block] }));
    expect(text).not.toContain('<svg/>');
    const parsed = parseProject(text);
    expect(parsed.state.placedBlocks).toHaveLength(1);
    expect(parsed.state.placedBlocks[0]).toMatchObject({ id: 'b1', gridCol: 2, gridRow: 3 });
  });

  it('opens a legacy (v4) flat file as a Grid Pattern with defaults filled in', () => {
    const legacy = JSON.stringify({ version: 4, gridSettings: { cols: 12, borderPct: 5 }, placedBlocks: [] });
    const { mode, state } = parseProject(legacy);
    expect(mode).toBe('gridBuilder');
    expect(state.gridSettings.cols).toBe(12);
    // Seeds are random per new document, so compare everything else.
    const withoutSeed = ({ seed, ...rest }) => { void seed; return rest; };
    expect(withoutSeed(state.glitchSettings)).toEqual(withoutSeed(createDefaultDocState('gridBuilder').glitchSettings));
    expect(typeof state.glitchSettings.seed).toBe('number');
  });

  it('recognises a legacy Meander file by its single SVG image block', () => {
    const legacy = JSON.stringify({ version: 3, placedBlocks: [{ type: 'image', imageSrc: 'data:image/svg+xml;base64,AAAA' }] });
    expect(parseProject(legacy).mode).toBe('knotwork');
  });

  it('converts pre-1.4.1 Meander roundness into corner radii', () => {
    const state = createDefaultDocState('knotwork');
    const { capRoundness, innerRadius, outerRadius, ...rest } = state.knotworkSettings;
    void capRoundness; void innerRadius; void outerRadius;
    const text = JSON.stringify({ version: PROJECT_VERSION, mode: 'knotwork', name: 'Old', state: { knotworkSettings: { ...rest, roundness: 1 } } });
    const ks = parseProject(text).state.knotworkSettings;
    expect(ks.capRoundness).toBeCloseTo(1);
    expect(ks.outerRadius).toBeGreaterThan(ks.innerRadius);
  });

  it('rejects files it cannot read', () => {
    expect(() => parseProject('not json')).toThrow(/valid project/);
    expect(() => parseProject(JSON.stringify({ version: 99 }))).toThrow(/Unsupported project version/);
  });

  it('names a document after its file', () => {
    expect(fileNameFromPath('C:\\Users\\Ade\\Designs\\Blue maze.mps.json')).toBe('Blue maze');
    expect(fileNameFromPath('/tmp/old.json')).toBe('old');
  });
});
