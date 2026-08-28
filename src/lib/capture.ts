import type { ModifierKey, Shortcut } from "../types";
import { getGestureAvailability, allTapGesturesTaken } from "./conflict.ts";
import { isCatalogKey } from "./keyCatalog.ts";

/**
 * Native key capture for the shortcut-creation UI.
 *
 * In the desktop app the renderer never sees keydown events for keys the
 * native helper consumes (any key with an existing shortcut, remap, or hyper
 * behavior). Physical capture must therefore go through the native capture
 * mode: the helper arms, reports the next non-injected key as CapturedKey over
 * IPC, and the renderer maps it to the canonical catalog token. The DOM
 * keydown path stays as the browser/simulator fallback.
 *
 * The native message carries the PHYSICAL key (vk/scanCode from the raw hook),
 * so a captured remap source or hyper key reports its physical identity, not
 * its behavior — the tests in scripts/key-capture.test.mjs cover this.
 */

/** Canonical renderer token for a native vk. Mirrors electron/vk-catalog.ts
 *  so the picker, capture, and engine all share one vocabulary. */
export const VK_TO_KEY: Record<number, string> = {
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

export interface NativeCaptured {
  vk: number;
  scanCode: number;
  extended: boolean;
  name: string;
}

/** Map a native captured key to the canonical catalog token. The native
 *  message always reports the PHYSICAL key (raw hook vk), so a remapped or
 *  hyper key still resolves to its physical identity. Falls back to the
 *  native name when the vk is unknown but already a catalog key, else a
 *  `VK_..` placeholder. */
export function tokenFromNativeCaptured(msg: NativeCaptured): string {
  const byVk = VK_TO_KEY[msg.vk];
  if (byVk) return byVk;
  if (isCatalogKey(msg.name)) return msg.name;
  return `VK_${msg.vk.toString(16).toUpperCase()}`;
}

/** Whether the native capture bridge is present in this context. */
export function nativeCaptureAvailable(eapi?: any): boolean {
  return !!(eapi?.input?.beginCapture && eapi?.input?.onCapturedKey);
}

/** Safe access to the electron bridge (absent in Node tests / plain browser). */
function electronApi(): any {
  return typeof window !== "undefined" ? (window as any).electronAPI : undefined;
}

/**
 * One-shot capture coordinator. Prefers the native bridge; falls back to the
 * DOM keydown capture (browser / simulator). Owns the full lifecycle: arm,
 * cancel, captured, and cleanup (cancel + unsubscribe) on unmount/reload.
 */
export class CaptureCoordinator {
  private nativeUnsub: (() => void) | null = null;
  private nativeCancelUnsub: (() => void) | null = null;
  private active = false;
  private arming = false;
  private session = 0;
  private onCaptured: (token: string, mods: ModifierKey[]) => void;
  private onCancelled: (() => void) | null = null;
  private getEapi: () => any;

  constructor(onCaptured: (token: string, mods: ModifierKey[]) => void, getEapi: () => any = electronApi) {
    this.onCaptured = onCaptured;
    this.getEapi = getEapi;
  }

  /** Update the captured callback (called each render so closures stay fresh). */
  setOnCaptured(cb: (token: string, mods: ModifierKey[]) => void): void {
    this.onCaptured = cb;
  }

  /** Update the cancelled callback (Escape while listening, etc.). */
  setOnCancelled(cb: () => void): void {
    this.onCancelled = cb;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Whether the native bridge would be used for this capture. */
  get usingNative(): boolean {
    return nativeCaptureAvailable(this.getEapi());
  }

  start(getEngine: { captureNext: (cb: (token: string, mods: ModifierKey[]) => void) => void }): Promise<"native" | "dom" | "none"> {
    if (this.active || this.arming) return Promise.resolve("none");
    const session = ++this.session;
    this.arming = true;
    let completed = false;
    const eapi = this.getEapi();
    if (nativeCaptureAvailable(eapi)) {
      // Subscribe BEFORE arming so a physical press between beginCapture()
      // resolving and the listener attaching is never lost, and so a stale
      // response from a previous session is ignored by the session check.
      this.nativeUnsub = eapi.input.onCapturedKey((msg: NativeCaptured) => {
        if (session !== this.session || completed) return;
        completed = true;
        this.active = false;
        this.arming = false;
        this.clearNative();
        void eapi.input.cancelCapture?.();
        this.onCaptured(tokenFromNativeCaptured(msg), []);
      });
      // Escape (or any native cancel) while listening: exit capture cleanly
      // without producing a captured key.
      if (eapi.input.onCaptureCancelled) {
        this.nativeCancelUnsub = eapi.input.onCaptureCancelled(() => {
          if (session !== this.session || completed) return;
          completed = true;
          this.active = false;
          this.arming = false;
          this.clearNative();
          void eapi.input.cancelCapture?.();
          this.onCancelled?.();
        });
      }
      return eapi.input
        .beginCapture()
        .then((armed: boolean) => {
          if (session !== this.session || completed) {
            // Cancelled/disposed/already captured: do not mark active.
            this.arming = false;
            return completed ? "native" : "none";
          }
          if (!armed) {
            this.clearNative();
            void eapi.input.cancelCapture?.();
            return this.startDomSafe(getEngine, session);
          }
          this.active = true;
          return "native";
        })
        .catch(() => {
          if (session !== this.session || completed) return completed ? "native" : "none";
          this.clearNative();
          void eapi.input.cancelCapture?.();
          return this.startDomSafe(getEngine, session);
        })
        .finally(() => {
          if (session === this.session && !completed) this.arming = false;
        });
    }
    this.arming = false;
    return Promise.resolve(this.startDomSafe(getEngine, session));
  }

  private clearNative(): void {
    if (this.nativeUnsub) {
      this.nativeUnsub();
      this.nativeUnsub = null;
    }
    if (this.nativeCancelUnsub) {
      this.nativeCancelUnsub();
      this.nativeCancelUnsub = null;
    }
  }

  private startDom(getEngine: { captureNext: (cb: (token: string, mods: ModifierKey[]) => void) => void }, session: number): "dom" {
    this.active = true;
    getEngine.captureNext((token, mods) => {
      if (session !== this.session) return; // stale — ignore
      this.active = false;
      this.onCaptured(token, mods);
    });
    return "dom";
  }

  /** DOM fallback that never throws: returns "none" if the engine is unusable. */
  private startDomSafe(getEngine: { captureNext: (cb: (token: string, mods: ModifierKey[]) => void) => void }, session: number): "dom" | "none" {
    try {
      return this.startDom(getEngine, session);
    } catch {
      this.active = false;
      this.arming = false;
      return "none";
    }
  }

  /** Abort an active capture without reporting a key. Safe to call when idle. */
  cancel(): void {
    if (!this.active && !this.nativeUnsub && !this.arming) return;
    this.session++; // invalidate any in-flight arming/captured responses
    this.active = false;
    this.arming = false;
    this.clearNative();
    const eapi = this.getEapi();
    void eapi?.input?.cancelCapture?.();
  }

  /** Cleanup on unmount/reload: abort and drop the subscription. */
  dispose(): void {
    this.cancel();
  }
}

/** Gesture availability for a captured token, reused by the Create Shortcut
 *  chips. Scope-aware; passed through to conflict.ts unchanged. */
export function captureGestureAvailability(token: string, mods: ModifierKey[], allShortcuts: Shortcut[], options: { currentShortcutId?: string; activeProfileId?: string } = {}) {
  return getGestureAvailability({ key: token, modifiers: mods }, allShortcuts, options);
}

export function capturedAllTapGesturesTaken(token: string, mods: ModifierKey[], allShortcuts: Shortcut[], options: { currentShortcutId?: string; activeProfileId?: string } = {}) {
  return allTapGesturesTaken({ key: token, modifiers: mods }, allShortcuts, options);
}