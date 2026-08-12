import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAhkScript } from "../dist-electron/ahk-generator.js";

const candidates = [
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "AutoHotkey", "v2", "AutoHotkey64.exe") : "",
  "C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe",
];
const ahk = candidates.find((p) => p && existsSync(p));

if (!ahk) {
  console.log("SKIP: AutoHotkey v2 not found; skipping real helper startup smoke test");
  process.exit(0);
}

// The empty-key boilerplate still exercises Emit's global-scope fix: a top-level
// call must emit a key event with sequence 1 instead of throwing an unassigned-local
// runtime error (the old bug surfaced a dialog and never emitted the event).
const script = generateAhkScript([]) + '\nEmit("down", "CapsLock")\n';
const dir = mkdtempSync(join(tmpdir(), "keyflow-smoke-"));
const scriptPath = join(dir, "smoke-test.ahk");
writeFileSync(scriptPath, script);

const startedAt = Date.now();
const TIMEOUT_MS = 8000;
const proc = spawn(ahk, ["/ErrorStdOut", scriptPath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

let out = "";
let err = "";
let sawReady = false;
let sawKey = false;
let resolved = false;

function finish(code, msg) {
  if (resolved) return;
  resolved = true;
  try { proc.kill(); } catch { /* already gone */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  if (code === 0) {
    console.log(`PASS: helper started; ready + key event sequence 1 observed`);
  } else {
    console.error(`FAIL: ${msg}`);
    console.error(`--- stdout ---\n${out}`);
    if (err) console.error(`--- stderr ---\n${err}`);
  }
  process.exit(code);
}

proc.stdout?.on("data", (c) => {
  out += c.toString();
  if (out.includes('"ready"')) sawReady = true;
  if (out.includes('"sequence":1')) sawKey = true;
  if (sawReady && sawKey) finish(0, "ok");
});
proc.stderr?.on("data", (c) => { err += c.toString(); });
proc.on("error", (e) => finish(1, `spawn error: ${e.message}`));
proc.on("exit", (code) => finish(1, `helper exited before emitting events (code ${code})`));
setTimeout(() => {
  const hint = sawReady && !sawKey ? " (helper started but Emit failed - likely the global-scope bug)" : "";
  finish(1, `timeout after ${TIMEOUT_MS}ms${hint}`);
}, TIMEOUT_MS);
