import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { app } from "electron";

export interface WindowTopmostOptions {
  mode?: "toggle" | "pin" | "unpin";
  color?: string;
  highlight?: boolean;
  sound?: boolean;
}

export interface WindowTopmostResult {
  ok: boolean;
  action: string;
  mode: string;
  is_topmost: boolean;
  hwnd?: number;
  title?: string;
  highlight_applied: boolean;
  error?: string;
}

function findNativeHelperBinary(): string | null {
  const candidates: string[] = [];

  // Development paths
  const appPath = typeof app?.getAppPath === "function" ? app.getAppPath() : process.cwd();
  candidates.push(join(appPath, "native", "keyflow-input", "target", "release", "keyflow-input.exe"));
  candidates.push(join(process.cwd(), "native", "keyflow-input", "target", "release", "keyflow-input.exe"));

  // Production paths
  if (typeof process.resourcesPath === "string") {
    candidates.push(join(process.resourcesPath, "keyflow-input.exe"));
    candidates.push(join(process.resourcesPath, "native", "keyflow-input.exe"));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Execute native Always-on-Top toggle/pin/unpin and optional DWM border highlight
 * on the current foreground Windows application.
 */
export function toggleWindowTopmost(options: WindowTopmostOptions = {}): Promise<WindowTopmostResult> {
  const mode = options.mode ?? "toggle";
  const color = options.color ?? "#4F7CFF";
  const highlight = options.highlight !== false;
  const sound = options.sound !== false;

  const binary = findNativeHelperBinary();
  if (!binary) {
    return Promise.resolve({
      ok: false,
      action: "alwaysOnTop",
      mode,
      is_topmost: false,
      highlight_applied: false,
      error: "Native window helper binary (keyflow-input.exe) not found",
    });
  }

  const args = ["--window-topmost", "--mode", mode, "--color", color];
  if (!highlight) {
    args.push("--no-highlight");
  }
  if (!sound) {
    args.push("--no-sound");
  } else {
    args.push("--sound");
  }

  return new Promise((resolve) => {
    execFile(binary, args, { windowsHide: true, timeout: 2000 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return resolve({
          ok: false,
          action: "alwaysOnTop",
          mode,
          is_topmost: false,
          highlight_applied: false,
          error: stderr || err.message,
        });
      }

      try {
        const parsed = JSON.parse(stdout.trim()) as WindowTopmostResult;
        resolve(parsed);
      } catch (parseErr) {
        resolve({
          ok: false,
          action: "alwaysOnTop",
          mode,
          is_topmost: false,
          highlight_applied: false,
          error: `Failed to parse native window-control output: ${String(parseErr)}`,
        });
      }
    });
  });
}
