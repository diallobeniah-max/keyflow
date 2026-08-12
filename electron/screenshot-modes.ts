export type ScreenshotMode = "snipOverlay" | "fullscreenClip" | "windowClip" | "fullscreenSave";

export const DEFAULT_SCREENSHOT_MODE: ScreenshotMode = "snipOverlay";

const VALID_MODES = new Set<string>(["snipOverlay", "fullscreenClip", "windowClip", "fullscreenSave"]);

export function resolveScreenshotMode(mode?: string): ScreenshotMode {
  if (mode && VALID_MODES.has(mode)) return mode as ScreenshotMode;
  return DEFAULT_SCREENSHOT_MODE;
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Produce a timestamped base filename, e.g. keyflow-20260805-143059.png */
export function screenshotBaseName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const h = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  return `keyflow-${y}${mo}${d}-${h}${mi}${s}.png`;
}