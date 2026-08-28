import type { ModifierKey, Shortcut } from "../types/index.ts";
import { useStore } from "../store/useStore";
import { ACTION_META } from "./constants.ts";
import { runActions } from "./actions";

function modsFromEvent(e: KeyboardEvent | MouseEvent): ModifierKey[] {
  const m: ModifierKey[] = [];
  if (e.ctrlKey) m.push("Ctrl");
  if (e.altKey) m.push("Alt");
  if (e.shiftKey) m.push("Shift");
  if (e.metaKey) m.push("Win");
  return m;
}

function tokenFromKey(e: KeyboardEvent): string {
  const k = e.key;
  if (k === " ") return "Space";
  if (k === "Control") return "Ctrl";
  if (k === "Meta") return "Win";
  if (k.length === 1) return k.toUpperCase();
  if (k.startsWith("Arrow")) return k.replace("Arrow", "");
  return k;
}

function mouseToken(button: number): string {
  return (["MB1", "MB3", "MB2", "MB4", "MB5"] as const)[button] ?? "MB1";
}

function sameMods(a: ModifierKey[], b: ModifierKey[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function sig(token: string, mods: ModifierKey[]): string {
  return [...mods].sort().join("+") + "+" + token;
}

function actionLabel(c: Shortcut): string {
  const a = c.actions[0];
  if (!a) return "No action";
  const meta = ACTION_META[a.type];
  if (a.payload.path) return `${meta.label} · ${a.payload.path}`;
  if (a.payload.url) return `${meta.label} · ${a.payload.url}`;
  if (a.payload.text) return `${meta.label} · snippet`;
  return meta.label;
}

type CaptureCb = (token: string, mods: ModifierKey[]) => void;

class Engine {
  private capture = false;
  private nextCapture: CaptureCb | null = null;
  private counts = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private down = new Map<string, boolean>();
  private holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private cooldowns = new Map<string, number>();
  private lastMouse = { x: 0, y: 0 };

  start() {
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("mousedown", this.onMouseDown, true);
    window.addEventListener("mouseup", this.onMouseUp, true);
    window.addEventListener("mousemove", this.onMouseMove, true);
    (window as unknown as { __lastMouse?: { x: number; y: number } }).__lastMouse = this.lastMouse;
  }

  setCapture(enabled: boolean) { this.capture = enabled; }
  isCapturing() { return this.capture; }
  captureNext(cb: CaptureCb) { this.nextCapture = cb; }

  /** In the desktop app with the native backend, the main process owns
   *  keyboard matching; the renderer engine must not fire shortcuts from real
   *  key events (keyboard capture for the simulator stays intact). */
  private desktopNative = false;
  setDesktopNative(v: boolean) { this.desktopNative = v; }
  isDesktopNative() { return this.desktopNative; }

  private blocked(): boolean {
    const store = useStore.getState();
    if (store.paused || store.safeMode) return true;
    const blacklisted = store.data.settings.privacy.blacklistedApps;
    return blacklisted.some((name) => name && store.focusedApp.toLowerCase().includes(name.toLowerCase()));
  }

  private async fire(c: Shortcut, sKey: string) {
    const store = useStore.getState();
    this.cooldowns.set(sKey, performance.now() + c.timing.cooldown);
    store.updateShortcut({ ...c, useCount: (c.useCount || 0) + 1, lastUsed: Date.now() });
    store.addRecent({ shortcutId: c.id, shortcutName: c.name, actionLabel: actionLabel(c), profileId: c.profileId });
    store.toast("Triggered: " + c.name, "success");
    const run = () => void runActions(c.actions);
    c.timing.delay > 0 ? setTimeout(run, c.timing.delay) : run();
  }

  private evaluate(c: Shortcut, sKey: string) {
    switch (c.trigger) {
      case "single":
      case "combo":
        void this.fire(c, sKey);
        break;
      case "double":
      case "triple": {
        const key = `${sKey}:${c.trigger}`;
        const target = c.trigger === "double" ? 2 : 3;
        const count = (this.counts.get(key) || 0) + 1;
        this.counts.set(key, count);
        if (this.timers.has(key)) clearTimeout(this.timers.get(key)!);
        if (count >= target) {
          this.counts.set(key, 0);
          void this.fire(c, sKey);
        } else {
          this.timers.set(key, setTimeout(() => this.counts.set(key, 0), c.timing.tapInterval));
        }
        break;
      }
      case "longPress":
      case "hold": {
        const key = `${sKey}:${c.trigger}`;
        if (this.down.get(key)) return;
        this.down.set(key, true);
        this.holdTimers.set(key, setTimeout(() => this.down.get(key) && void this.fire(c, sKey), c.timing.holdDuration));
        break;
      }
      case "tapThenHold": {
        const key = `${sKey}:tth`;
        const armed = this.counts.get(key) || 0;
        if (armed === 0) {
          this.counts.set(key, 1);
          this.timers.set(key, setTimeout(() => this.counts.set(key, 0), c.timing.tapInterval));
        } else {
          this.down.set(key, true);
          this.holdTimers.set(key, setTimeout(() => this.down.get(key) && void this.fire(c, sKey), c.timing.holdDuration));
        }
        break;
      }
      case "sequence": {
        const key = `${sKey}:seq`;
        const count = (this.counts.get(key) || 0) + 1;
        this.counts.set(key, count);
        if (this.timers.has(key)) clearTimeout(this.timers.get(key)!);
        if (count >= 2) {
          this.counts.set(key, 0);
          void this.fire(c, sKey);
        } else {
          this.timers.set(key, setTimeout(() => this.counts.set(key, 0), c.timing.tapInterval));
        }
        break;
      }
    }
  }

  private press(token: string, mods: ModifierKey[], native?: Event) {
    if (this.blocked()) return;
    const store = useStore.getState();
    const candidates = store.data.shortcuts.filter((s) => s.enabled && s.profileId === store.activeProfileId && s.key === token && sameMods(s.modifiers, mods));
    if (!candidates.length) return;
    const sKey = sig(token, mods);
    if (performance.now() < (this.cooldowns.get(sKey) || 0)) return;
    if (native && candidates.some((c) => c.suppressKey)) native.preventDefault();
    candidates.forEach((c) => this.evaluate(c, sKey));
  }

  private release(token: string, mods: ModifierKey[]) {
    const sKey = sig(token, mods);
    for (const [key, timer] of this.holdTimers) {
      if (key.startsWith(sKey + ":")) {
        clearTimeout(timer);
        this.down.set(key, false);
      }
    }
  }

  simulateTap(token: string, mods: ModifierKey[] = []) {
    this.press(token, mods);
    setTimeout(() => this.release(token, mods), 30);
  }
  simulateHold(token: string, mods: ModifierKey[] = [], ms = 900) {
    this.press(token, mods);
    setTimeout(() => this.release(token, mods), ms);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.nextCapture) {
      const cb = this.nextCapture;
      this.nextCapture = null;
      e.preventDefault();
      cb(tokenFromKey(e), modsFromEvent(e));
      return;
    }
    if (this.capture && !this.desktopNative && !e.repeat && !isEditableTarget(e.target)) this.press(tokenFromKey(e), modsFromEvent(e), e);
  };
  private onKeyUp = (e: KeyboardEvent) => { if (this.capture && !this.desktopNative) this.release(tokenFromKey(e), modsFromEvent(e)); };
  private onMouseDown = (e: MouseEvent) => {
    if (this.nextCapture) {
      const cb = this.nextCapture;
      this.nextCapture = null;
      e.preventDefault();
      cb(mouseToken(e.button), []);
      return;
    }
    if (this.capture && !this.desktopNative) this.press(mouseToken(e.button), []);
  };
  private onMouseUp = (e: MouseEvent) => { if (this.capture && !this.desktopNative) this.release(mouseToken(e.button), []); };
  private onMouseMove = (e: MouseEvent) => { this.lastMouse.x = e.clientX; this.lastMouse.y = e.clientY; };
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

let engine: Engine | null = null;
export function initEngine(): Engine { if (!engine) { engine = new Engine(); engine.start(); } return engine; }
export function getEngine(): Engine { return engine ?? initEngine(); }
