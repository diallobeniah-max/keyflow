import { ChildProcess, spawn } from "child_process";
import { existsSync } from "fs";
import { SuppressionConfig } from "./suppression-config.js";

export type SuppressionStatus = "unavailable" | "starting" | "ready" | "paused" | "bypassed" | "stopped" | "error";

function commandsForConfig(config: SuppressionConfig): string[] {
  const lines = ["CLEAR"];
  const plainConsumed = config.consumed.filter((vk) => {
    const entry = config.entries.find((e) => e.vk === vk);
    return !entry?.conditionalCapsPassThrough;
  });
  if (plainConsumed.length) lines.push(`CONSUME ${plainConsumed.join(" ")}`);
  for (const entry of config.entries) {
    if (entry.mode === "remap" && entry.remapTo !== undefined) {
      lines.push(`REMAP ${entry.vk} ${entry.remapTo}`);
    } else if (entry.conditionalCapsPassThrough && entry.hyperVk !== undefined) {
      lines.push(`CAPSPASS ${entry.vk} ${entry.hyperVk}`);
    }
  }
  return lines;
}

/**
 * Owns the Windows low-level keyboard hook helper. The helper swallows only
 * explicitly configured virtual-key codes; everything else passes through.
 * If the helper binary is missing or the process dies, KeyFlow fails open
 * (no suppression) so keys are never left disabled.
 */
export class SuppressionManager {
  private proc: ChildProcess | null = null;
  private status: SuppressionStatus = "unavailable";
  private lastConfig: SuppressionConfig | null = null;
  private bypass = false;
  private shiftHeld = false;
  private readonly helperPath: string;
  private readonly onInjected: (vk: number) => void;

  constructor(options: { helperPath: string; onInjected: (vk: number) => void }) {
    this.helperPath = options.helperPath;
    this.onInjected = options.onInjected;
  }

  start(): void {
    this.bypass = process.argv.includes("--no-suppression") || process.env.KEYFLOW_NO_SUPPRESSION === "1";
    if (this.bypass) {
      this.status = "bypassed";
      console.log("[suppress] suppression bypassed for this launch");
      return;
    }
    if (!existsSync(this.helperPath)) {
      this.status = "unavailable";
      console.log(`[suppress] helper not found at ${this.helperPath} — suppression disabled (fail open)`);
      return;
    }
    try {
      this.proc = spawn(this.helperPath, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (err) {
      this.status = "unavailable";
      console.log(`[suppress] helper spawn failed — suppression disabled (fail open): ${(err as Error).message}`);
      return;
    }
    this.status = "starting";
    this.proc.stdin?.on("error", () => { /* ignore */ });
    this.proc.stdout?.on("data", (chunk: Buffer) => this.handleOutput(chunk.toString()));
    this.proc.stderr?.on("data", () => { /* never log keystrokes or typed data */ });
    this.proc.on("error", () => {
      this.status = "unavailable";
      this.proc = null;
      console.log("[suppress] helper process error — suppression disabled (fail open)");
    });
    this.proc.on("exit", (code) => {
      console.log(`[suppress] helper exited (code ${code}) — suppression disabled (fail open)`);
      this.status = this.status === "paused" ? "paused" : "unavailable";
      this.proc = null;
    });
  }

  private handleOutput(text: string): void {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line === "READY") {
        this.status = this.shiftHeld ? "bypassed" : "ready";
        console.log(`[suppress] helper ready${this.shiftHeld ? " (bypass: Shift held at startup)" : ""}`);
        if (!this.shiftHeld && this.lastConfig) this.sendConfig(this.lastConfig);
      } else if (line.startsWith("SHIFT_HELD ")) {
        this.shiftHeld = line.split(" ")[1] === "1";
      } else if (line.startsWith("INJECTED ")) {
        const vk = Number(line.split(" ")[1]);
        if (Number.isFinite(vk)) this.onInjected(vk);
      } else if (line.startsWith("ERROR ")) {
        console.log(`[suppress] helper error: ${line.slice(6)}`);
      }
    }
  }

  updateConfig(config: SuppressionConfig): void {
    this.lastConfig = config;
    if (this.status !== "ready" || this.bypass || this.shiftHeld) return;
    this.sendConfig(config);
  }

  setPaused(paused: boolean): void {
    if (!this.proc) return;
    if (paused) {
      this.status = "paused";
      this.write(["CLEAR"]);
      console.log("[suppress] suppression paused");
    } else if (this.status === "paused") {
      this.status = "ready";
      console.log("[suppress] suppression resumed");
      if (this.lastConfig) this.sendConfig(this.lastConfig);
    }
  }

  stop(): void {
    if (this.proc && !this.proc.killed) {
      try { this.write(["EXIT"]); } catch { /* ignore */ }
      setTimeout(() => { try { this.proc?.kill(); } catch { /* ignore */ } }, 300);
    }
    this.proc = null;
    this.status = "stopped";
  }

  private write(lines: string[]): void {
    if (!this.proc?.stdin || this.proc.killed) return;
    try {
      this.proc.stdin.write(lines.join("\n") + "\n");
    } catch { /* ignore */ }
  }

  private sendConfig(config: SuppressionConfig): void {
    this.write(commandsForConfig(config));
  }
}

export function commandsForConfigExport(config: SuppressionConfig): string[] {
  return commandsForConfig(config);
}
