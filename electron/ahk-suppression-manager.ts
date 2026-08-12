import { ChildProcess, spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseAhkEvent } from "./ahk-protocol.js";
import { generateAhkScript, SuppressKey } from "./ahk-generator.js";
import { ahkKeyName } from "./ahk-keys.js";
import { SuppressionConfig } from "./suppression-config.js";

export type AhkStatus = "unavailable" | "starting" | "ready" | "paused" | "stopped" | "error";

export interface AhkKeyEventLike {
  type: "key";
  state: "down" | "up";
  key: string;
  sequence: number;
}

export class AhkSuppressionManager {
  private proc: ChildProcess | null = null;
  private status: AhkStatus = "unavailable";
  private readonly ahkExe: string | null;
  private readonly scriptPath: string;
  private readonly onEvent: (event: AhkKeyEventLike) => void;
  private readonly onStatus: (status: AhkStatus) => void;
  private lastConfig: SuppressionConfig | null = null;
  private lastScript = "";
  private failedScript: string | null = null;

  constructor(options: { ahkExe: string | null; runtimeDir: string; onEvent: (e: AhkKeyEventLike) => void; onStatus: (s: AhkStatus) => void }) {
    this.ahkExe = options.ahkExe;
    this.scriptPath = join(options.runtimeDir, "keyflow-suppression.ahk");
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus;
  }

  getStatus(): AhkStatus {
    return this.status;
  }

  start(): void {
    if (!this.ahkExe) {
      this.status = "unavailable";
      this.onStatus("unavailable");
      console.log("[suppress] AutoHotkey v2 not found - key suppression unavailable (fail open; keys pass through)");
      return;
    }
    if (this.lastConfig) this.restart(this.lastConfig);
    else this.status = "starting";
  }

  updateConfig(config: SuppressionConfig): void {
    this.lastConfig = config;
    if (!this.ahkExe) return;
    this.restart(config);
  }

  setPaused(paused: boolean): void {
    if (paused) {
      this.stopProc();
      this.status = "paused";
      this.onStatus("paused");
      console.log("[suppress] suppression paused");
    } else if (this.status === "paused") {
      if (this.lastConfig) this.restart(this.lastConfig, { force: true });
    }
  }

  stop(): void {
    this.stopProc();
    this.status = "stopped";
    this.onStatus("stopped");
  }

  private toSuppressKeys(config: SuppressionConfig): SuppressKey[] {
    const keys: SuppressKey[] = [];
    for (const entry of config.entries ?? []) {
      const ahkKey = ahkKeyName(entry.keyName);
      if (!ahkKey) continue;
      if (entry.mode === "remap") {
        const remapTo = ahkKeyName(entry.remapToName);
        if (remapTo) keys.push({ ahkKey, mode: "remap", remapTo });
      } else {
        keys.push({ ahkKey, mode: entry.mode === "disable" ? "disable" : "suppress" });
      }
    }
    return keys;
  }

  private restart(config: SuppressionConfig, opts?: { force?: boolean }): void {
    const script = generateAhkScript(this.toSuppressKeys(config));
    if (script === this.lastScript && this.status === "ready") {
      return;
    }
    // Crash-loop guard: the exact same script already failed to start and this is
    // not an explicit resume. Fail open instead of respawning the broken helper.
    const unchanged = script === this.lastScript;
    if (unchanged && script === this.failedScript && this.status !== "ready" && !opts?.force) {
      this.status = "error";
      this.onStatus("error");
      console.log("[suppress] AutoHotkey suppression helper failed to start; skipping respawn (fail open)");
      return;
    }
    this.stopProc();
    this.lastScript = script;
    this.failedScript = null;
    try {
      mkdirSync(join(this.scriptPath, ".."), { recursive: true });
      writeFileSync(this.scriptPath, script);
    } catch (err) {
      this.status = "error";
      this.onStatus("error");
      console.log(`[suppress] failed to write AHK script (fail open): ${(err as Error).message}`);
      return;
    }
    let proc: ChildProcess;
    try {
      proc = this.spawnHelper();
    } catch (err) {
      this.failedScript = script;
      this.status = "error";
      this.onStatus("error");
      console.log(`[suppress] AutoHotkey suppression helper failed to start (fail open): ${(err as Error).message}`);
      return;
    }
    const procState = { ready: false };
    this.proc = proc;
    this.status = "starting";
    this.onStatus("starting");
    console.log("[suppress] AutoHotkey suppression helper started");
    proc.stdout?.on("data", (chunk: Buffer) => this.handleOutput(chunk.toString(), proc, procState));
    proc.stderr?.on("data", () => { /* never log typed text */ });
    proc.on("error", () => {
      if (this.proc !== proc) return;
      if (!procState.ready) this.failedScript = script;
      this.status = "unavailable";
      this.onStatus("unavailable");
      console.log("[suppress] AHK helper process error - suppression disabled (fail open)");
    });
    proc.on("exit", (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (!procState.ready) {
        this.failedScript = script;
        this.status = "error";
        this.onStatus("error");
        console.log(`[suppress] AutoHotkey suppression helper failed to start (code ${code}) - suppression disabled (fail open)`);
      } else {
        this.status = "unavailable";
        this.onStatus("unavailable");
        console.log(`[suppress] AHK helper exited (code ${code}) - suppression disabled (fail open)`);
      }
    });
  }

  private handleOutput(text: string, proc: ChildProcess, procState: { ready: boolean }): void {
    if (this.proc !== proc) return;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const event = parseAhkEvent(line);
      if (!event) continue;
      if (event.type === "ready") {
        procState.ready = true;
        this.status = "ready";
        this.onStatus("ready");
        console.log("[suppress] AutoHotkey suppression helper ready");
      } else {
        this.onEvent({ type: "key", state: event.state, key: event.key, sequence: event.sequence });
      }
    }
  }

  protected spawnHelper(): ChildProcess {
    return spawn(this.ahkExe as string, [this.scriptPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  }

  private stopProc(): void {
    if (this.proc && !this.proc.killed) {
      try { this.proc.kill(); } catch { /* ignore */ }
    }
    this.proc = null;
  }
}