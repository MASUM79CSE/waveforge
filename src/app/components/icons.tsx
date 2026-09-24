/**
 * Inline SVG icon library for the toolbar (D2) — stroke style, 24-box,
 * currentColor. Replaces AudioMass's IcoMoon font dependency (license-clean,
 * no network font, scales with DPI).
 */
import type { JSX } from 'preact';

export type IconName =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'trim'
  | 'silence'
  | 'delete'
  | 'gain'
  | 'fadeIn'
  | 'fadeOut'
  | 'normalize'
  | 'reverse'
  | 'invert'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

const PATHS: Record<IconName, JSX.Element> = {
  cut: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 16L18 4M16 16L6 4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
  paste: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  trim: <path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" />,
  silence: (
    <>
      <path d="M11 5L6 9H2v6h4l5 4z" />
      <path d="M23 9l-6 6M17 9l6 6" />
    </>
  ),
  delete: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  gain: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  fadeIn: <path d="M3 20h18M3 20C9 20 15 14 21 4" />,
  fadeOut: <path d="M3 20h18M3 4c6 10 12 16 18 16" />,
  normalize: <path d="M18 20V10M12 20V4M6 20v-6" />,
  reverse: (
    <path
      d="M11 19L2 12l9-7v14zM22 19l-9-7 9-7v14z"
      style="fill: currentColor; stroke: none"
    />
  ),
  invert: (
    <>
      <path d="M12 3v18" />
      <path d="M5 9l7-6 7 6M5 15l7 6 7-6" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M8 11h6" />
    </>
  ),
  zoomReset: <path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />,
};

export function Icon({ name }: { name: IconName }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
