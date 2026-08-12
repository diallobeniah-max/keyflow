/**
 * uiohook-napi compatibility spike for KeyFlow
 * Tests: startup, detect key press, key release, mouse button, stop/cleanup
 */
import pkg from "uiohook-napi";
const { uIOhook, UiohookKey, UiohookButton } = pkg;
import { setTimeout as sleep } from "timers/promises";

let keydownCount = 0;
let keyupCount = 0;
let mouseDownCount = 0;

console.log("[spike] Starting uiohook-napi test...");
console.log(`[spike] Node: ${process.version} Electron: ${process.versions?.electron || "n/a"} Platform: ${process.platform}`);

uIOhook.on("keydown", (e) => {
  keydownCount++;
  console.log(`[spike] keydown code=${e.keycode} rawcode=${e.rawcode} alt=${e.altKey} ctrl=${e.ctrlKey} shift=${e.shiftKey} meta=${e.metaKey}`);
});

uIOhook.on("keyup", (e) => {
  keyupCount++;
  console.log(`[spike] keyup   code=${e.keycode}`);
});

uIOhook.on("mousedown", (e) => {
  mouseDownCount++;
  console.log(`[spike] mousedown button=${e.button} clicks=${e.clicks} x=${e.x} y=${e.y}`);
});

uIOhook.on("mouseup", (e) => {
  console.log(`[spike] mouseup   button=${e.button}`);
});

try {
  uIOhook.start();
  console.log("[spike] uIOhook.start() succeeded — listening for 8 seconds...");

  await sleep(8000);

  uIOhook.stop();
  console.log(`[spike] uIOhook.stop() done. keydown=${keydownCount} keyup=${keyupCount} mousedown=${mouseDownCount}`);

  if (keydownCount > 0 && keyupCount > 0) {
    console.log("[spike] PASS: Keyboard events detected");
  } else {
    console.log("[spike] WARN: No keyboard events. Either no keys were pressed or hook failed silently.");
  }

  process.exit(0);
} catch (err) {
  console.error("[spike] FAIL:", err.message);
  process.exit(1);
}
