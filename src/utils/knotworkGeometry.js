// Compiles a polyline of grid-path vertices into an SVG path string using
// only straight-line (`L`) and circular-arc (`A`) commands — never Bezier
// curves. Each corner is filleted with a circular arc of the given radius.
//
// When radius = cellSize / 2 (the standard "pill" setting) and two
// same-direction 90° turns sit one grid cell apart, each fillet's trim
// distance exactly consumes half the connecting segment, so the two quarter
// arcs meet tangentially and read as one continuous semicircular loopback —
// no special-casing needed. A literal single-vertex 180° reversal (which a
// well-formed grid path should never produce) is still handled below as a
// fallback, via an offset stadium cap.

function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function scale(v, s) { return { x: v.x * s, y: v.y * s }; }
function len(v) { return Math.hypot(v.x, v.y); }
function norm(v) { const l = len(v) || 1; return { x: v.x / l, y: v.y / l }; }
function fmt(n) { return Math.round(n * 1000) / 1000; }

// Signed angle (radians, -PI..PI) turned when travelling from direction
// `d1` into direction `d2`. 0 = straight ahead, +/-PI = full reversal.
function turnAngle(d1, d2) {
  const cross = d1.x * d2.y - d1.y * d2.x;
  const dot = d1.x * d2.x + d1.y * d2.y;
  return Math.atan2(cross, dot);
}

// Shared per-vertex fillet computation used by both the open and closed
// compilers: given neighbors A, V, C and a target radius, returns either
// { straight: true } (no fillet needed) or an arc descriptor
// { arcStart, arcEnd, radius, sweepFlag }.
function computeFillet(A, V, C, radius) {
  const dIn = norm(sub(V, A));
  const dOut = norm(sub(C, V));
  const theta = turnAngle(dIn, dOut);
  const absTheta = Math.abs(theta);

  if (absTheta < 1e-6) return { straight: true };

  const segInLen = len(sub(V, A));
  const segOutLen = len(sub(C, V));

  // Full reversal: the two segments are collinear and run in opposite
  // directions, so the standard fillet (which stays on the A-V-C line)
  // degenerates to a single point. Draw a stadium-style semicircular cap
  // instead: trim `t` back from V, then swing a 180° arc of radius `t`
  // sideways onto the parallel return line. Note this assumes an isolated
  // reversal — real loopbacks are produced by two consecutive same-turn
  // 90° corners one cell apart, which the generic fillet below already
  // renders as a seamless semicircle without hitting this branch at all.
  if (Math.abs(Math.PI - absTheta) < 1e-3) {
    const perp = { x: -dIn.y, y: dIn.x };
    const side = theta >= 0 ? 1 : -1;
    const t = Math.min(radius, segInLen / 2, segOutLen / 2);
    const arcStart = sub(V, scale(dIn, t));
    const arcEnd = add(arcStart, scale(perp, side * 2 * t));
    return { arcStart, arcEnd, radius: t, sweepFlag: side > 0 ? 1 : 0 };
  }

  // Standard corner fillet: trim distance t from the vertex along each
  // segment relates to the fillet radius r by t = r * tan(theta/2). When
  // the segments are too short for the full radius, shrink the fillet's
  // effective radius to whatever the clamped trim distance supports, so
  // the arc stays tangent to both trimmed segment ends.
  const desiredT = radius * Math.tan(absTheta / 2);
  const t = Math.min(desiredT, segInLen / 2, segOutLen / 2);
  const rEff = t / Math.tan(absTheta / 2);
  const arcStart = sub(V, scale(dIn, t));
  const arcEnd = add(V, scale(dOut, t));
  return { arcStart, arcEnd, radius: rEff, sweepFlag: theta > 0 ? 1 : 0 };
}

// Converts a sequence of grid-cell coordinates into pixel-space cell-center
// points, using the same origin/cellSize convention as computeGrid().
export function knotworkPathToPixels(path, gridComputed) {
  const { gridOriginX, gridOriginY, cellSize } = gridComputed;
  return path.map(({ col, row }) => ({
    x: gridOriginX + (col + 0.5) * cellSize,
    y: gridOriginY + (row + 0.5) * cellSize,
  }));
}

// points: array of {x,y} pixel-space polyline vertices (consecutive,
// distinct). radius: fillet/U-turn circle radius, e.g. cellSize / 2.
export function compileKnotworkPath(points, radius) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }

  const cmds = [`M ${fmt(points[0].x)} ${fmt(points[0].y)}`];

  for (let i = 1; i < points.length - 1; i++) {
    const f = computeFillet(points[i - 1], points[i], points[i + 1], radius);
    if (f.straight) continue;
    cmds.push(`L ${fmt(f.arcStart.x)} ${fmt(f.arcStart.y)}`);
    cmds.push(`A ${fmt(f.radius)} ${fmt(f.radius)} 0 0 ${f.sweepFlag} ${fmt(f.arcEnd.x)} ${fmt(f.arcEnd.y)}`);
  }

  const last = points[points.length - 1];
  cmds.push(`L ${fmt(last.x)} ${fmt(last.y)}`);
  return cmds.join(' ');
}

// Same contract as compileKnotworkPath, but treats `points` as a closed
// loop (the last point connects back to the first), filleting every vertex
// including the wraparound, and closing with `Z`. Used for the lattice
// weave's closed strand loops.
export function compileClosedKnotworkPath(points, radius) {
  const n = points.length;
  if (n < 3) return '';

  const fillets = points.map((V, i) => {
    const A = points[(i - 1 + n) % n];
    const C = points[(i + 1) % n];
    const f = computeFillet(A, V, C, radius);
    return f.straight ? { arcStart: V, arcEnd: V, straight: true } : f;
  });

  const cmds = [`M ${fmt(fillets[0].arcStart.x)} ${fmt(fillets[0].arcStart.y)}`];
  for (let i = 0; i < n; i++) {
    const f = fillets[i];
    if (!f.straight) {
      cmds.push(`A ${fmt(f.radius)} ${fmt(f.radius)} 0 0 ${f.sweepFlag} ${fmt(f.arcEnd.x)} ${fmt(f.arcEnd.y)}`);
    }
    const next = fillets[(i + 1) % n];
    cmds.push(`L ${fmt(next.arcStart.x)} ${fmt(next.arcStart.y)}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

function directionOf(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

// True for a path endpoint, or any vertex where the incoming and outgoing
// directions differ -- i.e. exactly the set of vertices compileKnotworkPath
// would fillet (or cap, at the endpoints). addTensionWobble below never
// inserts a point next to one of these, so it can never perturb a fillet's
// angle or a cap's direction.
function isCornerVertex(points, i) {
  if (i <= 0 || i >= points.length - 1) return true;
  const dIn = directionOf(points[i - 1], points[i]);
  const dOut = directionOf(points[i], points[i + 1]);
  return Math.abs(dIn.x - dOut.x) > 1e-6 || Math.abs(dIn.y - dOut.y) > 1e-6;
}

// Inserts a small perpendicular-offset point at the midpoint of each
// interior straight-run segment -- one whose both endpoints are themselves
// non-corner vertices -- to give strands a hand-drawn "tension" instead of
// mechanically uniform straight lines. Never touches an existing point, so
// every corner vertex and path endpoint compileKnotworkPath sees is
// byte-identical to the tension=0 case; only brand-new inserted points
// carry the offset. Those new points do introduce a (tiny) turn angle of
// their own, which compileKnotworkPath fillets automatically using the
// same shared radius as everything else -- at these near-straight angles
// that resolves to a very gentle, wide arc rather than a sharp kink, which
// is what actually reads as "wobble" rather than "zigzag".
export function addTensionWobble(points, tension, cellSize, rng) {
  if (points.length < 3 || tension <= 0) return points;
  const maxOffset = cellSize * 0.18 * tension;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (!isCornerVertex(points, i - 1) && !isCornerVertex(points, i)) {
      const dir = directionOf(a, b);
      const px = -dir.y, py = dir.x;
      const offset = (rng() * 2 - 1) * maxOffset;
      out.push({ x: (a.x + b.x) / 2 + px * offset, y: (a.y + b.y) / 2 + py * offset });
    }
    out.push(b);
  }
  return out;
}