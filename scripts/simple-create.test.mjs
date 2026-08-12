import test from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultKeyBehavior, resolveShortcutBehavior } from "../src/lib/defaults.ts";

test("simple Tap creates correct shortcut model", () => {
  const shortcut = {
    id: "sc-test-1",
    key: "A",
    modifiers: [],
    trigger: "single",
    timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350, timingMode: "auto" },
    actions: [{ id: "act-1", type: "screenshot", payload: { screenshotMode: "snipOverlay" } }],
    enabled: true,
  };

  assert.equal(shortcut.trigger, "single");
  assert.equal(shortcut.key, "A");
  assert.equal(shortcut.actions[0].type, "screenshot");
  assert.equal(shortcut.timing.timingMode, "auto");
});

test("simple Double tap creates correct shortcut model", () => {
  const shortcut = {
    id: "sc-test-2",
    key: "F",
    modifiers: [],
    trigger: "double",
    timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350, timingMode: "auto" },
    actions: [{ id: "act-2", type: "alwaysOnTop", payload: { topmostMode: "toggle", highlight: true } }],
    enabled: true,
  };

  assert.equal(shortcut.trigger, "double");
  assert.equal(shortcut.key, "F");
  assert.equal(shortcut.actions[0].type, "alwaysOnTop");
  assert.equal(shortcut.actions[0].payload.topmostMode, "toggle");
});

test("simple Hold creates correct shortcut model", () => {
  const shortcut = {
    id: "sc-test-3",
    key: "M",
    modifiers: [],
    trigger: "hold",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350, timingMode: "auto" },
    actions: [{ id: "act-3", type: "volumeControl", payload: { volume: "toggle" } }],
    enabled: true,
  };

  assert.equal(shortcut.trigger, "hold");
  assert.equal(shortcut.key, "M");
  assert.equal(shortcut.actions[0].type, "volumeControl");
});

test("automatic default behavior: CapsLock screenshot resolves to suppress", () => {
  const behavior = resolveDefaultKeyBehavior("CapsLock", "single", [
    { id: "act-1", type: "screenshot", payload: {} },
  ]);
  assert.equal(behavior, "suppress", "CapsLock with single tap should automatically default to suppress");
});

test("automatic default behavior: ordinary F double tap resolves to passThrough", () => {
  const behavior = resolveDefaultKeyBehavior("F", "double", [
    { id: "act-1", type: "showPopup", payload: {} },
  ]);
  assert.equal(behavior, "passThrough", "F double tap should automatically default to passThrough so typing works");
});

test("automatic default behavior: modifier combo resolves to passThrough", () => {
  const behavior = resolveDefaultKeyBehavior("K", "combo", [], ["Ctrl", "Shift"]);
  assert.equal(behavior, "passThrough", "Modifier combos must always pass through");
});

test("resolveShortcutBehavior honors explicit override when keyBehavior is set", () => {
  const custom = {
    key: "F",
    trigger: "double",
    keyBehavior: "disable",
  };
  assert.equal(resolveShortcutBehavior(custom), "disable", "Explicit keyBehavior override must win");
});

test("resolveShortcutBehavior honors legacy suppressKey flag", () => {
  const legacy = {
    key: "F",
    trigger: "double",
    suppressKey: true,
  };
  assert.equal(resolveShortcutBehavior(legacy), "suppress", "Legacy suppressKey=true must resolve to suppress");
});

test("editing advanced shortcut while Advanced is collapsed preserves all hidden values", () => {
  // Existing advanced shortcut
  const existing = {
    id: "sc-adv-1",
    name: "Custom Dev Helper",
    profileId: "prof-coding",
    key: "D",
    modifiers: ["Ctrl"],
    trigger: "longPress",
    timing: { tapInterval: 450, holdDuration: 850, delay: 120, cooldown: 600, timingMode: "custom" },
    actions: [
      { id: "act-1", type: "openApp", payload: { path: "code" } },
      { id: "act-2", type: "pasteText", payload: { text: "npm test" } },
    ],
    conditions: [{ type: "appActive", exe: "Code.exe" }],
    keyBehavior: "suppress",
    suppressKey: true,
    remapTo: "F13",
    enabled: true,
    createdAt: 1000,
  };

  // User edits only the primary action without opening Advanced settings:
  const draft = JSON.parse(JSON.stringify(existing));
  // User changes action #1 path
  draft.actions[0].payload.path = "notepad.exe";

  // When saved:
  const saved = {
    ...draft,
    keyBehavior: draft.keyBehavior ?? resolveShortcutBehavior(draft),
    suppressKey: draft.suppressKey ?? (resolveShortcutBehavior(draft) === "suppress"),
  };

  // Verify all hidden advanced properties are 100% preserved
  assert.equal(saved.id, "sc-adv-1");
  assert.equal(saved.profileId, "prof-coding");
  assert.equal(saved.timing.timingMode, "custom");
  assert.equal(saved.timing.holdDuration, 850);
  assert.equal(saved.timing.delay, 120);
  assert.equal(saved.conditions.length, 1);
  assert.equal(saved.conditions[0].exe, "Code.exe");
  assert.equal(saved.keyBehavior, "suppress");
  assert.equal(saved.remapTo, "F13");
  assert.equal(saved.actions.length, 2);
  assert.equal(saved.actions[0].payload.path, "notepad.exe");
  assert.equal(saved.actions[1].payload.text, "npm test");
});

test("existing FF popup shortcut data remains unchanged", () => {
  const fShortcut = {
    id: "sc-f-popup",
    name: "Double tap F popup",
    profileId: "prof-default",
    key: "F",
    modifiers: [],
    trigger: "double",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [{ id: "act-pop", type: "showPopup", payload: { popupItems: [] } }],
    enabled: true,
    createdAt: 100,
  };

  const behavior = resolveShortcutBehavior(fShortcut);
  assert.equal(behavior, "passThrough");
  assert.equal(fShortcut.trigger, "double");
  assert.equal(fShortcut.actions[0].type, "showPopup");
});

test("existing CapsLock Screenshot shortcut data remains unchanged", () => {
  const capsShortcut = {
    id: "sc-caps-snip",
    name: "CapsLock Screenshot",
    profileId: "prof-default",
    key: "CapsLock",
    modifiers: [],
    trigger: "single",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [{ id: "act-snip", type: "screenshot", payload: { screenshotMode: "snipOverlay" } }],
    enabled: true,
    createdAt: 100,
  };

  const behavior = resolveShortcutBehavior(capsShortcut);
  assert.equal(behavior, "suppress");
  assert.equal(capsShortcut.key, "CapsLock");
  assert.equal(capsShortcut.actions[0].type, "screenshot");
});
