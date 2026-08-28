import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeShortcutConflicts,
  areTriggersConflicting,
  getSuggestedShortcuts,
  sameModifiers,
  isPrintableKey,
} from "../src/lib/conflict.ts";

test("sameModifiers detects equal modifier chords regardless of order or case", () => {
  assert.equal(sameModifiers(["Ctrl", "Shift"], ["Shift", "Ctrl"]), true);
  assert.equal(sameModifiers(["ctrl", "shift"], ["Ctrl", "Shift"]), true);
  assert.equal(sameModifiers([], []), true);
  assert.equal(sameModifiers(["Ctrl"], ["Ctrl", "Alt"]), false);
  assert.equal(sameModifiers(["Ctrl"], []), false);
});

test("isPrintableKey identifies standard letters, numbers and punctuation", () => {
  assert.equal(isPrintableKey("F"), true);
  assert.equal(isPrintableKey("a"), true);
  assert.equal(isPrintableKey("1"), true);
  assert.equal(isPrintableKey("Space"), true);
  assert.equal(isPrintableKey("CapsLock"), false);
  assert.equal(isPrintableKey("Escape"), false);
  assert.equal(isPrintableKey("F12"), false);
  assert.equal(isPrintableKey("ArrowLeft"), false);
});

test("areTriggersConflicting identifies exact duplicates and gesture overlaps", () => {
  assert.deepEqual(areTriggersConflicting("single", "single"), { conflicting: true, exact: true });
  assert.deepEqual(areTriggersConflicting("double", "double"), { conflicting: true, exact: true });
  assert.deepEqual(areTriggersConflicting("hold", "hold"), { conflicting: true, exact: true });
  assert.deepEqual(areTriggersConflicting("hold", "longPress"), { conflicting: true, exact: true });

  // Distinct tap counts coexist (native engine arbitrates single/double/triple)
  assert.deepEqual(areTriggersConflicting("single", "double"), { conflicting: false, exact: false });
  assert.deepEqual(areTriggersConflicting("double", "single"), { conflicting: false, exact: false });
  assert.deepEqual(areTriggersConflicting("single", "triple"), { conflicting: false, exact: false });
  assert.deepEqual(areTriggersConflicting("double", "triple"), { conflicting: false, exact: false });
  // Single still collides with hold-family timing
  assert.deepEqual(areTriggersConflicting("single", "tapThenHold"), { conflicting: true, exact: false });
});

test("analyzeShortcutConflicts: detects exact duplicate in same profile", () => {
  const existing = [
    {
      id: "sc-1",
      name: "Existing Screenshot",
      profileId: "prof-default",
      key: "CapsLock",
      modifiers: [],
      trigger: "single",
      enabled: true,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      createdAt: 100,
    },
  ];

  const candidate = {
    id: "sc-candidate",
    name: "New Screenshot",
    profileId: "prof-default",
    key: "CapsLock",
    modifiers: [],
    trigger: "single",
    enabled: true,
  };

  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, true);
  assert.equal(report.conflicts.length, 1);
  assert.equal(report.conflicts[0].type, "exact_duplicate");
  assert.ok(report.conflicts[0].message.includes("CapsLock is already used"));
});

test("analyzeShortcutConflicts: allows single tap alongside double tap on same key", () => {
  const existing = [
    {
      id: "sc-popup",
      name: "Double tap F popup",
      profileId: "prof-default",
      key: "F",
      modifiers: [],
      trigger: "double",
      enabled: true,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      createdAt: 100,
    },
  ];

  // User creates Single Tap F (e.g. Always on Top); the native engine
  // arbitrates tap counts, so distinct gestures on one key are allowed.
  const candidate = {
    id: "sc-aot",
    name: "Always on Top",
    profileId: "prof-default",
    key: "F",
    modifiers: [],
    trigger: "single",
    enabled: true,
  };

  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false);
  const conflict = report.conflicts.find((c) => c.type === "gesture_overlap");
  assert.ok(!conflict, "Single tap must not overlap double tap on the same key");
});

test("analyzeShortcutConflicts: allows different modifier chords on same key", () => {
  const existing = [
    {
      id: "sc-aot-1",
      name: "Always on Top",
      profileId: "prof-default",
      key: "C",
      modifiers: ["Ctrl", "Shift"],
      trigger: "single",
      enabled: true,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      createdAt: 100,
    },
  ];

  const candidate = {
    id: "sc-clipboard",
    name: "Clipboard History",
    profileId: "prof-default",
    key: "C",
    modifiers: ["Ctrl", "Alt"],
    trigger: "single",
    enabled: true,
  };

  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false);
});

test("analyzeShortcutConflicts: self-exclusion when editing existing shortcut", () => {
  const existing = [
    {
      id: "sc-aot-edit",
      name: "Always on Top",
      profileId: "prof-default",
      key: "C",
      modifiers: ["Ctrl", "Shift"],
      trigger: "single",
      enabled: true,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      createdAt: 100,
    },
  ];

  const candidate = {
    id: "sc-aot-edit",
    name: "Always on Top Renamed",
    profileId: "prof-default",
    key: "C",
    modifiers: ["Ctrl", "Shift"],
    trigger: "single",
    enabled: true,
  };

  const report = analyzeShortcutConflicts(candidate, existing, undefined, {
    currentShortcutId: "sc-aot-edit",
  });
  assert.equal(report.hasBlockingConflict, false);
});

test("analyzeShortcutConflicts: warns for bare single printable keys", () => {
  const existing = [];
  const candidate = {
    id: "sc-new",
    name: "Risky F",
    profileId: "prof-default",
    key: "F",
    modifiers: [],
    trigger: "single",
    enabled: true,
  };

  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false);
  assert.equal(report.hasWarning, true);
  const warn = report.conflicts.find((c) => c.type === "risky_bare_key");
  assert.ok(warn);
  assert.ok(warn.message.includes("typing"));
});

test("getSuggestedShortcuts: returns safe unused modifier chords for base key", () => {
  const existing = [
    {
      id: "sc-1",
      name: "Existing F1",
      profileId: "prof-default",
      key: "F",
      modifiers: ["Ctrl", "Shift"],
      trigger: "single",
      enabled: true,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      createdAt: 100,
    },
  ];

  const suggestions = getSuggestedShortcuts({ key: "F", trigger: "single" }, existing, { limit: 3 });
  assert.ok(suggestions.length >= 2);
  // Must NOT include Ctrl + Shift + F because it is already taken
  assert.equal(suggestions.some((s) => sameModifiers(s.modifiers, ["Ctrl", "Shift"])), false);
  // Must include safe unused combinations like Alt + Shift + F or Ctrl + Alt + F
  assert.ok(suggestions.some((s) => s.label.includes("Alt")));
});
