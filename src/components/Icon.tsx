import React from "react";

const P: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  shortcuts: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></>,
  create: <path d="M12 5v14M5 12h14"/>,
  visual: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  library: <path d="M4 5v14M9 5v14M14 6l5 14"/>,
  profiles: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 0 1 0 6M21 20c0-2-1-4-3-4.5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
  pause: <><rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/></>,
  play: <path d="M7 5l12 7-12 7z"/>, bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
  close: <path d="M6 6l12 12M18 6L6 18"/>, chevronLeft: <path d="M15 6l-6 6 6 6"/>, chevronRight: <path d="M9 6l6 6-6 6"/>, chevronUp: <path d="M6 15l6-6 6 6"/>, chevronDown: <path d="M6 9l6 6 6-6"/>,
  star: <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z"/>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></>, trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>, edit: <path d="M4 20h4L19 9l-4-4L4 16z"/>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>, volume: <><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/></>, mute: <><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M22 9l-6 6M16 9l6 6"/></>,
  screenshot: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 3v3M16 3v3"/></>, folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>, file: <><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></>,
  window: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 7h.01M10 7h.01"/></>, globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>, terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></>,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>, text: <path d="M5 6h14M12 6v13M9 19h6"/>, popup: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 14h6M9 17h3"/></>,
  winMin: <path d="M5 14h14v5H5z"/>, winMax: <rect x="5" y="5" width="14" height="14" rx="1"/>, winClose: <><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/></>, arrowLeft: <path d="M15 6l-6 6 6 6"/>, arrowRight: <path d="M9 6l6 6-6 6"/>, pinTop: <path d="M12 3v9M8 12h8l-1 8H9z"/>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/></>, notify: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></>, swap: <path d="M7 7h11l-3-3M17 17H6l3 3"/>, shield: <><path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/><path d="M9 12l2 2 4-4"/></>, warning: <><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></>, check: <path d="M5 13l4 4L19 7"/>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>, sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>, moon: <path d="M20 14a8 8 0 1 1-9-11 6 6 0 0 0 9 11z"/>, monitor: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
  logo: <><path d="M4 12a8 8 0 0 1 14-5"/><path d="M20 12a8 8 0 0 1-14 5"/><path d="M18 4v3h-3M6 20v-3h3"/></>, key: <><circle cx="8" cy="8" r="4"/><path d="M11 11l8 8M16 16l2-2M19 19l1-1"/></>, mouse: <><rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3"/></>,
};

export function Icon({ name, size = 20, className, strokeWidth = 1.8, style }: { name: string; size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{P[name] ?? P.window}</svg>;
}
