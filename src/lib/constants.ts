import type { ActionType, TriggerType } from "../types/index.ts";

export const ACTION_META: Record<ActionType, { label: string; icon: string; color: string; category: string }> = {
  openApp: { label: "Open app", icon: "window", color: "#4F7CFF", category: "Launch" },
  openFile: { label: "Open file", icon: "file", color: "#5D8DFF", category: "Launch" },
  openFolder: { label: "Open folder", icon: "folder", color: "#5D8DFF", category: "Launch" },
  openWebsite: { label: "Open website", icon: "globe", color: "#4F7CFF", category: "Launch" },
  runCommand: { label: "Run command", icon: "terminal", color: "#4F7CFF", category: "System" },
  runPowershell: { label: "Run PowerShell", icon: "terminal", color: "#4F7CFF", category: "System" },
  runBatch: { label: "Run batch file", icon: "terminal", color: "#4F7CFF", category: "System" },
  pasteText: { label: "Paste text snippet", icon: "clipboard", color: "#4F7CFF", category: "Text" },
  typeText: { label: "Type text", icon: "text", color: "#4F7CFF", category: "Text" },
  pressShortcut: { label: "Press shortcut", icon: "command", color: "#5D8DFF", category: "Input" },
  multiAction: { label: "Run multiple actions", icon: "swap", color: "#4F7CFF", category: "Flow" },
  volumeControl: { label: "Control volume", icon: "volume", color: "#4F7CFF", category: "Media" },
  mediaControl: { label: "Media playback", icon: "play", color: "#4F7CFF", category: "Media" },
  toggleMute: { label: "Toggle mute", icon: "mute", color: "#4F7CFF", category: "Media" },
  brightnessControl: { label: "Screen brightness", icon: "sun", color: "#4F7CFF", category: "System" },
  screenshot: { label: "Take screenshot", icon: "screenshot", color: "#5D8DFF", category: "System" },
  lockScreen: { label: "Lock screen", icon: "lock", color: "#4F7CFF", category: "System" },
  openSettings: { label: "Open settings page", icon: "settings", color: "#7EA2FF", category: "System" },
  switchProfile: { label: "Switch profile", icon: "profiles", color: "#4F7CFF", category: "Flow" },
  showPopup: { label: "Show popup menu", icon: "popup", color: "#4F7CFF", category: "Flow" },
  showNotification: { label: "Show notification", icon: "notify", color: "#4F7CFF", category: "Flow" },
  copySelected: { label: "Copy selected text", icon: "copy", color: "#4F7CFF", category: "Text" },
  clipboardHistory: { label: "Clipboard history", icon: "clipboard", color: "#4F7CFF", category: "Text" },
  minimizeWindow: { label: "Minimize window", icon: "winMin", color: "#5D8DFF", category: "Window" },
  maximizeWindow: { label: "Maximize window", icon: "winMax", color: "#5D8DFF", category: "Window" },
  closeWindow: { label: "Close window", icon: "winClose", color: "#4F7CFF", category: "Window" },
  moveWindow: { label: "Move window", icon: "arrowRight", color: "#5D8DFF", category: "Window" },
  alwaysOnTop: { label: "Toggle always-on-top", icon: "pinTop", color: "#5D8DFF", category: "Window" },
  toggleWasdNavigation: { label: "WASD Navigation Mode", icon: "arrows", color: "#5D8DFF", category: "Navigation" },
  notesPopup: { label: "Notes Popup", icon: "file", color: "#4F7CFF", category: "Productivity" },
  delay: { label: "Delay / wait", icon: "pause", color: "#7EA2FF", category: "Flow" },
  remapKey: { label: "Remap key", icon: "swap", color: "#5D8DFF", category: "Input" },
};

export const TRIGGER_META: Record<TriggerType, { label: string; desc: string; icon: string }> = {
  single: { label: "Single tap", desc: "Trigger when the key is pressed once", icon: "key" },
  double: { label: "Double tap", desc: "Trigger on two quick presses", icon: "key" },
  triple: { label: "Triple tap", desc: "Trigger on three quick presses", icon: "key" },
  longPress: { label: "Long press", desc: "Trigger after holding past the hold duration", icon: "pause" },
  hold: { label: "Key hold", desc: "Trigger while the key is held down", icon: "pause" },
  combo: { label: "Key combo", desc: "Trigger with modifier(s) + key", icon: "command" },
  tapThenHold: { label: "Tap then hold", desc: "Tap once, then hold", icon: "key" },
  sequence: { label: "Sequence", desc: "Trigger after a repeated sequence", icon: "command" },
  remap: { label: "Remap key", desc: "Redirect this key to another key", icon: "swap" },
};

export const RISKY_KEYS = ["Escape", "Enter", "Tab", "Backspace", "Space", "Ctrl", "Alt", "Shift", "Win", "Delete"];
export const LETTER_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const NUMBER_KEYS = "1234567890".split("");
export const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);
export const FUNCTION_KEYS_EXTENDED = Array.from({ length: 24 }, (_, i) => `F${i + 1}`);
export const NUMPAD_KEYS = Array.from({ length: 10 }, (_, i) => `Num${i}`);
export const ARROW_KEYS = ["Up", "Down", "Left", "Right"];
export const SYSTEM_KEYS = ["Escape", "Tab", "CapsLock", "Shift", "Ctrl", "Alt", "Space", "Enter", "Backspace", "Delete"];
export const MEDIA_KEYS = ["PlayPause", "NextTrack", "PrevTrack", "Stop", "Mute", "VolumeUp", "VolumeDown"];
export const REMAP_TARGETS = [
  { value: "Tab", label: "Tab" },
  { value: "Enter", label: "Enter" },
  { value: "Escape", label: "Escape" },
  { value: "Backspace", label: "Backspace" },
  { value: "Space", label: "Space" },
  { value: "Delete", label: "Delete" },
  { value: "CapsLock", label: "Caps Lock" },
  { value: "Home", label: "Home" },
  { value: "End", label: "End" },
  { value: "PageUp", label: "Page Up" },
  { value: "PageDown", label: "Page Down" },
  { value: "Up", label: "Arrow Up" },
  { value: "Down", label: "Arrow Down" },
  { value: "Left", label: "Arrow Left" },
  { value: "Right", label: "Arrow Right" },
  ...FUNCTION_KEYS_EXTENDED.map((k) => ({ value: k, label: k })),
];
export const MOUSE_BUTTONS = [
  { value: "MB1", label: "Mouse Left" },
  { value: "MB2", label: "Mouse Right" },
  { value: "MB3", label: "Mouse Middle" },
  { value: "MB4", label: "Mouse Button 4" },
  { value: "MB5", label: "Mouse Button 5" },
];
export const KEYBOARD_ROWS = [
  ["Escape", ...FUNCTION_KEYS],
  ["`", ...NUMBER_KEYS, "Backspace"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]"],
  ["CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
  ["Ctrl", "Win", "Alt", "Space", "Alt", "Ctrl", "Left", "Down", "Up", "Right"],
];
export const WINDOWS_SETTINGS = [
  { value: "ms-settings:", label: "Windows Settings home" },
  { value: "ms-settings:network", label: "Network & Internet" },
  { value: "ms-settings:bluetooth", label: "Bluetooth" },
  { value: "ms-settings:display", label: "Display" },
  { value: "ms-settings:privacy", label: "Privacy" },
  { value: "ms-settings:apps", label: "Apps" },
  { value: "ms-settings:sound", label: "Sound" },
  { value: "ms-settings:windowsupdate", label: "Windows Update" },
];
export const ACCENT_PRESETS = [
  { value: "#3b82f6", label: "KeyFlow Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#10b981", label: "Emerald" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Rose" },
  { value: "#ec4899", label: "Pink" },
  { value: "#64748b", label: "Slate" },
] as const;
// Backward compatibility: array of just the hex values
export const ACCENT_COLORS = ACCENT_PRESETS.map((p) => p.value);
export const HIGHLIGHT_PRESETS = [
  { value: "#4F7CFF", label: "KeyFlow Accent" },
  { value: "#00D2FF", label: "Vibrant Cyan" },
  { value: "#34C78A", label: "Emerald" },
  { value: "#E7A63A", label: "Amber" },
  { value: "#E65B65", label: "Rose" },
  { value: "#A855F7", label: "Purple" },
];

export const HOT_CORNER_ACTIONS = [
  { value: "none", label: "None" },
  { value: "taskView", label: "Open Task view" },
  { value: "start", label: "Open Start" },
  { value: "search", label: "Open search" },
  { value: "desktop", label: "Go to desktop" },
  { value: "quickSettings", label: "Open quick settings" },
  { value: "previousDesktop", label: "Previous desktop" },
  { value: "nextDesktop", label: "Next desktop" },
] as const;

export const SCREEN_TINT_PRESETS = [
  { value: "warm", label: "Warm amber", color: "#F2C078" },
  { value: "rose", label: "Soft rose", color: "#D99AB7" },
  { value: "yellow", label: "Soft yellow", color: "#F2E58A" },
  { value: "blue", label: "Cool blue", color: "#9FC7ED" },
  { value: "mint", label: "Mint", color: "#A8D8C0" },
  { value: "neutral", label: "Neutral gray", color: "#BDBDBD" },
] as const;
export const SCREEN_TINT_DEFAULT_COLOR = SCREEN_TINT_PRESETS[0].color;
