import { effectsReach } from './effectDefs';

// WebGL pass for the raster effects. One fragment shader runs every enabled
// effect in order. It works in artboard coordinates: the source texture is
// the artwork rendered at `k` device pixels per artboard pixel, offset by
// `off`, so the same code drives the live canvas (any zoom / pan) and the
// export (any scale, processed in tiles).

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texSize, u_outSize, u_off, u_artSize;
uniform float u_k, u_seed;
uniform float u_post, u_levels;
uniform float u_half, u_halfSize, u_halfAngle, u_halfMono;
uniform float u_copy, u_copyContrast, u_copyToner;
uniform float u_riso, u_risoOffset, u_risoAngle, u_risoTexture;
uniform float u_chroma, u_chromaAmount;
uniform float u_glow, u_glowRadius, u_glowStrength, u_glowThreshold;
uniform float u_scan, u_scanSpacing, u_scanIntensity;
uniform float u_grain, u_grainAmount, u_grainSize;

const vec3 PAPER = vec3(0.965, 0.955, 0.925);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030) + u_seed * 0.0137);
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
vec4 texAt(vec2 art) { return texture2D(u_tex, (art * u_k + u_off) / u_texSize); }

// The artwork at an artboard point after halftone and posterise.
vec3 base(vec2 art) {
  vec3 c = texAt(art).rgb;
  if (u_half > 0.5) {
    float a = radians(u_halfAngle);
    float ca = cos(a), sa = sin(a);
    vec2 q = vec2(ca * art.x + sa * art.y, -sa * art.x + ca * art.y) / u_halfSize;
    vec2 cell = floor(q) + 0.5;
    vec2 cArt = vec2(ca * cell.x - sa * cell.y, sa * cell.x + ca * cell.y) * u_halfSize;
    vec3 cc = texAt(cArt).rgb;
    float l = luma(cc);
    float r = u_halfMono > 0.5 ? sqrt(1.0 - l) * 0.72 : 0.3 + 0.42 * sqrt(1.0 - l);
    float w = 0.75 / max(u_halfSize * u_k, 1.0);
    float ink = 1.0 - smoothstep(r - w, r + w, length(q - cell));
    c = mix(PAPER, u_halfMono > 0.5 ? vec3(0.08) : cc, ink);
  }
  if (u_post > 0.5) {
    float n = u_levels - 1.0;
    c = floor(c * n + 0.5) / n;
  }
  return c;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_outSize.y - gl_FragCoord.y);
  vec2 art = (px - u_off) / u_k;
  vec4 src = texAt(art);

  vec2 offR = vec2(0.0), offG = vec2(0.0), offB = vec2(0.0);
  bool split = false;
  if (u_riso > 0.5) {
    float a = radians(u_risoAngle);
    vec2 d = vec2(cos(a), sin(a)) * u_risoOffset;
    offR += d; offB -= d; offG += vec2(-d.y, d.x) * 0.5;
    split = true;
  }
  if (u_chroma > 0.5) {
    vec2 fromCentre = (art - u_artSize * 0.5) / max(u_artSize.x, u_artSize.y);
    offR += fromCentre * u_chromaAmount * 2.0;
    offB -= fromCentre * u_chromaAmount * 2.0;
    split = true;
  }
  vec3 c = split ? vec3(base(art + offR).r, base(art + offG).g, base(art + offB).b) : base(art);

  if (u_riso > 0.5 && u_risoTexture > 0.0) {
    // Uneven ink: each colour layer gets its own speckle.
    vec2 g = floor(art * 0.9);
    vec3 speck = vec3(hash(g + 11.0), hash(g + 37.0), hash(g + 71.0));
    c = mix(c, vec3(1.0), (1.0 - c) * (speck - 0.35) * 0.5 * u_risoTexture);
  }

  if (u_copy > 0.5) {
    float l = luma(c);
    float t = 0.5 + (hash(floor(art * 0.5) + 3.0) - 0.5) * 0.06;
    float soft = mix(0.32, 0.02, u_copyContrast);
    l = smoothstep(t - soft, t + soft, l);
    float speck = step(hash(floor(art * 1.3) + 17.0), u_copyToner * 0.05);
    float streak = 1.0 - u_copyToner * 0.12 * (0.5 + 0.5 * sin(art.x * 0.031 + hash(vec2(floor(art.x / 40.0), 1.0)) * 6.0));
    l = l * streak * (1.0 - speck * 0.85);
    c = mix(vec3(0.07), vec3(0.95, 0.94, 0.9), l);
  }

  if (u_glow > 0.5) {
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 40; i++) {
      float fi = float(i);
      float rr = sqrt((fi + 0.5) / 40.0) * u_glowRadius;
      float th = fi * 2.39996;
      vec3 s = texAt(art + vec2(cos(th), sin(th)) * rr).rgb;
      float v = max(max(s.r, s.g), s.b);
      float sat = v - min(min(s.r, s.g), s.b);
      float b = max(0.0, v - u_glowThreshold) / (1.0 - u_glowThreshold + 0.001) * (0.35 + 0.65 * sat);
      float w = 1.0 - 0.6 * rr / u_glowRadius;
      acc += s * b * w;
      wsum += w;
    }
    // Screen blend: light spills into dark areas, never past white.
    vec3 g = clamp(acc / wsum * u_glowStrength * 2.0, 0.0, 1.0);
    c = 1.0 - (1.0 - c) * (1.0 - g);
  }

  if (u_scan > 0.5) {
    float line = 0.5 + 0.5 * cos(6.2831853 * art.y / u_scanSpacing);
    c *= 1.0 - u_scanIntensity * line;
    float m = mod(floor(art.x / max(u_scanSpacing / 3.0, 0.5)), 3.0);
    vec3 mask = m < 1.0 ? vec3(1.0, 0.82, 0.82) : m < 2.0 ? vec3(0.82, 1.0, 0.82) : vec3(0.82, 0.82, 1.0);
    c *= mix(vec3(1.0), mask, u_scanIntensity * 0.6);
    vec2 v = art / u_artSize - 0.5;
    c *= 1.0 - u_scanIntensity * 0.9 * dot(v, v);
    c *= 1.0 + u_scanIntensity * 0.25;
  }

  if (u_grain > 0.5) {
    c += (hash(floor(art / u_grainSize)) - 0.5) * u_grainAmount;
  }

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`;

function compile(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}

// One renderer per output canvas (WebGL contexts are limited, so callers keep theirs).
export function createEffectsRenderer(canvas = document.createElement('canvas')) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uniforms = {};
  const u = (name) => (uniforms[name] ??= gl.getUniformLocation(prog, name));
  const f = (name, ...v) => gl[`uniform${v.length}f`](u(name), ...v);
  const on = (x) => (x?.on ? 1 : 0);

  return {
    canvas,
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    // source: canvas/image (texture px = art × k + off); output is sized outW × outH.
    render(source, fx, { k, off, artSize, outW, outH }) {
      if (canvas.width !== outW) canvas.width = outW;
      if (canvas.height !== outH) canvas.height = outH;
      gl.viewport(0, 0, outW, outH);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      f('u_texSize', source.width, source.height);
      f('u_outSize', outW, outH);
      f('u_off', off[0], off[1]);
      f('u_artSize', artSize.width, artSize.height);
      f('u_k', k);
      f('u_seed', fx.seed ?? 1);
      f('u_post', on(fx.posterise)); f('u_levels', fx.posterise.levels);
      f('u_half', on(fx.halftone)); f('u_halfSize', fx.halftone.size); f('u_halfAngle', fx.halftone.angle); f('u_halfMono', fx.halftone.mono ? 1 : 0);
      f('u_copy', on(fx.photocopy)); f('u_copyContrast', fx.photocopy.contrast); f('u_copyToner', fx.photocopy.toner);
      f('u_riso', on(fx.riso)); f('u_risoOffset', fx.riso.offset); f('u_risoAngle', fx.riso.angle); f('u_risoTexture', fx.riso.texture);
      f('u_chroma', on(fx.chroma)); f('u_chromaAmount', fx.chroma.amount);
      f('u_glow', on(fx.glow)); f('u_glowRadius', fx.glow.radius); f('u_glowStrength', fx.glow.strength); f('u_glowThreshold', fx.glow.threshold);
      f('u_scan', on(fx.scanlines)); f('u_scanSpacing', fx.scanlines.spacing); f('u_scanIntensity', fx.scanlines.intensity);
      f('u_grain', on(fx.grain)); f('u_grainAmount', fx.grain.amount); f('u_grainSize', fx.grain.size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

let exportRenderer = null;

// Applies the effects to a finished export raster (`canvas`, k px per
// artboard px). Large images are processed in overlapping tiles. Returns a
// new canvas the same size.
export function applyEffectsToCanvas(canvas, fx, artSize) {
  exportRenderer ??= createEffectsRenderer();
  if (!exportRenderer) throw new Error('Effects need WebGL, which isn’t available here.');
  const k = canvas.width / artSize.width;
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const octx = out.getContext('2d');
  const pad = Math.ceil(effectsReach(fx) * k) + 2;
  const tile = Math.max(256, Math.min(4096, exportRenderer.maxTexture) - pad * 2);
  const piece = document.createElement('canvas');
  const pctx = piece.getContext('2d');
  for (let ty = 0; ty < canvas.height; ty += tile) {
    for (let tx = 0; tx < canvas.width; tx += tile) {
      const w = Math.min(tile, canvas.width - tx), h = Math.min(tile, canvas.height - ty);
      const sx = Math.max(0, tx - pad), sy = Math.max(0, ty - pad);
      const sw = Math.min(canvas.width, tx + w + pad) - sx, sh = Math.min(canvas.height, ty + h + pad) - sy;
      piece.width = sw; piece.height = sh;
      pctx.clearRect(0, 0, sw, sh);
      pctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      exportRenderer.render(piece, fx, { k, off: [-sx, -sy], artSize, outW: sw, outH: sh });
      octx.drawImage(exportRenderer.canvas, tx - sx, ty - sy, w, h, tx, ty, w, h);
    }
  }
  return out;
}
