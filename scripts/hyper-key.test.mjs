import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeShortcutConfig,
  buildNativeHyperSpec,
} from "../dist-electron/suppression-config.js";
import { getSafeHyperKeySuggestions } from "../src/lib/conflict.ts";

test("buildNativeHyperSpec builds spec from suppression context", () => {
  const spec = buildNativeHyperSpec({
    hyperKeyConfig: {
      enabled: true,
      key: "AltRight",
      tapActionId: "sc-f-popup",
      suppressOriginal: true,
    },
  });

  assert.notEqual(spec, null);
  assert.equal(spec.enabled, true);
  assert.equal(spec.vk, 165); // Right Alt
  assert.equal(spec.suppressOriginal, true);
  assert.equal(spec.tapActionId, "sc-f-popup");
});

test("buildNativeHyperSpec returns null when disabled or key missing", () => {
  assert.equal(buildNativeHyperSpec({ hyperKeyConfig: { enabled: false, key: "AltRight" } }), null);
  assert.equal(buildNativeHyperSpec({}), null);
});

test("buildNativeShortcutConfig maps Hyper modifier to bit 16", () => {
  const entries = [
    {
      id: "sc-hyper-t",
      name: "Hyper + T",
      enabled: true,
      key: "T",
      modifiers: ["Hyper"],
      trigger: "single",
    },
    {
      id: "sc-hyper-shift-p",
      name: "Hyper + Shift + P",
      enabled: true,
      key: "P",
      modifiers: ["Hyper", "Shift"],
      trigger: "single",
    },
  ];

  const specs = buildNativeShortcutConfig(entries);
  assert.equal(specs.length, 2);

  // Hyper -> 16
  assert.deepEqual(specs[0].modifiers, [16]);
  // Hyper (16) + Shift (160 or Shift VK) -> includes 16
  assert.ok(specs[1].modifiers.includes(16));
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
