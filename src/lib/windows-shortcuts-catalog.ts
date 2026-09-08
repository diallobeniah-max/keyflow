import type { ModifierKey, Shortcut, TriggerType } from "../types/index.js";

export type WindowsShortcutCategory =
  | "System"
  | "Window Management"
  | "Shell & Taskbar"
  | "Accessibility"
  | "Gaming & Media"
  | "Virtual Desktops"
  | "Security";

export type Interceptability =
  | "interceptable"
  | "conditionally-interceptable"
  | "os-secured"
  | "requires-testing";

export interface WindowsShortcutEntry {
  id: string;
  accelerator: string;
  key: string;
  modifiers: ModifierKey[];
  name: string;
  description: string;
  category: WindowsShortcutCategory;
  interceptability: Interceptability;
}

export interface SuggestedAlternative {
  key: string;
  modifiers: ModifierKey[];
  trigger: TriggerType;
  label: string;
}

/**
 * Microsoft Windows official system shortcut knowledge catalog.
 * Researched from Microsoft Windows 10 & 11 keyboard shortcut documentation.
 *
 * NOTE on interceptability:
 * - "os-secured": Reserved by the Windows kernel / Winlogon for hardware security
 *   (e.g., Ctrl+Alt+Delete Secure Attention Sequence) or system lock (Win+L).
 *   The Windows kernel explicitly bypasses user-mode WH_KEYBOARD_LL hooks for these.
 * - "conditionally-interceptable": Interceptable by WH_KEYBOARD_LL, but special Windows
 *   subsystems (e.g. Xbox Game Bar / GameDVR) or fullscreen exclusive games may take precedence.
 * - "interceptable": Standard Windows shell / system shortcuts (Win+V, Win+D, Win+U, etc.)
 *   that can be cleanly suppressed and overridden at runtime.
 */
export const WINDOWS_SHORTCUTS_CATALOG: WindowsShortcutEntry[] = [
  // OS-Secured / Kernel / Winlogon hard-coded shortcuts (Cannot be intercepted via WH_KEYBOARD_LL)
  {
    id: "win-sec-cad",
    accelerator: "Ctrl+Alt+Delete",
    key: "Delete",
    modifiers: ["Ctrl", "Alt"],
    name: "Windows Security Screen (SAS)",
    description: "Hard-coded Secure Attention Sequence handled directly by Winlogon. User-mode hooks are bypassed by the kernel.",
    category: "Security",
    interceptability: "os-secured",
  },
  {
    id: "win-sec-lock",
    accelerator: "Win+L",
    key: "L",
    modifiers: ["Win"],
    name: "Lock Workstation",
    description: "Immediately locks the Windows session. Handled by Winlogon/csrss; user-mode keyboard hooks are bypassed.",
    category: "Security",
    interceptability: "os-secured",
  },

  // Interceptable Windows Shortcuts (Overridable while Keyflow is active)
  {
    id: "win-u",
    accelerator: "Win+U",
    key: "U",
    modifiers: ["Win"],
    name: "Accessibility Settings",
    description: "Opens Windows Accessibility settings. Normal Windows shell shortcut, interceptable at runtime.",
    category: "Accessibility",
    interceptability: "interceptable",
  },
  {
    id: "win-video-restart",
    accelerator: "Ctrl+Shift+Win+B",
    key: "B",
    modifiers: ["Ctrl", "Shift", "Win"],
    name: "Restart Graphics Driver",
    description: "DWM video driver wake/recovery sequence. Can be intercepted by low-level hooks at runtime.",
    category: "System",
    interceptability: "interceptable",
  },

  // Interceptable Windows Shortcuts (Overridable while Keyflow is active)
  {
    id: "win-v",
    accelerator: "Win+V",
    key: "V",
    modifiers: ["Win"],
    name: "Clipboard History",
    description: "Opens Windows Clipboard History popup.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-d",
    accelerator: "Win+D",
    key: "D",
    modifiers: ["Win"],
    name: "Show / Hide Desktop",
    description: "Minimizes and restores all open application windows.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-e",
    accelerator: "Win+E",
    key: "E",
    modifiers: ["Win"],
    name: "File Explorer",
    description: "Opens a new File Explorer window.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-a",
    accelerator: "Win+A",
    key: "A",
    modifiers: ["Win"],
    name: "Quick Settings",
    description: "Opens Windows Quick Settings (Wi-Fi, Bluetooth, volume).",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-shift-s",
    accelerator: "Win+Shift+S",
    key: "S",
    modifiers: ["Win", "Shift"],
    name: "Snipping Tool",
    description: "Takes a screenshot or screen snip.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-s",
    accelerator: "Win+S",
    key: "S",
    modifiers: ["Win"],
    name: "Windows Search",
    description: "Opens Windows Search.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-r",
    accelerator: "Win+R",
    key: "R",
    modifiers: ["Win"],
    name: "Run Dialog",
    description: "Opens the Windows Run command dialog.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-i",
    accelerator: "Win+I",
    key: "I",
    modifiers: ["Win"],
    name: "Windows Settings",
    description: "Opens Windows Settings app.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-x",
    accelerator: "Win+X",
    key: "X",
    modifiers: ["Win"],
    name: "Quick Link Menu",
    description: "Opens the Windows Power User / Start context menu.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-tab",
    accelerator: "Win+Tab",
    key: "Tab",
    modifiers: ["Win"],
    name: "Task View",
    description: "Opens Windows Task View and Virtual Desktops overview.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-ctrl-d",
    accelerator: "Win+Ctrl+D",
    key: "D",
    modifiers: ["Ctrl", "Win"],
    name: "New Virtual Desktop",
    description: "Creates and switches to a new Virtual Desktop.",
    category: "Virtual Desktops",
    interceptability: "interceptable",
  },
  {
    id: "win-ctrl-f4",
    accelerator: "Win+Ctrl+F4",
    key: "F4",
    modifiers: ["Ctrl", "Win"],
    name: "Close Virtual Desktop",
    description: "Closes current Virtual Desktop.",
    category: "Virtual Desktops",
    interceptability: "interceptable",
  },
  {
    id: "win-ctrl-left",
    accelerator: "Win+Ctrl+ArrowLeft",
    key: "ArrowLeft",
    modifiers: ["Ctrl", "Win"],
    name: "Switch Virtual Desktop Left",
    description: "Switches to the Virtual Desktop on the left.",
    category: "Virtual Desktops",
    interceptability: "interceptable",
  },
  {
    id: "win-ctrl-right",
    accelerator: "Win+Ctrl+ArrowRight",
    key: "ArrowRight",
    modifiers: ["Ctrl", "Win"],
    name: "Switch Virtual Desktop Right",
    description: "Switches to the Virtual Desktop on the right.",
    category: "Virtual Desktops",
    interceptability: "interceptable",
  },
  {
    id: "win-alt-k",
    accelerator: "Win+Alt+K",
    key: "K",
    modifiers: ["Alt", "Win"],
    name: "Mute Microphone in Calls",
    description: "Mutes microphone in supported meeting apps (e.g. Teams).",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-h",
    accelerator: "Win+H",
    key: "H",
    modifiers: ["Win"],
    name: "Voice Typing / Dictation",
    description: "Launches Windows Voice Typing tool.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-k",
    accelerator: "Win+K",
    key: "K",
    modifiers: ["Win"],
    name: "Cast",
    description: "Opens Connect / Cast quick action panel.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-p",
    accelerator: "Win+P",
    key: "P",
    modifiers: ["Win"],
    name: "Project Display",
    description: "Opens multi-monitor presentation display settings.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-w",
    accelerator: "Win+W",
    key: "W",
    modifiers: ["Win"],
    name: "Widgets Board",
    description: "Opens Windows Widgets board.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-z",
    accelerator: "Win+Z",
    key: "Z",
    modifiers: ["Win"],
    name: "Snap Layouts",
    description: "Opens Snap Layout menu on the active window.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-dot",
    accelerator: "Win+.",
    key: "Period",
    modifiers: ["Win"],
    name: "Emoji & Symbol Panel",
    description: "Opens emoji, symbol, and gif picker.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-semicolon",
    accelerator: "Win+;",
    key: "Semicolon",
    modifiers: ["Win"],
    name: "Emoji Panel",
    description: "Opens emoji picker.",
    category: "System",
    interceptability: "interceptable",
  },
  {
    id: "win-g",
    accelerator: "Win+G",
    key: "G",
    modifiers: ["Win"],
    name: "Xbox Game Bar",
    description: "Opens Xbox Game Bar overlay. Conditionally interceptable; system overlay or fullscreen exclusive games may take precedence.",
    category: "Gaming & Media",
    interceptability: "conditionally-interceptable",
  },
  {
    id: "win-alt-r",
    accelerator: "Win+Alt+R",
    key: "R",
    modifiers: ["Alt", "Win"],
    name: "Record Game Clip",
    description: "Starts/stops Game Bar screen recording.",
    category: "Gaming & Media",
    interceptability: "interceptable",
  },
  {
    id: "win-m",
    accelerator: "Win+M",
    key: "M",
    modifiers: ["Win"],
    name: "Minimize All Windows",
    description: "Minimizes all open windows.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-shift-m",
    accelerator: "Win+Shift+M",
    key: "M",
    modifiers: ["Win", "Shift"],
    name: "Restore Minimized Windows",
    description: "Restores windows minimized with Win+M.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-arrow-up",
    accelerator: "Win+ArrowUp",
    key: "ArrowUp",
    modifiers: ["Win"],
    name: "Maximize Window",
    description: "Maximizes the active window.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-arrow-down",
    accelerator: "Win+ArrowDown",
    key: "ArrowDown",
    modifiers: ["Win"],
    name: "Minimize / Restore Window",
    description: "Restores or minimizes the active window.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-arrow-left",
    accelerator: "Win+ArrowLeft",
    key: "ArrowLeft",
    modifiers: ["Win"],
    name: "Snap Window Left",
    description: "Snaps the active window to the left half of screen.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-arrow-right",
    accelerator: "Win+ArrowRight",
    key: "ArrowRight",
    modifiers: ["Win"],
    name: "Snap Window Right",
    description: "Snaps the active window to the right half of screen.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-shift-arrow-left",
    accelerator: "Win+Shift+ArrowLeft",
    key: "ArrowLeft",
    modifiers: ["Win", "Shift"],
    name: "Move Window to Left Monitor",
    description: "Moves the active window to the monitor on the left.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-shift-arrow-right",
    accelerator: "Win+Shift+ArrowRight",
    key: "ArrowRight",
    modifiers: ["Win", "Shift"],
    name: "Move Window to Right Monitor",
    description: "Moves the active window to the monitor on the right.",
    category: "Window Management",
    interceptability: "interceptable",
  },
  {
    id: "win-t",
    accelerator: "Win+T",
    key: "T",
    modifiers: ["Win"],
    name: "Cycle Taskbar Items",
    description: "Cycles focus through apps on the taskbar.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-b",
    accelerator: "Win+B",
    key: "B",
    modifiers: ["Win"],
    name: "Focus System Tray",
    description: "Moves focus to the notification area / system tray.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-n",
    accelerator: "Win+N",
    key: "N",
    modifiers: ["Win"],
    name: "Notification Center",
    description: "Opens Windows Notification Center and Calendar.",
    category: "Shell & Taskbar",
    interceptability: "interceptable",
  },
  {
    id: "win-ctrl-enter",
    accelerator: "Win+Ctrl+Enter",
    key: "Enter",
    modifiers: ["Ctrl", "Win"],
    name: "Narrator",
    description: "Turns Windows Narrator on or off.",
    category: "Accessibility",
    interceptability: "interceptable",
  },
  {
    id: "win-plus",
    accelerator: "Win++",
    key: "Equal",
    modifiers: ["Win"],
    name: "Magnifier Zoom In",
    description: "Opens Magnifier and zooms in.",
    category: "Accessibility",
    interceptability: "interceptable",
  },
  {
    id: "win-minus",
    accelerator: "Win+-",
    key: "Minus",
    modifiers: ["Win"],
    name: "Magnifier Zoom Out",
    description: "Zooms out in Windows Magnifier.",
    category: "Accessibility",
    interceptability: "interceptable",
  },
  {
    id: "win-esc",
    accelerator: "Win+Esc",
    key: "Escape",
    modifiers: ["Win"],
    name: "Exit Magnifier",
    description: "Closes Windows Magnifier.",
    category: "Accessibility",
    interceptability: "interceptable",
  },
  {
    id: "win-pause",
    accelerator: "Win+Pause",
    key: "Pause",
    modifiers: ["Win"],
    name: "About / System Properties",
    description: "Opens the About system properties page.",
    category: "System",
    interceptability: "interceptable",
  },
];

/**
 * Normalizes a key token for matching (e.g. "v" -> "V", "arrowleft" -> "ArrowLeft", "." -> "Period").
 */
export function normalizeKeyToken(rawKey: string): string {
  if (!rawKey) return "";
  const trimmed = rawKey.trim();
  const lower = trimmed.toLowerCase();

  switch (lower) {
    case "arrowleft":
    case "left":
      return "ArrowLeft";
    case "arrowright":
    case "right":
      return "ArrowRight";
    case "arrowup":
    case "up":
      return "ArrowUp";
    case "arrowdown":
    case "down":
      return "ArrowDown";
    case ".":
    case "period":
      return "Period";
    case ";":
    case "semicolon":
      return "Semicolon";
    case "=":
    case "equal":
    case "+":
      return "Equal";
    case "-":
    case "minus":
      return "Minus";
    case "esc":
    case "escape":
      return "Escape";
    case "del":
    case "delete":
      return "Delete";
    case "return":
    case "enter":
      return "Enter";
    default:
      if (/^[a-z]$/i.test(trimmed)) {
        return trimmed.toUpperCase();
      }
      return trimmed;
  }
}

/**
 * Normalizes modifiers to a canonical sorted set of lowercase strings.
 */
export function normalizeModifierSet(modifiers: ModifierKey[] = []): string[] {
  return modifiers
    .map((m) => {
      const lower = String(m).toLowerCase();
      if (lower === "control") return "ctrl";
      if (lower === "meta") return "win";
      return lower;
    })
    .sort();
}

/**
 * Checks if two modifier arrays represent the same chord regardless of order or case.
 */
export function matchModifiers(a: ModifierKey[] = [], b: ModifierKey[] = []): boolean {
  const normA = normalizeModifierSet(a);
  const normB = normalizeModifierSet(b);
  if (normA.length !== normB.length) return false;
  return normA.every((m, i) => m === normB[i]);
}

/**
 * Look up a Windows shortcut by key and modifiers.
 */
export function lookupWindowsShortcut(
  key: string,
  modifiers: ModifierKey[] = []
): WindowsShortcutEntry | undefined {
  const normKey = normalizeKeyToken(key);
  if (!normKey) return undefined;

  return WINDOWS_SHORTCUTS_CATALOG.find((entry) => {
    const entryKey = normalizeKeyToken(entry.key);
    if (entryKey !== normKey) return false;
    return matchModifiers(entry.modifiers, modifiers);
  });
}

/**
 * Checks if a key + modifiers combination is an OS-secured shortcut that cannot
 * be overridden by low-level hooks.
 */
export function isOsSecuredShortcut(key: string, modifiers: ModifierKey[] = []): boolean {
  const entry = lookupWindowsShortcut(key, modifiers);
  return entry?.interceptability === "os-secured";
}

/**
 * Generate smart alternative shortcuts that do not collide with Windows defaults
 * or existing Keyflow shortcuts.
 */
export function getSmartAlternativeShortcuts(
  key: string,
  currentModifiers: ModifierKey[] = [],
  existingShortcuts: Shortcut[] = [],
  limit = 3
): SuggestedAlternative[] {
  const baseKey = normalizeKeyToken(key) || "V";

  // Common high-productivity modifier combos that avoid standard OS conflicts:
  const candidateChords: ModifierKey[][] = [
    ["Ctrl", "Shift"],
    ["Ctrl", "Alt"],
    ["Alt", "Shift"],
    ["Ctrl", "Alt", "Shift"],
    ["Win", "Alt"],
    ["Win", "Shift"],
  ];

  const alternatives: SuggestedAlternative[] = [];

  for (const mods of candidateChords) {
    if (matchModifiers(currentModifiers, mods)) continue;

    // Must not be an OS-secured shortcut:
    if (isOsSecuredShortcut(baseKey, mods)) continue;

    // Must not be a known interceptable Windows shortcut (we want clean alternatives):
    if (lookupWindowsShortcut(baseKey, mods)) continue;

    // Check against existing Keyflow shortcuts:
    const conflictsExisting = existingShortcuts.some((s) => {
      if (!s.enabled) return false;
      return normalizeKeyToken(s.key) === baseKey && matchModifiers(s.modifiers, mods);
    });

    if (!conflictsExisting) {
      const label = `${mods.join(" + ")} + ${baseKey}`;
      alternatives.push({
        key: baseKey,
        modifiers: mods,
        trigger: "single",
        label,
      });

      if (alternatives.length >= limit) break;
    }
  }

  return alternatives;
}
