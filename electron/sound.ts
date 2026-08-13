/**
 * KeyFlow Sound Player (Electron main process)
 *
 * Plays custom WAV assets for system feedback events (e.g. Always on Top toggle).
 * Uses PowerShell's System.Media.SoundPlayer which is built into every modern
 * Windows installation — no third-party audio dependencies required.
 *
 * .Play() is asynchronous and non-blocking; it returns before the sound finishes,
 * so the keyboard hook is never stalled waiting for audio playback.
 *
 * Asset resolution order (dev → production):
 *   1. Vite dev-server public/sounds/  (via Vite's public dir served at /)
 *   2. Next to the Electron app executable (asar-unpacked or resources/)
 *   3. Adjacent to the main process bundle (dist-electron/)
 */

import { existsSync } from "fs";
import { join, resolve } from "path";
import { spawn } from "child_process";
import { app } from "electron";

type SoundName = "topmost-on" | "topmost-off";

/**
 * Resolve the absolute path to a bundled sound asset.
 * Returns null if the file cannot be found on this machine.
 */
function resolveSoundPath(name: SoundName): string | null {
  const filename = `${name}.wav`;

  const candidates: string[] = [];

  // Dev: Vite serves public/ from project root
  const appPath =
    typeof app?.getAppPath === "function" ? app.getAppPath() : process.cwd();

  candidates.push(join(appPath, "public", "sounds", filename));
  candidates.push(join(process.cwd(), "public", "sounds", filename));

  // Production: next to keyflow-input.exe in resources/
  if (typeof process.resourcesPath === "string") {
    candidates.push(join(process.resourcesPath, "sounds", filename));
    candidates.push(join(process.resourcesPath, filename));
  }

  // Adjacent to Electron bundle (dist-electron/)
  candidates.push(join(appPath, "sounds", filename));
  candidates.push(resolve(__dirname ?? appPath, "..", "sounds", filename));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Play a named KeyFlow sound asynchronously.
 *
 * Uses PowerShell System.Media.SoundPlayer.Play() which returns immediately
 * while audio continues in the background — the keyboard hook is never blocked.
 *
 * Silent no-op when the WAV file cannot be located.
 */
export function playKeyFlowSound(name: SoundName): void {
  const soundPath = resolveSoundPath(name);
  if (!soundPath) {
    // File not found — silently skip rather than logging every call
    return;
  }

  // Escape backslashes and single-quotes for the PowerShell string literal.
  const escapedPath = soundPath.replace(/'/g, "''");

  const script = `(New-Object System.Media.SoundPlayer '${escapedPath}').Play()`;

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { detached: true, stdio: "ignore", windowsHide: true },
  );

  // Unref so the child process does not prevent Node from exiting
  child.unref();
}
