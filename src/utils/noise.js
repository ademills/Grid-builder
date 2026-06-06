// 2D Simplex noise — deterministic, returns values in [-1, 1].
// Based on Gustavson's public-domain algorithm.

const G2 = (3 - Math.sqrt(3)) / 6;
const F2 = (Math.sqrt(3) - 1) / 2;
const GRAD2 = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

// Deterministic permutation table (fixed seed so pattern is consistent)
const _src = new Uint8Array(256);
for (let i = 0; i < 256; i++) _src[i] = i;
{
  let s = 0x9e3779b9 | 0;
  for (let i = 255; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    const j = ((s >>> 16) & 0xffff) % (i + 1);
    const t = _src[i]; _src[i] = _src[j]; _src[j] = t;
  }
}
const perm = new Uint8Array(512);
for (let i = 0; i < 512; i++) perm[i] = _src[i & 255];

export function simplex2(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s) | 0;
  const j = Math.floor(y + s) | 0;
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = perm[ii + perm[jj]] & 7;
  const gi1 = perm[ii + i1 + perm[jj + j1]] & 7;
  const gi2 = perm[ii + 1 + perm[jj + 1]] & 7;

  let n = 0;
  for (const [dx, dy, gi] of [[x0, y0, gi0], [x1, y1, gi1], [x2, y2, gi2]]) {
    const t2 = 0.5 - dx * dx - dy * dy;
    if (t2 > 0) {
      const g = GRAD2[gi];
      n += t2 * t2 * t2 * t2 * (g[0] * dx + g[1] * dy);
    }
  }
  return 70 * n;
}
