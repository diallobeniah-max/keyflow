import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNativeShortcutConfig, buildNativeHyperSpec } from "../dist-electron/suppression-config.js";
import { routeMatchedShortcut } from "../dist-electron/action-router.js";

function makeShortcut(id, key, mods, trigger = "single", actions = [{ type: "screenshot" }]) {
  return {
    id,
    name: `Test ${id}`,
    key,
    modifiers: mods,
    trigger,
    actions,
    enabled: true,
    profileId: "p-default",
  };
}

test("buildNativeShortcutConfig converts modifiers to canonical lowercase string tokens", () => {
  const entries = [
    makeShortcut("sc-1", "C", ["Ctrl", "Shift"], "combo", [{ type: "alwaysOnTop" }]),
    makeShortcut("sc-2", "T", ["Hyper"], "single", [{ type: "showPopup" }]),
  ];
  const specs = buildNativeShortcutConfig(entries);
  assert.equal(specs.length, 2);

  // Ctrl + Shift + C
  assert.equal(specs[0].id, "sc-1");
  assert.deepEqual(specs[0].modifiers, ["ctrl", "shift"]);
  assert.equal(specs[0].key.vk, 0x43); // 'C'

  // Hyper + T: the "hyper" modifier compiles to the Ctrl+Alt+Win chord
  // (includeShift false). The compiled representation is what the native
  // engine receives, not the literal "hyper" token.
  assert.equal(specs[1].id, "sc-2");
  assert.deepEqual(specs[1].modifiers, ["ctrl", "alt", "win"]);
  assert.equal(specs[1].key.vk, 0x54); // 'T'
});

test("buildNativeHyperSpec parses complete hyperKeyConfig from context", () => {
  const context = {
    hyperKeyConfig: {
      enabled: true,
      key: "AltRight",
      tapActionId: "sc-f-popup",
      suppressOriginal: true,
    },
  };
  const hyperSpec = buildNativeHyperSpec(context, [{ id: "sc-f-popup" }]);
  assert.notEqual(hyperSpec, null);
  assert.equal(hyperSpec.enabled, true);
  assert.equal(hyperSpec.vk, 0xA5); // Right Alt VK
  // Raycast parity: Right Alt is a modifier Hyper key and must not attach a tap action.
  assert.equal(hyperSpec.tapActionId, undefined);
});

test("ActionRouter routes any trigger key (ArrowUp, 1, G Double, Hyper+T) to correct action", async () => {
  const actionsExecuted = [];
  const mockRunner = async (action, window) => {
    actionsExecuted.push(action.type);
    return { ok: true, action: action.type };
  };

  const popupManagerMock = {
    toggle: (data) => actionsExecuted.push("showPopup"),
  };

  // Test A: ArrowUp -> Screenshot
  const sc1 = makeShortcut("sc-arrow", "Up", [], "single", [{ type: "screenshot" }]);
  await routeMatchedShortcut(sc1, { popupManager: null, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "screenshot");

  // Test B: 1 -> Screenshot
  const sc2 = makeShortcut("sc-1", "1", [], "single", [{ type: "screenshot" }]);
  await routeMatchedShortcut(sc2, { popupManager: null, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "screenshot");

  // Test C: G Double -> Popup
  const sc3 = makeShortcut("sc-g", "G", [], "double", [{ type: "showPopup" }]);
  await routeMatchedShortcut(sc3, { popupManager: popupManagerMock, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "showPopup");

  // Test D: Ctrl + Shift + C -> Always on Top
  const sc4 = makeShortcut("sc-cc", "C", ["Ctrl", "Shift"], "combo", [{ type: "alwaysOnTop" }]);
  await routeMatchedShortcut(sc4, { popupManager: null, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "alwaysOnTop");

  // Test E: Hyper + T -> Popup
  const sc5 = makeShortcut("sc-ht", "T", ["Hyper"], "single", [{ type: "showPopup" }]);
  await routeMatchedShortcut(sc5, { popupManager: popupManagerMock, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "showPopup");

  // Test F: H Hold -> Notes Popup
  const sc6 = makeShortcut("sc-hn", "H", [], "hold", [{ type: "notesPopup" }]);
  await routeMatchedShortcut(sc6, { popupManager: null, mainWindow: null }, mockRunner);
  assert.equal(actionsExecuted.pop(), "notesPopup");
});

test("Live reconfiguration updates shortcut specs without restarting helper", () => {
  // Config V1: G Double -> Popup
  const list1 = [makeShortcut("sc-g", "G", [], "double", [{ type: "showPopup" }])];
  const specs1 = buildNativeShortcutConfig(list1);
  assert.equal(specs1.length, 1);
  assert.equal(specs1[0].key.vk, 0x47); // 'G'

  // Config V2: Edit key to H Double
  const list2 = [makeShortcut("sc-g", "H", [], "double", [{ type: "showPopup" }])];
  const specs2 = buildNativeShortcutConfig(list2);
  assert.equal(specs2.length, 1);
  assert.equal(specs2[0].key.vk, 0x48); // 'H'

  // Config V3: Delete shortcut
  const list3 = [];
  const specs3 = buildNativeShortcutConfig(list3);
  assert.equal(specs3.length, 0);
});

test("Profile switch filtering only includes active profile's enabled shortcuts", () => {
  const allShortcuts = [
    { ...makeShortcut("sc-p1", "G", [], "double", [{ type: "showPopup" }]), profileId: "p-work" },
    { ...makeShortcut("sc-p2", "H", [], "single", [{ type: "alwaysOnTop" }]), profileId: "p-gaming" },
  ];

  // Switch to p-work
  const workShortcuts = allShortcuts.filter((s) => s.enabled && s.profileId === "p-work");
  const workSpecs = buildNativeShortcutConfig(workShortcuts);
  assert.equal(workSpecs.length, 1);
  assert.equal(workSpecs[0].id, "sc-p1");

  // Switch to p-gaming
  const gamingShortcuts = allShortcuts.filter((s) => s.enabled && s.profileId === "p-gaming");
  const gamingSpecs = buildNativeShortcutConfig(gamingShortcuts);
  assert.equal(gamingSpecs.length, 1);
  assert.equal(gamingSpecs[0].id, "sc-p2");
});
