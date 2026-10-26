import type { ReactNode } from 'react';

// Line icons drawn to sit alongside SF Symbols: 24px grid, rounded strokes.
const ICONS: Record<string, ReactNode> = {
  flight: (
    <path
      fill="currentColor"
      stroke="none"
      d="M21 15.6v-1.7l-7.6-4.8V4.2a1.4 1.4 0 0 0-2.8 0v4.9L3 13.9v1.7l7.6-2.4v4.6l-2 1.5V21l3.4-1 3.4 1v-1.3l-2-1.5v-4.6z"
    />
  ),
  ofp: (
    <>
      <path d="M7 3h6.5L19 8.5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M13.5 3v5.5H19M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  weather: (
    <>
      <path d="M7.5 19h9.25a3.75 3.75 0 0 0 .6-7.45 5.25 5.25 0 0 0-10.1 1.2A3.15 3.15 0 0 0 7.5 19z" />
      <path d="M8 4.5v1M3.8 6.3l.7.7M2.5 10.5h1M12.2 6.3l-.7.7" />
    </>
  ),
  charts: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="m7.5 16 3-5.5 2.5 3.5 3.5-6" />
    </>
  ),
  perf: (
    <>
      <path d="M4.3 17.5a8.5 8.5 0 1 1 15.4 0" />
      <path d="m12 14 4-4.5" />
      <circle cx="12" cy="14" r="1.2" fill="currentColor" />
    </>
  ),
  loadsheet: (
    <>
      <path d="M6.2 9h11.6l2.2 11H4z" />
      <circle cx="12" cy="6" r="2.3" />
    </>
  ),
  notes: (
    <>
      <path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.2 14.7l-3.4.9.9-3.4z" />
    </>
  ),
  logbook: (
    <>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20z" />
      <path d="M5 20a1.5 1.5 0 0 0 1.5 1H19v-3.5M9 7.5h6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h8.5M16.5 7H20M4 17h2.5M10.5 17H20" />
      <circle cx="14.5" cy="7" r="2" />
      <circle cx="8.5" cy="17" r="2" />
    </>
  ),
  planner: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2.5" />
      <path d="M9 4V3h6v1" />
      <circle cx="9" cy="16.5" r="1.3" fill="currentColor" />
      <path d="M10.3 16c2.5-.5 2.2-4.2 4.7-5.5" />
      <circle cx="15.2" cy="9.8" r="1.6" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
      <circle cx="16" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4.5H15" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
      <path d="M17.5 13.5V18a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H11" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2.2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}
