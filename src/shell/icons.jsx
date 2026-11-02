// Small stroke icons for the shell chrome. 20×20 viewBox, currentColor.
const Icon = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const SelectIcon = (p) => (
  <Icon {...p}><path d="M5 3l10 6.5-4.6 1.2L8 15z" fill="currentColor" stroke="none" /></Icon>
);

export const LassoIcon = (p) => (
  <Icon {...p}>
    <path d="M10 3.5c3.9 0 7 1.9 7 4.3s-3.1 4.3-7 4.3-7-1.9-7-4.3 3.1-4.3 7-4.3z" />
    <path d="M6.2 11.4c-.9 1.3-.4 2.7.9 3.1s1.6 1.6.9 2.6" />
  </Icon>
);

export const MoveIcon = (p) => (
  <Icon {...p}>
    <path d="M10 2.5v15M2.5 10h15M10 2.5L7.8 4.7M10 2.5l2.2 2.2M10 17.5l-2.2-2.2M10 17.5l2.2-2.2M2.5 10l2.2-2.2M2.5 10l2.2 2.2M17.5 10l-2.2-2.2M17.5 10l-2.2 2.2" />
  </Icon>
);

export const HandIcon = (p) => (
  <Icon {...p}>
    <path d="M7 10V4.5a1.2 1.2 0 012.4 0V9M9.4 9V3.5a1.2 1.2 0 012.4 0V9M11.8 9V4.5a1.2 1.2 0 012.4 0v6.2c0 3-2 5.3-5 5.3-2 0-3.2-1-4.3-2.6L3.5 10.7a1.2 1.2 0 012-1.3L7 11" />
  </Icon>
);

export const ZoomIcon = (p) => (
  <Icon {...p}><circle cx="8.5" cy="8.5" r="5" /><path d="M12.2 12.2L17 17M6.5 8.5h4M8.5 6.5v4" /></Icon>
);

export const CloseIcon = (p) => (
  <Icon size={12} {...p}><path d="M5 5l10 10M15 5L5 15" strokeWidth="2" /></Icon>
);

export const PlusIcon = (p) => (
  <Icon size={14} {...p}><path d="M10 4v12M4 10h12" strokeWidth="2" /></Icon>
);

export const HomeIcon = (p) => (
  <Icon {...p}><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v8h9V8" /></Icon>
);

export const FolderIcon = (p) => (
  <Icon {...p}><path d="M3 6.5a1.5 1.5 0 011.5-1.5H8l1.5 2h6A1.5 1.5 0 0117 8.5v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5z" /></Icon>
);

// Mode marks used on the home screen cards and tab badges.
export const GridModeMark = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <rect x="2" y="2" width="17" height="17" fill="currentColor" opacity="0.95" />
    <path d="M21 2h17v17H21z" fill="currentColor" opacity="0.35" />
    <path d="M21 19L38 2v17z" fill="currentColor" opacity="0.9" />
    <circle cx="10.5" cy="29.5" r="8.5" fill="currentColor" opacity="0.6" />
    <path d="M21 21h17v17H21z" fill="currentColor" opacity="0.2" />
    <path d="M21 38a17 17 0 0117-17v17z" fill="currentColor" opacity="0.85" />
  </svg>
);

export const MeanderModeMark = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3.4"
    strokeLinecap="square" aria-hidden="true">
    <path d="M4 36V4h32v32H12V12h16v16h-8v-8" />
  </svg>
);

export const LineworkModeMark = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6"
    strokeLinecap="butt" aria-hidden="true">
    <path d="M6 34V6h28v28H11V11h18v18H16V16h8v8h-3" />
    <path d="M2 38L20 20" opacity="0.4" />
  </svg>
);

export const EyeIcon = ({ off, ...p }) => (
  <Icon size={14} {...p}>
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" opacity={off ? 0.35 : 1} />
    <circle cx="10" cy="10" r="2.3" opacity={off ? 0.35 : 1} />
    {off && <path d="M3.5 16.5l13-13" />}
  </Icon>
);

export const LockIcon = ({ open, ...p }) => (
  <Icon size={14} {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d={open ? 'M7 9V6.5a3 3 0 015.8-1' : 'M7 9V6.5a3 3 0 016 0V9'} />
  </Icon>
);

export const PinIcon = (p) => (
  <Icon size={12} {...p}>
    <path d="M7 3h6M8 3v5l-3 3h10l-3-3V3M10 11v6" />
  </Icon>
);

export const ChevronIcon = ({ open, ...p }) => (
  <Icon size={10} {...p} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.12s' }}>
    <path d="M5 8l5 5 5-5" strokeWidth="2" />
  </Icon>
);

export const WandIcon = (p) => (
  <Icon {...p}>
    <path d="M4 16L12.5 7.5" strokeWidth="2" />
    <path d="M14 2.5v2.5M14 9v2.5M10.5 6h-2M19.5 6h-2M11.6 3.6l1.2 1.2M15.2 7.2l1.2 1.2M16.4 3.6l-1.2 1.2" />
  </Icon>
);

export const EyedropperIcon = (p) => (
  <Icon {...p}>
    <path d="M13.5 3.5l3 3-2 2-1-1L7 14H5v-2l6.5-6.5-1-1z" />
    <path d="M4 16l1-2" />
  </Icon>
);

export const BucketIcon = (p) => (
  <Icon {...p}>
    <path d="M8.5 3.5l7 7-5 5a1.4 1.4 0 01-2 0l-5-5a1.4 1.4 0 010-2z" />
    <path d="M3.5 10h12" />
    <path d="M16.5 12.5s1.5 1.8 1.5 2.8a1.5 1.5 0 01-3 0c0-1 1.5-2.8 1.5-2.8z" fill="currentColor" />
  </Icon>
);

export const StampIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="12.5" width="13" height="3" rx="0.8" />
    <path d="M7.5 12.5V9.5h5v3M8.5 9.5a2.5 2.5 0 113 0" />
    <path d="M4.5 18h11" />
  </Icon>
);

export const EraserIcon = (p) => (
  <Icon {...p}>
    <path d="M11 3.5l5.5 5.5-7 7H6l-2.5-2.5a1.4 1.4 0 010-2z" />
    <path d="M7.5 7l5.5 5.5M9.5 16h7" />
  </Icon>
);

export const RotateIcon = (p) => (
  <Icon {...p}>
    <path d="M15.5 10A5.5 5.5 0 115 7.3" />
    <path d="M4 3.5v4h4" />
  </Icon>
);

export const ReflectIcon = (p) => (
  <Icon {...p}>
    <path d="M10 2.5v15" strokeDasharray="2 2" />
    <path d="M7.5 5.5L3 14.5h4.5zM12.5 5.5l4.5 9h-4.5z" />
  </Icon>
);

export const DiceIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" />
    <circle cx="7.3" cy="7.3" r="1" fill="currentColor" stroke="none" />
    <circle cx="12.7" cy="12.7" r="1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

// Panel icons for the inspector's panel rail.
export const LayersIcon = (p) => (
  <Icon {...p}><path d="M10 3l7 3.8-7 3.8-7-3.8zM3 10.2l7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" /></Icon>
);

export const HistoryIcon = (p) => (
  <Icon {...p}><path d="M3.5 10a6.5 6.5 0 106.5-6.5c-2.2 0-4 1-5.3 2.6M4.5 3v3.3h3.3M10 6.5V10l2.5 1.8" /></Icon>
);

export const InfoIcon = (p) => (
  <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M10 9v5M10 6.2v.1" /></Icon>
);

export const LayoutsIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="14" height="14" rx="1.5" /><path d="M3 8h14M9 8v9" /></Icon>
);

export const SwatchesIcon = (p) => (
  <Icon {...p}><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></Icon>
);

export const PaletteIcon = (p) => (
  <Icon {...p}>
    <path d="M10 3a7 7 0 000 14c1.2 0 1.6-.8 1.3-1.7-.4-1 .3-2 1.4-2H15a2.5 2.5 0 002.5-2.5C17.5 6.2 14.2 3 10 3z" />
    <circle cx="6.5" cy="9" r=".9" fill="currentColor" /><circle cx="9.5" cy="6.2" r=".9" fill="currentColor" /><circle cx="13" cy="7.5" r=".9" fill="currentColor" />
  </Icon>
);

export const ShapesIcon = (p) => (
  <Icon {...p}><circle cx="6.5" cy="6.5" r="3.5" /><path d="M13.5 3l3.5 6h-7zM3 12h7v5H3zM12 12h5v5h-5z" /></Icon>
);

export const EffectsIcon = (p) => (
  <Icon {...p}><path d="M10 2.5l1.7 4.6 4.8.4-3.7 3 1.2 4.8L10 12.6l-4 2.7 1.2-4.8-3.7-3 4.8-.4z" /></Icon>
);

export const ImageIcon = (p) => (
  <Icon {...p}><rect x="3" y="4" width="14" height="12" rx="1.5" /><circle cx="7.5" cy="8" r="1.3" /><path d="M3.5 14.5l4.2-4 3 2.8 2.3-2 3.5 3.2" /></Icon>
);

export const AnimationIcon = (p) => (
  <Icon {...p}><circle cx="10" cy="10" r="7" /><path d="M8.3 7v6l5-3z" fill="currentColor" /></Icon>
);

export const AudioIcon = (p) => (
  <Icon {...p}><path d="M3.5 8v4h3l4 3.5v-11l-4 3.5zM13.5 7.5a3.5 3.5 0 010 5M15.5 5.5a6.3 6.3 0 010 9" /></Icon>
);
