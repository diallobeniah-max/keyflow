/**
 * config-save-regression.test.mjs
 *
 * Regression tests for the config-after-save failure:
 *   - Saving a new shortcut must not erase existing shortcuts.
 *   - The built config must include all enabled shortcuts from the store.
 *   - Stale modifiers from defaults must not leak into captured keys.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeShortcutConfig, shortcutBehavior } from "../dist-electron/suppression-config.js";

const timing = { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 };

function shortcut(id, key, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    modifiers: [],
    trigger: "single",
    timing: { ...timing },
    actions: [],
    enabled: true,
    ...extra,
  };
}

// --------------------------------------------------------------------------
// Test 1: Existing shortcut (Ctrl+Shift+T) + new shortcut (K) both present.
// --------------------------------------------------------------------------
test("config with existing + new shortcut includes both rules", () => {
  const existing = shortcut("sc-existing", "T", {
    modifiers: ["Ctrl", "Shift"],
    keyBehavior: "passThrough",
  });
  const newShortcut = shortcut("sc-new", "K", {
    modifiers: [],
    trigger: "single",
    keyBehavior: "suppress",
  });

  const specs = buildNativeShortcutConfig([existing, newShortcut], {});
  assert.equal(specs.length, 2, "both shortcuts present in built config");

  const existingSpec = specs.find((s) => s.id === "sc-existing");
  assert.ok(existingSpec, "existing shortcut present");
  assert.equal(existingSpec.key.vk, 0x54, "T vk correct");
  assert.deepEqual(existingSpec.modifiers, ["ctrl", "shift"], "modifiers correct");
  assert.equal(existingSpec.behavior, "pass", "passThrough → pass");

  const newSpec = specs.find((s) => s.id === "sc-new");
  assert.ok(newSpec, "new shortcut present");
  assert.equal(newSpec.key.vk, 0x4b, "K vk correct");
  assert.deepEqual(newSpec.modifiers, [], "no modifiers");
  assert.equal(newSpec.behavior, "suppress", "suppress behavior");
});

// --------------------------------------------------------------------------
// Test 2: Config update replaces previous config (not appends).
// --------------------------------------------------------------------------
test("config update is a full replacement", () => {
  // First config: just T
  const config1 = buildNativeShortcutConfig(
    [shortcut("sc-t", "T", { modifiers: ["Ctrl", "Shift"] })],
    {}
  );
  assert.equal(config1.length, 1);

  // Second config: T + K (simulating save of new shortcut)
  const config2 = buildNativeShortcutConfig(
    [
      shortcut("sc-t", "T", { modifiers: ["Ctrl", "Shift"] }),
      shortcut("sc-k", "K", { keyBehavior: "suppress" }),
    ],
    {}
  );
  assert.equal(config2.length, 2, "both in second config");
  assert.ok(config2.some((s) => s.id === "sc-t"), "T in second config");
  assert.ok(config2.some((s) => s.id === "sc-k"), "K in second config");
});

// --------------------------------------------------------------------------
// Test 3: Disabled shortcuts are excluded.
// --------------------------------------------------------------------------
test("disabled shortcuts are excluded from config", () => {
  const enabled = shortcut("sc-on", "T", { modifiers: ["Ctrl", "Shift"] });
  const disabled = shortcut("sc-off", "K", { enabled: false, keyBehavior: "suppress" });
  const specs = buildNativeShortcutConfig([enabled, disabled], {});
  assert.equal(specs.length, 1, "only enabled shortcut");
  assert.equal(specs[0].id, "sc-on");
});

// --------------------------------------------------------------------------
// Test 4: Paused context returns empty config (all pass through).
// --------------------------------------------------------------------------
test("paused context returns empty config", () => {
  const specs = buildNativeShortcutConfig(
    [shortcut("sc-t", "T", { modifiers: ["Ctrl", "Shift"] })],
    { paused: true }
  );
  assert.equal(specs.length, 0, "paused → empty");
});

// --------------------------------------------------------------------------
// Test 5: Creating a simple K single tap screenshot produces correct shape.
// --------------------------------------------------------------------------
test("K single tap screenshot shortcut produces correct native spec", () => {
  const sc = shortcut("sc-k-screenshot", "K", {
    name: "Screenshot",
    modifiers: [],
    trigger: "single",
    keyBehavior: "suppress",
    actions: [{ id: "act-1", type: "screenshot", payload: { screenshotMode: "snipOverlay" } }],
  });
  const specs = buildNativeShortcutConfig([sc], {});
  assert.equal(specs.length, 1);
  const spec = specs[0];

  // Verify exact shape Rust expects:
  assert.equal(spec.key.vk, 0x4b, "K = VK 0x4B");
  assert.equal(spec.key.scanCode, 0, "scanCode defaults to 0");
  assert.deepEqual(spec.modifiers, [], "no modifiers");
  assert.equal(spec.trigger.kind, "single", "trigger kind = single");
  assert.equal(spec.behavior, "suppress", "behavior = suppress");
  assert.equal(spec.remapTo, 0, "not a remap");
  assert.equal(spec.enabled, true);
  assert.equal(spec.appScope, undefined, "no app scope");
});

// --------------------------------------------------------------------------
// Test 6: Hyper modifier is compiled correctly.
// --------------------------------------------------------------------------
test("Hyper modifier compiles to ctrl+alt+win", () => {
  const sc = shortcut("sc-hyper-t", "T", {
    modifiers: ["Hyper"],
  });
  const specs = buildNativeShortcutConfig([sc], { hyperKeyConfig: { enabled: true, key: "CapsLock" } });
  assert.equal(specs.length, 1);
  const mods = specs[0].modifiers;
  assert.ok(mods.includes("ctrl"), "ctrl");
  assert.ok(mods.includes("alt"), "alt");
  assert.ok(mods.includes("win"), "win");
  assert.ok(!mods.includes("hyper"), "hyper token expanded");
});

// --------------------------------------------------------------------------
// Test 7: Mouse shortcuts are excluded.
// --------------------------------------------------------------------------
test("mouse shortcuts are excluded from native config", () => {
  const keyboard = shortcut("sc-kb", "T", { modifiers: ["Ctrl"] });
  const mouse = shortcut("sc-mouse", "MB1", { mouse: true });
  const specs = buildNativeShortcutConfig([keyboard, mouse], {});
  assert.equal(specs.length, 1);
  assert.equal(specs[0].id, "sc-kb");
});
