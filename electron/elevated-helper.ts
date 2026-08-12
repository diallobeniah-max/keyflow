/**
 * ElevatedHelperBridge: manages spawning and communicating with keyflow-input.exe
 * running with Administrator (High Integrity) privileges via an authenticated local named pipe.
 *
 * Security & Threat Boundary:
 * - The bridge runs strictly as a single keyboard owner.
 * - The protocol supports only keyboard configuration, pausing, status, and gesture trigger IDs.
 * - No arbitrary shell commands or file executions are exposed through this interface.
 * - Each session uses a cryptographically secure 128-bit random token.
 * - If elevation is cancelled by UAC or the process exits, KeyFlow safely falls back (fail open).
 */

import { createServer, Server, Socket } from "net";
import { randomBytes } from "crypto";
import { exec } from "child_process";
import { resolveNativeHelperPath } from "./native-input-helper.js";
import { inputDebug } from "./input/input-debug.js";

export interface ElevatedHelperOptions {
  parentPid: number;
  onLine: (line: string) => void;
  onStatusChange: (status: "starting" | "ready" | "stopped" | "failed") => void;
  onExit: () => void;
}

export class ElevatedHelperBridge {
  private server: Server | null = null;
  private socket: Socket | null = null;
  private token: string = "";
  private pipePath: string = "";
  private authenticated = false;
  private lineBuf = "";
  private status: "starting" | "ready" | "stopped" | "failed" = "stopped";
  private options: ElevatedHelperOptions;
  private connectTimeout: NodeJS.Timeout | null = null;

  constructor(options: ElevatedHelperOptions) {
    this.options = options;
  }

  getStatus(): "starting" | "ready" | "stopped" | "failed" {
    return this.status;
  }

  /**
   * Start the named pipe server and request Windows elevation for the helper.
   */
  async start(): Promise<boolean> {
    const helperExe = resolveNativeHelperPath();
    if (!helperExe) {
      console.error("[elevated-helper] helper binary not found");
      this.setStatus("failed");
      return false;
    }

    this.token = randomBytes(16).toString("hex");
    this.pipePath = `\\\\.\\pipe\\keyflow-elevated-${this.token}`;
    this.setStatus("starting");
    this.authenticated = false;

    return new Promise<boolean>((resolve) => {
      this.server = createServer((socket) => {
        inputDebug("[input-debug] elevated helper connected to named pipe");
        this.socket = socket;

        socket.on("data", (chunk) => {
          this.handleData(chunk.toString("utf8"));
        });

        socket.on("error", (err) => {
          inputDebug(`[input-debug] elevated helper socket error: ${err.message}`);
        });

        socket.on("close", () => {
          inputDebug("[input-debug] elevated helper socket closed");
          this.socket = null;
          this.setStatus("stopped");
          this.options.onExit();
        });
      });

      this.server.listen(this.pipePath, () => {
        inputDebug(`[input-debug] named pipe listening at ${this.pipePath}`);
        this.launchElevatedProcess(helperExe);
      });

      this.server.on("error", (err) => {
        console.error("[elevated-helper] pipe server error:", err.message);
        this.setStatus("failed");
        resolve(false);
      });

      // 15-second timeout for UAC prompt acceptance and connection
      this.connectTimeout = setTimeout(() => {
        if (this.status !== "ready") {
          console.warn("[elevated-helper] connection timed out (UAC cancelled or declined)");
          this.stop();
          resolve(false);
        } else {
          resolve(true);
        }
      }, 15000);
    });
  }

  private launchElevatedProcess(helperExe: string): void {
    const args = `\\\"--pipe\\\" \\\"${this.pipePath}\\\" \\\"--token\\\" \\\"${this.token}\\\" \\\"--parent-pid\\\" \\\"${this.options.parentPid}\\\"`;
    const cmd = `powershell.exe -NoProfile -NonInteractive -Command "Start-Process -FilePath '${helperExe}' -ArgumentList '${args}' -Verb RunAs"`;

    inputDebug(`[input-debug] requesting elevated start: ${cmd}`);
    exec(cmd, (err) => {
      if (err) {
        inputDebug(`[input-debug] elevation request returned error (UAC declined): ${err.message}`);
        // If UAC was declined, stop and notify
        if (this.status !== "ready") {
          this.stop();
        }
      }
    });
  }

  private handleData(text: string): void {
    this.lineBuf += text;
    let idx: number;
    while ((idx = this.lineBuf.indexOf("\n")) !== -1) {
      const line = this.lineBuf.slice(0, idx).trim();
      this.lineBuf = this.lineBuf.slice(idx + 1);
      if (!line) continue;

      if (!this.authenticated) {
        try {
          const msg = JSON.parse(line);
          if (msg.type === "auth" && msg.token === this.token) {
            inputDebug("[input-debug] elevated helper authenticated successfully");
            this.authenticated = true;
            this.setStatus("ready");
            if (this.connectTimeout) {
              clearTimeout(this.connectTimeout);
              this.connectTimeout = null;
            }
            continue;
          } else {
            console.error("[elevated-helper] unauthorized connection attempt to pipe, dropping");
            this.socket?.destroy();
            return;
          }
        } catch {
          console.error("[elevated-helper] invalid auth payload, dropping connection");
          this.socket?.destroy();
          return;
        }
      }

      this.options.onLine(line);
    }
  }

  /**
   * Send an NDJSON command line to the elevated helper.
   */
  writeLine(line: string): boolean {
    if (!this.socket || this.status !== "ready") return false;
    return this.socket.write(line + "\n");
  }

  /**
   * Stop the elevated helper and close the server.
   */
  stop(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    if (this.socket) {
      this.writeLine(JSON.stringify({ type: "shutdown", version: 1 }));
      this.socket.destroy();
      this.socket = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.setStatus("stopped");
  }

  private setStatus(s: "starting" | "ready" | "stopped" | "failed"): void {
    this.status = s;
    this.options.onStatusChange(s);
  }
}
