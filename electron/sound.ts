/**
 * KeyFlow Sound Player (Electron main process)
 *
 * Plays custom WAV assets for system feedback events (Always on Top toggle,
 * WASD Navigation Mode on/off). Uses PowerShell's System.Media.SoundPlayer
 * which is built into every modern Windows installation — no third-party audio
 * dependencies required.
 *
 * The playback must run with .PlaySync() inside the child process: .Play() is
 * asynchronous, so the detached PowerShell child would exit before the audio
 * finished and the sound would be cut off. PlaySync blocks only the detached
 * child (never the Electron main thread) until the WAV finishes.
 *
 * Asset resolution is delegated to the pure module ./sound-paths.js so Node
 * tests can verify dev vs packaged path logic without importing Electron.
 */

import { spawn } from "child_process";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { app } from "electron";
import { feedbackSoundName, resolveSoundPath, SoundName } from "./sound-paths.js";

export type { SoundName } from "./sound-paths.js";
export { feedbackSoundName } from "./sound-paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function resolveSoundPathForName(name: SoundName): string | null {
  const appPath = typeof app?.getAppPath === "function" ? app.getAppPath() : process.cwd();
  return resolveSoundPath(name, {
    appPath,
    cwd: process.cwd(),
    resourcesPath: typeof process.resourcesPath === "string" ? process.resourcesPath : undefined,
    bundleDir: __dirname,
  });
}

/**
 * Play a named KeyFlow sound. Exactly one sound per call; missing assets fail
 * closed with a log line instead of throwing.
 */
export function playKeyFlowSound(name: SoundName): void {
  const soundPath = resolveSoundPathForName(name);
  if (!soundPath) {
    console.warn(`[sound] name=${name} result=error error=asset-not-found`);
    return;
  }

  // Escape backslashes and single-quotes for the PowerShell string literal.
  const escapedPath = soundPath.replace(/'/g, "''");
  const script = `(New-Object System.Media.SoundPlayer '${escapedPath}').PlaySync()`;

  console.log(`[sound] name=${name} path=${soundPath} result=playing`);
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { detached: true, stdio: "ignore", windowsHide: true },
  );
  child.on("error", (err) => console.error(`[sound] name=${name} result=error error=${err.message}`));
  // Unref so the child process does not prevent Node from exiting; PlaySync
  // keeps it alive only long enough to finish the audio.
  child.unref();
}