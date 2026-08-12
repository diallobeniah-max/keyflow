import test from "node:test";
import assert from "node:assert/strict";
import { routeMatchedShortcut, notifyRendererMatched, nextPopupGeneration } from "../dist-electron/action-router.js";

const timing = { tapInterval: 100, holdDuration: 30, delay: 0, cooldown: 0 };

function sc(id, key, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    mouse: false,
    modifiers: [],
    trigger: "single",
    timing,
    actions: [],
    enabled: true,
    ...extra,
  };
}

test("popup shortcuts route to the popup manager, not the action runner", async () => {
  const toggles = [];
  const ran = [];
  const deps = {
    popupManager: { toggle: (req) => toggles.push(req) },
    mainWindow: null,
  };
  const s = sc("sc-f", "F", { actions: [{ type: "showPopup", payload: { popupItems: [{ id: "x", label: "X" }], title: "T" } }] });
  const results = await routeMatchedShortcut(s, deps, async (a) => { ran.push(a); return { ok: true, action: a.type }; });
  assert.deepEqual(ran, []);
  assert.equal(toggles.length, 1);
  assert.equal(toggles[0].items[0].id, "x");
  assert.equal(toggles[0].title, "sc-f");
  assert.equal(toggles[0].shortcutId, "sc-f");
  assert.ok(toggles[0].generatorId);
  assert.equal(results[0].action, "showPopup");
});

test("generation ids are unique per call", () => {
  const a = nextPopupGeneration();
  const b = nextPopupGeneration();
  assert.notEqual(a, b);
});

test("non-popup shortcuts run every action in order through the runner", async () => {
  const ran = [];
  const deps = { popupManager: null, mainWindow: null };
  const s = sc("sc-a", "A", { actions: [{ type: "screenshot" }, { type: "notify" }] });
  const results = await routeMatchedShortcut(s, deps, async (a) => { ran.push(a.type); return { ok: true, action: a.type }; });
  assert.deepEqual(ran, ["screenshot", "notify"]);
  assert.equal(results.length, 2);
});

test("shortcut with no actions returns empty results without throwing", async () => {
  const deps = { popupManager: null, mainWindow: null };
  const s = sc("sc-0", "H");
  const results = await routeMatchedShortcut(s, deps, async () => ({ ok: true, action: "?" }));
  assert.deepEqual(results, []);
});

test("notifyRendererMatched skips popup shortcuts (no informational event for popup toggles)", () => {
  const sent = [];
  const mainWindow = { webContents: { send: (ch, sc) => sent.push([ch, sc]) } };
  const sPopup = sc("sc-f", "F", { actions: [{ type: "showPopup", payload: {} }] });
  const sAction = sc("sc-a", "A", { actions: [{ type: "screenshot" }] });
  notifyRendererMatched(sPopup, mainWindow);
  assert.equal(sent.length, 0);
  notifyRendererMatched(sAction, mainWindow);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "shortcut:triggered");
  assert.equal(sent[0][1].id, "sc-a");
});