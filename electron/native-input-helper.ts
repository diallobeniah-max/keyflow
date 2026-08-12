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

export type NativeHelperStatus = "stopped" | "starting" | "ready" | "failed";

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
  private status: NativeHelperStatus = "stopped";
  private onKey: (e: NativeKeyEventMessage) => void;
  private onStatus: (s: NativeHelperStatus) => void;
  private onTriggered: ((msg: NativeTriggeredMessage) => void) | null = null;
  private onCapturedKey: ((msg: NativeCapturedKeyMessage) => void) | null = null;
  private pendingKeys: NativeKeySpec[] = [];
  private pendingShortcuts: unknown[] | null = null;
  private pendingCapture = false;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private lineBuf = "";
  private shuttingDown = false;

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

  getStatus(): NativeHelperStatus {
    return this.status;
  }

  /** Spawn the helper; it hooks the keyboard only after this returns. */
  start(parentPid: number): void {
    const path = resolveNativeHelperPath();
    if (!path) {
      console.error("[native-input] helper binary not found (run `npm run native:build`)");
      this.fail("missing-binary");
      return;
    }
    this.status = "starting";
    this.onStatus("starting");
    console.log(`[native-input] spawning helper: ${path}`);

    const proc = spawn(path, ["--parent-pid", String(parentPid)], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proc = proc;

    proc.on("error", (err) => {
      console.error(`[native-input] helper spawn error: ${err.message}`);
      this.fail("spawn");
    });

    proc.on("exit", (code, signal) => {
      console.log(`[native-input] helper exited code=${code} signal=${signal}`);
      if (this.status === "ready" || this.status === "starting") this.fail("exit");
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
  setShortcuts(shortcuts: unknown[]): void {
    this.pendingShortcuts = shortcuts;
    if (this.status === "ready") this.sendConfigure();
  }

  /** Request a one-shot capture of the next physical key (shortcut UI). */
  beginCapture(): void {
    this.pendingCapture = true;
    if (this.status === "ready") {
      this.send({ type: "beginCapture", version: NATIVE_PROTOCOL_VERSION });
      this.pendingCapture = false;
    }
  }

  setKeyStream(enabled: boolean): void {
    this.send({ type: "setKeyStream", version: NATIVE_PROTOCOL_VERSION, enabled });
  }

  setPaused(paused: boolean): void {
    this.send(paused ? { type: "pause", version: NATIVE_PROTOCOL_VERSION } : { type: "resume", version: NATIVE_PROTOCOL_VERSION });
  }

  ping(): void {
    this.send({ type: "ping", version: NATIVE_PROTOCOL_VERSION });
  }

  /** Graceful shutdown: ask the helper to unhook and exit. */
  shutdown(): void {
    this.shuttingDown = true;
    if (this.status !== "ready" && this.status !== "starting") {
      this.kill();
      return;
    }
    this.send({ type: "shutdown", version: NATIVE_PROTOCOL_VERSION });
    setTimeout(() => this.kill(), 800);
  }

  private flushConfigure(): void {
    if (this.pendingCapture) {
      this.send({ type: "beginCapture", version: NATIVE_PROTOCOL_VERSION });
      this.pendingCapture = false;
    }
    this.sendConfigure();
  }

  private sendConfigure(): void {
    if (this.pendingShortcuts !== null) {
      this.send({ type: "configure", version: NATIVE_PROTOCOL_VERSION, shortcuts: this.pendingShortcuts });
      this.pendingShortcuts = null;
      return;
    }
    this.send({ type: "configure", version: NATIVE_PROTOCOL_VERSION, keys: this.pendingKeys });
  }

  private send(msg: unknown): void {
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
      case "ack":
        inputDebug(`[input-debug] helper ack for=${msg.for}`);
        break;
      case "bypass":
        console.warn("[native-input] emergency bypass latched (Ctrl+Alt+Shift+F12) — all keys pass through until re-configured");
        inputDebug(`[input-debug] emergency bypass active`);
        break;
      default:
        console.error(`[native-input] unknown helper message: ${msg.type}`);
    }
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
    if (this.proc && !this.proc.killed && this.proc.exitCode === null) {
      this.proc.kill();
    }
    this.proc = null;
  }
}
