import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildNativeShortcutConfig,
  shortcutBehavior,
} from "../dist-electron/suppression-config.js";
import {
  migrateWindowsShortcuts,
  migrateHyperShortcuts,
  resolveOnboardingDone,
  isLegacyEstablishedUser,
} from "../src/lib/defaults.ts";

// Repository-owned sanitized fixture containing synthetic IDs and zero personal/machine data
const fixtureUrl = new URL("./fixtures/legacy-shortcut-state.json", import.meta.url);
const legacyFixture = JSON.parse(fs.readFileSync(fixtureUrl, "utf8"));

test("sanitized legacy fixture contains 5 representative historical shortcut types", () => {
  assert.equal(legacyFixture.shortcuts.length, 5);
  const ids = legacyFixture.shortcuts.map((s) => s.id);
  assert.deepEqual(ids, [
    "legacy-win-v",
    "legacy-hyper-o",
    "legacy-topmost",
    "legacy-double-shift",
    "legacy-capslock",
  ]);
});

test("onboardingDone resolution contract: preserves explicit flags and detects legacy established users", () => {
  // Case A: current state with onboardingDone: true -> true
  assert.equal(resolveOnboardingDone({ onboardingDone: true }), true);
  assert.equal(resolveOnboardingDone({ onboardingDone: true, shortcuts: [] }), true);

  // Case B: current state with onboardingDone: false -> false (explicit false MUST NEVER be overwritten)
  assert.equal(resolveOnboardingDone({ onboardingDone: false }), false);
  assert.equal(resolveOnboardingDone({ onboardingDone: false, shortcuts: [{ id: "legacy-win-v" }] }), false);

  // Case C: legacy established state with missing onboardingDone -> true
  assert.equal(resolveOnboardingDone(legacyFixture), true, "Legacy fixture with shortcuts must resolve to true");
  assert.equal(resolveOnboardingDone({ shortcuts: [{ id: "s1" }] }), true);
  assert.equal(resolveOnboardingDone({ profiles: [{ id: "p1" }, { id: "p2" }] }), true);
  assert.equal(resolveOnboardingDone({ profiles: [{ id: "p1", appRules: [{ exe: "code.exe" }] }] }), true);
  assert.equal(resolveOnboardingDone({ recent: [{ id: "r1", actionLabel: "test" }] }), true);
  assert.equal(resolveOnboardingDone({ library: [{ id: "lib1", type: "openApp" }] }), true);

  // Case D: genuinely empty/new state with missing onboardingDone -> false
  assert.equal(resolveOnboardingDone({}), false);
  assert.equal(resolveOnboardingDone({ version: 1, shortcuts: [], profiles: [] }), false);
  assert.equal(resolveOnboardingDone({ shortcuts: [] }), false);
  assert.equal(resolveOnboardingDone(null), false);
  assert.equal(resolveOnboardingDone(undefined), false);
});

test("isLegacyEstablishedUser correctly distinguishes established users from blank initializations", () => {
  assert.equal(isLegacyEstablishedUser(null), false);
  assert.equal(isLegacyEstablishedUser({}), false);
  assert.equal(isLegacyEstablishedUser({ shortcuts: [] }), false);
  assert.equal(isLegacyEstablishedUser({ profiles: [{ id: "prof-default", appRules: [] }] }), false);

  assert.equal(isLegacyEstablishedUser({ shortcuts: [{ id: "any" }] }), true);
  assert.equal(isLegacyEstablishedUser({ profiles: [{ id: "p1" }, { id: "p2" }] }), true);
  assert.equal(isLegacyEstablishedUser({ recent: [{ at: 123 }] }), true);
  assert.equal(isLegacyEstablishedUser({ library: [{ id: "a1" }] }), true);
});

test("legacy state migration: preserves IDs, triggers, actions, and migrates Windows keyBehavior to suppress", () => {
  const originalShortcuts = JSON.parse(JSON.stringify(legacyFixture.shortcuts));
  const migrated = migrateWindowsShortcuts(migrateHyperShortcuts(originalShortcuts));

  assert.equal(migrated.length, originalShortcuts.length);

  // 1. legacy-win-v: migrated to suppress
  const winV = migrated.find((s) => s.id === "legacy-win-v");
  assert.ok(winV);
  assert.equal(winV.key, "V");
  assert.deepEqual(winV.modifiers, ["Win"]);
  assert.equal(winV.trigger, "single");
  assert.equal(winV.keyBehavior, "suppress", "Win-key shortcut must migrate from passThrough to suppress");
  assert.equal(winV.suppressKey, true);
  assert.deepEqual(winV.actions, originalShortcuts.find((s) => s.id === "legacy-win-v").actions);

  // 2. legacy-hyper-o: non-Win retains passThrough, preserves actions and triggers
  const hyperO = migrated.find((s) => s.id === "legacy-hyper-o");
  assert.ok(hyperO);
  assert.equal(hyperO.key, "O");
  assert.deepEqual(hyperO.modifiers, ["Hyper"]);
  assert.equal(hyperO.trigger, "single");
  assert.equal(hyperO.keyBehavior, "passThrough", "Non-Win shortcuts keep existing behavior");
  assert.deepEqual(hyperO.actions, originalShortcuts.find((s) => s.id === "legacy-hyper-o").actions);

  // 3. legacy-topmost: Ctrl+Shift+T retains passThrough
  const topmost = migrated.find((s) => s.id === "legacy-topmost");
  assert.ok(topmost);
  assert.equal(topmost.key, "T");
  assert.deepEqual(topmost.modifiers, ["Ctrl", "Shift"]);
  assert.equal(topmost.trigger, "single");
  assert.equal(topmost.keyBehavior, "passThrough");
  assert.deepEqual(topmost.actions, originalShortcuts.find((s) => s.id === "legacy-topmost").actions);

  // 4. legacy-double-shift: Shift double tap retains passThrough
  const shift = migrated.find((s) => s.id === "legacy-double-shift");
  assert.ok(shift);
  assert.equal(shift.key, "Shift");
  assert.deepEqual(shift.modifiers, []);
  assert.equal(shift.trigger, "double");
  assert.equal(shift.keyBehavior, "passThrough");
  assert.deepEqual(shift.actions, originalShortcuts.find((s) => s.id === "legacy-double-shift").actions);

  // 5. legacy-capslock: CapsLock retains suppress
  const caps = migrated.find((s) => s.id === "legacy-capslock");
  assert.ok(caps);
  assert.equal(caps.key, "CapsLock");
  assert.equal(caps.trigger, "single");
  assert.equal(caps.keyBehavior, "suppress");
  assert.deepEqual(caps.actions, originalShortcuts.find((s) => s.id === "legacy-capslock").actions);
});

test("shortcutBehavior runtime resolver: suppresses Win-key shortcuts even with legacy passThrough", () => {
  const rawWinV = legacyFixture.shortcuts.find((s) => s.id === "legacy-win-v");
  assert.equal(rawWinV.keyBehavior, "passThrough");
  assert.equal(shortcutBehavior(rawWinV), "suppress");

  const rawHyperO = legacyFixture.shortcuts.find((s) => s.id === "legacy-hyper-o");
  assert.equal(shortcutBehavior(rawHyperO), "pass");

  const rawTopmost = legacyFixture.shortcuts.find((s) => s.id === "legacy-topmost");
  assert.equal(shortcutBehavior(rawTopmost), "pass");

  const rawShift = legacyFixture.shortcuts.find((s) => s.id === "legacy-double-shift");
  assert.equal(shortcutBehavior(rawShift), "pass");

  const rawCaps = legacyFixture.shortcuts.find((s) => s.id === "legacy-capslock");
  assert.equal(shortcutBehavior(rawCaps), "suppress");
});

test("buildNativeShortcutConfig produces complete native specs from migrated legacy shortcuts", () => {
  const migrated = migrateWindowsShortcuts(migrateHyperShortcuts(legacyFixture.shortcuts));
  const specs = buildNativeShortcutConfig(migrated, {
    hyperKeyConfig: { enabled: true, key: "AltRight", includeShift: false },
  });

  const specIds = specs.map((s) => s.id);
  for (const s of migrated) {
    assert.ok(specIds.includes(s.id), `Missing spec for shortcut ${s.id}`);
  }

  // Win+V spec
  const winVSpec = specs.find((s) => s.id === "legacy-win-v");
  assert.ok(winVSpec);
  assert.equal(winVSpec.key.vk, 0x56); // V
  assert.deepEqual(winVSpec.modifiers, ["win"]);
  assert.equal(winVSpec.behavior, "suppress");
  assert.equal(winVSpec.trigger.kind, "single");

  // Hyper+O spec (AltRight -> Ctrl+Alt+Win)
  const hyperSpec = specs.find((s) => s.id === "legacy-hyper-o");
  assert.ok(hyperSpec);
  assert.equal(hyperSpec.key.vk, 0x4f); // O
  assert.deepEqual(hyperSpec.modifiers.sort(), ["alt", "ctrl", "win"]);
  assert.equal(hyperSpec.behavior, "pass");

  // Topmost (Ctrl+Shift+T) spec
  const topmostSpec = specs.find((s) => s.id === "legacy-topmost");
  assert.ok(topmostSpec);
  assert.equal(topmostSpec.key.vk, 0x54); // T
  assert.deepEqual(topmostSpec.modifiers.sort(), ["ctrl", "shift"]);
  assert.equal(topmostSpec.behavior, "pass");

  // Double shift spec
  const shiftSpec = specs.find((s) => s.id === "legacy-double-shift");
  assert.ok(shiftSpec);
  assert.equal(shiftSpec.key.vk, 0x10); // Shift
  assert.equal(shiftSpec.trigger.kind, "double");
  assert.equal(shiftSpec.behavior, "pass");

  // CapsLock spec
  const capsSpec = specs.find((s) => s.id === "legacy-capslock");
  assert.ok(capsSpec);
  assert.equal(capsSpec.key.vk, 0x14); // CapsLock
  assert.equal(capsSpec.behavior, "suppress");
});
