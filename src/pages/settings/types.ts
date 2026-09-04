import type { PersistedState } from "../../types";

export type SettingsSectionId =
  | "appBehavior"
  | "notifications"
  | "keyboard"
  | "commandPalette"
  | "shortcutBinding"
  | "wasd"
  | "hotCorners"
  | "alwaysOnTop"
  | "appearance"
  | "smoothScroll"
  | "screenTint"
  | "appIcon"
  | "popup"
  | "privacy"
  | "backup"
  | "advanced"
  | "about";

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: string;
  accentColor: string;
  summary?: (data: PersistedState) => string;
}

export interface SettingsNavGroup {
  id: string;
  title: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: "app",
    title: "App",
    items: [
      {
        id: "appBehavior",
        label: "App Behavior",
        icon: "settings",
        accentColor: "blue",
        summary: (d) => (d.settings.general.launchOnStartup ? "Startup on" : "Standard"),
      },
      {
        id: "notifications",
        label: "Notifications",
        icon: "bell",
        accentColor: "indigo",
        summary: (d) => (d.settings.general.showNotifications !== false ? "Toasts on" : "Off"),
      },
    ],
  },
  {
    id: "input",
    title: "Input",
    items: [
      {
        id: "keyboard",
        label: "Keyboard & Gestures",
        icon: "keyboard",
        accentColor: "amber",
        summary: (d) => (d.settings.shortcuts.altCapsLockBypass !== false ? "Caps bypass on" : "Normal"),
      },
      {
        id: "commandPalette",
        label: "Command Palette",
        icon: "search",
        accentColor: "cyan",
        summary: (d) => d.settings.shortcuts.commandPaletteShortcut || "Ctrl+K",
      },
      {
        id: "shortcutBinding",
        label: "Shortcut Bindings",
        icon: "shortcuts",
        accentColor: "indigo",
        summary: (d) => d.settings.shortcuts.globalPause || "Unset",
      },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & Control",
    items: [
      {
        id: "wasd",
        label: "WASD Navigation",
        icon: "keyboard",
        accentColor: "green",
        summary: (d) => `${d.settings.wasdNavigation?.cursorSize ?? 32}px pointer`,
      },
      {
        id: "hotCorners",
        label: "Hot Corners",
        icon: "window",
        accentColor: "yellow",
        summary: (d) => (d.settings.hotCorners?.enabled ? "4 corners" : "Off"),
      },
      {
        id: "alwaysOnTop",
        label: "Always on Top",
        icon: "pinTop",
        accentColor: "purple",
        summary: (d) => (d.settings.windowControl?.highlightPinned ? "Highlight on" : "Off"),
      },
    ],
  },
  {
    id: "interface",
    title: "Interface",
    items: [
      {
        id: "appearance",
        label: "Appearance",
        icon: "monitor",
        accentColor: "pink",
        summary: (d) => {
          const t = d.settings.appearance.theme;
          return t === "system" ? "Auto" : t === "dark" ? "Dark" : "Light";
        },
      },
      {
        id: "smoothScroll",
        label: "Smooth Scrolling",
        icon: "mouse",
        accentColor: "teal",
        summary: (d) => {
          const s = d.settings.smoothScroll;
          if (!s || !s.enabled || s.preset === "native") return "Native";
          return s.preset === "custom" ? "Custom" : s.preset.charAt(0).toUpperCase() + s.preset.slice(1);
        },
      },
      {
        id: "screenTint",
        label: "Screen Tint",
        icon: "sun",
        accentColor: "amber",
        summary: (d) => (d.settings.screenTint?.enabled ? "Active" : "Off"),
      },
      {
        id: "appIcon",
        label: "App Icon",
        icon: "sparkles",
        accentColor: "blue",
        summary: (d) => d.settings.appearance.appIcon || "Obsidian",
      },
      {
        id: "popup",
        label: "Popup Menu",
        icon: "popup",
        accentColor: "cyan",
        summary: (d) => d.settings.popup.position || "Cursor",
      },
    ],
  },
  {
    id: "system",
    title: "System",
    items: [
      {
        id: "privacy",
        label: "Privacy & Safety",
        icon: "shield",
        accentColor: "rose",
        summary: (d) => (d.settings.privacy.safeMode ? "Safe Mode" : "Normal"),
      },
      {
        id: "backup",
        label: "Backup & Restore",
        icon: "folder",
        accentColor: "blue",
        summary: (d) => (d.settings.data.autoBackupEnabled ? "Auto backup" : "Manual"),
      },
      {
        id: "advanced",
        label: "Advanced",
        icon: "terminal",
        accentColor: "slate",
        summary: (d) => (d.settings.advanced?.extendedAccess ? "Elevated" : "Standard"),
      },
    ],
  },
  {
    id: "information",
    title: "Information",
    items: [
      {
        id: "about",
        label: "About KeyFlow",
        icon: "logo",
        accentColor: "slate",
        summary: () => "v0.3.0",
      },
    ],
  },
];

/**
 * Backward-compatible category / route resolver.
 * Maps legacy routes ("general" -> "appBehavior", "shortcuts" -> "keyboard", "data" -> "backup")
 */
export function resolveSettingsSectionId(raw: string | undefined | null): SettingsSectionId {
  if (!raw) return "appBehavior";
  const lower = raw.trim();
  if (lower === "general") return "appBehavior";
  if (lower === "shortcuts") return "keyboard";
  if (lower === "data") return "backup";
  // Direct matches
  for (const group of SETTINGS_NAV_GROUPS) {
    for (const item of group.items) {
      if (item.id === lower) return item.id;
    }
  }
  return "appBehavior";
}
