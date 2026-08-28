import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";

const ROOT = new URL("..", import.meta.url).pathname;
function file(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("preload exposes native status and WASD navigation surface", () => {
  const src = file("../electron/preload.ts");
  assert.match(src, /getNativeStatus/);
  assert.match(src, /"native:get-status"/);
  assert.match(src, /getWasdNavigationState/);
  assert.match(src, /"navigation:get-state"/);
  assert.match(src, /onWasdNavigationState/);
  assert.match(src, /"navigation:state-changed"/);
});

test("main.ts registers navigation + native-status IPC and wires the controller", () => {
  const src = file("../electron/main.ts");
  assert.match(src, /ipcMain\.handle\("native:get-status"/);
  assert.match(src, /ipcMain\.handle\("navigation:get-state"/);
  assert.match(src, /new NavigationModeController/);
  assert.match(src, /setNavigationModeController\(/);
  assert.match(src, /showNavigationOverlay/);
  assert.match(src, /playKeyFlowSound/);
  assert.match(src, /setWasdNavigation\(enabled/);
});

test("electron.d.ts declares the new InputAPI methods", () => {
  const src = file("../src/types/electron.d.ts");
  assert.match(src, /interface NativeStatus/);
  assert.match(src, /getNativeStatus/);
  assert.match(src, /getWasdNavigationState/);
  assert.match(src, /onWasdNavigationState/);
});

test("renderer action surface registers toggleWasdNavigation", () => {
  assert.match(file("../src/types/index.ts"), /toggleWasdNavigation/);
  assert.match(file("../src/lib/constants.ts"), /toggleWasdNavigation/);
  assert.match(file("../src/lib/actions.ts"), /toggleWasdNavigation/);
  assert.match(file("../src/components/SimpleActionPicker.tsx"), /toggleWasdNavigation/);
});

test("store + native-input subscription expose live WASD navigation state", () => {
  assert.match(file("../src/store/useStore.ts"), /wasdNavigationActive/);
  assert.match(file("../src/store/useStore.ts"), /setWasdNavigationActive/);
  assert.match(file("../src/lib/native-input.ts"), /onWasdNavigationState/);
  assert.match(file("../src/lib/native-input.ts"), /setWasdNavigationActive/);
});

test("VisualKeyboard and Shortcuts reflect active navigation mode", () => {
  assert.match(file("../src/pages/VisualKeyboard.tsx"), /key-nav-active/);
  assert.match(file("../src/pages/VisualKeyboard.tsx"), /WASD Active/);
  assert.match(file("../src/pages/Shortcuts.tsx"), /toggleWasdNavigation/);
  assert.match(file("../src/pages/Shortcuts.tsx"), /wasdNavActive/);
});

test("nav-active key styling uses approved accent tokens", () => {
  const css = file("../src/index.css");
  assert.match(css, /\.key-tile\.key-nav-active/);
  assert.match(css, /var\(--color-accent\)/);
});

test("gen-sounds emits navigation on/off assets", () => {
  assert.match(file("../scripts/gen-sounds.mjs"), /navigation-on\.wav/);
  assert.match(file("../scripts/gen-sounds.mjs"), /navigation-off\.wav/);
  // Naming authority now lives in sound-paths.ts; sound.ts delegates to it.
  assert.match(file("../electron/sound-paths.ts"), /navigation-on/);
  assert.match(file("../electron/sound-paths.ts"), /navigation-off/);
});

test("main.tsx exposes the store for Playwright validation in dev", () => {
  assert.match(file("../src/main.tsx"), /__keyflowStore/);
});