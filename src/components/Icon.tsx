import React from "react";

const P: Record<string, React.ReactNode> = {
  // Navigation & Core
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
  shortcuts: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></>,
  create: <path d="M12 5v14M5 12h14"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  visual: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  library: <path d="M4 5v14M9 5v14M14 6l5 14"/>,
  profiles: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 0 1 0 6M21 20c0-2-1-4-3-4.5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.6h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
  pause: <><rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/></>,
  play: <path d="M7 5l12 7-12 7z"/>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
  close: <path d="M6 6l12 12M18 6L6 18"/>,
  chevronLeft: <path d="M15 6l-6 6 6 6"/>,
  chevronRight: <path d="M9 6l6 6-6 6"/>,
  chevronUp: <path d="M6 15l6-6 6 6"/>,
  chevronDown: <path d="M6 9l6 6 6-6"/>,
  star: <path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z"/>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z"/>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6"/></>,
  mute: <><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M22 9l-6 6M16 9l6 6"/></>,
  screenshot: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 3v3M16 3v3"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  file: <><path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4h4"/></>,
  window: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 7h.01M10 7h.01"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></>,
  command: <path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>,
  text: <path d="M5 6h14M12 6v13M9 19h6"/>,
  popup: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 14h6M9 17h3"/></>,
  pinTop: <path d="M12 3v9M8 12h8l-1 8H9z"/>,
  arrows: <><path d="M12 4v5M9.5 6.5L12 4l2.5 2.5M12 20v-5M9.5 17.5L12 20l2.5-2.5M4 12h5M6.5 9.5L4 12l2.5 2.5M20 12h-5M17.5 9.5L20 12l-2.5 2.5"/></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/></>,
  shield: <><path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/><path d="M9 12l2 2 4-4"/></>,
  check: <path d="M5 13l4 4L19 7"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>,
  moon: <path d="M20 14a8 8 0 1 1-9-11 6 6 0 0 0 9 11z"/>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></>,
  logo: <><path d="M4 12a8 8 0 0 1 14-5"/><path d="M20 12a8 8 0 0 1-14 5"/><path d="M18 4v3h-3M6 20v-3h3"/></>,
  key: <><circle cx="8" cy="8" r="4"/><path d="M11 11l8 8M16 16l2-2M19 19l1-1"/></>,
  mouse: <><rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v3"/></>,

  // Productivity & Office
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></>,
  bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  tag: <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01"/>,
  layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  flag: <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>,

  // Coding & Dev
  code: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
  gitBranch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
  bug: <><rect x="6" y="8" width="12" height="10" rx="4"/><path d="M12 5V2M12 18v3M4 10h16M4 16h16M4 7l3 2M20 7l-3 2M4 19l3-2M20 19l-3 2"/></>,
  server: <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
  hash: <><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></>,

  // Media & Audio
  music: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  mic: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/></>,
  video: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  headphones: <><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></>,
  film: <><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></>,
  speaker: <><rect x="4" y="2" width="16" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><line x1="12" y1="6" x2="12.01" y2="6"/></>,

  // System & Tools
  sliders: <><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></>,
  tool: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  power: <><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></>,
  wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></>,
  battery: <><rect x="1" y="6" width="18" height="12" rx="2"/><line x1="23" y1="11" x2="23" y2="13"/></>,

  // Daily & Health
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
  heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>,
  coffee: <><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></>,
  smile: <><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
  compass: <><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>,
  mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></>,
  droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,
  sparkles: <path d="M12 3l1.9 4.9L19 9.8l-4.1 3.5 1.4 5.3L12 15.7 7.7 18.6l1.4-5.3L5 9.8l5.1-1.9z"/>,
};

export interface IconCategory {
  id: string;
  name: string;
  icons: Array<{ name: string; label: string }>;
}

export const ICON_CATEGORIES: IconCategory[] = [
  {
    id: "productivity",
    name: "⚡ Productivity & Office",
    icons: [
      { name: "briefcase", label: "Work" },
      { name: "calendar", label: "Calendar" },
      { name: "clock", label: "Clock" },
      { name: "checkCircle", label: "Tasks" },
      { name: "clipboard", label: "Clipboard" },
      { name: "bookmark", label: "Bookmark" },
      { name: "inbox", label: "Inbox" },
      { name: "tag", label: "Tag" },
      { name: "file", label: "Document" },
      { name: "folder", label: "Folder" },
      { name: "layers", label: "Layers" },
      { name: "flag", label: "Flag" },
    ],
  },
  {
    id: "development",
    name: "💻 Coding & Development",
    icons: [
      { name: "code", label: "Code" },
      { name: "terminal", label: "Terminal" },
      { name: "cpu", label: "CPU" },
      { name: "database", label: "Database" },
      { name: "gitBranch", label: "Git Branch" },
      { name: "bug", label: "Bug" },
      { name: "server", label: "Server" },
      { name: "globe", label: "Web / API" },
      { name: "hash", label: "Hash" },
      { name: "command", label: "Command" },
      { name: "key", label: "Key" },
      { name: "lock", label: "Lock" },
    ],
  },
  {
    id: "media",
    name: "🎵 Media & Audio",
    icons: [
      { name: "music", label: "Music" },
      { name: "mic", label: "Microphone" },
      { name: "video", label: "Video" },
      { name: "camera", label: "Camera" },
      { name: "headphones", label: "Headphones" },
      { name: "volume", label: "Volume" },
      { name: "mute", label: "Mute" },
      { name: "play", label: "Play" },
      { name: "pause", label: "Pause" },
      { name: "screenshot", label: "Screenshot" },
      { name: "film", label: "Film" },
      { name: "speaker", label: "Speaker" },
    ],
  },
  {
    id: "system",
    name: "🛠️ System & Tools",
    icons: [
      { name: "settings", label: "Settings" },
      { name: "sliders", label: "Adjustments" },
      { name: "tool", label: "Tools" },
      { name: "zap", label: "Power / Fast" },
      { name: "power", label: "Power" },
      { name: "shield", label: "Security" },
      { name: "wifi", label: "Network" },
      { name: "battery", label: "Battery" },
      { name: "monitor", label: "Display" },
      { name: "mouse", label: "Mouse" },
      { name: "window", label: "Window" },
      { name: "bell", label: "Notification" },
    ],
  },
  {
    id: "daily",
    name: "🏃 Daily & Health",
    icons: [
      { name: "activity", label: "Activity / Pulse" },
      { name: "heart", label: "Health / Heart" },
      { name: "coffee", label: "Coffee / Break" },
      { name: "sun", label: "Day / Sun" },
      { name: "moon", label: "Night / Moon" },
      { name: "smile", label: "Mood / Smile" },
      { name: "compass", label: "Focus / Compass" },
      { name: "mapPin", label: "Location" },
      { name: "droplet", label: "Hydrate" },
      { name: "flame", label: "Streak / Fire" },
      { name: "star", label: "Favorite" },
      { name: "sparkles", label: "Magic" },
    ],
  },
];

export const ICON_COLOR_PALETTE = [
  { id: "blue", label: "KeyFlow Blue", value: "#4f7cff" },
  { id: "indigo", label: "Indigo", value: "#6a91ff" },
  { id: "emerald", label: "Emerald", value: "#34c78a" },
  { id: "amber", label: "Amber", value: "#e7a63a" },
  { id: "rose", label: "Rose", value: "#e65b65" },
  { id: "slate", label: "Slate", value: "#a0a8b3" },
];

export type IconName = string;

export function Icon({ name, size = 20, className, strokeWidth = 1.8, style }: { name: IconName; size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{P[name] ?? P.window}</svg>;
}
