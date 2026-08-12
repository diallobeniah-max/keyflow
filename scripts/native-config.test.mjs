import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeShortcutConfig, shortcutBehavior } from "../dist-electron/suppression-config.js";

const timing = { tapInterval: 100, holdDuration: 300, delay: 0, cooldown: 0 };

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

test("shortcutBehavior resolves the canonical behavior from shortcut fields", () => {
  assert.equal(shortcutBehavior({ enabled: true, keyBehavior: "suppress" }), "suppress");
  assert.equal(shortcutBehavior({ enabled: true, keyBehavior: "disable" }), "disable");
  assert.equal(shortcutBehavior({ enabled: true, keyBehavior: "remap" }), "remap");
  assert.equal(shortcutBehavior({ enabled: true, keyBehavior: "passThrough" }), "pass");
  assert.equal(shortcutBehavior({ enabled: true, suppressKey: true }), "suppress");
  assert.equal(shortcutBehavior({ enabled: true }), "pass");
  assert.equal(shortcutBehavior({ enabled: false, keyBehavior: "suppress" }), "pass");
});

test("buildNativeShortcutConfig maps key names to VKs and keeps behavior", () => {
  const specs = buildNativeShortcutConfig([shortcut("sc-3w02ys1", "CapsLock", { keyBehavior: "suppress" })], {});
  assert.equal(specs.length, 1);
  assert.equal(specs[0].id, "sc-3w02ys1");
  assert.equal(specs[0].key.vk, 0x14);
  assert.equal(specs[0].behavior, "suppress");
  assert.equal(specs[0].trigger.kind, "single");
  assert.deepEqual(specs[0].modifiers, []);
});

test("the CapsLock screenshot shortcut round-trips to the exact Rust-compatible JSON", () => {
  const entry = shortcut("sc-3w02ys1", "CapsLock", {
    name: "Screenshot",
    trigger: "single",
    keyBehavior: "suppress",
  });
  // This is the exact shape the Rust protocol test consumes
  // (native/keyflow-input tests caps_lock_screenshot_resolves_to_suppress).
  const specs = buildNativeShortcutConfig([entry], {});
  const json = JSON.stringify({ type: "configure", shortcuts: specs });
  assert.ok(json.includes('"shortcutKey":"CapsLock"') === false); // no renderer-specific bloat
  const parsed = JSON.parse(json);
  assert.equal(parsed.shortcuts[0].behavior, "suppress");
  assert.equal(parsed.shortcuts[0].key.vk, 0x14);
  assert.equal(parsed.shortcuts[0].trigger.kind, "single");
  assert.deepEqual(parsed.shortcuts[0].modifiers, []);
  // Round-trip through the actual configure message the helper sends.
  const msg = JSON.parse(JSON.stringify({ type: "configure", version: 1, shortcuts: specs }));
  assert.ok(msg.shortcuts[0].enabled);
  assert.equal(msg.shortcuts[0].enabled, true);
});

test("modifier combos are preserved as VK modifier list", () => {
  const specs = buildNativeShortcutConfig(
    [shortcut("ctrl-k", "K", { modifiers: ["Ctrl"], trigger: "single", keyBehavior: "passThrough" })],
    {},
  );
  assert.deepEqual(specs[0].modifiers, [0x11]);
  assert.equal(specs[0].behavior, "pass");
});

test("double / hold triggers keep their kind and timing", () => {
  const specs = buildNativeShortcutConfig(
    [shortcut("f-double", "F", { trigger: "double", timing: { ...timing, tapInterval: 220 }, keyBehavior: "passThrough" })],
    {},
  );
  assert.equal(specs[0].trigger.kind, "double");
  assert.equal(specs[0].trigger.tapInterval, 220);
  const hold = buildNativeShortcutConfig(
    [shortcut("h", "Space", { trigger: "hold", timing: { ...timing, holdDuration: 400 }, keyBehavior: "passThrough" })],
    {},
  );
  assert.equal(hold[0].trigger.kind, "hold");
  assert.equal(hold[0].trigger.holdDuration, 400);
});

test("mouse shortcuts are excluded, disabled are excluded, sequence is skipped", () => {
  const specs = buildNativeShortcutConfig(
    [shortcut("m", "MB1", { mouse: true, keyBehavior: "suppress" }),
     shortcut("off", "A", { enabled: false, keyBehavior: "suppress" }),
     shortcut("seq", "B", { trigger: "sequence", keyBehavior: "passThrough" })],
    {},
  );
  assert.deepEqual(specs.map((s) => s.id), []); // all three are excluded
});

test("remap shortcuts carry the target vk", () => {
  const specs = buildNativeShortcutConfig([shortcut("r", "A", { keyBehavior: "remap", remapTo: "F13" })], {});
  assert.equal(specs[0].behavior, "remap");
  assert.equal(specs[0].remapTo, 0x7c);
});

test("paused and safe mode produce an empty native config (fail open)", () => {
  const entry = shortcut("c", "CapsLock", { keyBehavior: "suppress" });
  assert.equal(buildNativeShortcutConfig([entry], { paused: true }).length, 0);
  assert.equal(buildNativeShortcutConfig([entry], { safeMode: true }).length, 0);
});