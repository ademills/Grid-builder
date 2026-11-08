import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { copyLinear, copyMatrix, wedgeAngles, radialSvg } from '../src/utils/kaleidoscope';
import { clipToConvex } from '../src/utils/svgGeometry';
import { plotterSvg } from '../src/utils/plotter';

const parse = (s) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
const apply = ([a, b, c, d, e, f], [x, y]) => [a * x + c * y + e, b * x + d * y + f];

describe('radial repeat (whole artboard)', () => {
  it('turns copy k by k wedges about the centre', () => {
    const m = copyMatrix(1, 4, false, 50, 50);
    const [x, y] = apply(m, [50, 0]); // top middle → a quarter turn clockwise (y down): right middle
    expect(x).toBeCloseTo(100); expect(y).toBeCloseTo(50);
  });
  it('mirrors odd copies across the wedge edge', () => {
    const { a0, step } = wedgeAngles(6);
    const edge = a0 + step;
    // a point on the shared edge stays put under copy 1's reflection
    const p = [Math.cos(edge), Math.sin(edge)];
    const [a, b, c, d] = copyLinear(1, 6, true);
    expect(a * p[0] + c * p[1]).toBeCloseTo(p[0]);
    expect(b * p[0] + d * p[1]).toBeCloseTo(p[1]);
    // and it's a reflection (determinant −1); even copies are turns (+1)
    expect(a * d - b * c).toBeCloseTo(-1);
    const [e, f, g, h] = copyLinear(2, 6, true);
    expect(e * h - f * g).toBeCloseTo(1);
  });
  it('wraps the shapes in a clipped wedge and its copies', () => {
    const svg = parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#fff"/>
      <g data-name="Shapes"><path id="s" d="M45 5H55V15H45Z" fill="#f00"/></g></svg>`);
    radialSvg(svg, { count: 6, mirror: true }, { w: 100, h: 100 });
    const groups = Array.from(svg.getElementsByTagName('g')).filter(g => /^radial_/.test(g.getAttribute('id') ?? ''));
    expect(groups).toHaveLength(6);
    expect(groups[0].getAttribute('clip-path')).toBe('url(#radial-wedge)');
    const ids = Array.from(svg.getElementsByTagName('*')).map(e => e.getAttribute('id')).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg.getElementsByTagName('clipPath')).toHaveLength(1);
  });
  it('leaves the SVG alone while off', () => {
    const svg = parse('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g data-name="Shapes"><path d="M0 0H1V1Z"/></g></svg>');
    radialSvg(svg, { count: 1 }, { w: 10, h: 10 });
    expect(svg.getElementsByTagName('clipPath')).toHaveLength(0);
  });
  it('clips plotter lines to the wedge', () => {
    const tri = [[0, 0], [10, 0], [0, 10]];
    const [piece] = clipToConvex({ pts: [[-5, 2], [15, 2]], closed: false }, tri);
    expect(piece.pts[0][0]).toBeCloseTo(0); expect(piece.pts[1][0]).toBeCloseTo(8);
    const svg = parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g data-name="Shapes"><path d="M50 0V100" fill="none" stroke="#000"/></g></svg>`);
    radialSvg(svg, { count: 4, mirror: false }, { w: 100, h: 100 });
    const { svg: out } = plotterSvg(svg);
    // a vertical line through the centre: the upward wedge keeps its top
    // half, and the 4 copies make a plus -- one run each, not the whole line 4 times
    const d = Array.from(out.getElementsByTagName('path')).map(p => p.getAttribute('d')).join(' ');
    const total = [...d.matchAll(/M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/g)]
      .reduce((L, [, a, b, c, e]) => L + Math.hypot(c - a, e - b), 0);
    expect(total).toBeCloseTo(200, 0);
    for (const [, x] of d.matchAll(/[ML](-?[\d.]+) /g)) {
      expect(+x).toBeGreaterThanOrEqual(-0.01); expect(+x).toBeLessThanOrEqual(100.01);
    }
  });
});
