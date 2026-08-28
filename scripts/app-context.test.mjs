import test from "node:test";
import assert from "node:assert/strict";
import {
  diffRunningApps,
  normalizeExecutablePath,
  savedScopes,
} from "../src/lib/app-scope.ts";
import { analyzeShortcutConflicts } from "../src/lib/conflict.ts";

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

function shortcut(id, key, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    modifiers: [],
    trigger: "single",
    timing: { tapInterval: 100, holdDuration: 300, delay: 0, cooldown: 0 },
    actions: [],
    enabled: true,
    createdAt: 0,
    ...extra,
  };
}

const timing = { tapInterval: 100, holdDuration: 300, delay: 0, cooldown: 0 };

test("app_context_running_now_diff_added", () => {
  const { added, removed } = diffRunningApps(
    [{ executablePath: CHROME.executablePath }],
    [{ executablePath: CHROME.executablePath }, { executablePath: NOTEPAD.executablePath }]
  );
  assert.deepEqual(removed, []);
  assert.equal(added.length, 1);
  assert.equal(normalizeExecutablePath(added[0].executablePath), normalizeExecutablePath(NOTEPAD.executablePath));
});

test("app_context_running_now_diff_removed", () => {
  const { added, removed } = diffRunningApps(
    [{ executablePath: CHROME.executablePath }, { executablePath: NOTEPAD.executablePath }],
    [{ executablePath: CHROME.executablePath }]
  );
  assert.deepEqual(added, []);
  assert.equal(removed.length, 1);
  assert.equal(removed[0], normalizeExecutablePath(NOTEPAD.executablePath));
});

test("app_context_running_now_diff_no_change_is_empty", () => {
  const apps = [{ executablePath: CHROME.executablePath }, { executablePath: NOTEPAD.executablePath }];
  const { added, removed } = diffRunningApps(apps, apps);
  assert.equal(added.length, 0);
  assert.equal(removed.length, 0, "no-op diffs must not trigger a re-render");
});

test("app_context_closed_app_removed_from_running_now_only", () => {
  // Closing an app drops it from the live Running Now diff…
  const { removed } = diffRunningApps(
    [{ executablePath: NOTEPAD.executablePath }],
    []
  );
  assert.equal(removed.length, 1);
  // …but a saved scope for that app survives independently of the live list.
  const saved = savedScopes([shortcut("sc-np", "3", { appScope: NOTEPAD })]);
  assert.equal(saved.length, 1);
  assert.equal(normalizeExecutablePath(saved[0].executablePath), normalizeExecutablePath(NOTEPAD.executablePath));
});

test("app_context_saved_scopes_never_deleted_by_running_now", () => {
  const saved = savedScopes([
    shortcut("sc-ps", "3", { appScope: PHOTOSHOP }),
    shortcut("sc-np", "F", { appScope: NOTEPAD }),
  ]);
  // The "Saved apps" section is derived from shortcut scopes, not from the
  // running-app list, so a closed app's scope is never dropped.
  assert.equal(saved.length, 2);
  const keys = saved.map((s) => normalizeExecutablePath(s.executablePath));
  assert.ok(keys.includes(normalizeExecutablePath(PHOTOSHOP.executablePath)));
  assert.ok(keys.includes(normalizeExecutablePath(NOTEPAD.executablePath)));
});

test("app_context_saved_scopes_deduped_and_global_filtered", () => {
  const saved = savedScopes([
    shortcut("sc-a", "3", { appScope: PHOTOSHOP }),
    shortcut("sc-b", "F", { appScope: { ...PHOTOSHOP, displayName: "Photoshop again" } }),
    shortcut("sc-c", "T", {}), // no scope = global, must be ignored
    shortcut("sc-d", "Y", { appScope: { scopeType: "everywhere", executablePath: "" } }),
  ]);
  assert.equal(saved.length, 1, "same normalized app dedupes; global/absent scopes are filtered");
});

test("app_context_specific_overrides_general", () => {
  // A Photoshop-scoped shortcut may coexist with a global shortcut on the same
  // key: while Photoshop is active the scoped rule wins, elsewhere the global
  // applies. The renderer must not treat this as a blocking conflict.
  const existing = [
    shortcut("sc-global", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Enter" }),
  ];
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
  assert.equal(report.hasBlockingConflict, false, "app-specific override must coexist with the general rule");
});

test("app_context_general_applies_outside_specific_scope", () => {
  // Same key, same profile, but only one is app-scoped: they never conflict.
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
  assert.equal(report.hasBlockingConflict, false);
});

test("app_context_same_scope_same_trigger_still_conflicts", () => {
  // Two shortcuts for the SAME app and SAME trigger on the same key remain a
  // real conflict — the coexistence rule only spans different scopes.
  const existing = [shortcut("sc-ps1", "3", { trigger: "remap", keyBehavior: "remap", remapTo: "Tab", appScope: PHOTOSHOP })];
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
  assert.equal(report.hasBlockingConflict, true);
});
