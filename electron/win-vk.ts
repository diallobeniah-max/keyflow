/**
 * Pure mapping from KeyFlow key names to Windows virtual-key codes.
 * Used by the suppression config builder. No Electron import.
 */

export const VK: Record<string, number> = {
  Ctrl: 0x11, Alt: 0x12, Shift: 0x10, Win: 0x5b,
  LCtrl: 0xa2, RCtrl: 0xa3, LAlt: 0xa4, RAlt: 0xa5, LShift: 0xa0, RShift: 0xa1, LWin: 0x5b, RWin: 0x5c,
  ControlLeft: 0xa2, ControlRight: 0xa3, AltLeft: 0xa4, AltRight: 0xa5, ShiftLeft: 0xa0, ShiftRight: 0xa1,
  Apps: 0x5d, Menu: 0x5d, Application: 0x5d,
  Enter: 0x0d, Tab: 0x09, Space: 0x20, Backspace: 0x08, Delete: 0x2e, Insert: 0x2d,
  Escape: 0x1b, CapsLock: 0x14, PrintScreen: 0x2c, ScrollLock: 0x91, Pause: 0x13, NumLock: 0x90,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28,
  VolumeUp: 0xaf, VolumeDown: 0xae, VolumeMute: 0xad,
  PlayPause: 0xb3, MediaPlayPause: 0xb3, NextTrack: 0xb0, MediaNext: 0xb0, PrevTrack: 0xb1, MediaPrev: 0xb1, Stop: 0xb2, MediaStop: 0xb2,
  ",": 0xbc, ".": 0xbe, "/": 0xbf, ";": 0xba, "'": 0xde,
  "[": 0xdb, "]": 0xdd, "\\": 0xdc, "-": 0xbd, "=": 0xbb, "`": 0xc0,
  "*": 0x6a, "+": 0x6b, "Num.": 0x6e, "Num+": 0x6b, "Num-": 0x6d, "Num/": 0x6f, "NumEnter": 0x0d,
};

for (let i = 1; i <= 24; i += 1) VK[`F${i}`] = 0x6f + i;
for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") VK[character] = character.charCodeAt(0);
for (let i = 0; i <= 9; i += 1) VK[`Num${i}`] = i === 0 ? 0x60 : 0x60 + i;

export function normalizeKeyName(name: string | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/[\s\-_]/g, "");
}

export function keyToVk(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const n = normalizeKeyName(name);
  if (!n) return undefined;

  const ALIASES: Record<string, number> = {
    // Alt Right / AltGr
    altright: 0xa5,
    rightalt: 0xa5,
    ralt: 0xa5,
    altgr: 0xa5,
    // Alt Left
    altleft: 0xa4,
    leftalt: 0xa4,
    lalt: 0xa4,
    alt: 0x12,
    menu: 0x5d,
    apps: 0x5d,
    application: 0x5d,
    app: 0x5d,

    // Ctrl Right
    controlright: 0xa3,
    rightcontrol: 0xa3,
    ctrlright: 0xa3,
    rightctrl: 0xa3,
    rctrl: 0xa3,
    // Ctrl Left
    controlleft: 0xa2,
    leftcontrol: 0xa2,
    ctrlleft: 0xa2,
    leftctrl: 0xa2,
    lctrl: 0xa2,
    ctrl: 0x11,
    control: 0x11,

    // Shift Right / Left
    shiftright: 0xa1,
    rightshift: 0xa1,
    rshift: 0xa1,
    shiftleft: 0xa0,
    leftshift: 0xa0,
    lshift: 0xa0,
    shift: 0x10,

    // Win Right / Left
    winright: 0x5c,
    rightwin: 0x5c,
    rwin: 0x5c,
    winleft: 0x5b,
    leftwin: 0x5b,
    lwin: 0x5b,
    win: 0x5b,
    meta: 0x5b,

    // Lock keys
    capslock: 0x14,
    caps: 0x14,
    scrolllock: 0x91,
    scroll: 0x91,
    numlock: 0x90,

    // Common keys
    enter: 0x0d,
    return: 0x0d,
    tab: 0x09,
    space: 0x20,
    spacebar: 0x20,
    backspace: 0x08,
    delete: 0x2e,
    del: 0x2e,
    insert: 0x2d,
    ins: 0x2d,
    escape: 0x1b,
    esc: 0x1b,
    printscreen: 0x2c,
    prtscr: 0x2c,
    pause: 0x13,

    // Navigation
    home: 0x24,
    end: 0x23,
    pageup: 0x21,
    pgup: 0x21,
    pagedown: 0x22,
    pgdn: 0x22,
    left: 0x25,
    up: 0x26,
    right: 0x27,
    down: 0x28,

    // Media
    volumeup: 0xaf,
    volumedown: 0xae,
    volumemute: 0xad,
    playpause: 0xb3,
    nexttrack: 0xb0,
    prevtrack: 0xb1,
    stop: 0xb2,
  };

  if (ALIASES[n] !== undefined) return ALIASES[n];

  const direct = VK[name.trim()];
  if (typeof direct === "number") return direct;
  const upper = VK[name.trim().toUpperCase()];
  if (typeof upper === "number") return upper;

  if (n.length === 1) {
    if (/[a-z]/.test(n)) return 0x41 + n.charCodeAt(0) - 97;
    if (/[0-9]/.test(n)) return 0x30 + n.charCodeAt(0) - 48;
  }
  const fMatch = /^f([1-2][0-4]|[1-9])$/.exec(n);
  if (fMatch) return 0x6f + parseInt(fMatch[1], 10);

  return undefined;
}

/** Parse a combo like "Ctrl+Shift+CapsLock" into its virtual-key codes. */
export function comboToVks(combo: string | undefined): Set<number> {
  const out = new Set<number>();
  if (!combo) return out;
  for (const part of combo.split("+").map((p) => p.trim()).filter(Boolean)) {
    const vk = keyToVk(part);
    if (vk !== undefined) out.add(vk);
  }
  return out;
}

/** Secure Windows sequences that must never be suppressed. */
export function isSecureVkCombo(keys: string[], modifiers: string[]): boolean {
  const mods = modifiers.map((m) => m.toLowerCase());
  const keysLower = keys.map((k) => k.toLowerCase());
  if (mods.includes("ctrl") && mods.includes("alt") && keysLower.some((k) => k === "delete" || k === "del")) return true;
  if (mods.includes("win") && keysLower.some((k) => k === "l" || k === "u" || k === "p" || k === "x" || k === "i" || k === "r")) return true;
  if (mods.includes("ctrl") && mods.includes("shift") && keysLower.some((k) => k === "escape" || k === "esc")) return true;
  if (mods.includes("alt") && keysLower.some((k) => k === "f4" || k === "tab")) return true;
  return false;
}

/** Check if a virtual-key code or key name corresponds to a Win32 extended key. */
export function isExtendedVk(vk: number, name?: string): boolean {
  if (name) {
    const k = name.trim().toLowerCase();
    if (k === "num/" || k === "numenter" || k === "altright" || k === "controlright" || k === "winright" || k === "rwin" || k === "ralt" || k === "rctrl") {
      return true;
    }
  }
  switch (vk) {
    case 0x21: // PageUp
    case 0x22: // PageDown
    case 0x23: // End
    case 0x24: // Home
    case 0x25: // Left
    case 0x26: // Up
    case 0x27: // Right
    case 0x28: // Down
    case 0x2C: // PrintScreen
    case 0x2D: // Insert
    case 0x2E: // Delete
    case 0x5C: // RWin
    case 0x5D: // Apps
    case 0xA3: // RCtrl
    case 0xA5: // RAlt
      return true;
    default:
      return false;
  }
}
