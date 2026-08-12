/**
 * Central VK -> KeyFlow key-name catalog for the native input engine.
 *
 * Names deliberately match the legacy uiohook KEY_MAP names so existing
 * shortcut data keeps working unchanged when the keyboard source switches.
 */

export const VK_NAMES: Record<number, string> = {
  0x08: "Backspace",
  0x09: "Tab",
  0x0d: "Enter",
  0x13: "Pause",
  0x14: "CapsLock",
  0x1b: "Escape",
  0x20: "Space",
  0x21: "PageUp",
  0x22: "PageDown",
  0x23: "End",
  0x24: "Home",
  0x25: "Left",
  0x26: "Up",
  0x27: "Right",
  0x28: "Down",
  0x2c: "PrintScreen",
  0x2d: "Insert",
  0x2e: "Delete",
  0x30: "0", 0x31: "1", 0x32: "2", 0x33: "3", 0x34: "4",
  0x35: "5", 0x36: "6", 0x37: "7", 0x38: "8", 0x39: "9",
  0x41: "A", 0x42: "B", 0x43: "C", 0x44: "D", 0x45: "E", 0x46: "F",
  0x47: "G", 0x48: "H", 0x49: "I", 0x4a: "J", 0x4b: "K", 0x4c: "L",
  0x4d: "M", 0x4e: "N", 0x4f: "O", 0x50: "P", 0x51: "Q", 0x52: "R",
  0x53: "S", 0x54: "T", 0x55: "U", 0x56: "V", 0x57: "W", 0x58: "X",
  0x59: "Y", 0x5a: "Z",
  0x5b: "Win",
  0x5c: "Win",
  0x5d: "Menu",
  0x10: "Shift", 0x11: "Ctrl", 0x12: "Alt",
  0x60: "Num0", 0x61: "Num1", 0x62: "Num2", 0x63: "Num3", 0x64: "Num4",
  0x65: "Num5", 0x66: "Num6", 0x67: "Num7", 0x68: "Num8", 0x69: "Num9",
  0x6a: "Num*", 0x6b: "Num+", 0x6d: "Num-", 0x6e: "Num.", 0x6f: "Num/",
  0x70: "F1", 0x71: "F2", 0x72: "F3", 0x73: "F4", 0x74: "F5", 0x75: "F6",
  0x76: "F7", 0x77: "F8", 0x78: "F9", 0x79: "F10", 0x7a: "F11", 0x7b: "F12",
  0x7c: "F13", 0x7d: "F14", 0x7e: "F15", 0x7f: "F16", 0x80: "F17", 0x81: "F18",
  0x82: "F19", 0x83: "F20", 0x84: "F21", 0x85: "F22", 0x86: "F23", 0x87: "F24",
  0x90: "NumLock",
  0x91: "ScrollLock",
  0xa0: "Shift", 0xa1: "Shift",
  0xa2: "Ctrl", 0xa3: "Ctrl",
  0xa4: "Alt", 0xa5: "Alt",
  0xa6: "Back", 0xa7: "Forward", 0xa8: "Refresh",
  0xaa: "Home", 0xab: "Search", 0xac: "Favorites",
  0xad: "VolumeMute", 0xae: "VolumeDown", 0xaf: "VolumeUp",
  0xb0: "NextTrack", 0xb1: "PrevTrack", 0xb2: "Stop", 0xb3: "PlayPause",
  0xba: ";", 0xbb: "=", 0xbc: ",", 0xbd: "-", 0xbe: ".", 0xbf: "/",
  0xc0: "`",
  0xdb: "[", 0xdc: "\\", 0xdd: "]", 0xde: "'",
  0xe2: "\\",
};

export function nativeKeyName(vk: number, _rawcode?: number, extended?: boolean): string {
  if (vk === 0x0d && extended) return "NumEnter";
  return VK_NAMES[vk] ?? `VK_${vk.toString(16).toUpperCase()}`;
}

export function isModifierKeyName(name: string): boolean {
  return name === "Ctrl" || name === "Alt" || name === "Shift" || name === "Win";
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-_]/g, "");
}

/** Reverse lookup: KeyFlow key name -> VK. Used to build native config. */
export function keyNameToVk(name: string): number | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  if (n.length === 1) {
    if (/[a-z]/.test(n)) return 0x41 + n.charCodeAt(0) - 97;
    if (/[0-9]/.test(n)) return 0x30 + n.charCodeAt(0) - 48;
  }
  if (n === "numenter") return 0x0d;
  for (const [vk, nm] of Object.entries(VK_NAMES)) {
    if (normalize(nm) === n) return Number(vk);
  }
  return undefined;
}
