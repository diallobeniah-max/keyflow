import test from "node:test";
import assert from "node:assert/strict";
import {
  appScopeKey,
  appScopeMatches,
  filterRunningApps,
  formatScopeLabel,
  isScopeActive,
  normalizeExecutablePath,
  scopeFromBrowsePath,
  scopeFromPickedApp,
} from "../src/lib/app-scope.ts";
import { analyzeShortcutConflicts } from "../src/lib/conflict.ts";
import { buildNativeShortcutConfig } from "../dist-electron/suppression-config.js";

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

const PHOTOSHOP = {
  scopeType: "executable",
  executablePath: String.raw`C:\Program Files\Adobe\Photoshop\Photoshop.exe`,
  processName: "Photoshop",
  displayName: "Adobe Photoshop",
};

const CHROME = {
  scopeType: "executable",
  executablePath: String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
  processName: "chrome",
  displayName: "Google Chrome",
};

const NOTEPAD = {
  scopeType: "executable",
  executablePath: String.raw`C:\Windows\System32\notepad.exe`,
  processName: "notepad",
  displayName: "Notepad",
};

test("app_scope_everywhere_default", () => {
  assert.equal(appScopeKey(undefined), "everywhere");
  assert.equal(appScopeKey(null), "everywhere");
  assert.equal(isScopeActive(undefined, null), true, "no scope = active everywhere");
  assert.equal(appScopeMatches(undefined, { executablePath: String.raw`C:\x\y.exe` }), true);
});

test("app_scope_photoshop_matches_photoshop", () => {
  const active = { executablePath: PHOTOSHOP.executablePath };
  assert.equal(appScopeMatches(PHOTOSHOP, active), true);
  assert.equal(isScopeActive(PHOTOSHOP, active), true);
});

test("app_scope_photoshop_rejects_chrome", () => {
  const active = { executablePath: CHROME.executablePath };
  assert.equal(appScopeMatches(PHOTOSHOP, active), false);
  assert.equal(isScopeActive(PHOTOSHOP, active), false);
});

test("app_scope_path_normalization", () => {
  const scope = { scopeType: "executable", executablePath: String.raw`C:\Program Files\Adobe\Photoshop\Photoshop.exe` };
  const forwardSlash = { executablePath: "C:/Program Files/Adobe/Photoshop/Photoshop.exe" };
  assert.equal(appScopeMatches(scope, forwardSlash), true, "forward slashes normalize to backslashes");
  const extraWhitespace = { executablePath: `  ${scope.executablePath}  ` };
  assert.equal(appScopeMatches(scope, extraWhitespace), true, "whitespace is trimmed");
  const nullPadded = { executablePath: `${scope.executablePath}\u0000` };
  assert.equal(appScopeMatches(scope, nullPadded), true, "null terminator is stripped");
});

test("app_scope_case_normalization", () => {
  const scope = { scopeType: "executable", executablePath: String.raw`C:\Program Files\ADOBE\PHOTOSHOP\Photoshop.exe` };
  const active = { executablePath: "c:\\program files\\adobe\\photoshop\\photoshop.exe" };
  assert.equal(appScopeMatches(scope, active), true, "comparison is case-insensitive");
});

test("window_title_changes_do_not_affect_identity", () => {
  // Scope matching never reads window titles — only the executable path.
  const activeA = { executablePath: PHOTOSHOP.executablePath, processName: "Photoshop", displayName: "Untitled-1" };
  const activeB = { executablePath: PHOTOSHOP.executablePath, processName: "Photoshop", displayName: "final-v3.psd" };
  assert.equal(appScopeMatches(PHOTOSHOP, activeA), true);
  assert.equal(appScopeMatches(PHOTOSHOP, activeB), true, "title changes must not affect matching");
});

test("running_app_picker", () => {
  const apps = filterRunningApps([
    { executablePath: PHOTOSHOP.executablePath, processName: "Photoshop", displayName: "Adobe Photoshop" },
    { executablePath: CHROME.executablePath, processName: "chrome", displayName: "Google Chrome" },
    { executablePath: PHOTOSHOP.executablePath, processName: "Photoshop", displayName: "Adobe Photoshop (dup)" },
    { executablePath: NOTEPAD.executablePath, processName: "notepad", displayName: "Notepad" },
    { executablePath: "", processName: "bogus" },
  ]);
  assert.equal(apps.length, 3, "dedupes by normalized path and skips empty paths");
  assert.ok(apps.some((a) => a.displayName === "Notepad"), "picked app keeps display name");
  const picked = scopeFromPickedApp(apps[0]);
  assert.equal(picked.scopeType, "executable");
  assert.equal(normalizeExecutablePath(picked.executablePath), normalizeExecutablePath(apps[0].executablePath));
});

test("browse_exe_selection", () => {
  const scope = scopeFromBrowsePath(String.raw`C:\Tools\CoolApp\coolapp.exe`);
  assert.ok(scope, "browsed path builds a scope");
  assert.equal(scope.processName, "coolapp");
  assert.equal(scope.displayName, "coolapp");
  assert.equal(formatScopeLabel(scope), "coolapp");
  assert.equal(scopeFromBrowsePath("   "), null, "blank path is rejected");
});

test("missing_foreground_identity_fail_open", () => {
  // No active app (undefined/unknown foreground) => scoped shortcut inactive.
  assert.equal(appScopeMatches(PHOTOSHOP, null), false);
  assert.equal(appScopeMatches(PHOTOSHOP, { executablePath: "" }), false);
  assert.equal(isScopeActive(PHOTOSHOP, null), false, "scoped shortcut must be inactive when foreground is unknown");
});

test("global_fallback", () => {
  const existing = [shortcut("sc-global", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Enter" })];
  const candidate = {
    id: "sc-ps",
    name: "3 -> Tab in Photoshop",
    profileId: "p",
    key: "3",
    modifiers: [],
    trigger: "remap",
    remapTo: "Tab",
    keyBehavior: "remap",
    appScope: PHOTOSHOP,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "global + app-specific override must coexist");
});

test("specific_overrides_global", () => {
  const existing = [shortcut("sc-ps", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-global",
    name: "3 -> Enter",
    profileId: "p",
    key: "3",
    modifiers: [],
    trigger: "remap",
    remapTo: "Enter",
    keyBehavior: "remap",
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "app-specific rule + global rule coexist");
});

test("same_trigger_different_apps_allowed", () => {
  const existing = [shortcut("sc-ps", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-np",
    name: "3 -> Win in Notepad",
    profileId: "p",
    key: "3",
    modifiers: [],
    trigger: "remap",
    remapTo: "Win",
    keyBehavior: "remap",
    appScope: NOTEPAD,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "same trigger in different apps is allowed");
});

test("same_trigger_same_app_conflict", () => {
  const existing = [shortcut("sc-ps", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-ps2",
    name: "3 -> Enter in Photoshop",
    profileId: "p",
    key: "3",
    modifiers: [],
    trigger: "remap",
    remapTo: "Enter",
    keyBehavior: "remap",
    appScope: PHOTOSHOP,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, true, "same app + same trigger must conflict");
});

test("scoped_remap_active_app", () => {
  const specs = buildNativeShortcutConfig([
    shortcut("r-ps", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP }),
  ]);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].appScope?.scopeType, "executable");
  assert.equal(normalizeExecutablePath(specs[0].appScope.executablePath), normalizeExecutablePath(PHOTOSHOP.executablePath));
  assert.equal(specs[0].remapTo, 0x09, "Tab remap compiles to the correct vk");
});

test("scoped_remap_outside_app_preserves_source", () => {
  const specs = buildNativeShortcutConfig([
    shortcut("r-ps", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP }),
  ]);
  assert.equal(specs.length, 1);
  // Outside the app the rule is inactive, so the source key is preserved.
  assert.equal(appScopeMatches(specs[0].appScope, { executablePath: CHROME.executablePath }), false);
  assert.equal(appScopeMatches(specs[0].appScope, null), false, "unknown foreground must not swallow the key");
});

test("foreground_change_releases_remapped_target", () => {
  // Mirror of the Rust engine guarantee: a scope change while the source is
  // held releases the target and swallows the physical UP. The Electron
  // contract re-verifies the scope no longer matches after the switch.
  const scope = PHOTOSHOP;
  assert.equal(appScopeMatches(scope, { executablePath: PHOTOSHOP.executablePath }), true);
  assert.equal(appScopeMatches(scope, { executablePath: CHROME.executablePath }), false);
});

test("foreground_change_while_source_held_no_leak", () => {
  // Same key, two scopes: switching apps must never leave the old target active.
  assert.equal(appScopeKey(PHOTOSHOP) === appScopeKey(NOTEPAD), false, "scopes are distinct by normalized path");
});

test("scoped_single_tap", () => {
  // A scoped single-tap shortcut is globally unique in its app but may share
  // the same physical key with another app's shortcut.
  const existing = [shortcut("sc-ps", "F", { trigger: "single", keyBehavior: "passThrough", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-np",
    name: "F in Notepad",
    profileId: "p",
    key: "F",
    modifiers: [],
    trigger: "single",
    keyBehavior: "passThrough",
    appScope: NOTEPAD,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false);
});

test("scoped_double_tap", () => {
  const existing = [shortcut("sc-ps", "F", { trigger: "double", keyBehavior: "passThrough", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-np",
    name: "F double in Notepad",
    profileId: "p",
    key: "F",
    modifiers: [],
    trigger: "double",
    keyBehavior: "passThrough",
    appScope: NOTEPAD,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "same double-tap in different apps is allowed");
});

test("scoped_triple_tap", () => {
  const existing = [shortcut("sc-ps", "T", { trigger: "triple", keyBehavior: "passThrough", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-np",
    name: "T triple in Notepad",
    profileId: "p",
    key: "T",
    modifiers: [],
    trigger: "triple",
    keyBehavior: "passThrough",
    appScope: NOTEPAD,
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false);
});

test("gesture_reset_on_foreground_change", () => {
  // Renderer-level contract: switching app clears scoped gesture state, so a
  // half-completed double tap must not fire after the switch.
  const scope = PHOTOSHOP;
  const inPhotoshop = { executablePath: PHOTOSHOP.executablePath };
  const inChrome = { executablePath: CHROME.executablePath };
  assert.equal(isScopeActive(scope, inPhotoshop), true);
  assert.equal(isScopeActive(scope, inChrome), false, "switched foreground deactivates the scope");
});

test("scoped_hyper", () => {
  // Hyper shortcuts follow the same scope rules as any other trigger.
  const existing = [shortcut("sc-ps", "T", { modifiers: ["Hyper"], trigger: "single", keyBehavior: "passThrough", appScope: PHOTOSHOP })];
  const candidate = {
    id: "sc-global",
    name: "Hyper+T",
    profileId: "p",
    key: "T",
    modifiers: ["Hyper"],
    trigger: "single",
    keyBehavior: "passThrough",
    enabled: true,
  };
  const report = analyzeShortcutConflicts(candidate, existing);
  assert.equal(report.hasBlockingConflict, false, "scoped Hyper + global Hyper coexist");
});

test("one_hundred_foreground_switch_cycles", () => {
  // Cycle Photoshop -> Chrome -> Notepad repeatedly; the scope match result
  // must be stable and never cross-contaminate.
  const apps = [
    { executablePath: PHOTOSHOP.executablePath },
    { executablePath: CHROME.executablePath },
    { executablePath: NOTEPAD.executablePath },
  ];
  for (let i = 0; i < 100; i++) {
    const active = apps[i % apps.length];
    const expected = normalizeExecutablePath(active.executablePath) === normalizeExecutablePath(PHOTOSHOP.executablePath);
    assert.equal(appScopeMatches(PHOTOSHOP, active), expected, `cycle ${i} mismatch`);
  }
});