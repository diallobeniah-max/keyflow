/**
 * Pure sound asset resolution + naming. No Electron import so Node tests can
 * exercise dev vs packaged path logic directly.
 */

import { existsSync } from "fs";
import { join, resolve } from "path";

export type SoundName = "topmost-on" | "topmost-off" | "navigation-on" | "navigation-off";

export function soundFileFor(name: SoundName): string {
  return `${name}.wav`;
}

/** Centralized feedback-sound naming so call sites can't drift apart. */
export function feedbackSoundName(kind: "topmost" | "navigation", on: boolean): SoundName {
  return kind === "topmost" ? (on ? "topmost-on" : "topmost-off") : (on ? "navigation-on" : "navigation-off");
}

export interface SoundPathContext {
  /** Electron app path (or process.cwd() when unavailable). */
  appPath: string;
  /** process.cwd() at runtime. */
  cwd: string;
  /** process.resourcesPath when running packaged. */
  resourcesPath?: string;
  /** Directory of the main-process bundle (dist-electron/) for the adjacent fallback. */
  bundleDir?: string;
}

/**
 * Ordered candidates for a named sound asset (dev → packaged → bundle-adjacent).
 */
export function soundCandidates(ctx: SoundPathContext, name: SoundName): string[] {
  const filename = soundFileFor(name);
  const out: string[] = [];

  // Dev: Vite serves public/ from the project root.
  out.push(join(ctx.appPath, "public", "sounds", filename));
  out.push(join(ctx.cwd, "public", "sounds", filename));

  // Packaged: next to keyflow-input.exe in resources/.
  if (ctx.resourcesPath) {
    out.push(join(ctx.resourcesPath, "sounds", filename));
    out.push(join(ctx.resourcesPath, filename));
  }

  // Adjacent to the main-process bundle (dist-electron/../sounds).
  out.push(join(ctx.appPath, "sounds", filename));
  if (ctx.bundleDir) {
    out.push(resolve(ctx.bundleDir, "..", "sounds", filename));
  }

  return out;
}

/** First existing candidate, or null when none exist (controlled failure). */
export function resolveSoundPath(name: SoundName, ctx: SoundPathContext): string | null {
  for (const candidate of soundCandidates(ctx, name)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}