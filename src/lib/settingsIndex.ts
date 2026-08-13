/**
 * KeyFlow Settings Search Metadata Index
 * Centralized searchable index covering all 9 Settings categories.
 */

export interface SettingSearchItem {
  id: string;
  title: string;
  category:
    | "general"
    | "shortcuts"
    | "alwaysOnTop"
    | "popup"
    | "appearance"
    | "privacy"
    | "data"
    | "advanced"
    | "about";
  categoryLabel: string;
  description: string;
  keywords: string[];
  synonyms?: string[];
  anchorId: string;
}

export const SETTINGS_INDEX: SettingSearchItem[] = [
  // General
  {
    id: "gen-startup",
    title: "Launch on Windows startup",
    category: "general",
    categoryLabel: "General",
    description: "Start KeyFlow automatically when you log in to Windows",
    keywords: ["launch", "startup", "boot", "login", "auto start", "windows"],
    synonyms: ["autostart", "start on boot"],
    anchorId: "row-gen-startup",
  },
  {
    id: "gen-minimized",
    title: "Start minimized",
    category: "general",
    categoryLabel: "General",
    description: "Open KeyFlow hidden in the background on launch",
    keywords: ["minimized", "background", "silent", "hidden"],
    anchorId: "row-gen-minimized",
  },
  {
    id: "gen-tray",
    title: "Minimize to system tray",
    category: "general",
    categoryLabel: "General",
    description: "Keep running in the notification area when the window is closed",
    keywords: ["tray", "notification area", "minimize", "background", "system tray"],
    anchorId: "row-gen-tray",
  },
  {
    id: "gen-notifications",
    title: "Desktop notifications",
    category: "general",
    categoryLabel: "General",
    description: "Show Windows toast alerts when shortcuts execute",
    keywords: ["notifications", "toast", "alerts", "banner", "popups"],
    anchorId: "row-gen-notifications",
  },
  {
    id: "gen-profile",
    title: "Default workspace profile",
    category: "general",
    categoryLabel: "General",
    description: "Profile activated when no specific application rule matches",
    keywords: ["profile", "default", "workspace", "active profile"],
    anchorId: "row-gen-profile",
  },

  // Shortcuts & Gestures
  {
    id: "sc-pause",
    title: "Global pause shortcut",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Instantly pause all shortcut matching system-wide",
    keywords: ["pause", "stop", "suspend", "global pause", "shortcut"],
    anchorId: "row-sc-pause",
  },
  {
    id: "sc-emergency",
    title: "Emergency Safe Mode shortcut",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Instantly disconnect low-level hooks in emergency",
    keywords: ["emergency", "safe mode", "disconnect", "kill hook", "panic"],
    anchorId: "row-sc-emergency",
  },
  {
    id: "sc-double-tap",
    title: "Double tap threshold",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Maximum time between two presses in milliseconds",
    keywords: ["double tap", "tap interval", "speed", "timing", "ms", "gesture"],
    anchorId: "row-sc-double-tap",
  },
  {
    id: "sc-hold-thresh",
    title: "Hold press threshold",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Duration to hold a key before hold trigger fires",
    keywords: ["hold", "long press", "duration", "threshold", "timing", "delay"],
    anchorId: "row-sc-hold-thresh",
  },
  {
    id: "sc-repeat-prot",
    title: "Key repeat protection",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Ignore repeated OS key-down events while holding a physical key",
    keywords: ["repeat", "auto repeat", "debounce", "protection", "holding"],
    anchorId: "row-sc-repeat-prot",
  },
  {
    id: "sc-hyper-enable",
    title: "Enable Hyper Key",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Acts as a dedicated KeyFlow modifier key (bit 4) for all Hyper chords",
    keywords: ["hyper", "hyper key", "enable hyper", "modifier", "custom modifier", "super key"],
    synonyms: ["hper", "superkey"],
    anchorId: "row-sc-hyper-enable",
  },
  {
    id: "sc-hyper-key",
    title: "Physical Hyper Key",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Select an unused physical key (Right Alt, Right Ctrl, Menu, CapsLock)",
    keywords: ["hyper key", "physical key", "right alt", "altright", "menu", "right ctrl", "capslock"],
    anchorId: "row-sc-hyper-key",
  },
  {
    id: "sc-hyper-tap",
    title: "Tap Hyper Key Action",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Action triggered when the Hyper key is pressed and released alone",
    keywords: ["hyper tap", "tap action", "hyper alone", "solo press", "single tap"],
    anchorId: "row-sc-hyper-tap",
  },
  {
    id: "sc-typing-prot",
    title: "Typing protection mode",
    category: "shortcuts",
    categoryLabel: "Shortcuts & Gestures",
    description: "Suppress single printable key triggers during fast active typing bursts",
    keywords: ["typing", "typing protection", "accidental", "burst", "strict", "balanced"],
    anchorId: "row-sc-typing-prot",
  },

  // Always on Top
  {
    id: "top-mode",
    title: "Default pin mode",
    category: "alwaysOnTop",
    categoryLabel: "Always on Top",
    description: "Default action behavior when pinning window",
    keywords: ["always on top", "pin", "topmost", "toggle", "unpin", "window"],
    anchorId: "row-top-mode",
  },
  {
    id: "top-highlight",
    title: "Highlight pinned window border",
    category: "alwaysOnTop",
    categoryLabel: "Always on Top",
    description: "Apply a colored DWM accent border around pinned windows",
    keywords: ["border", "highlight", "dwm", "pinned border", "color border"],
    anchorId: "row-top-highlight",
  },
  {
    id: "top-color",
    title: "Pinned window highlight color",
    category: "alwaysOnTop",
    categoryLabel: "Always on Top",
    description: "Visual border highlight accent color",
    keywords: ["color", "highlight color", "border color", "preset", "accent"],
    anchorId: "row-top-color",
  },
  {
    id: "top-sound",
    title: "Sound feedback",
    category: "alwaysOnTop",
    categoryLabel: "Always on Top",
    description: "Play KeyFlow custom audio tones when pinning or unpinning",
    keywords: ["sound", "audio", "beep", "tone", "chime", "sound feedback"],
    anchorId: "row-top-sound",
  },

  // Popup Menu
  {
    id: "pop-pos",
    title: "Popup position",
    category: "popup",
    categoryLabel: "Popup Menu",
    description: "Default spawn location for the floating action menu",
    keywords: ["popup", "position", "cursor", "screen center", "display"],
    anchorId: "row-pop-pos",
  },
  {
    id: "pop-icons",
    title: "Show icons in popup",
    category: "popup",
    categoryLabel: "Popup Menu",
    description: "Display action type icons in the menu list",
    keywords: ["icons", "popup icons", "menu icons", "visual"],
    anchorId: "row-pop-icons",
  },
  {
    id: "pop-search",
    title: "Enable popup search",
    category: "popup",
    categoryLabel: "Popup Menu",
    description: "Include instant search filter in the popup header",
    keywords: ["popup search", "filter", "instant search", "command palette"],
    anchorId: "row-pop-search",
  },
  {
    id: "pop-close",
    title: "Close after action",
    category: "popup",
    categoryLabel: "Popup Menu",
    description: "Automatically dismiss the popup menu once an item is triggered",
    keywords: ["close", "dismiss", "auto close", "after action"],
    anchorId: "row-pop-close",
  },

  // Appearance
  {
    id: "app-theme",
    title: "Theme mode",
    category: "appearance",
    categoryLabel: "Appearance",
    description: "Switch between dark and light desktop palettes",
    keywords: ["theme", "dark", "light", "mode", "color scheme", "system match"],
    synonyms: ["theme mode", "palette"],
    anchorId: "row-app-theme",
  },
  {
    id: "app-fontsize",
    title: "Text size",
    category: "appearance",
    categoryLabel: "Appearance",
    description: "Adjust application typography scaling across all pages and popups",
    keywords: ["font size", "text size", "scale", "typography", "large", "small", "zoom"],
    synonyms: ["font", "text scale"],
    anchorId: "row-app-fontsize",
  },
  {
    id: "app-accent",
    title: "Accent color",
    category: "appearance",
    categoryLabel: "Appearance",
    description: "Signature highlight color used across buttons, focus rings, and key indicators",
    keywords: ["accent", "accent color", "preset", "color", "custom color", "swatch", "highlight"],
    synonyms: ["colour", "acsent", "theme color"],
    anchorId: "row-app-accent",
  },
  {
    id: "app-motion",
    title: "Reduce motion",
    category: "appearance",
    categoryLabel: "Appearance",
    description: "Minimize transitions and animations across the app",
    keywords: ["motion", "reduce motion", "animation", "disable animations", "transition"],
    anchorId: "row-app-motion",
  },

  // Privacy & Safety
  {
    id: "priv-safe",
    title: "Safe mode",
    category: "privacy",
    categoryLabel: "Privacy & Safety",
    description: "Immediately disable all shortcut hooks system-wide",
    keywords: ["safe mode", "disable hooks", "emergency", "off", "pause all"],
    anchorId: "row-priv-safe",
  },
  {
    id: "priv-password",
    title: "Pause in password fields",
    category: "privacy",
    categoryLabel: "Privacy & Safety",
    description: "Attempt to suspend hooks when entering sensitive credentials",
    keywords: ["password", "sensitive", "credentials", "privacy", "protection", "security"],
    anchorId: "row-priv-password",
  },
  {
    id: "priv-history",
    title: "Action history",
    category: "privacy",
    categoryLabel: "Privacy & Safety",
    description: "Clear recorded list of executed actions",
    keywords: ["history", "clear history", "recent actions", "privacy"],
    anchorId: "row-priv-history",
  },

  // Data & Backup
  {
    id: "data-export",
    title: "Export backup",
    category: "data",
    categoryLabel: "Data & Backup",
    description: "Save all shortcuts and settings to a JSON file",
    keywords: ["export", "backup", "save json", "download backup"],
    anchorId: "row-data-export",
  },
  {
    id: "data-import",
    title: "Import backup",
    category: "data",
    categoryLabel: "Data & Backup",
    description: "Restore shortcuts and profiles from a previous backup file",
    keywords: ["import", "restore", "load json", "upload backup"],
    anchorId: "row-data-import",
  },
  {
    id: "data-reset",
    title: "Reset application data",
    category: "data",
    categoryLabel: "Data & Backup",
    description: "Delete all shortcuts, profiles, and reset settings to default",
    keywords: ["reset", "clear all", "factory reset", "delete data", "wipe"],
    anchorId: "row-data-reset",
  },

  // Advanced
  {
    id: "adv-extended",
    title: "Extended shortcut access",
    category: "advanced",
    categoryLabel: "Advanced",
    description: "Allows shortcuts to work while elevated apps (Task Manager / Terminal) have focus",
    keywords: ["extended access", "uac", "elevated", "task manager", "admin", "privilege"],
    anchorId: "row-adv-extended",
  },
  {
    id: "adv-debug",
    title: "Enable debug logs",
    category: "advanced",
    categoryLabel: "Advanced",
    description: "Output verbose diagnostic logs to console and DevTools",
    keywords: ["debug", "logs", "diagnostics", "verbose", "console"],
    anchorId: "row-adv-debug",
  },
  {
    id: "adv-perf",
    title: "Performance mode",
    category: "advanced",
    categoryLabel: "Advanced",
    description: "Optimize input dispatcher for minimum CPU latency",
    keywords: ["performance", "latency", "fast", "cpu", "optimization"],
    anchorId: "row-adv-perf",
  },

  // About
  {
    id: "about-version",
    title: "Version & Build",
    category: "about",
    categoryLabel: "About",
    description: "Current installed KeyFlow version and platform build details",
    keywords: ["version", "build", "release", "about", "keyflow version"],
    anchorId: "row-about-version",
  },
];
