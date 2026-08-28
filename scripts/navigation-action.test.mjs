import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_META } from "../src/lib/constants.ts";
import { routesToDesktop } from "../dist-electron/action-routing.js";
import { NavigationModeController } from "../dist-electron/navigation-mode.js";

function spyDeps(overrides = {}) {
  const calls = { native: [], sound: [], overlay: [], renderer: [], cursor: [] };
  const deps = {
    sendToNative: (enabled) => calls.native.push(enabled),
    getMainWindow: () => ({
      webContents: { send: (channel, active) => calls.renderer.push([channel, active]) },
    }),
    playSound: (name) => calls.sound.push(name),
    showOverlay: (active) => calls.overlay.push(active),
    setCursor: (active) => calls.cursor.push(active),
    ...overrides,
  };
  return { deps, calls };
}

test("ACTION_META registers the WASD Navigation Mode action with the arrows icon", () => {
  const meta = ACTION_META.toggleWasdNavigation;
  assert.ok(meta, "toggleWasdNavigation must exist in ACTION_META");
  assert.equal(meta.label, "WASD Navigation Mode");
  assert.equal(meta.icon, "arrows");
  assert.equal(meta.category, "Navigation");
});

test("Electron routing set includes toggleWasdNavigation", () => {
  assert.equal(routesToDesktop("toggleWasdNavigation"), true);
});

test("shortcut JSON serialization preserves the toggleWasdNavigation action type", () => {
  const shortcut = {
    id: "sc-nav",
    key: "W",
    modifiers: ["Hyper"],
    trigger: "single",
    actions: [{ type: "toggleWasdNavigation", payload: {} }],
    enabled: true,
  };
  const roundTripped = JSON.parse(JSON.stringify(shortcut));
  assert.equal(roundTripped.actions[0].type, "toggleWasdNavigation");
});

test("controller starts OFF and reflects state", () => {
  const { deps } = spyDeps();
  const c = new NavigationModeController(deps);
  assert.equal(c.isActive(), false);
  c.toggle();
  assert.equal(c.isActive(), true);
  c.toggle();
  assert.equal(c.isActive(), false);
});

test("toggle ON sends native, plays navigation-on sound, shows overlay, notifies renderer", () => {
  const { deps, calls } = spyDeps();
  const c = new NavigationModeController(deps);
  const result = c.toggle();

  assert.deepEqual(calls.native, [true]);
  assert.deepEqual(calls.sound, ["navigation-on"]);
  assert.deepEqual(calls.overlay, [true]);
  assert.deepEqual(calls.renderer, [["navigation:state-changed", true]]);
  assert.equal(result.ok, true);
  assert.equal(result.action, "toggleWasdNavigation");
  assert.equal(result.mode, "on");
});

test("toggle OFF sends native false, plays navigation-off, shows overlay, notifies renderer", () => {
  const { deps, calls } = spyDeps();
  const c = new NavigationModeController(deps);
  c.toggle();
  const result = c.toggle();

  assert.deepEqual(calls.native, [true, false]);
  assert.deepEqual(calls.sound, ["navigation-on", "navigation-off"]);
  assert.deepEqual(calls.overlay, [true, false]);
  assert.deepEqual(calls.renderer, [
    ["navigation:state-changed", true],
    ["navigation:state-changed", false],
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.mode, "off");
});

test("toggle reports ok:false with error when a dependency throws", () => {
  const { deps } = spyDeps({ sendToNative: () => { throw new Error("boom"); } });
  const c = new NavigationModeController(deps);
  const result = c.toggle();
  assert.equal(result.ok, false);
  assert.equal(result.error, "boom");
});

test("toggle without a main window still completes (renderer notify skipped)", () => {
  const { deps, calls } = spyDeps({ getMainWindow: () => null });
  const c = new NavigationModeController(deps);
  const result = c.toggle();
  assert.equal(result.ok, true);
  assert.deepEqual(calls.native, [true]);
  assert.deepEqual(calls.renderer, []);
});

test("toggle ON/OFF sets system cursor", () => {
  const { deps, calls } = spyDeps();
  const c = new NavigationModeController(deps);
  c.toggle();
  assert.deepEqual(calls.cursor, [true]);
  c.toggle();
  assert.deepEqual(calls.cursor, [true, false]);
});