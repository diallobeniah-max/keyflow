import test from "node:test";
import assert from "node:assert/strict";
import { analyzeShortcutConflicts, areTriggersConflicting, formatTriggerLabel } from "../src/lib/conflict.ts";
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
    createdAt: 0,
    ...extra,
  };
}

test("remap is exclusive with every gesture trigger on the same key", () => {
  for (const gesture of ["single", "double", "triple", "hold", "combo"]) {
    const report = areTriggersConflicting("remap", gesture);
    assert.equal(report.conflicting, true, `remap must conflict with ${gesture}`);
    assert.equal(report.exact, false);
  }
});

test("two remaps on the same key are an exact duplicate", () => {
  assert.deepEqual(areTriggersConflicting("remap", "remap"), { conflicting: true, exact: true });
});

test("destination overlap is allowed: 1→Tab and 3→Tab do not conflict", () => {
  const existing = [
    shortcut("sc-a", "1", { trigger: "remap", remapTo: "Tab", keyBehavior: "remap" }),
  ];
  const candidate = {
    id: "sc-b",
    name: "Remap 3 to Tab",
    profileId: "p",
    key: "3",
    modifiers: [],
    trigger: "remap",
    remapTo: "Tab",
    keyBehavior: "remap",
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "different source keys to the same target must be allowed");
});

test("a remap on the same key as an existing gesture is a blocking conflict", () => {
  const existing = [
    shortcut("sc-double", "F", { trigger: "double", keyBehavior: "passThrough" }),
  ];
  const candidate = {
    id: "sc-remap",
    name: "Remap F",
    profileId: "p",
    key: "F",
    modifiers: [],
    trigger: "remap",
    remapTo: "Tab",
    keyBehavior: "remap",
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, true);
  assert.ok(report.conflicts.some((c) => c.type === "gesture_overlap"));
});

test("formatTriggerLabel shows compact tap badges and the remap target", () => {
  assert.equal(formatTriggerLabel({ trigger: "single" }), "×1");
  assert.equal(formatTriggerLabel({ trigger: "double" }), "×2");
  assert.equal(formatTriggerLabel({ trigger: "triple" }), "×3");
  assert.equal(formatTriggerLabel({ trigger: "remap", remapTo: "Tab" }), "→ Tab");
  assert.equal(formatTriggerLabel({ trigger: "remap" }), "Remap");
  assert.equal(formatTriggerLabel({ trigger: "hold" }), "Hold");
});

test("remap shortcuts compile to the canonical native behavior + target vk", () => {
  const specs = buildNativeShortcutConfig([shortcut("r", "1", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab" })], {});
  assert.equal(specs.length, 1);
  assert.equal(specs[0].behavior, "remap");
  assert.equal(specs[0].remapTo, 0x09);
});

test("a remap shortcut does not install a gesture trigger rule on the wire", () => {
  const specs = buildNativeShortcutConfig([shortcut("r", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab" })], {});
  // The native engine treats unknown gesture kinds ("remap") as no-rule; the
  // per-key behavior is what matters. Renderer sends trigger.kind "remap".
  assert.equal(specs[0].trigger.kind, "remap");
  assert.equal(shortcutBehavior({ enabled: true, keyBehavior: "remap" }), "remap");
});