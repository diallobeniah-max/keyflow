import { FUNCTION_KEYS_EXTENDED } from "./constants.ts";

/**
 * Canonical renderer-side key catalog for the key picker and visual keyboard.
 *
 * Names deliberately match the native engine catalog (`electron/vk-catalog.ts`
 * VK_NAMES) so a key picked here is the same string the engine receives, and
 * physical capture and the picker share one vocabulary. Fn is intentionally
 * absent — there is no normal VK for Fn.
 */

export interface KeyGroup {
  id: string;
  label: string;
  keys: string[];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NUMBERS = "1234567890".split("");
const COMMON = ["Escape", "Tab", "CapsLock", "Shift", "Ctrl", "Alt", "Space", "Enter", "Backspace", "Delete"];
const NAVIGATION = ["Home", "End", "PageUp", "PageDown", "Insert", "Up", "Down", "Left", "Right"];
const MODIFIERS = ["Hyper", "LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin"];
const NUMPAD = Array.from({ length: 10 }, (_, i) => `Num${i}`);
const SYSTEM = ["PrintScreen", "ScrollLock", "Pause", "NumLock", "Menu"];
const MEDIA = ["VolumeUp", "VolumeDown", "VolumeMute", "PlayPause", "NextTrack", "PrevTrack", "Stop"];

export const KEY_GROUPS: KeyGroup[] = [
  { id: "common", label: "Common", keys: COMMON },
  { id: "letters", label: "Letters", keys: LETTERS },
  { id: "numbers", label: "Numbers", keys: NUMBERS },
  { id: "function", label: "Function", keys: FUNCTION_KEYS_EXTENDED },
  { id: "navigation", label: "Navigation", keys: NAVIGATION },
  { id: "modifiers", label: "Modifiers", keys: MODIFIERS },
  { id: "numpad", label: "Numpad", keys: NUMPAD },
  { id: "system", label: "System", keys: SYSTEM },
  { id: "media", label: "Media", keys: MEDIA },
];

const SEARCH_ALIASES: Record<string, string> = {
  hyper: "Hyper",
  hyperkey: "Hyper",
  caps: "CapsLock",
  capslock: "CapsLock",
  esc: "Escape",
  del: "Delete",
  ins: "Insert",
  pgup: "PageUp",
  pgdn: "PageDown",
  prtscr: "PrintScreen",
  printscreen: "PrintScreen",
  scroll: "ScrollLock",
  scrolllock: "ScrollLock",
  numlock: "NumLock",
  rightalt: "RAlt",
  "alt right": "RAlt",
  altright: "RAlt",
  ralt: "RAlt",
  leftalt: "LAlt",
  altleft: "LAlt",
  lalt: "LAlt",
  rightctrl: "RCtrl",
  ctrlright: "RCtrl",
  rctrl: "RCtrl",
  leftctrl: "LCtrl",
  ctrlleft: "LCtrl",
  lctrl: "LCtrl",
  rightshift: "RShift",
  shiftright: "RShift",
  rshift: "RShift",
  leftshift: "LShift",
  shiftleft: "LShift",
  lshift: "LShift",
  rightwin: "RWin",
  winright: "RWin",
  rwin: "RWin",
  leftwin: "LWin",
  winleft: "LWin",
  lwin: "LWin",
  volume: "VolumeUp",
  volup: "VolumeUp",
  voldown: "VolumeDown",
  mute: "VolumeMute",
  play: "PlayPause",
  next: "NextTrack",
  prev: "PrevTrack",
  media: "PlayPause",
  arrow: "Up",
  arrows: "Up",
  uparrow: "Up",
  downarrow: "Down",
  leftarrow: "Left",
  rightarrow: "Right",
  menu: "Menu",
  apps: "Menu",
  spacebar: "Space",
  return: "Enter",
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s\-_]/g, "");
}

/**
 * Search the catalog. `query` is normalized and matched against each key name,
 * its group, and common aliases (e.g. "caps", "tab", "right alt", "volume",
 * "arrow"). Returns full matching keys (letters/numbers), plus aliased hits.
 */
export function searchKeys(query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  const direct = new Set<string>();
  const aliasHits = new Set<string>();

  for (const group of KEY_GROUPS) {
    for (const key of group.keys) {
      if (norm(key) === q) {
        direct.add(key);
        continue;
      }
      if (norm(key).includes(q) || norm(group.label).includes(q)) aliasHits.add(key);
    }
  }
  for (const [alias, target] of Object.entries(SEARCH_ALIASES)) {
    if (norm(alias) === q || norm(alias).includes(q)) aliasHits.add(target);
  }

  return [...direct, ...aliasHits];
}

/** Flat list of every key in the catalog, deduplicated, picker order. */
export function allCatalogKeys(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of KEY_GROUPS) {
    for (const key of group.keys) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** Whether a key name exists in the catalog (case-insensitive). */
export function isCatalogKey(name: string | undefined): boolean {
  if (!name) return false;
  const n = norm(name);
  if (SEARCH_ALIASES[n] !== undefined) return true;
  return allCatalogKeys().some((k) => norm(k) === n);
}

/** Human-friendly label for a key name (e.g. "VolumeUp" -> "Volume Up"). */
export function keyLabel(name: string | undefined): string {
  if (!name) return "";
  if (name === "CapsLock") return "Caps Lock";
  if (name === "PageUp") return "Page Up";
  if (name === "PageDown") return "Page Down";
  if (name === "PrintScreen") return "Print Screen";
  if (name === "ScrollLock") return "Scroll Lock";
  if (name === "NumLock") return "Num Lock";
  if (name === "VolumeMute") return "Mute";
  if (name === "VolumeUp") return "Volume Up";
  if (name === "VolumeDown") return "Volume Down";
  if (name === "PlayPause") return "Play / Pause";
  if (name === "NextTrack") return "Next Track";
  if (name === "PrevTrack") return "Previous Track";
  return name;
}