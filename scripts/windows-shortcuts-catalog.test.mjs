import test from "node:test";
import assert from "node:assert/strict";
import {
  lookupWindowsShortcut,
  isOsSecuredShortcut,
  getSmartAlternativeShortcuts,
  normalizeKeyToken,
  matchModifiers,
  WINDOWS_SHORTCUTS_CATALOG,
} from "../src/lib/windows-shortcuts-catalog.ts";
import { analyzeShortcutConflicts } from "../src/lib/conflict.ts";

test("Windows catalog contains known system shortcuts", () => {
  assert.ok(WINDOWS_SHORTCUTS_CATALOG.length >= 30, "Catalog should have at least 30 shortcuts");
  const winV = WINDOWS_SHORTCUTS_CATALOG.find((s) => s.id === "win-v");
  assert.ok(winV, "Win+V should exist in catalog");
  assert.equal(winV.interceptability, "interceptable");
  assert.equal(winV.name, "Clipboard History");
});

test("lookupWindowsShortcut matches Win+V order-invariantly and case-insensitively", () => {
  const match1 = lookupWindowsShortcut("v", ["Win"]);
  assert.ok(match1);
  assert.equal(match1.id, "win-v");

  const match2 = lookupWindowsShortcut("V", ["win"]);
  assert.ok(match2);
  assert.equal(match2.id, "win-v");

  const match3 = lookupWindowsShortcut("s", ["Shift", "Win"]);
  assert.ok(match3);
  assert.equal(match3.id, "win-shift-s");

  const match4 = lookupWindowsShortcut("S", ["Win", "Shift"]);
  assert.ok(match4);
  assert.equal(match4.id, "win-shift-s");
});

test("isOsSecuredShortcut identifies security-restricted shortcuts", () => {
  // Authoritative OS-secured shortcuts (SAS & Lock Workstation)
  assert.equal(isOsSecuredShortcut("Delete", ["Ctrl", "Alt"]), true);
  assert.equal(isOsSecuredShortcut("L", ["Win"]), true);

  // Interceptable shortcuts are NOT OS-secured
  assert.equal(isOsSecuredShortcut("U", ["Win"]), false);
  assert.equal(isOsSecuredShortcut("B", ["Ctrl", "Shift", "Win"]), false);
  assert.equal(isOsSecuredShortcut("G", ["Win"]), false);
  assert.equal(isOsSecuredShortcut("V", ["Win"]), false);
  assert.equal(isOsSecuredShortcut("D", ["Win"]), false);
  assert.equal(isOsSecuredShortcut("E", ["Win"]), false);
});

test("getSmartAlternativeShortcuts provides non-conflicting alternatives", () => {
  const alternatives = getSmartAlternativeShortcuts("V", ["Win"], []);
  assert.ok(alternatives.length > 0);
  for (const alt of alternatives) {
    assert.equal(alt.key, "V");
    assert.notDeepEqual(alt.modifiers, ["Win"]);
    assert.equal(isOsSecuredShortcut(alt.key, alt.modifiers), false);
    assert.equal(lookupWindowsShortcut(alt.key, alt.modifiers), undefined);
  }
});

test("analyzeShortcutConflicts classifies Win+V as interceptable warning with override capability", () => {
  const candidate = {
    key: "V",
    modifiers: ["Win"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, false, "Win+V should not block save");
  assert.equal(report.hasWarning, true, "Win+V should produce a warning");
  const winConflict = report.conflicts.find((c) => c.type === "windows_interceptable");
  assert.ok(winConflict, "Conflict type should be windows_interceptable");
  assert.equal(winConflict.canOverride, true, "Keyflow can override Win+V");
  assert.ok(winConflict.message.includes("Keyflow will override"));
  assert.ok(report.suggestions.length > 0, "Suggestions should be provided");
});

test("analyzeShortcutConflicts classifies Win+L as OS-secured blocking error", () => {
  const candidate = {
    key: "L",
    modifiers: ["Win"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, true, "Win+L must block save");
  const secConflict = report.conflicts.find((c) => c.level === "error");
  assert.ok(secConflict);
  assert.equal(secConflict.canOverride, false, "Cannot override Win+L");
});

test("analyzeShortcutConflicts classifies Ctrl+Alt+Delete as OS-secured blocking error", () => {
  const candidate = {
    key: "Delete",
    modifiers: ["Ctrl", "Alt"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, true, "Ctrl+Alt+Delete must block save");
  const secConflict = report.conflicts.find((c) => c.level === "error");
  assert.ok(secConflict);
  assert.equal(secConflict.canOverride, false);
});

test("analyzeShortcutConflicts considers unassigned Win combination clean / free", () => {
  const candidate = {
    key: "J",
    modifiers: ["Win", "Shift"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, false);
  assert.equal(report.hasWarning, false);
  assert.equal(report.conflicts.length, 0);
});

test("analyzeShortcutConflicts classifies Win+U as interceptable warning with override capability", () => {
  const candidate = {
    key: "U",
    modifiers: ["Win"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, false, "Win+U must not block save");
  assert.equal(report.hasWarning, true);
  const winConflict = report.conflicts.find((c) => c.type === "windows_interceptable");
  assert.ok(winConflict);
  assert.equal(winConflict.canOverride, true);
  assert.equal(winConflict.windowsShortcut?.interceptability, "interceptable");
});

test("analyzeShortcutConflicts classifies Win+G as conditionally-interceptable", () => {
  const candidate = {
    key: "G",
    modifiers: ["Win"],
    trigger: "single",
  };
  const report = analyzeShortcutConflicts(candidate, []);
  assert.equal(report.hasBlockingConflict, false, "Win+G must not block save");
  assert.equal(report.hasWarning, true);
  const winConflict = report.conflicts.find((c) => c.type === "windows_interceptable");
  assert.ok(winConflict);
  assert.equal(winConflict.canOverride, true);
  assert.equal(winConflict.windowsShortcut?.interceptability, "conditionally-interceptable");
  assert.ok(winConflict.message.includes("overlay settings"));
});
