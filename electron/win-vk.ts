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
  PlayPause: 0xcd, MediaPlayPause: 0xcd, NextTrack: 0xb5, MediaNext: 0xb5, PrevTrack: 0xb6, MediaPrev: 0xb6, Stop: 0xb7, MediaStop: 0xb7,
  ",": 0xbc, ".": 0xbe, "/": 0xbf, ";": 0xba, "'": 0xde,
  "[": 0xdb, "]": 0xdd, "\\": 0xdc, "-": 0xbd, "=": 0xbb, "`": 0xc0,
  "*": 0x6a, "+": 0x6b, "Num.": 0x6e, "Num+": 0x6b, "Num-": 0x6d, "Num/": 0x6f, "NumEnter": 0x0d,
};

for (let i = 1; i <= 24; i += 1) VK[`F${i}`] = 0x6f + i;
for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") VK[character] = character.charCodeAt(0);
for (let i = 0; i <= 9; i += 1) VK[`Num${i}`] = i === 0 ? 0x60 : 0x60 + i;

export function keyToVk(name: string | undefined): number | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();
  const direct = VK[trimmed];
  if (typeof direct === "number") return direct;
  const upper = VK[trimmed.toUpperCase()];
  if (typeof upper === "number") return upper;
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
