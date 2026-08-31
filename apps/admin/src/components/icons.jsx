// Stroke-based SVG icon set (lucide-style, 24×24) — replaces emoji for a
// professional look. Usage: <Icon name="users" size={16} />
import { createElement } from 'react';

const I = {
  dashboard: [<rect key="a" x="3" y="3" width="7" height="7" rx="1.5" />, <rect key="b" x="14" y="3" width="7" height="7" rx="1.5" />, <rect key="c" x="3" y="14" width="7" height="7" rx="1.5" />, <rect key="d" x="14" y="14" width="7" height="7" rx="1.5" />],
  users: [<path key="a" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />, <circle key="b" cx="9" cy="7" r="4" />, <path key="c" d="M22 21v-2a4 4 0 0 0-3-3.87" />, <path key="d" d="M16 3.13a4 4 0 0 1 0 7.75" />],
  user: [<path key="a" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />, <circle key="b" cx="12" cy="7" r="4" />],
  server: [<rect key="a" x="2" y="2" width="20" height="8" rx="2" />, <rect key="b" x="2" y="14" width="20" height="8" rx="2" />, <line key="c" x1="6" x2="6.01" y1="6" y2="6" />, <line key="d" x1="6" x2="6.01" y1="18" y2="18" />],
  plug: [<path key="a" d="M12 22v-5" />, <path key="b" d="M9 8V2" />, <path key="c" d="M15 8V2" />, <path key="d" d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />],
  models: [<path key="a" d="M12 2 2 7l10 5 10-5-10-5Z" />, <path key="b" d="m2 17 10 5 10-5" />, <path key="c" d="m2 12 10 5 10-5" />],
  mask: [<circle key="a" cx="12" cy="12" r="10" />, <path key="b" d="M8 14s1.5 2 4 2 4-2 4-2" />, <line key="c" x1="9" x2="9.01" y1="9" y2="9" />, <line key="d" x1="15" x2="15.01" y1="9" y2="9" />],
  memory: [<path key="a" d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />],
  shield: [<path key="a" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />],
  shieldCheck: [<path key="a" d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1 1 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" />, <path key="b" d="m9 12 2 2 4-4" />],
  chart: [<path key="a" d="M3 3v18h18" />, <path key="b" d="M18 17V9" />, <path key="c" d="M13 17V5" />, <path key="d" d="M8 17v-3" />],
  file: [<path key="a" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />, <path key="b" d="M14 2v4a2 2 0 0 0 2 2h4" />, <path key="c" d="M16 13H8" />, <path key="d" d="M16 17H8" />, <path key="e" d="M10 9H8" />],
  bell: [<path key="a" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />, <path key="b" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />],
  heart: [<path key="a" d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />, <path key="b" d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />],
  lock: [<rect key="a" width="18" height="11" x="3" y="11" rx="2" />, <path key="b" d="M7 11V7a5 5 0 0 1 10 0v4" />],
  key: [<path key="a" d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />],
  search: [<circle key="a" cx="11" cy="11" r="8" />, <path key="b" d="m21 21-4.3-4.3" />],
  sun: [<circle key="a" cx="12" cy="12" r="4" />, <path key="b" d="M12 2v2" />, <path key="c" d="M12 20v2" />, <path key="d" d="m4.93 4.93 1.41 1.41" />, <path key="e" d="m17.66 17.66 1.41 1.41" />, <path key="f" d="M2 12h2" />, <path key="g" d="M20 12h2" />, <path key="h" d="m6.34 17.66-1.41 1.41" />, <path key="i" d="m19.07 4.93-1.41 1.41" />],
  moon: [<path key="a" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />],
  logout: [<path key="a" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />, <path key="b" d="m16 17 5-5-5-5" />, <path key="c" d="M21 12H9" />],
  x: [<path key="a" d="M18 6 6 18" />, <path key="b" d="m6 6 12 12" />],
  check: [<path key="a" d="M20 6 9 17l-5-5" />],
  plus: [<path key="a" d="M5 12h14" />, <path key="b" d="M12 5v14" />],
  trash: [<path key="a" d="M3 6h18" />, <path key="b" d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />, <path key="c" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />, <line key="d" x1="10" x2="10" y1="11" y2="17" />, <line key="e" x1="14" x2="14" y1="11" y2="17" />],
  edit: [<path key="a" d="M12 20h9" />, <path key="b" d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />],
  refresh: [<path key="a" d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />, <path key="b" d="M21 3v5h-5" />],
  download: [<path key="a" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />, <polyline key="b" points="7 10 12 15 17 10" />, <line key="c" x1="12" x2="12" y1="15" y2="3" />],
  alert: [<path key="a" d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />, <path key="b" d="M12 9v4" />, <path key="c" d="M12 17h.01" />],
  info: [<circle key="a" cx="12" cy="12" r="10" />, <path key="b" d="M12 16v-4" />, <path key="c" d="M12 8h.01" />],
  database: [<ellipse key="a" cx="12" cy="5" rx="9" ry="3" />, <path key="b" d="M3 5v14a9 3 0 0 0 18 0V5" />, <path key="c" d="M3 12a9 3 0 0 0 18 0" />],
  cpu: [<rect key="a" x="4" y="4" width="16" height="16" rx="2" />, <rect key="b" x="9" y="9" width="6" height="6" />, <path key="c" d="M9 2v2" />, <path key="d" d="M15 2v2" />, <path key="e" d="M9 20v2" />, <path key="f" d="M15 20v2" />, <path key="g" d="M2 9h2" />, <path key="h" d="M2 15h2" />, <path key="i" d="M20 9h2" />, <path key="j" d="M20 15h2" />],
  ram: [<path key="a" d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />, <path key="b" d="M4 13v4h2v-3" />, <path key="c" d="M8 13v4h2v-3" />, <path key="d" d="M12 13v4h2v-3" />, <path key="e" d="M16 13v4h2v-3" />, <path key="f" d="M6 8h.01" />, <path key="g" d="M10 8h.01" />],
  disk: [<line key="a" x1="22" x2="2" y1="12" y2="12" />, <path key="b" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />, <line key="c" x1="6" x2="6.01" y1="16" y2="16" />, <line key="d" x1="10" x2="10.01" y1="16" y2="16" />],
  terminal: [<polyline key="a" points="4 17 10 11 4 5" />, <line key="b" x1="12" x2="20" y1="19" y2="19" />],
  eye: [<path key="a" d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />, <circle key="b" cx="12" cy="12" r="3" />],
  eyeOff: [<path key="a" d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />, <path key="b" d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />, <path key="c" d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />, <line key="d" x1="2" x2="22" y1="2" y2="22" />],
  chevronDown: [<path key="a" d="m6 9 6 6 6-6" />],
  settings: [<path key="a" d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />, <circle key="b" cx="12" cy="12" r="3" />],
  globe: [<circle key="a" cx="12" cy="12" r="10" />, <path key="b" d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />, <path key="c" d="M2 12h20" />],
  mail: [<rect key="a" width="20" height="16" x="2" y="4" rx="2" />, <path key="b" d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />],
  bot: [<path key="a" d="M12 8V4H8" />, <rect key="b" width="16" height="12" x="4" y="8" rx="2" />, <path key="c" d="M2 14h2" />, <path key="d" d="M20 14h2" />, <path key="e" d="M15 13v2" />, <path key="f" d="M9 13v2" />],
  message: [<path key="a" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />],
  send: [<path key="a" d="m22 2-7 20-4-9-9-4Z" />, <path key="b" d="M22 2 11 13" />],
  clock: [<circle key="a" cx="12" cy="12" r="10" />, <polyline key="b" points="12 6 12 12 16 14" />],
  zap: [<polygon key="a" points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />],
  activity: [<polyline key="a" points="22 12 18 12 15 21 9 3 6 12 2 12" />],
  trendUp: [<polyline key="a" points="22 7 13.5 15.5 8.5 10.5 2 17" />, <polyline key="b" points="16 7 22 7 22 13" />],
  filter: [<polygon key="a" points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />],
  copy: [<rect key="a" width="14" height="14" x="8" y="8" rx="2" />, <path key="b" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />],
  external: [<path key="a" d="M15 3h6v6" />, <path key="b" d="M10 14 21 3" />, <path key="c" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />],
  dollar: [<line key="a" x1="12" x2="12" y1="2" y2="22" />, <path key="b" d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />],
  gauge: [<path key="a" d="m12 14 4-4" />, <path key="b" d="M3.34 19a10 10 0 1 1 17.32 0" />],
  save: [<path key="a" d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />, <path key="b" d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />, <path key="c" d="M7 3v4a1 1 0 0 0 1 1h7" />],
  play: [<polygon key="a" points="6 3 20 12 6 21 6 3" />],
  pause: [<rect key="a" x="6" y="4" width="4" height="16" rx="1" />, <rect key="b" x="14" y="4" width="4" height="16" rx="1" />],
};

export function Icon({ name, size = 16, strokeWidth = 2, ...rest }) {
  const paths = I[name] ?? I.info;
  return createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, ...rest,
  }, ...paths);
}

/** Brand logo mark (the "B" bot glyph) used in sidebar & login. */
export function LogoMark({ size = 20, ...rest }) {
  return createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, ...rest,
  },
  <rect x="5" y="7" width="14" height="12" rx="3" />,
  <path d="M12 7V4" />,
  <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />,
  <path d="M9 12v2" />,
  <path d="M15 12v2" />);
}
