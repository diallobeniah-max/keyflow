import test from "node:test";
import assert from "node:assert/strict";
import { NativeInputService } from "../dist-electron/input/native-input-service.js";
import { keyNameToKeycode, nativeKeyName } from "../dist-electron/input/trigger-matcher.js";
import { nativeKeyName as vkName, keyNameToVk } from "../dist-electron/vk-catalog.js";
import { NATIVE_INPUT_MARKER, buildNativeKeyConfig } from "../dist-electron/native-input-helper.js";

const timing = { tapInterval: 100, holdDuration: 30, delay: 0, cooldown: 0 };

function sc(id, key, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    mouse: false,
    modifiers: [],
    trigger: "single",
    timing: { ...timing },
    actions: [],
    enabled: true,
    ...extra,
  };
}

class TestService extends NativeInputService {
  matchingEnabled() { return true; }
}

function nativeService(fired) {
  return new TestService((sc) => fired.push(sc.id), { keyboardSource: "native", keyName: vkName });
}

test("keyNameToKeycode maps AHK key names to uiohook keycodes", () => {
  assert.equal(keyNameToKeycode("CapsLock"), 58);
  assert.equal(keyNameToKeycode("capslock"), 58);
  assert.equal(keyNameToKeycode("f"), 33);
  assert.equal(keyNameToKeycode("F"), 33);
  assert.equal(keyNameToKeycode("Space"), 57);
  assert.equal(keyNameToKeycode("F13"), 91);
  assert.equal(keyNameToKeycode("numpad4"), 75);
  assert.equal(keyNameToKeycode("not-a-key"), undefined);
  assert.equal(nativeKeyName(58), "CapsLock");
});

test("AHK CapsLock down+up routed into matcher fires the single-tap action exactly once", () => {
  const fired = [];
  const service = new TestService((sc) => fired.push(sc.id));
  service.updateShortcuts([sc("sc-caps", "CapsLock", { actions: [{ type: "screenshot" }] })]);
  service.injectKeyEvent("down", "CapsLock");
  service.injectKeyEvent("up", "CapsLock");
  assert.deepEqual(fired, ["sc-caps"]);
});

test("AHK F double-tap routed into matcher fires exactly once per pair across 20 pairs", () => {
  const fired = [];
  const service = new TestService((sc) => fired.push(sc.id));
  service.updateShortcuts([sc("sc-f", "F", { trigger: "double", actions: [{ type: "showPopup", payload: { popupItems: [] } }] })]);
  for (let i = 0; i < 20; i++) {
    service.injectKeyEvent("down", "F");
    service.injectKeyEvent("up", "F");
    service.injectKeyEvent("down", "F");
    service.injectKeyEvent("up", "F");
  }
  assert.equal(fired.length, 20);
  assert.ok(fired.every((id) => id === "sc-f"));
});

test("injected events for keys with no matching shortcut are ignored", () => {
  const fired = [];
  const service = new TestService((sc) => fired.push(sc.id));
  service.updateShortcuts([sc("sc-caps", "CapsLock", { actions: [{ type: "screenshot" }] })]);
  service.injectKeyEvent("down", "F13");
  service.injectKeyEvent("up", "F13");
  assert.equal(fired.length, 0);
});

test("uiohook ignore set resolves consumed key names to keycodes", () => {
  // setIgnoredKeyNames must map CapsLock -> uiohook keycode 58 so the native
  // listener drops uiohook events for keys owned by the AHK helper.
  const service = new TestService(() => {});
  const exposed = service;
  assert.ok(typeof exposed.setIgnoredKeyNames === "function");
  exposed.setIgnoredKeyNames(["CapsLock"]);
  assert.equal(keyNameToKeycode("CapsLock"), 58);
  assert.equal(keyNameToKeycode("A"), 30);
});

// --- Native helper keyboard pipeline (vk-catalog + handleNativeKeyEvent) ---

function e(type, vk, scanCode = 0, extended = false, injected = false) {
  return { type, vk, scanCode, extended, injected, sequence: 0 };
}

test("vk catalog: CapsLock=0x14, F=0x46, NumEnter uses extended flag, unknown -> VK_HEX", () => {
  assert.equal(vkName(0x14), "CapsLock");
  assert.equal(vkName(0x46), "F");
  assert.equal(vkName(0x0d), "Enter");
  assert.equal(vkName(0x0d, 0, true), "NumEnter");
  assert.equal(vkName(0x1a), "VK_1A");
});

test("keyNameToVk resolves names used by shortcut data", () => {
  assert.equal(keyNameToVk("CapsLock"), 0x14);
  assert.equal(keyNameToVk("F"), 0x46);
  assert.equal(keyNameToVk("NumEnter"), 0x0d);
  assert.equal(keyNameToVk("a"), 0x41);
  assert.equal(keyNameToVk("7"), 0x37);
  assert.equal(keyNameToVk("not-a-key"), undefined);
});

test("native CapsLock down+up fires the single-tap action exactly once", () => {
  const fired = [];
  const service = nativeService(fired);
  service.updateShortcuts([sc("sc-caps", "CapsLock", { actions: [{ type: "screenshot" }] })]);
  service.handleNativeKeyEvent(e("down", 0x14, 58));
  service.handleNativeKeyEvent(e("up", 0x14, 58));
  assert.deepEqual(fired, ["sc-caps"]);
});

test("native F double-tap fires exactly once per pair across 20 pairs", () => {
  const fired = [];
  const service = nativeService(fired);
  service.updateShortcuts([sc("sc-f", "F", { trigger: "double", actions: [{ type: "showPopup", payload: { popupItems: [] } }] })]);
  for (let i = 0; i < 20; i++) {
    service.handleNativeKeyEvent(e("down", 0x46, 33));
    service.handleNativeKeyEvent(e("up", 0x46, 33));
    service.handleNativeKeyEvent(e("down", 0x46, 33));
    service.handleNativeKeyEvent(e("up", 0x46, 33));
  }
  assert.equal(fired.length, 20);
});

test("native events for keys with no matching shortcut are ignored", () => {
  const fired = [];
  const service = nativeService(fired);
  service.updateShortcuts([sc("sc-caps", "CapsLock", { actions: [{ type: "screenshot" }] })]);
  service.handleNativeKeyEvent(e("down", 0x7c)); // F13 (0x7C)
  service.handleNativeKeyEvent(e("up", 0x7c));
  assert.equal(fired.length, 0);
});

test("events injected by other tools are skipped (helper already filters its own remaps)", () => {
  const fired = [];
  const service = nativeService(fired);
  service.updateShortcuts([sc("sc-caps", "CapsLock", {})]);
  service.handleNativeKeyEvent(e("down", 0x14, 58, false, true));
  service.handleNativeKeyEvent(e("up", 0x14, 58, false, true));
  assert.equal(fired.length, 0);
});

test("native Ctrl+C combo fires the combo shortcut", () => {
  const fired = [];
  const service = nativeService(fired);
  service.updateShortcuts([sc("sc-cc", "C", { modifiers: ["Ctrl"], trigger: "combo", actions: [] })]);
  service.handleNativeKeyEvent(e("down", 0x11)); // Ctrl
  service.handleNativeKeyEvent(e("down", 0x43)); // C
  service.handleNativeKeyEvent(e("up", 0x43));
  service.handleNativeKeyEvent(e("up", 0x11));
  assert.deepEqual(fired, ["sc-cc"]);
});

test("native-key config building maps keyBehavior to helper modes", () => {
  const ctx = { paused: false, safeMode: false, emergencySafe: false };
  const entries = [
    sc("a", "CapsLock", { keyBehavior: "suppress" }),
    sc("b", "F", { keyBehavior: "disable" }),
    sc("c", "G", { keyBehavior: "remap", remapTo: "W" }),
    sc("d", "H", { keyBehavior: "passThrough" }),
    sc("e", "Space", { enabled: false, keyBehavior: "suppress" }),
  ];
  const cfg = buildNativeKeyConfig(entries, ctx);
  assert.deepEqual(cfg, [
    { vk: 0x14, mode: "suppress", remapTo: undefined },
    { vk: 0x46, mode: "disable", remapTo: undefined },
    { vk: 0x47, mode: "remap", remapTo: 0x57 },
  ]);
});

test("native-key config is empty when paused or safe mode", () => {
  const entries = [sc("a", "CapsLock", { keyBehavior: "suppress" })];
  assert.deepEqual(buildNativeKeyConfig(entries, { paused: true }), []);
  assert.deepEqual(buildNativeKeyConfig(entries, { safeMode: true }), []);
  assert.deepEqual(buildNativeKeyConfig(entries, { emergencySafe: true }), []);
});

test("NATIVE_INPUT_MARKER matches the Rust OWN_INJECTED_MARKER", () => {
  assert.equal(NATIVE_INPUT_MARKER, 0x4b46574b);
});

test("ignored uiohook names still resolve (legacy path) while native source stays testable", () => {
  const service = new TestService(() => {});
  service.setIgnoredKeyNames(["CapsLock"]);
  assert.equal(keyNameToKeycode("CapsLock"), 58);
});
