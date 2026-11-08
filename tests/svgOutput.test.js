import { describe, it, expect } from 'vitest';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { pathPolylines, parseTransform, apply, collectShapes, normaliseColour } from '../src/utils/svgGeometry';
import { joinRuns, orderRuns, travel, plotterSvg } from '../src/utils/plotter';
import { separations, inksOf } from '../src/utils/separations';

const parse = (s) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
const text = (el) => new XMLSerializer().serializeToString(el);
const paths = (el) => Array.from(el.getElementsByTagName('path'));

describe('svg geometry', () => {
  it('reads path commands, relative and absolute', () => {
    const [a] = pathPolylines('M0 0 h10 v10 H0 z');
    expect(a.closed).toBe(true);
    expect(a.pts).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const [b] = pathPolylines('m5 5 10 0 0 10');
    expect(b.pts).toEqual([[5, 5], [15, 5], [15, 15]]);
    expect(pathPolylines('M0 0L1 1M5 5L6 6')).toHaveLength(2);
  });
  it('flattens curves and arcs close to the curve', () => {
    const [c] = pathPolylines('M0 0A10 10 0 0 1 20 0', 0.01);
    for (const [x, y] of c.pts) expect(Math.hypot(x - 10, y)).toBeCloseTo(10, 1);
    expect(c.pts[c.pts.length - 1]).toEqual([20, 0]);
    const [q] = pathPolylines('M0 0C0 10 10 10 10 0', 0.01);
    expect(q.pts.length).toBeGreaterThan(5);
    expect(q.pts[q.pts.length - 1]).toEqual([10, 0]);
  });
  it('composes transforms', () => {
    const m = parseTransform('translate(10 5) scale(2)');
    expect(apply(m, [1, 1])).toEqual([12, 7]);
    const r = parseTransform('rotate(90 5 5)');
    const [x, y] = apply(r, [10, 5]);
    expect(x).toBeCloseTo(5); expect(y).toBeCloseTo(10);
  });
  it('normalises colours', () => {
    expect(normaliseColour('#ABC')).toBe('#aabbcc');
    expect(normaliseColour('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(normaliseColour('none')).toBeNull();
    expect(normaliseColour('url(#g)')).toBeNull();
  });
  it('collects shapes with inherited paint and transforms', () => {
    const svg = parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <g data-name="Background"><rect width="100" height="100" fill="#fff"/></g>
      <g fill="#f00" transform="translate(10 0)"><rect x="0" y="0" width="5" height="5"/></g></svg>`);
    const shapes = collectShapes(svg);
    expect(shapes).toHaveLength(2);
    expect(shapes[0].inBackground).toBe(true);
    expect(shapes[1].fill).toBe('#ff0000');
    expect(shapes[1].polys[0].pts[0]).toEqual([10, 0]);
  });
});

describe('plotter', () => {
  it('draws an edge two tiles share once and joins the rest into runs', () => {
    const polys = [
      { pts: [[0, 0], [10, 0], [10, 10], [0, 10]], closed: true },
      { pts: [[10, 0], [20, 0], [20, 10], [10, 10]], closed: true },
    ];
    const runs = joinRuns(polys, 0.01);
    const length = runs.reduce((L, r) => {
      const pts = r.closed ? [...r.pts, r.pts[0]] : r.pts;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return L;
    }, 0);
    expect(length).toBeCloseTo(70); // 80 drawn before; the shared edge once
    expect(runs.length).toBeLessThanOrEqual(2);
  });
  it('drops zero-length segments and merges straight runs', () => {
    const runs = joinRuns([{ pts: [[0, 0], [0, 0], [5, 0], [10, 0], [10, 0.000001]], closed: false }], 0.01);
    expect(runs).toHaveLength(1);
    expect(runs[0].pts).toEqual([[0, 0], [10, 0]]);
  });
  it('orders runs to cut pen-up travel', () => {
    const runs = [];
    for (let i = 0; i < 40; i++) {
      const x = ((i * 37) % 40) * 10; // a scrambled row of short lines
      runs.push({ pts: [[x, 0], [x, 5]], closed: false });
    }
    const ordered = orderRuns(runs);
    expect(ordered).toHaveLength(40);
    expect(travel(ordered)).toBeLessThan(travel(runs) / 4);
  });
  it('makes a pen per colour, without the background or blurred shapes', () => {
    const svg = parse(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <g data-name="Background"><rect width="100" height="100" fill="#ffffff"/></g>
      <g data-name="Shapes">
        <rect x="0" y="0" width="10" height="10" fill="#ff0000"/>
        <rect x="10" y="0" width="10" height="10" fill="#ff0000"/>
        <circle cx="50" cy="50" r="10" fill="#0000ff"/>
        <path d="M0 50H20" fill="none" stroke="#0000ff"/>
        <rect x="60" y="60" width="5" height="5" fill="#00ff00" filter="url(#b)"/>
      </g></svg>`);
    const { svg: out, stats } = plotterSvg(svg, { penWidth: 0.5 });
    const groups = Array.from(out.getElementsByTagName('g'));
    expect(groups.map(g => g.getAttribute('stroke'))).toEqual(['#ff0000', '#0000ff']);
    expect(groups.every(g => g.getAttribute('fill') === 'none')).toBe(true);
    expect(stats.pens).toBe(2);
    expect(paths(out).every(p => !p.getAttribute('fill'))).toBe(true);
    expect(out.getAttribute('viewBox')).toBe('0 0 100 100');
  });
});

describe('separations', () => {
  const art = () => parse(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
    <g id="Background" data-name="Background"><rect width="200" height="100" fill="#fafafa"/></g>
    <g id="Shapes" data-name="Shapes">
      <path id="a" d="M0 0H10V10Z" fill="#e63946"/>
      <path id="b" d="M20 0H30V10Z" fill="#1d3557" stroke="#e63946"/>
      <path d="M40 0H50V10Z" fill="url(#g)"/>
      <image href="x.png" width="5" height="5"/>
    </g></svg>`);

  it('lists the inks in drawing order and counts what cannot be split', () => {
    const { inks, skipped } = inksOf(art());
    expect(inks).toEqual(['#e63946', '#1d3557']);
    expect(skipped).toBe(2);
  });
  it('makes one sheet per ink, each the same size, with marks', () => {
    const { inks } = separations(art(), {
      marks: true, margin: 10, page: { width: 200, height: 100 }, units: 'px',
      colourName: h => (h === '#e63946' ? 'Red' : null),
    });
    expect(inks.map(i => i.name)).toEqual(['Ink 1 Red #e63946', 'Ink 2 #1d3557']);
    for (const { svg } of inks) {
      expect(svg.getAttribute('viewBox')).toBe('-10 -10 220 120');
      expect(svg.getAttribute('width')).toBe('220');
      expect(text(svg)).not.toContain('#fafafa');
      expect(svg.getElementsByTagName('image').length).toBe(0);
    }
    const red = inks[0].svg;
    const b = paths(red).find(p => p.getAttribute('id') === 'b');
    expect(paths(red).some(p => p.getAttribute('id') === 'a')).toBe(true);
    expect(b.getAttribute('fill')).toBe('none');
    expect(b.getAttribute('stroke')).toBe('#e63946');
    expect(text(red)).toContain('Registration');
    expect(paths(inks[1].svg).some(p => p.getAttribute('id') === 'a')).toBe(false);
  });
  it('prints every ink black when asked', () => {
    const { inks } = separations(art(), { black: true });
    const shapes = paths(inks[1].svg).filter(p => p.getAttribute('fill') !== 'none');
    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.every(p => p.getAttribute('fill') === '#000000')).toBe(true);
  });
  it('puts every ink in one file as named groups with unique ids', () => {
    const { combined } = separations(art(), { marks: true, margin: 10 });
    const groups = Array.from(combined.childNodes).filter(n => n.nodeType === 1 && n.tagName === 'g');
    expect(groups.map(g => g.getAttribute('data-name'))).toEqual(['Ink 1 #e63946', 'Ink 2 #1d3557', 'Registration']);
    const ids = Array.from(combined.getElementsByTagName('*')).map(e => e.getAttribute('id')).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
