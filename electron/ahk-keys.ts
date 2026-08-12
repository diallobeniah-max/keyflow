/**
 * Maps KeyFlow key names to AutoHotkey v2 hotkey key names.
 * Pure module, no Electron import.
 */
const SPECIAL: Record<string, string> = {
  Escape: "Escape",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  CapsLock: "CapsLock",
  PrintScreen: "PrintScreen",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  NumLock: "NumLock",
  Home: "Home",
  End: "End",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Up: "Up",
  Down: "Down",
  Left: "Left",
  Right: "Right",
  Ctrl: "CTRL",
  Alt: "ALT",
  Shift: "SHIFT",
  Win: "LWin",
  LCtrl: "LCtrl",
  RCtrl: "RCtrl",
  LAlt: "LAlt",
  RAlt: "RAlt",
  LShift: "LShift",
  RShift: "RShift",
  LWin: "LWin",
  RWin: "RWin",
  ",": ",", ".": ".", "/": "/", ";": ";", "'": "'",
  "[": "[", "]": "]", "\\": "\\", "-": "-", "=": "=", "`": "``",
  "*": "NumpadMult", "+": "NumpadAdd", "Num.": "NumpadDot",
  VolumeUp: "Volume_Up",
  VolumeDown: "Volume_Down",
  VolumeMute: "Volume_Mute",
  PlayPause: "Media_Play_Pause",
  NextTrack: "Media_Next",
  PrevTrack: "Media_Prev",
  Stop: "Media_Stop",
};

const FUNC = /^F([1-9]|1[0-9]|2[0-4])$/;
const NUM = /^Num([0-9])$/;

export function ahkKeyName(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  const mapped = SPECIAL[trimmed];
  if (mapped) return mapped;
  if (/^[A-Z0-9]$/.test(trimmed)) return trimmed.toLowerCase();
  if (FUNC.test(trimmed)) return trimmed;
  const num = NUM.exec(trimmed);
  if (num) return `Numpad${num[1]}`;
  return undefined;
}
