import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeShortcutConfig,
  buildNativeHyperSpec,
  resolveActionForHyperTap,
  isModifierHyperKey,
  HYPER_TAP_SYNTHETIC_ID,
} from "../dist-electron/suppression-config.js";
import { keyToVk } from "../dist-electron/win-vk.js";
import { getSafeHyperKeySuggestions } from "../src/lib/conflict.ts";
import { migrateHyperShortcuts, migrateHyperConfig, isModifierHyperKeyName } from "../src/lib/defaults.ts";

test("migrateHyperConfig migrates 'None' or invalid physical key to canonical 'AltRight'", () => {
  const migratedNone = migrateHyperConfig({ enabled: true, key: "None" });
  assert.equal(migratedNone.key, "AltRight");
  assert.equal(migratedNone.enabled, true);
  assert.equal(migratedNone.tapActionId, "showPopup");

  const migratedEmpty = migrateHyperConfig({});
  assert.equal(migratedEmpty.key, "AltRight");
  assert.equal(migratedEmpty.enabled, true);
});

test("migrateHyperConfig preserves valid user choices even if disabled", () => {
  const migratedDisabled = migrateHyperConfig({ enabled: false, key: "ControlRight" });
  assert.equal(migratedDisabled.key, "ControlRight");
  assert.equal(migratedDisabled.enabled, false);
});

test("isModifierHyperKey classifies modifier vs non-modifier hyper keys (Raycast parity)", () => {
  // Modifier keys: no Quick Press / tap action.
  assert.equal(isModifierHyperKey("AltRight"), true);
  assert.equal(isModifierHyperKey("RightAlt"), true);
  assert.equal(isModifierHyperKey("ControlRight"), true);
  assert.equal(isModifierHyperKey("AltLeft"), true);
  assert.equal(isModifierHyperKey("ShiftRight"), true);
  assert.equal(isModifierHyperKey("Win"), true);
  // Non-modifier keys: Quick Press / tap is available.
  assert.equal(isModifierHyperKey("CapsLock"), false);
  assert.equal(isModifierHyperKey("F1"), false);
  assert.equal(isModifierHyperKey("F12"), false);
  assert.equal(isModifierHyperKey("Apps"), false);
  assert.equal(isModifierHyperKey("ScrollLock"), false);
  assert.equal(isModifierHyperKey("NumLock"), false);
  // Renderer helper agrees.
  assert.equal(isModifierHyperKeyName("AltRight"), true);
  assert.equal(isModifierHyperKeyName("CapsLock"), false);
});

test("buildNativeHyperSpec builds spec from suppression context", () => {
  const spec = buildNativeHyperSpec({
    hyperKeyConfig: {
      enabled: true,
      key: "AltRight",
      tapActionId: "sc-f-popup",
      suppressOriginal: true,
    },
  }, [{ id: "sc-f-popup" }]);

  assert.notEqual(spec, null);
  assert.equal(spec.enabled, true);
  assert.equal(spec.vk, 165); // Right Alt
  assert.equal(spec.suppressOriginal, true);
  // Raycast parity: a modifier Hyper key (Right Alt) must NOT carry a tap action.
  assert.equal(spec.tapActionId, undefined, "modifier Hyper keys must not attach a tap action");
});

test("buildNativeHyperSpec keeps tap action for non-modifier hyper keys", () => {
  const spec = buildNativeHyperSpec({
    hyperKeyConfig: {
      enabled: true,
      key: "CapsLock",
      tapActionId: "sc-f-popup",
      suppressOriginal: true,
    },
  }, [{ id: "sc-f-popup" }]);

  assert.notEqual(spec, null);
  assert.equal(spec.vk, 20); // Caps Lock
  assert.equal(spec.tapActionId, "sc-f-popup");
});

test("buildNativeHyperSpec resolves synthetic ID for built-in tap actions (non-modifier only)", () => {
  const spec = buildNativeHyperSpec({
    hyperKeyConfig: {
      enabled: true,
      key: "CapsLock",
      tapActionId: "showPopup",
      suppressOriginal: true,
    },
  }, []);

  assert.notEqual(spec, null);
  assert.equal(spec.enabled, true);
  assert.equal(spec.vk, 20); // Caps Lock
  assert.equal(spec.tapActionId, HYPER_TAP_SYNTHETIC_ID);

  // The old behavior (Right Ctrl carrying a tap action) must be gone.
  const modifierSpec = buildNativeHyperSpec({
    hyperKeyConfig: {
      enabled: true,
      key: "ControlRight",
      tapActionId: "showPopup",
      suppressOriginal: true,
    },
  }, []);
  assert.equal(modifierSpec.tapActionId, undefined, "modifier Hyper keys never resolve a synthetic tap id");
});

test("buildNativeHyperSpec returns null when disabled or key missing", () => {
  assert.equal(buildNativeHyperSpec({ hyperKeyConfig: { enabled: false, key: "AltRight" } }), null);
  assert.equal(buildNativeHyperSpec({}), null);
});

test("keyToVk resolves all Hyper candidate physical keys and aliases", () => {
  assert.equal(keyToVk("AltRight"), 165);
  assert.equal(keyToVk("RightAlt"), 165);
  assert.equal(keyToVk("Right Alt"), 165);
  assert.equal(keyToVk("ControlRight"), 163);
  assert.equal(keyToVk("Right Ctrl"), 163);
  assert.equal(keyToVk("Apps"), 93);
  assert.equal(keyToVk("Menu"), 93);
  assert.equal(keyToVk("ScrollLock"), 145);
  assert.equal(keyToVk("Scroll Lock"), 145);
  assert.equal(keyToVk("NumLock"), 144);
  assert.equal(keyToVk("CapsLock"), 20);
});

test("resolveActionForHyperTap constructs proper action payload", () => {
  assert.equal(resolveActionForHyperTap("showPopup")[0].type, "showPopup");
  assert.equal(resolveActionForHyperTap("notesPopup")[0].type, "notesPopup");
  assert.equal(resolveActionForHyperTap("screenshot")[0].type, "screenshot");
  assert.equal(resolveActionForHyperTap("alwaysOnTop")[0].type, "alwaysOnTop");
  assert.deepEqual(resolveActionForHyperTap("none"), []);
  assert.deepEqual(resolveActionForHyperTap(""), []);
});

test("buildNativeShortcutConfig creates synthetic shortcut entry for hyper tap action (non-modifier only)", () => {
  const context = {
    hyperKeyConfig: {
      enabled: true,
      key: "CapsLock",
      tapActionId: "showPopup",
    },
  };
  const specs = buildNativeShortcutConfig([], context);
  const synthetic = specs.find((s) => s.id === HYPER_TAP_SYNTHETIC_ID);
  assert.notEqual(synthetic, undefined);
  assert.equal(synthetic.key.vk, 20);

  // Modifier Hyper keys (e.g. Right Alt) must NOT get a synthetic tap entry.
  const modifierContext = {
    hyperKeyConfig: {
      enabled: true,
      key: "AltRight",
      tapActionId: "showPopup",
    },
  };
  const modifierSpecs = buildNativeShortcutConfig([], modifierContext);
  assert.equal(modifierSpecs.find((s) => s.id === HYPER_TAP_SYNTHETIC_ID), undefined, "no synthetic tap for modifier Hyper keys");
});

test("buildNativeShortcutConfig maps Hyper modifier to compiled native modifiers (includeShift false/true)", () => {
  const entries = [
    {
      id: "sc-hyper-t",
      name: "Hyper + T",
      enabled: true,
      key: "T",
      modifiers: ["Hyper"],
      trigger: "single",
    },
  ];

  // includeShift: false (default)
  const specsDefault = buildNativeShortcutConfig(entries, { hyperKeyConfig: { includeShift: false } });
  assert.equal(specsDefault.length, 1);
  assert.deepEqual(specsDefault[0].modifiers.sort(), ["alt", "ctrl", "win"].sort());

  // includeShift: true
  const specsShift = buildNativeShortcutConfig(entries, { hyperKeyConfig: { includeShift: true } });
  assert.equal(specsShift.length, 1);
  assert.deepEqual(specsShift[0].modifiers.sort(), ["alt", "ctrl", "shift", "win"].sort());
});

test("migrateHyperShortcuts converts legacy CASH expansion to native Hyper modifier", () => {
  const legacy = [
    {
      id: "sc-legacy-1",
      name: "Hyper + P",
      key: "P",
      modifiers: ["Ctrl", "Alt", "Shift", "Win"],
    },
    {
      id: "sc-normal",
      name: "Ctrl + Shift + C",
      key: "C",
      modifiers: ["Ctrl", "Shift"],
    },
  ];

  const migrated = migrateHyperShortcuts(legacy);
  assert.deepEqual(migrated[0].modifiers, ["Hyper"]);
  assert.deepEqual(migrated[1].modifiers, ["Ctrl", "Shift"]);
});

test("getSafeHyperKeySuggestions excludes CapsLock if assigned to Screenshot", () => {
  const shortcuts = [
    {
      id: "sc-caps",
      name: "Screenshot",
      profileId: "prof-default",
      key: "CapsLock",
      modifiers: [],
      trigger: "single",
      enabled: true,
    },
  ];

  const suggestions = getSafeHyperKeySuggestions(shortcuts, "prof-default");
  const caps = suggestions.find((s) => s.value === "CapsLock");
  const rightAlt = suggestions.find((s) => s.value === "AltRight");

  assert.notEqual(caps, undefined);
  assert.equal(caps.safe, false);
  assert.ok(caps.warning.includes("assigned to Screenshot"));

  assert.notEqual(rightAlt, undefined);
  assert.equal(rightAlt.safe, true);
});

test("Cross-layer Hyper Contract: config builder -> spec generation (modifier key, no tap)", () => {
  const context = {
    hyperKeyConfig: {
      enabled: true,
      key: "RightAlt",
      tapActionId: "notesPopup",
      suppressOriginal: true,
    },
  };

  const userShortcuts = [
    {
      id: "sc-hyper-t",
      name: "Hyper + T",
      enabled: true,
      key: "T",
      modifiers: ["Hyper"],
      trigger: "single",
      actions: [{ type: "alwaysOnTop" }],
    },
  ];

  const specs = buildNativeShortcutConfig(userShortcuts, context);
  const hyperSpec = buildNativeHyperSpec(context, userShortcuts);

  // Hyper Spec: modifier key -> enabled, but NO tap action attached.
  assert.equal(hyperSpec.enabled, true);
  assert.equal(hyperSpec.vk, 165); // Right Alt VK
  assert.equal(hyperSpec.tapActionId, undefined, "Right Alt must have no tap action under Raycast parity");

  // Specs array contains ONLY the user shortcut — no synthetic tap entry.
  const chordSpec = specs.find((s) => s.id === "sc-hyper-t");
  const tapSpec = specs.find((s) => s.id === HYPER_TAP_SYNTHETIC_ID);

  assert.notEqual(chordSpec, undefined);
  assert.deepEqual(chordSpec.modifiers.sort(), ["alt", "ctrl", "win"].sort());
  assert.equal(chordSpec.key.vk, 84); // T

  assert.equal(tapSpec, undefined, "no synthetic tap entry for modifier Hyper key");
});

test("Standalone Hyper key shortcut resolves key: 'Hyper' to physical Hyper key VK", () => {
  const context = {
    hyperKeyConfig: {
      enabled: true,
      key: "AltRight",
      tapActionId: "none",
      suppressOriginal: true,
    },
  };

  const userShortcuts = [
    {
      id: "sc-hyper-double",
      name: "Hyper Double Tap",
      enabled: true,
      key: "Hyper",
      modifiers: [],
      trigger: "double",
      actions: [{ type: "notesPopup" }],
    },
    {
      id: "sc-hyper-triple",
      name: "Hyper Triple Tap",
      enabled: true,
      key: "Hyper",
      modifiers: [],
      trigger: "triple",
      actions: [{ type: "screenshot" }],
    },
  ];

  const specs = buildNativeShortcutConfig(userShortcuts, context);
  assert.equal(specs.length, 2);

  const doubleSpec = specs.find((s) => s.id === "sc-hyper-double");
  assert.notEqual(doubleSpec, undefined);
  assert.equal(doubleSpec.key.vk, 165); // AltRight VK
  assert.equal(doubleSpec.trigger.kind, "double");
  assert.deepEqual(doubleSpec.modifiers, []);

  const tripleSpec = specs.find((s) => s.id === "sc-hyper-triple");
  assert.notEqual(tripleSpec, undefined);
  assert.equal(tripleSpec.key.vk, 165); // AltRight VK
  assert.equal(tripleSpec.trigger.kind, "triple");
  assert.deepEqual(tripleSpec.modifiers, []);

  // tapActionId is "none", so no synthetic single tap is injected
  const tapSpec = specs.find((s) => s.id === HYPER_TAP_SYNTHETIC_ID);
  assert.equal(tapSpec, undefined);
});


