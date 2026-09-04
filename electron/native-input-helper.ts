/**
 * NativeInputHelper: manages the keyflow-input.exe child process and its
 * NDJSON protocol (stdin = commands, stdout = events, stderr = logs).
 *
 * The helper owns the global low-level keyboard hook. It only reports key
 * events and enforces suppress/disable/remap; all shortcut matching stays in
 * the Electron TriggerMatcher via NativeInputService.handleNativeKeyEvent.
 */

import { spawn, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { inputDebug } from "./input/input-debug.js";
import { keyNameToVk } from "./vk-catalog.js";
import type { ShortcutEntry } from "./input/trigger-matcher.js";
import { ElevatedHelperBridge } from "./elevated-helper.js";

/** Must match the Rust OWN_INJECTED_MARKER (native/keyflow-input/src/inject.rs). */
export const NATIVE_INPUT_MARKER = 0x4b46574b;

export const NATIVE_PROTOCOL_VERSION = 1;

export type NativeKeyMode = "pass" | "suppress" | "disable" | "remap";

export interface NativeKeySpec {
  vk: number;
  mode: NativeKeyMode;
  /** Target vk when mode === "remap". */
  remapTo?: number;
}

export interface NativeKeyEventMessage {
  type: "down" | "up";
  vk: number;
  scanCode: number;
  extended: boolean;
  injected: boolean;
  lowerIntegrityInjected: boolean;
  sequence: number;
}

export type NativeHelperStatus = "stopped" | "starting" | "ready" | "failed" | "unavailable";

export interface NativeTriggeredMessage {
  type: "triggered";
  shortcutId: string;
  generation: number;
}

export interface NativeCapturedKeyMessage {
  type: "capturedKey";
  vk: number;
  scanCode: number;
  extended: boolean;
  name: string;
}

export interface DragSwitcherWindowEntry {
  hwnd: string;
  title: string;
  app: string;
  icon?: string;
}

export interface DragSwitcherShowMessage {
  type: "dragSwitcherShow";
  monitorIndex: number;
  monitorLeft: number;
  monitorTop: number;
  monitorRight: number;
  monitorBottom: number;
  workLeft: number;
  workTop: number;
  workRight: number;
  workBottom: number;
  cursorX: number;
  cursorY: number;
  sourceHwnd: string;
  hoverDwellMs: number;
  windows: DragSwitcherWindowEntry[];
}

export interface DragSwitcherMoveMessage {
  type: "dragSwitcherMove";
  x: number;
  y: number;
}

export interface DragSwitcherHideMessage {
  type: "dragSwitcherHide";
  reason: string;
}

export interface WindowActivationResultMessage {
  type: "windowActivationResult";
  hwnd: string;
  success: boolean;
  reason: string;
}

export interface DragSwitcherConfig {
  enabled: boolean;
  /** Enabled hot-zone bitmask (ZONE_TL=1 .. ZONE_BOTTOM=0x80). 0 = unspecified -> Top Right. */
  zones: number;
  /** Activation dwell in ms; 0 = Instant. */
  activationMs: number;
  hoverMs: number;
  cornerSize: number;
}

export interface SmoothScrollNativeConfig {
  enabled?: boolean;
  preset?: string;
  stepSize?: number;
  animationTime?: number;
  accelerationEnabled?: boolean;
  accelerationDelta?: number;
  accelerationMax?: number;
  trackpadPassThrough?: boolean;
}

/** A running application offered by the app picker (executable identity). */
export interface NativeAppInfo {
  executablePath: string;
  processName?: string;
  displayName?: string;
  icon?: string;
}

export interface AppListMessage {
  type: "appList";
  apps: NativeAppInfo[];
}

export function resolveNativeHelperPath(): string | null {
  const fromEnv = process.env.KEYFLOW_INPUT_HELPER;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  // Dev: built by `npm run native:build` from the repo root.
  const dev = join(process.cwd(), "native", "keyflow-input", "target", "release", "keyflow-input.exe");
  if (existsSync(dev)) return dev;
  // Packaged: extraResources -> resources/keyflow-input/keyflow-input.exe
  const packaged = join(process.resourcesPath ?? "", "keyflow-input", "keyflow-input.exe");
  if (existsSync(packaged)) return packaged;
  return null;
}

export interface NativeKeyBuildContext {
  paused?: boolean;
  safeMode?: boolean;
  emergencySafe?: boolean;
}

/**
 * Map enabled shortcuts to the helper's per-key policy table.
 * - suppress / disable / remap (with a resolvable target) become helper modes;
 * - pass-through keys and unknowns are omitted (helper forwards by default).
 * Paused/safe mode returns an empty table (everything passes through).
 */
export function buildNativeKeyConfig(entries: ShortcutEntry[], context: NativeKeyBuildContext = {}): NativeKeySpec[] {
  if (context.paused || context.safeMode || context.emergencySafe) return [];
  const specs: NativeKeySpec[] = [];
  const seen = new Map<number, NativeKeyMode>();
  for (const entry of entries ?? []) {
    if (!entry.enabled) continue;
    const behavior = (entry as any).keyBehavior ?? "passThrough";
    const vk = keyNameToVk(entry.key);
    if (vk === undefined) continue;
    let mode: NativeKeyMode = "pass";
    let remapTo: number | undefined;
    if (behavior === "suppress") mode = "suppress";
    else if (behavior === "disable") mode = "disable";
    else if (behavior === "remap") {
      const target = keyNameToVk((entry as any).remapTo ?? "");
      if (target === undefined) continue;
      mode = "remap";
      remapTo = target;
    } else {
      continue; // passThrough needs no helper entry
    }
    // First enabled shortcut wins per key; later ones are ignored.
    if (!seen.has(vk)) {
      seen.set(vk, mode);
      specs.push({ vk, mode, remapTo });
    }
  }
  inputDebug(`[input-debug] native key config: ${specs.map((s) => `${s.vk}:${s.mode}${s.remapTo ? "->" + s.remapTo : ""}`).join(",") || "(none)"}`);
  return specs;
}

export class NativeInputHelper {
  private proc: ChildProcess | null = null;
  private elevatedBridge: ElevatedHelperBridge | null = null;
  private isElevated = false;
  private parentPid = 0;
  private status: NativeHelperStatus = "stopped";
  private onKey: (e: NativeKeyEventMessage) => void;
  private onStatus: (s: NativeHelperStatus) => void;
  private onTriggered: ((msg: NativeTriggeredMessage) => void) | null = null;
  private onCapturedKey: ((msg: NativeCapturedKeyMessage) => void) | null = null;
  private onDragSwitcherShow: ((msg: DragSwitcherShowMessage) => void) | null = null;
  private onDragSwitcherMove: ((msg: DragSwitcherMoveMessage) => void) | null = null;
  private onDragSwitcherHide: ((msg: DragSwitcherHideMessage) => void) | null = null;
  private onWindowActivationResult: ((msg: WindowActivationResultMessage) => void) | null = null;
  private pendingDragSwitcher: DragSwitcherConfig | null = null;
  private pendingSmoothScroll: SmoothScrollNativeConfig | null = null;
  private pendingKeys: NativeKeySpec[] = [];
  private pendingShortcuts: unknown[] | null = null;
  private pendingHyperKey: unknown = null;
  private pendingAppList: ((apps: NativeAppInfo[]) => void) | null = null;
  private pendingActiveApp: ((app: NativeAppInfo | null) => void) | null = null;
  private currentConfigVersion = 0;
  private lastAckVersion = 0;
  private pendingCapture = false;
  /** Resolves the in-flight beginCapture() promise once the hook acks it armed. */
  private captureArmedResolve: ((armed: boolean) => void) | null = null;
  private captureArmedTimer: NodeJS.Timeout | null = null;
  /** Renderer callback for a cancel event (Escape while listening). */
  private onCaptureCancelled: (() => void) | null = null;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private lineBuf = "";
  private shuttingDown = false;
  /** Bounded retry delays (ms) for unexpected helper exits. */
  private static readonly RECOVERY_BACKOFF_MS = [250, 1000, 3000];
  private recoveryAttempts = 0;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private lastAckRuleCount = 0;
  private lastAckHyperEnabled = false;
  private lastAckHyperVk = 0;
  private injectSeq = 0;
  private pendingInject = new Map<number, (ok: boolean, error?: number) => void>();

  constructor(onKey: (e: NativeKeyEventMessage) => void, onStatus: (s: NativeHelperStatus) => void) {
    this.onKey = onKey;
    this.onStatus = onStatus;
  }

  /** Hook for completed native gestures (the only thing Electron routes on). */
  setOnTrigger(fn: (msg: NativeTriggeredMessage) => void): void {
    this.onTriggered = fn;
  }

  /** Hook for the one-shot key capture used by the shortcut-creation UI. */
  setOnCapturedKey(fn: (msg: NativeCapturedKeyMessage) => void): void {
    this.onCapturedKey = fn;
  }

  /** Hook for capture cancellation (Escape while listening). */
  setOnCaptureCancelled(fn: () => void): void {
    this.onCaptureCancelled = fn;
  }

  /** Hook for Drag Corner Switcher overlay show events. */
  setOnDragSwitcherShow(fn: (msg: DragSwitcherShowMessage) => void): void {
    this.onDragSwitcherShow = fn;
  }

  /** Hook for cursor moves while the switcher overlay is visible. */
  setOnDragSwitcherMove(fn: (msg: DragSwitcherMoveMessage) => void): void {
    this.onDragSwitcherMove = fn;
  }

  /** Hook for Drag Corner Switcher overlay hide events. */
  setOnDragSwitcherHide(fn: (msg: DragSwitcherHideMessage) => void): void {
    this.onDragSwitcherHide = fn;
  }

  /** Hook for window activation attempts (result of DragSwitcherActivate). */
  setOnWindowActivationResult(fn: (msg: WindowActivationResultMessage) => void): void {
    this.onWindowActivationResult = fn;
  }

  /**
   * Push the Drag Corner Switcher configuration to the native helper. The
   * helper keeps this config across shortcut reloads; it is re-sent whenever
   * the helper reconnects so a restart never silently disables the feature.
   */
  setDragSwitcher(config: DragSwitcherConfig): void {
    this.pendingDragSwitcher = config;
    if (this.status === "ready") this.sendDragSwitcher();
  }

  /** Ask the native helper to activate a window (tile hover dwell fired). */
  activateDragSwitcherWindow(hwnd: string): void {
    this.send({ type: "dragSwitcherActivate", version: NATIVE_PROTOCOL_VERSION, hwnd });
  }

  /**
   * Fetch the running applications for the app picker. Resolves with an empty
   * array when the helper is not ready (UI shows the Empty state / Browse).
   */
  listApps(): Promise<NativeAppInfo[]> {
    if (this.status !== "ready") return Promise.resolve([]);
    return new Promise((resolve) => {
      this.pendingAppList = resolve;
      this.send({ type: "listApps", version: NATIVE_PROTOCOL_VERSION });
      setTimeout(() => {
        if (this.pendingAppList) {
          this.pendingAppList = null;
          resolve([]);
        }
      }, 3000);
    });
  }

  /**
   * Fetch the cached foreground application (the current context). Resolves
   * with null when the helper is not ready or the foreground is unresolved.
   */
  getActiveApp(): Promise<NativeAppInfo | null> {
    if (this.status !== "ready") return Promise.resolve(null);
    return new Promise((resolve) => {
      this.pendingActiveApp = resolve;
      this.send({ type: "getActiveApp", version: NATIVE_PROTOCOL_VERSION });
      setTimeout(() => {
        if (this.pendingActiveApp) {
          this.pendingActiveApp = null;
          resolve(null);
        }
      }, 3000);
    });
  }

  getStatus(): NativeHelperStatus {
    return this.status;
  }

  isElevatedMode(): boolean {
    return this.isElevated;
  }

  /** Spawn the helper; it hooks the keyboard only after this returns. */
  start(parentPid: number): void {
    this.parentPid = parentPid;
    if (this.isElevated && this.elevatedBridge) {
      return;
    }
    const path = resolveNativeHelperPath();
    if (!path) {
      console.error("[native-input] helper binary not found (run `npm run native:build`)");
      this.fail("missing-binary");
      return;
    }
    this.status = "starting";
    this.onStatus("starting");
    console.log(`[native-input] spawning standard helper: ${path}`);

    const proc = spawn(path, ["--parent-pid", String(parentPid)], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc = proc;
    this.proc = proc;

    proc.on("error", (err) => {
      console.error(`[native-input] helper spawn error: ${err.message}`);
      this.fail("spawn");
    });

    proc.on("exit", (code, signal) => {
      console.log(`[native-input] helper exited code=${code} signal=${signal}`);
      if (this.shuttingDown) return;
      if (this.status === "ready" || this.status === "starting") {
        this.scheduleRecovery();
      }
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      this.lineBuf += chunk.toString("utf8");
      let index: number;
      while ((index = this.lineBuf.indexOf("\n")) >= 0) {
        const line = this.lineBuf.slice(0, index).trim();
        this.lineBuf = this.lineBuf.slice(index + 1);
        if (line) this.handleLine(line);
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trimEnd();
      if (text) console.error(`[native-input-helper] ${text}`);
    });

    this.handshakeTimer = setTimeout(() => {
      if (this.status === "starting") this.fail("handshake-timeout");
    }, 5000);
  }

  /** Full replacement of the per-key policy table (legacy single-key mode). */
  setKeys(keys: NativeKeySpec[]): void {
    this.pendingKeys = keys;
    this.pendingShortcuts = null;
    if (this.status === "ready") this.sendConfigure();
  }

  /** Full replacement of the canonical native shortcut configuration. */
  setShortcuts(shortcuts: unknown[], hyperKey?: unknown, version?: number): void {
    this.currentConfigVersion = version ?? (this.currentConfigVersion + 1);
    this.pendingShortcuts = shortcuts;
    this.pendingHyperKey = hyperKey ?? null;
    if (this.status === "ready") this.sendConfigure();
  }

  isConfigSynced(): boolean {
    return this.status === "ready" && this.currentConfigVersion > 0 && this.lastAckVersion === this.currentConfigVersion;
  }

  getConfigVersionStatus(): { requested: number; acked: number; synced: boolean } {
    return {
      requested: this.currentConfigVersion,
      acked: this.lastAckVersion,
      synced: this.isConfigSynced(),
    };
  }

  /** Request a one-shot capture of the next physical key (shortcut UI).
   *  Resolves `true` only once the Rust hook has actually armed and acked
   *  (CaptureArmed). Resolves `false` on timeout, if the helper is unavailable,
   *  or if capture is cancelled before arming. This guarantees the renderer
   *  never believes capture is active while the native hook is not armed. */
  beginCapture(): Promise<boolean> {
    if (this.captureArmedTimer) {
      clearTimeout(this.captureArmedTimer);
      this.captureArmedTimer = null;
    }
    return new Promise<boolean>((resolve) => {
      this.captureArmedResolve = resolve;
      this.captureArmedTimer = setTimeout(() => {
        this.captureArmedTimer = null;
        if (this.captureArmedResolve) {
          this.captureArmedResolve = null;
          this.pendingCapture = false;
          resolve(false);
        }
      }, 2000);

      if (this.status === "ready") {
        this.pendingCapture = false;
        this.send({ type: "beginCapture", version: NATIVE_PROTOCOL_VERSION });
      } else {
        // Queued; flushConfigure sends beginCapture once the helper is ready,
        // and the CaptureArmed ack resolves this promise.
        this.pendingCapture = true;
      }
    });
  }

  /** Abort an active key capture (picker close, unmount, reload, shutdown). */
  cancelCapture(): void {
    this.pendingCapture = false;
    if (this.captureArmedTimer) {
      clearTimeout(this.captureArmedTimer);
      this.captureArmedTimer = null;
    }
    if (this.captureArmedResolve) {
      const resolve = this.captureArmedResolve;
      this.captureArmedResolve = null;
      // Cancelled before arming: report as not-armed so the coordinator does
      // not fall back to a capture the user explicitly aborted.
      resolve(false);
    }
    if (this.status === "ready") {
      this.send({ type: "stopKeyCapture", version: NATIVE_PROTOCOL_VERSION });
    }
  }

  setKeyStream(enabled: boolean): void {
    this.send({ type: "setKeyStream", version: NATIVE_PROTOCOL_VERSION, enabled });
  }

  setPaused(paused: boolean): void {
    this.send(paused ? { type: "pause", version: NATIVE_PROTOCOL_VERSION } : { type: "resume", version: NATIVE_PROTOCOL_VERSION });
  }

  /** Toggle the native WASD → arrows mapping. */
  setWasdNavigation(enabled: boolean, cursorSize?: number, cursorPath?: string): void {
    this.send({
      type: "setWasdNavigation",
      version: NATIVE_PROTOCOL_VERSION,
      enabled,
      cursor_size: cursorSize ?? 32,
      cursor_path: cursorPath ?? null,
    });
  }

  /** Configure native System-Wide Smooth Scrolling. */
  setSmoothScroll(config: SmoothScrollNativeConfig): void {
    this.pendingSmoothScroll = config;
    if (this.status === "ready") {
      this.sendSmoothScroll();
    }
  }

  private sendSmoothScroll(): void {
    const c = this.pendingSmoothScroll;
    if (!c) return;
    this.send({
      type: "setSmoothScroll",
      version: NATIVE_PROTOCOL_VERSION,
      enabled: c.enabled !== false,
      preset: c.preset ?? "smooth",
      stepSize: c.stepSize ?? 100,
      animationTime: c.animationTime ?? 400,
      accelerationEnabled: c.accelerationEnabled !== false,
      accelerationDelta: c.accelerationDelta ?? 50,
      accelerationMax: c.accelerationMax ?? 3.0,
      trackpadPassThrough: c.trackpadPassThrough !== false,
    });
  }

  /**
   * Inject one real SendInput key event via the helper. Resolves true only
   * after the helper confirms SendInput accepted it. Media/volume keys use
   * this path because PowerShell keybd_event cannot deliver them reliably.
   */
  injectKey(vk: number, extended: boolean, down: boolean): Promise<boolean> {
    if (this.status !== "ready") return Promise.resolve(false);
    const seq = ++this.injectSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingInject.delete(seq);
        console.error(`[media-control] injectKey vk=0x${vk.toString(16).toUpperCase()} seq=${seq} result=timeout`);
        resolve(false);
      }, 1500);
      this.pendingInject.set(seq, (ok, error) => {
        clearTimeout(timer);
        if (!ok) console.error(`[media-control] injectKey vk=0x${vk.toString(16).toUpperCase()} seq=${seq} result=SendInput-failed lastError=${error ?? 0}`);
        resolve(ok);
      });
      this.send({ type: "injectKey", version: NATIVE_PROTOCOL_VERSION, vk, extended, down, seq });
    });
  }

  /** Diagnostics for the Advanced settings panel. */
  getDiagnostics(): {
    status: NativeHelperStatus;
    requested: number;
    acked: number;
    synced: boolean;
    ruleCount: number;
    hyperEnabled: boolean;
    hyperVk: number;
  } {
    return {
      status: this.status,
      requested: this.currentConfigVersion,
      acked: this.lastAckVersion,
      synced: this.isConfigSynced(),
      ruleCount: this.lastAckRuleCount,
      hyperEnabled: this.lastAckHyperEnabled,
      hyperVk: this.lastAckHyperVk,
    };
  }

  ping(): void {
    this.send({ type: "ping", version: NATIVE_PROTOCOL_VERSION });
  }

  /** Switch between standard medium-integrity helper and elevated helper. */
  async setElevated(elevated: boolean): Promise<boolean> {
    if (this.isElevated === elevated && (this.status === "ready" || this.status === "starting")) {
      return true;
    }
    inputDebug(`[input-debug] switching helper elevated mode: ${this.isElevated} -> ${elevated}`);

    if (elevated) {
      // Cleanly stop standard helper first so only ONE hook exists
      this.kill();
      this.isElevated = true;
      this.elevatedBridge = new ElevatedHelperBridge({
        parentPid: this.parentPid || process.pid,
        onLine: (line) => this.handleLine(line),
        onStatusChange: (s) => {
          this.status = s;
          this.onStatus(s);
          if (s === "ready") {
            this.flushConfigure();
          }
        },
        onExit: () => {
          if (this.isElevated) {
            console.warn("[native-input] elevated helper exited, falling back to standard helper");
            this.isElevated = false;
            this.start(this.parentPid || process.pid);
          }
        },
      });
      const ok = await this.elevatedBridge.start();
      if (!ok) {
        console.warn("[native-input] elevated start failed/declined, falling back to standard helper");
        this.isElevated = false;
        this.elevatedBridge = null;
        this.start(this.parentPid || process.pid);
        return false;
      }
      return true;
    } else {
      // Disabling elevated mode: stop elevated bridge and return to standard helper
      if (this.elevatedBridge) {
        this.elevatedBridge.stop();
        this.elevatedBridge = null;
      }
      this.isElevated = false;
      this.start(this.parentPid || process.pid);
      return true;
    }
  }

  /** Graceful shutdown: ask the helper to unhook and exit. */
  shutdown(): void {
    this.shuttingDown = true;
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    if (this.status !== "ready" && this.status !== "starting") {
      this.kill();
      return;
    }
    this.send({ type: "shutdown", version: NATIVE_PROTOCOL_VERSION });
    setTimeout(() => this.kill(), 800);
  }

  private flushConfigure(): void {
    this.sendConfigure();
    this.sendDragSwitcher();
    this.sendSmoothScroll();
    // Send beginCapture AFTER config so engine reload (which resets gesture
    // state) doesn't race with an already-armed capture. The Rust hook's
    // CAPTURING atomic is independent of the engine, but arming after config
    // ensures the helper is in a clean state before listening for keys.
    if (this.pendingCapture) {
      this.send({ type: "beginCapture", version: NATIVE_PROTOCOL_VERSION });
      this.pendingCapture = false;
    }
  }

  private sendDragSwitcher(): void {
    const c = this.pendingDragSwitcher;
    if (!c) return;
    this.send({
      type: "setDragSwitcher",
      version: NATIVE_PROTOCOL_VERSION,
      enabled: c.enabled,
      zones: c.zones ?? 0,
      activationMs: c.activationMs ?? 0,
      hoverMs: c.hoverMs ?? 400,
      cornerSize: c.cornerSize ?? 16,
    });
  }

  private sendConfigure(): void {
    if (this.pendingShortcuts !== null) {
      const hk = this.pendingHyperKey as Record<string, unknown> | null | undefined;
      console.log(`[hyper-forensic] ACTUAL ELECTRON CONFIGURE hyperPresent=${!!hk} enabled=${!!hk?.enabled} physicalVk=${(hk as any)?.vk ?? 0} includeShift=${!!hk?.includeShift} tapSyntheticId=${(hk as any)?.tapActionId ?? "none"}`);
      this.send({
        type: "configure",
        version: NATIVE_PROTOCOL_VERSION,
        configVersion: this.currentConfigVersion,
        shortcuts: this.pendingShortcuts,
        hyperKey: this.pendingHyperKey ?? undefined,
      });
      return;
    }
    this.send({
      type: "configure",
      version: NATIVE_PROTOCOL_VERSION,
      configVersion: this.currentConfigVersion,
      keys: this.pendingKeys,
    });
  }

  private send(msg: unknown): void {
    if (this.isElevated && this.elevatedBridge) {
      this.elevatedBridge.writeLine(JSON.stringify(msg));
      return;
    }
    if (!this.proc || this.proc.killed || this.proc.exitCode !== null) return;
    try {
      this.proc.stdin?.write(`${JSON.stringify(msg)}\n`);
    } catch (err) {
      console.error(`[native-input] failed to write to helper: ${(err as Error).message}`);
    }
  }

  private handleLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error(`[native-input] invalid helper line: ${line}`);
      return;
    }
    switch (msg.type) {
      case "ready": {
        if (this.handshakeTimer) {
          clearTimeout(this.handshakeTimer);
          this.handshakeTimer = null;
        }
        this.status = "ready";
        console.log(`[native-input] helper ready pid=${msg.pid} version=${msg.version}`);
        inputDebug(`[input-debug] native helper ready pid=${msg.pid}`);
        this.recoveryAttempts = 0;
        this.onStatus("ready");
        this.flushConfigure();
        break;
      }
      case "key":
        this.onKey({
          type: msg.state,
          vk: msg.vk,
          scanCode: msg.scanCode,
          extended: !!msg.extended,
          injected: !!msg.injected,
          lowerIntegrityInjected: !!msg.lowerIntegrityInjected,
          sequence: msg.sequence,
        });
        break;
      case "triggered":
        console.log(`[native-input] triggered ${msg.shortcutId} gen=${msg.generation}`);
        inputDebug(`[input-debug] native triggered ${msg.shortcutId} gen=${msg.generation}`);
        this.onTriggered?.({
          type: "triggered",
          shortcutId: msg.shortcutId,
          generation: msg.generation,
        });
        break;
      case "capturedKey":
        console.log(`[native-input] captured key ${msg.name} vk=${msg.vk}`);
        inputDebug(`[input-debug] native captured key ${msg.name} vk=${msg.vk} scan=${msg.scanCode} ext=${!!msg.extended}`);
        this.onCapturedKey?.({
          type: "capturedKey",
          vk: msg.vk,
          scanCode: msg.scanCode,
          extended: !!msg.extended,
          name: msg.name,
        });
        break;
      case "pong":
        inputDebug(`[input-debug] helper pong`);
        break;
      case "captureArmed":
        console.log("[key-capture-native] armed");
        inputDebug(`[input-debug] native capture armed version=${msg.version}`);
        if (this.captureArmedTimer) {
          clearTimeout(this.captureArmedTimer);
          this.captureArmedTimer = null;
        }
        if (this.captureArmedResolve) {
          const resolve = this.captureArmedResolve;
          this.captureArmedResolve = null;
          resolve(true);
        }
        break;
      case "captureCancelled":
        console.log("[key-capture-native] cancelled");
        inputDebug(`[input-debug] native capture cancelled`);
        this.onCaptureCancelled?.();
        break;
      case "ack":
        if (typeof msg.configVersion === "number") {
          this.lastAckVersion = msg.configVersion;
          this.lastAckRuleCount = typeof msg.count === "number" ? msg.count : 0;
          this.lastAckHyperEnabled = !!msg.hyperEnabled;
          this.lastAckHyperVk = typeof msg.hyperPhysicalVk === "number" ? msg.hyperPhysicalVk : 0;
          const sentCount = Array.isArray(this.pendingShortcuts) ? this.pendingShortcuts.length : this.pendingKeys.length;
          const ackStatus = msg.status ?? "ok";
          console.log(`[native-config] ack version=${msg.configVersion} rules=${this.lastAckRuleCount} hyperEnabled=${this.lastAckHyperEnabled} hyperPhysicalVk=${this.lastAckHyperVk} status=${ackStatus}`);
          if (ackStatus !== "ok") {
            console.error(`[native-config] ack ERROR: status=${ackStatus} error=${msg.error ?? "(none)"}`);
          }
          if (this.lastAckRuleCount === 0 && sentCount > 0) {
            console.warn(`[native-config] WARNING: acked 0 rules but sent ${sentCount} specs — config may be broken`);
          }
        }
        inputDebug(`[input-debug] helper ack for=${msg.for} configVersion=${msg.configVersion}`);
        break;
      case "bypass":
        console.warn("[native-input] emergency bypass latched (Ctrl+Alt+Shift+F12) — all keys pass through until re-configured");
        inputDebug(`[input-debug] emergency bypass active`);
        break;
      case "injected": {
        const seq = typeof msg.seq === "number" ? msg.seq : -1;
        const resolver = this.pendingInject.get(seq);
        this.pendingInject.delete(seq);
        console.log(`[media-control] injected seq=${seq} ok=${msg.ok}${typeof msg.error === "number" ? ` lastError=${msg.error}` : ""}`);
        if (resolver) resolver(!!msg.ok, typeof msg.error === "number" ? msg.error : undefined);
        else console.warn(`[media-control] injected without pending resolver seq=${seq}`);
        break;
      }
      case "dragSwitcherShow": {
        console.log(`[drag-v2] electronShowReceived windows=${Array.isArray(msg.windows) ? msg.windows.length : 0} monitor=${msg.monitorIndex}`);
        inputDebug(`[input-debug] drag switcher show windows=${Array.isArray(msg.windows) ? msg.windows.length : 0}`);
        this.onDragSwitcherShow?.(msg as DragSwitcherShowMessage);
        break;
      }
      case "dragSwitcherMove":
        this.onDragSwitcherMove?.(msg as DragSwitcherMoveMessage);
        break;
      case "dragSwitcherHide":
        console.log(`[drag-v2] electronHideReceived reason=${msg.reason}`);
        inputDebug(`[input-debug] drag switcher hide reason=${msg.reason}`);
        this.onDragSwitcherHide?.(msg as DragSwitcherHideMessage);
        break;
      case "windowActivationResult":
        console.log(`[drag-v2] activationResult hwnd=${msg.hwnd} success=${!!msg.success} reason=${msg.reason}`);
        this.onWindowActivationResult?.(msg as WindowActivationResultMessage);
        break;
      case "appList": {
        const apps: NativeAppInfo[] = Array.isArray(msg.apps) ? msg.apps : [];
        console.log(`[native-input] app list count=${apps.length}`);
        if (this.pendingAppList) {
          this.pendingAppList(apps);
          this.pendingAppList = null;
        }
        break;
      }
      case "activeApp": {
        const app: NativeAppInfo | null =
          msg && typeof msg.executablePath === "string" && msg.executablePath.trim()
            ? { executablePath: msg.executablePath, processName: msg.processName, displayName: msg.displayName }
            : null;
        if (this.pendingActiveApp) {
          this.pendingActiveApp(app);
          this.pendingActiveApp = null;
        }
        break;
      }
      default:
        console.error(`[native-input] unknown helper message: ${msg.type}`);
    }
  }

  /**
   * Unexpected helper exit while it was expected to run: restart with bounded
   * backoff so transient crashes self-heal. After the last attempt the engine
   * is marked "unavailable" (Advanced settings shows this; keys keep working
   * because everything falls through to pass-through).
   */
  private scheduleRecovery(): void {
    if (this.status === "failed") return;
    if (this.recoveryAttempts >= NativeInputHelper.RECOVERY_BACKOFF_MS.length) {
      console.error("[native-input] helper recovery exhausted; marking engine unavailable");
      this.status = "unavailable";
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }
      this.kill();
      this.onStatus("unavailable");
      return;
    }
    const delay = NativeInputHelper.RECOVERY_BACKOFF_MS[this.recoveryAttempts];
    this.recoveryAttempts += 1;
    console.log(`[native-input] helper exited unexpectedly; restart attempt ${this.recoveryAttempts}/${NativeInputHelper.RECOVERY_BACKOFF_MS.length} in ${delay}ms`);
    this.status = "stopped";
    this.proc = null;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      this.start(this.parentPid);
    }, delay);
  }

  private fail(reason: string): void {
    if (this.status === "failed") return;
    console.error(`[native-input] helper unavailable (${reason})`);
    this.status = "failed";
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    this.kill();
    this.onStatus("failed");
  }

  private kill(): void {
    if (this.elevatedBridge) {
      this.elevatedBridge.stop();
      this.elevatedBridge = null;
    }
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      this.proc.kill();
    }
    this.proc = null;
  }
}

