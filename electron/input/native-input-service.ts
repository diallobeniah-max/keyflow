import pkg from "uiohook-napi";
const { uIOhook } = pkg;
import { TriggerMatcher, ShortcutEntry, MatchCallback, keyNameToKeycode, nativeKeyName, KeyNameResolver } from "./trigger-matcher.js";
import { NativeKeyEvent, NativeMouseEvent } from "./types.js";
import { isIgnoredKey, isRecentlyInjected, markInjected } from "./key-skip.js";
import { inputDebug } from "./input-debug.js";

export type ServiceStatus = "stopped" | "running" | "paused" | "error";

export interface NativeInputServiceOptions {
  /** "native" = keys come from the native helper (uiohook keyboard disabled). */
  keyboardSource?: "native" | "uiohook";
  /** Key-name resolver for the matcher; defaults to the uiohook KEY_MAP. */
  keyName?: KeyNameResolver;
}

export class NativeInputService {
  private matcher: TriggerMatcher;
  private status: ServiceStatus = "stopped";
  private shortcuts: ShortcutEntry[] = [];
  private onTrigger: MatchCallback;
  private ignoredKeys = new Set<number>();
  private injectedKeys = new Map<number, number>();
  private keyboardSource: "native" | "uiohook";
  private modState = new Set<string>();
  private keyNameResolver: KeyNameResolver;

  constructor(onTrigger: MatchCallback, options: NativeInputServiceOptions = {}) {
    this.onTrigger = onTrigger;
    this.keyboardSource = options.keyboardSource ?? "uiohook";
    this.keyNameResolver = options.keyName ?? nativeKeyName;
    this.matcher = new TriggerMatcher(
      (sc) => {
        if (this.matchingEnabled()) {
          inputDebug(`[input-debug] matched ${sc.id} key=${sc.key} trigger=${sc.trigger}`);
          this.onTrigger(sc);
        }
      },
      this.keyNameResolver,
    );
  }

  start(): void {
    if (this.status === "running") return;
    try {
      if (this.keyboardSource === "uiohook") {
        uIOhook.on("keydown", this.handleKeyDown);
        uIOhook.on("keyup", this.handleKeyUp);
      }
      uIOhook.on("mousedown", this.handleMouseDown);
      uIOhook.on("mouseup", this.handleMouseUp);
      uIOhook.start();
      this.status = "running";
      inputDebug(`[input-debug] service running (keyboard source: ${this.keyboardSource})`);
      console.log(`[input] Native input service started (keyboard source: ${this.keyboardSource})`);
    } catch (err) {
      this.status = "error";
      console.error("[input] Failed to start:", (err as Error).message);
    }
  }

  stop(): void {
    if (this.status === "stopped") return;
    try {
      uIOhook.removeListener("keydown", this.handleKeyDown);
      uIOhook.removeListener("keyup", this.handleKeyUp);
      uIOhook.removeListener("mousedown", this.handleMouseDown);
      uIOhook.removeListener("mouseup", this.handleMouseUp);
      uIOhook.stop();
    } catch { /* ignore */ }
    this.matcher.reset();
    this.modState.clear();
    this.status = "stopped";
    inputDebug("[input-debug] service stopped");
    console.log("[input] Native input service stopped");
  }

  pause(): void {
    if (this.status === "running") {
      this.status = "paused";
      this.matcher.reset();
      this.modState.clear();
      inputDebug("[input-debug] service paused");
      console.log("[input] Native input service paused");
    }
  }

  resume(): void {
    if (this.status === "paused") {
      this.status = "running";
      inputDebug("[input-debug] service resumed");
      console.log("[input] Native input service resumed");
    }
  }

  /** Runtime switch of the keyboard source (native helper <-> uiohook). */
  setKeyboardSource(source: "native" | "uiohook"): void {
    if (source === this.keyboardSource) return;
    this.keyboardSource = source;
    try {
      if (source === "uiohook") {
        uIOhook.on("keydown", this.handleKeyDown);
        uIOhook.on("keyup", this.handleKeyUp);
      } else {
        uIOhook.removeListener("keydown", this.handleKeyDown);
        uIOhook.removeListener("keyup", this.handleKeyUp);
      }
    } catch { /* ignore */ }
    this.matcher.reset();
    this.modState.clear();
    inputDebug(`[input-debug] keyboard source switched to ${source}`);
    console.log(`[input] keyboard source switched to ${source}`);
  }

  /**
   * Feed a normalized key event reported by the native helper into the same
   * TriggerMatcher the uiohook path uses. Modifier state is tracked here
   * because the helper does not compute ctrl/alt/shift/meta flags.
   */
  handleNativeKeyEvent(e: { type: "down" | "up"; vk: number; scanCode: number; extended: boolean; injected: boolean; sequence: number }): void {
    if (!this.matchingEnabled()) return;
    if (e.injected) {
      // Another tool injected this key (e.g. AHK remaps). Do not match on
      // it — it could double-fire a KeyFlow shortcut. The helper already
      // filters its own remap output via the dwExtraInfo marker.
      inputDebug(`[input-debug] native ${e.type} vk=${e.vk} SKIP (injected by other tool)`);
      return;
    }
    const name = this.keyNameResolver(e.vk, e.scanCode, e.extended);
    if (name.startsWith("VK_") || name.startsWith("KEY_")) {
      inputDebug(`[input-debug] native ${e.type} vk=${e.vk} UNKNOWN_KEY (${name}) — no shortcut can match`);
      return;
    }
    if (e.type === "down") this.modState.add(name);
    else this.modState.delete(name);
    const mods = { ctrlKey: this.modState.has("Ctrl"), altKey: this.modState.has("Alt"), shiftKey: this.modState.has("Shift"), metaKey: this.modState.has("Win") };
    const modNames = ["Ctrl", "Alt", "Shift", "Win"].filter((m) => this.modState.has(m)).join("+") || "-";
    inputDebug(`[input-debug] native ${e.type} ${name} vk=${e.vk} scan=${e.scanCode} seq=${e.sequence} mods=${modNames}`);
    this.matcher.onKeyEvent(
      { type: e.type === "down" ? "keydown" : "keyup", keycode: e.vk, rawcode: e.scanCode, extended: e.extended, ...mods },
      this.shortcuts,
    );
  }

  /** Key names owned by the suppression helper (by key name) are ignored by uiohook. */
  setIgnoredKeyNames(names: string[]): void {
    const codes = new Set<number>();
    for (const n of names) {
      const c = keyNameToKeycode(n);
      if (c !== undefined) codes.add(c);
    }
    this.ignoredKeys = codes;
    inputDebug(`[input-debug] ignored by uiohook: ${names.join(",") || "(none)"}`);
    this.matcher.reset();
  }

  updateShortcuts(entries: ShortcutEntry[]): void {
    this.shortcuts = entries.filter((s) => s.enabled);
    inputDebug(`[input-debug] shortcuts updated: ${this.shortcuts.length} enabled (${this.shortcuts.map((s) => s.key).join(",")})`);
    this.matcher.reset();
  }

  /**
   * Feed a normalized key event from the suppression helper (AutoHotkey) into the
   * same TriggerMatcher the native listener uses. Suppressed keys are owned by the
   * helper (uiohook never sees them because AHK consumes the key), so this is the
   * authoritative path for those keys.
   */
  injectKeyEvent(state: "down" | "up", keyName: string): void {
    if (!this.matchingEnabled()) {
      inputDebug(`[input-debug] inject ${state} ${keyName} SKIP (service not running)`);
      return;
    }
    const keycode = keyNameToKeycode(keyName);
    if (keycode === undefined) {
      inputDebug(`[input-debug] inject ${state} ${keyName} SKIP (unknown key name)`);
      return;
    }
    inputDebug(`[input-debug] inject ${state} ${keyName} vk=${keycode}`);
    this.matcher.onKeyEvent(
      { type: state === "down" ? "keydown" : "keyup", keycode, rawcode: keycode, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false },
      this.shortcuts
    );
  }

  /** Ignore a key that the suppression helper just injected as a replacement. */
  noteInjectedKey(vk: number): void {
    markInjected(this.injectedKeys, vk, Date.now());
  }

  getStatus(): ServiceStatus {
    return this.status;
  }

  /** Subclasses can override for tests; the real service matches only while running. */
  protected matchingEnabled(): boolean {
    return this.status === "running";
  }

  private shouldSkipKey(keycode: number): boolean {
    if (isIgnoredKey(keycode, this.ignoredKeys)) return true;
    return isRecentlyInjected(keycode, this.injectedKeys, Date.now());
  }

  private handleKeyDown = (e: any): void => {
    if (this.status !== "running") return;
    inputDebug(`[input-debug] uiohook keydown ${nativeKeyName(e.keycode)} vk=${e.keycode}`);
    if (this.shouldSkipKey(e.keycode)) {
      inputDebug(`[input-debug] uiohook keydown ${nativeKeyName(e.keycode)} SKIP (owned by helper)`);
      return;
    }
    this.matcher.onKeyEvent(
      { type: "keydown", keycode: e.keycode, rawcode: e.rawcode, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey },
      this.shortcuts
    );
  };

  private handleKeyUp = (e: any): void => {
    if (this.status !== "running") return;
    inputDebug(`[input-debug] uiohook keyup ${nativeKeyName(e.keycode)} vk=${e.keycode}`);
    if (this.shouldSkipKey(e.keycode)) {
      inputDebug(`[input-debug] uiohook keyup ${nativeKeyName(e.keycode)} SKIP (owned by helper)`);
      return;
    }
    this.matcher.onKeyEvent(
      { type: "keyup", keycode: e.keycode, rawcode: e.rawcode, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey },
      this.shortcuts
    );
  };

  private handleMouseDown = (e: any): void => {
    if (this.status !== "running") return;
    this.matcher.onMouseEvent(
      { type: "mousedown", button: Number(e.button), clicks: e.clicks, x: e.x, y: e.y, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey },
      this.shortcuts
    );
  };

  private handleMouseUp = (e: any): void => {
    if (this.status !== "running") return;
    this.matcher.onMouseEvent(
      { type: "mouseup", button: Number(e.button), clicks: e.clicks, x: e.x, y: e.y, altKey: e.altKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey },
      this.shortcuts
    );
  };
}
