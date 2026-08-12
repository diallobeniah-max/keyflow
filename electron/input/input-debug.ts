import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

let logPath = "";

export function initInputDebug(dir: string): void {
  logPath = join(dir, "input-debug.log");
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(logPath, `\n=== session ${new Date().toISOString()} ===\n`);
  } catch {
    logPath = "";
  }
}

export function inputDebug(msg: string): void {
  if (!logPath) return;
  try {
    appendFileSync(logPath, `${new Date().toISOString().slice(11)} ${msg}\n`);
  } catch {
    /* ignore */
  }
}
