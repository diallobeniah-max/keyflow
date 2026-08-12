import { NativeKeyEvent, NativeMouseEvent, TriggerState } from "./types.js";

export const KEY_MAP: Record<number, string> = {
  1: "Escape", 2: "1", 3: "2", 4: "3", 5: "4", 6: "5", 7: "6", 8: "7", 9: "8", 10: "9", 11: "0",
  12: "-", 13: "=", 14: "Backspace", 15: "Tab", 16: "Q", 17: "W", 18: "E", 19: "R", 20: "T",
  21: "Y", 22: "U", 23: "I", 24: "O", 25: "P", 26: "[", 27: "]", 28: "Enter", 29: "Ctrl",
  30: "A", 31: "S", 32: "D", 33: "F", 34: "G", 35: "H", 36: "J", 37: "K", 38: "L", 39: ";", 40: "'", 41: "`", 42: "Shift", 43: "\\",
  44: "Z", 45: "X", 46: "C", 47: "V", 48: "B", 49: "N", 50: "M", 51: ",", 52: ".", 53: "/", 54: "Shift", 55: "*", 56: "Alt", 57: "Space", 58: "CapsLock",
  59: "F1", 60: "F2", 61: "F3", 62: "F4", 63: "F5", 64: "F6", 65: "F7", 66: "F8", 67: "F9", 68: "F10", 69: "NumLock", 70: "ScrollLock",
  71: "Num7", 72: "Num8", 73: "Num9", 74: "Num-", 75: "Num4", 76: "Num5", 77: "Num6", 78: "Num+", 79: "Num1", 80: "Num2", 81: "Num3", 82: "Num0", 83: "Num.",
  87: "F11", 88: "F12", 91: "F13", 92: "F14", 93: "F15", 99: "F16", 100: "F17", 101: "F18", 102: "F19", 103: "F20", 104: "F21", 105: "F22", 106: "F23", 107: "F24",
  3612: "NumEnter", 3613: "Ctrl", 3637: "Num/", 3639: "PrintScreen", 3640: "Alt",
  3655: "Home", 3657: "PageUp", 3663: "End", 3665: "PageDown", 3666: "Insert", 3667: "Delete",
  3675: "Win", 3676: "Win", 57416: "Up", 57419: "Left", 57421: "Right", 57424: "Down",
  57360: "PrevTrack", 57369: "NextTrack", 57376: "VolumeMute", 57378: "PlayPause", 57380: "Stop", 57390: "VolumeDown", 57392: "VolumeUp",
};

const MOUSE_MAP: Record<number, string> = { 1: "MB1", 2: "MB2", 3: "MB3", 4: "MB4", 5: "MB5" };

export function nativeKeyName(keycode: number): string {
  return KEY_MAP[keycode] || `KEY_${keycode}`;
}

export type KeyNameResolver = (keycode: number, rawcode?: number, extended?: boolean) => string;

export function defaultKeyName(keycode: number, _rawcode?: number, _extended?: boolean): string {
  return nativeKeyName(keycode);
}

function normalizeKeyName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\-_]/g, "");
}

/** Reverse KEY_MAP lookup: key name (case-insensitive, e.g. "f", "capslock", "numpad1") -> uiohook keycode. */
export function keyNameToKeycode(name: string): number | undefined {
  let n = normalizeKeyName(name);
  if (!n) return undefined;
  // AutoHotkey emits Numpad* names; KEY_MAP uses the shorter Num* form.
  n = n.replace(/^numpad([0-9])/, "num$1");
  const numpadSpecial: Record<string, string> = {
    numpadadd: "num+",
    numpadsub: "num-",
    numpaddot: "num.",
    numpadenter: "numenter",
    numpaddiv: "num/",
    numpadmult: "*",
  };
  if (numpadSpecial[n]) n = numpadSpecial[n];
  for (const [code, key] of Object.entries(KEY_MAP)) {
    if (normalizeKeyName(key) === n) return Number(code);
  }
  return undefined;
}

function modsFromState(ctrl: boolean, alt: boolean, shift: boolean, meta: boolean): string[] {
  const m: string[] = [];
  if (ctrl) m.push("Ctrl");
  if (alt) m.push("Alt");
  if (shift) m.push("Shift");
  if (meta) m.push("Win");
  return m;
}

function modsMatch(a: string[], b: string[]): boolean {
  const normalize = (value: string) => {
    const lower = value.toLowerCase();
    return lower === "control" ? "ctrl" : lower === "command" ? "win" : lower;
  };
  const left = a.map(normalize).sort();
  const right = b.map(normalize).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
export interface ShortcutEntry {
  id: string;
  name?: string;
  profileId: string;
  key: string;
  mouse?: boolean;
  modifiers: string[];
  trigger: string;
  timing: { tapInterval: number; holdDuration: number; delay: number; cooldown: number };
  actions: any[];
  enabled: boolean;
}

export type MatchCallback = (shortcut: ShortcutEntry) => void;

function makeState(key: string, mods: string[]): TriggerState {
  return { key, mods: [...mods], pressTimes: [], tapTimer: null, holdTimer: null, holdFired: false, tapThenArmed: false };
}

export class TriggerMatcher {
  private state = new Map<string, TriggerState>();
  private downKeys = new Set<string>();
  private tapOrHold = new Map<string, { tapCandidates: ShortcutEntry[]; holdCandidates: ShortcutEntry[]; holdDuration: number; holdTimer: ReturnType<typeof setTimeout> | null }>();

  private onMatch: MatchCallback;
  private cooldowns = new Map<string, number>();
  private keyName: KeyNameResolver;

  constructor(onMatch: MatchCallback, keyName: KeyNameResolver = defaultKeyName) {
    this.onMatch = onMatch;
    this.keyName = keyName;
  }

  onKeyEvent(event: NativeKeyEvent, shortcuts: ShortcutEntry[]): void {
    const physicalKey = String(event.keycode);
    const keyName = this.keyName(event.keycode, event.rawcode, event.extended);
    const mods = modsFromState(event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);

    if (event.type === "keydown") {
      if (this.downKeys.has(physicalKey)) return;
      this.downKeys.add(physicalKey);
      const candidates = this.matchCandidates(keyName, mods, shortcuts);
      if (!candidates.length) return;
      const sKey = this.sig(keyName, mods);
      const holdCandidates = candidates.filter((c) => c.trigger === "longPress" || c.trigger === "hold");
      const tapCandidates = candidates.filter((c) => c.trigger === "single");
      if (holdCandidates.length && tapCandidates.length) {
        // Arbitrate a tap-versus-hold on the same key: wait for release or the
        // hold threshold so one physical press never fires both actions.
        this.armTapOrHold(sKey, tapCandidates, holdCandidates);
        return;
      }
      for (const candidate of candidates) this.evaluate(candidate, sKey, keyName, mods);
      return;
    }

    this.downKeys.delete(physicalKey);
    const sKey = this.sig(keyName, mods);
    const pending = this.tapOrHold.get(sKey);
    if (pending) {
      this.tapOrHold.delete(sKey);
      if (pending.holdTimer) clearTimeout(pending.holdTimer);
      for (const candidate of pending.tapCandidates) this.fire(candidate, sKey);
    }
    this.clearHold(keyName);
  }

  onMouseEvent(event: NativeMouseEvent, shortcuts: ShortcutEntry[]): void {
    const button = MOUSE_MAP[event.button];
    if (!button) return;
    const physicalButton = `mouse:${event.button}`;
    const mods = modsFromState(event.ctrlKey, event.altKey, event.shiftKey, event.metaKey);

if (event.type === "mousedown") {
      if (this.downKeys.has(physicalButton)) return;
      this.downKeys.add(physicalButton);
      const candidates = this.matchMouseCandidates(button, mods, shortcuts);
      if (!candidates.length) return;
      const sKey = this.sig(button, mods);
      for (const candidate of candidates) this.evaluate(candidate, sKey, button, mods);
      return;
    }

    this.downKeys.delete(physicalButton);
    this.clearHold(button);
  }

  private armTapOrHold(sKey: string, tapCandidates: ShortcutEntry[], holdCandidates: ShortcutEntry[]): void {
    if (this.tapOrHold.has(sKey)) return;
    const holdDuration = Math.min(...holdCandidates.map((c) => c.timing.holdDuration));
    const entry = {
      tapCandidates,
      holdCandidates,
      holdDuration,
      holdTimer: null as ReturnType<typeof setTimeout> | null,
    };
    entry.holdTimer = setTimeout(() => {
      const current = this.tapOrHold.get(sKey);
      if (!current) return;
      this.tapOrHold.delete(sKey);
      for (const candidate of current.holdCandidates) this.fire(candidate, sKey);
    }, holdDuration);
    this.tapOrHold.set(sKey, entry);
  }

  reset(): void {
    for (const state of this.state.values()) {
      if (state.tapTimer) clearTimeout(state.tapTimer);
      if (state.holdTimer) clearTimeout(state.holdTimer);
    }
    for (const entry of this.tapOrHold.values()) {
      if (entry.holdTimer) clearTimeout(entry.holdTimer);
    }
    this.state.clear();
    this.tapOrHold.clear();
    this.downKeys.clear();
    this.cooldowns.clear();
  }

  private matchCandidates(key: string, mods: string[], all: ShortcutEntry[]): ShortcutEntry[] {
    const normalizedKey = key.toLowerCase();
    return all.filter((shortcut) => shortcut.enabled && !shortcut.mouse && shortcut.key.toLowerCase() === normalizedKey && modsMatch(shortcut.modifiers, mods));
  }

  private matchMouseCandidates(button: string, mods: string[], all: ShortcutEntry[]): ShortcutEntry[] {
    return all.filter((shortcut) => shortcut.enabled && shortcut.mouse && shortcut.key === button && modsMatch(shortcut.modifiers, mods));
  }
  private evaluate(shortcut: ShortcutEntry, sKey: string, keyName: string, mods: string[]): void {
    switch (shortcut.trigger) {
      case "single":
      case "combo":
        this.fire(shortcut, sKey);
        return;

      case "double":
      case "triple":
      case "sequence": {
        const stateKey = `${sKey}:${shortcut.trigger}`;
        const target = shortcut.trigger === "triple" ? 3 : 2;
        const state = this.state.get(stateKey) ?? makeState(keyName, mods);
        this.state.set(stateKey, state);
        if (state.tapTimer) clearTimeout(state.tapTimer);
        state.pressTimes.push(Date.now());
        if (state.pressTimes.length > target) state.pressTimes.shift();
        if (state.pressTimes.length >= target) {
          const interval = state.pressTimes[state.pressTimes.length - 1] - state.pressTimes[0];
          if (interval <= shortcut.timing.tapInterval) {
            state.pressTimes = [];
            state.tapTimer = null;
            this.fire(shortcut, sKey);
            return;
          }
        }
        state.tapTimer = setTimeout(() => { state!.pressTimes = []; state!.tapTimer = null; }, shortcut.timing.tapInterval);
        return;
      }

      case "longPress":
      case "hold": {
        const stateKey = `${sKey}:${shortcut.trigger}`;
        const state = this.state.get(stateKey) ?? makeState(keyName, mods);
        this.state.set(stateKey, state);
        if (state.holdTimer) clearTimeout(state.holdTimer);
        state.holdFired = false;
        state.holdTimer = setTimeout(() => {
          state!.holdTimer = null;
          state!.holdFired = true;
          this.fire(shortcut, sKey);
        }, shortcut.timing.holdDuration);
        return;
      }

      case "tapThenHold": {
        const stateKey = `${sKey}:tth`;
        const state = this.state.get(stateKey) ?? makeState(keyName, mods);
        this.state.set(stateKey, state);
        if (!state.tapThenArmed) {
          state.tapThenArmed = true;
          if (state.tapTimer) clearTimeout(state.tapTimer);
          state.tapTimer = setTimeout(() => { state!.tapThenArmed = false; state!.tapTimer = null; }, shortcut.timing.tapInterval);
          return;
        }
        if (state.tapTimer) clearTimeout(state.tapTimer);
        state.tapTimer = null;
        state.tapThenArmed = false;
        if (state.holdTimer) clearTimeout(state.holdTimer);
        state.holdFired = false;
        state.holdTimer = setTimeout(() => {
          state!.holdTimer = null;
          state!.holdFired = true;
          this.fire(shortcut, sKey);
        }, shortcut.timing.holdDuration);
        return;
      }
    }
  }

  private clearHold(keyName: string): void {
    for (const [stateKey, state] of this.state) {
      if (state.key !== keyName) continue;
      if (stateKey.endsWith(":double") || stateKey.endsWith(":triple") || stateKey.endsWith(":sequence")) continue;
      if (stateKey.endsWith(":tth") && state.tapThenArmed) continue;
      if (state.holdTimer) clearTimeout(state.holdTimer);
      state.holdTimer = null;
      state.holdFired = false;
    }
  }
private fire(shortcut: ShortcutEntry, sKey: string): boolean {
    // Cooldown gate lives here (not before pattern evaluation) so the first
    // keypress of a double/triple/sequence is never swallowed by a cooldown
    // left over from the previous activation — that broke the popup toggle
    // (the next double-tap after a close fired nothing because its first tap
    // fell inside the previous activation's cooldown window).
    if (this.isOnCooldown(sKey)) return false;
    this.cooldowns.set(sKey, Date.now() + shortcut.timing.cooldown);
    this.onMatch(shortcut);
    return true;
  }

  private isOnCooldown(sKey: string): boolean { return (this.cooldowns.get(sKey) || 0) > Date.now(); }
  private sig(key: string, mods: string[]): string { return [...mods].map((mod) => mod.toLowerCase()).sort().join("+") + "+" + key.toLowerCase(); }
}






















