import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultPopupItems, createDefaultSettings, migratePopupMenuItems } from "../src/lib/defaults.ts";
import {
  resolvePopupItems,
  effectivePopupKey,
  popupKeyMap,
  findDuplicatePopupKeys,
} from "../src/lib/popup-items.ts";

const item = (id, label, extra = {}) => ({ id, label, icon: "command", actions: [{ id: `a-${id}`, type: "showNotification", payload: {} }], enabled: true, ...extra });

test("default popup items are non-empty with unique ids and single-char keys", () => {
  const items = createDefaultPopupItems();
  assert.ok(items.length >= 3);
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const it of items) {
    assert.ok(it.key && it.key.length === 1, `${it.id} must have a single-char key`);
    assert.equal(it.enabled, true);
    assert.ok(Array.isArray(it.actions) && it.actions.length > 0);
  }
  assert.deepEqual(findDuplicatePopupKeys(items), []);
});

test("createDefaultSettings seeds the editable popup menu", () => {
  const settings = createDefaultSettings();
  assert.ok(Array.isArray(settings.popup.items) && settings.popup.items.length > 0);
});

test("configured global menu wins over per-shortcut payload items", () => {
  const payload = [item("p1", "Payload")];
  const configured = [item("c1", "Configured")];
  assert.deepEqual(resolvePopupItems(payload, configured).map((i) => i.id), ["c1"]);
  assert.deepEqual(resolvePopupItems([], configured).map((i) => i.id), ["c1"]);
  assert.deepEqual(resolvePopupItems(payload, undefined).map((i) => i.id), ["p1"]);
  assert.deepEqual(resolvePopupItems([], undefined), []);
});

test("disabled items are filtered from the runtime menu", () => {
  const items = [item("a", "A"), item("b", "B", { enabled: false })];
  assert.deepEqual(resolvePopupItems(items, undefined).map((i) => i.id), ["a"]);
});

test("effectivePopupKey prefers explicit single-char keys and defaults to position", () => {
  assert.equal(effectivePopupKey(item("a", "A", { key: "5" }), 0), "5");
  assert.equal(effectivePopupKey(item("a", "A", { key: "AB" }), 0), "1", "multi-char keys are ignored");
  assert.equal(effectivePopupKey(item("a", "A"), 2), "3");
});

test("popupKeyMap maps explicit keys and position defaults, first item wins on duplicates", () => {
  const items = [item("a", "A", { key: "1" }), item("b", "B", { key: "1" }), item("c", "C")];
  const map = popupKeyMap(items);
  assert.equal(map.get("1"), 0, "duplicate key keeps the first item");
  assert.equal(map.get("3"), 2, "position default for item without a key");
});

test("findDuplicatePopupKeys reports keys used more than once", () => {
  const items = [item("a", "A", { key: "1" }), item("b", "B", { key: "1" }), item("c", "C", { key: "2" })];
  assert.deepEqual(findDuplicatePopupKeys(items), ["1"]);
  assert.deepEqual(findDuplicatePopupKeys([item("a", "A"), item("b", "B")]), []);
});

test("migratePopupMenuItems seeds from the first popup shortcut and normalizes enabled", () => {
  const settings = createDefaultSettings();
  settings.popup.items = undefined;
  const shortcuts = [
    { id: "s1", key: "F", actions: [{ type: "showPopup", payload: { popupItems: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] } }] },
  ];
  const migrated = migratePopupMenuItems(settings, shortcuts);
  assert.deepEqual(migrated.popup.items.map((i) => i.id), ["x", "y"]);
  for (const it of migrated.popup.items) assert.equal(it.enabled, true);
});

test("migratePopupMenuItems never overwrites a configured menu", () => {
  const settings = createDefaultSettings();
  const shortcuts = [
    { id: "s1", key: "F", actions: [{ type: "showPopup", payload: { popupItems: [{ id: "old", label: "Old" }] } }] },
  ];
  const migrated = migratePopupMenuItems(settings, shortcuts);
  assert.ok(migrated.popup.items.length > 0);
  assert.ok(!migrated.popup.items.some((i) => i.id === "old"));
});

test("migratePopupMenuItems leaves settings alone when nothing to seed", () => {
  const settings = createDefaultSettings();
  settings.popup.items = undefined;
  assert.equal(migratePopupMenuItems(settings, []).popup.items, undefined);
});