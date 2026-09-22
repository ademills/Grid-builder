export function computeFractalMask(gridComputed, settings) {
  const { cols, rows } = gridComputed;
  const {
    patternType = 'sierpinski',
    depth = 3,
    invert = false,
  } = settings;

  const activeCells = new Set();
  const fn = PATTERNS[patternType] ?? sierpinski;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const active = fn(c, r, cols, rows, depth);
      if (active !== invert) activeCells.add(`${c},${r}`);
    }
  }
  return activeCells;
}

function sierpinski(c, r, cols, rows, depth) {
  const size = Math.max(cols, rows);
  let x = c, y = r;
  for (let i = 0; i < depth + 4; i++) {
    const s = Math.pow(3, i);
    if (s > size) break;
    const cx = Math.floor(x / s) % 3;
    const cy = Math.floor(y / s) % 3;
    if (cx === 1 && cy === 1) return false;
  }
  return true;
}

function cantorDust(c, r, cols, rows, depth) {
  const size = Math.max(cols, rows);
  let x = c, y = r;
  for (let i = 0; i < depth + 4; i++) {
    const s = Math.pow(3, i);
    if (s > size) break;
    const cx = Math.floor(x / s) % 3;
    const cy = Math.floor(y / s) % 3;
    if (cx === 1 || cy === 1) return false;
  }
  return true;
}

function vicsek(c, r, cols, rows, depth) {
  const size = Math.max(cols, rows);
  let x = c, y = r;
  for (let i = 0; i < depth + 4; i++) {
    const s = Math.pow(3, i);
    if (s > size) break;
    const cx = Math.floor(x / s) % 3;
    const cy = Math.floor(y / s) % 3;
    if (cx !== 1 && cy !== 1) return false;
  }
  return true;
}

const PATTERNS = {
  sierpinski,
  cantorDust,
  vicsek,
};
