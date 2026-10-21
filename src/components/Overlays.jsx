// Composition overlays (View › Overlays: thirds, golden, centre, ig45,
// ig916): guides drawn over the artboard that
// never appear in exports. Rendered inside the canvas's artboard group, so
// coordinates are artboard px; strokes stay 1px at any zoom.

const PHI = (1 + Math.sqrt(5)) / 2;
const LINE = '#ff4fa3';
const SHADE = 'rgba(255, 79, 163, 0.16)';

// Instagram Stories / Reels keep the top 250px and bottom 340px of a
// 1080 × 1920 frame clear of the app's own buttons and captions.
const IG_STORY_TOP = 250 / 1920;
const IG_STORY_BOTTOM = 340 / 1920;

// The largest rect of aspect w:h centred in the artboard.
function fitAspect(width, height, aw, ah) {
  const scale = Math.min(width / aw, height / ah);
  const w = aw * scale, h = ah * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

function Line(props) {
  return <line stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" {...props} />;
}

function Label({ x, y, children, scale }) {
  // Constant on-screen size: counter the artboard zoom.
  const s = 1 / scale;
  return (
    <text x={x} y={y} fill={LINE} fontSize={11 * s} fontFamily="system-ui, sans-serif"
      dominantBaseline="hanging" style={{ userSelect: 'none' }}
      transform={`translate(${4 * s} ${4 * s})`}>
      {children}
    </text>
  );
}

// Shades everything in the artboard outside `r`.
function ShadeOutside({ r, width, height }) {
  return (
    <path fill={SHADE} fillRule="evenodd"
      d={`M0 0H${width}V${height}H0Z M${r.x} ${r.y}V${r.y + r.h}H${r.x + r.w}V${r.y}Z`} />
  );
}

export function Overlays({ ids, width, height, scale }) {
  if (!ids?.length) return null;
  const has = id => ids.includes(id);
  const g1 = 1 / (PHI * PHI); // ≈ 0.382

  let post = null, story = null;
  if (has('ig45')) post = fitAspect(width, height, 4, 5);
  if (has('ig916')) story = fitAspect(width, height, 9, 16);

  return (
    <g pointerEvents="none" data-noexport="true">
      {has('thirds') && [1, 2].map(i => (
        <g key={`t${i}`}>
          <Line x1={width * i / 3} y1={0} x2={width * i / 3} y2={height} />
          <Line x1={0} y1={height * i / 3} x2={width} y2={height * i / 3} />
        </g>
      ))}

      {has('golden') && [g1, 1 - g1].map(f => (
        <g key={`g${f}`}>
          <Line x1={width * f} y1={0} x2={width * f} y2={height} strokeDasharray="6 4" />
          <Line x1={0} y1={height * f} x2={width} y2={height * f} strokeDasharray="6 4" />
        </g>
      ))}

      {has('centre') && (
        <g>
          <Line x1={width / 2} y1={0} x2={width / 2} y2={height} strokeDasharray="2 3" />
          <Line x1={0} y1={height / 2} x2={width} y2={height / 2} strokeDasharray="2 3" />
          <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.02}
            fill="none" stroke={LINE} vectorEffect="non-scaling-stroke" />
        </g>
      )}

      {post && (() => {
        // Profile grids show posts cropped to 3:4, centred.
        const crop = { x: post.x, w: post.w, h: post.w * 4 / 3 };
        crop.y = post.y + (post.h - crop.h) / 2;
        return (
          <g>
            <ShadeOutside r={post} width={width} height={height} />
            <rect x={post.x} y={post.y} width={post.w} height={post.h} fill="none" stroke={LINE} vectorEffect="non-scaling-stroke" />
            <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h} fill="none" stroke={LINE} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            <Label x={post.x} y={post.y} scale={scale}>4:5 post</Label>
            <Label x={crop.x} y={crop.y} scale={scale}>3:4 profile grid crop</Label>
          </g>
        );
      })()}

      {story && (() => {
        const top = story.h * IG_STORY_TOP, bottom = story.h * IG_STORY_BOTTOM;
        const safe = { x: story.x, y: story.y + top, w: story.w, h: story.h - top - bottom };
        return (
          <g>
            <ShadeOutside r={story} width={width} height={height} />
            <rect x={story.x} y={story.y} width={story.w} height={top} fill={SHADE} />
            <rect x={story.x} y={story.y + story.h - bottom} width={story.w} height={bottom} fill={SHADE} />
            <rect x={story.x} y={story.y} width={story.w} height={story.h} fill="none" stroke={LINE} vectorEffect="non-scaling-stroke" />
            <rect x={safe.x} y={safe.y} width={safe.w} height={safe.h} fill="none" stroke={LINE} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
            <Label x={safe.x} y={safe.y} scale={scale}>9:16 safe area</Label>
          </g>
        );
      })()}
    </g>
  );
}
