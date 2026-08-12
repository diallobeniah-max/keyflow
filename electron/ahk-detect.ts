import { existsSync } from "fs";
import { join } from "path";

export const AHK_CANDIDATES = [
  "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe",
  "C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe",
  join(process.env.LOCALAPPDATA ?? "", "Programs", "AutoHotkey", "v2", "AutoHotkey64.exe"),
];

export function findAhkExecutable(): string | null {
  for (const candidate of AHK_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
