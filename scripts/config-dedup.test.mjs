import test from "node:test";
import assert from "node:assert/strict";
import { buildNativeShortcutConfig, buildNativeHyperSpec } from "../dist-electron/suppression-config.js";

// Mirrors main.ts input:update-shortcuts dedup: the handler compiles the same
// way, JSON.stringify's the compiled output, and skips the native Configure
// when both serialized forms are byte-identical to the last send. Shortcut
// *activity* (executing a shortcut, recent history, opening popup/notes,
// transient UI state) never changes these compiled forms, so it must not
// trigger a re-send or a native TriggerEngine reload.
const context = {
  hyperKeyConfig: { enabled: true, key: "AltRight", includeShift: false, tapActionId: "showPopup", suppressOriginal: true },
};

function makeEntries(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `sc-hyper-${i}`,
      name: `Hyper + ${String.fromCharCode(65 + (i % 26))}`,
      profileId: "p-default",
      key: String.fromCharCode(65 + (i % 26)),
      modifiers: ["Hyper"],
      trigger: "single",
      enabled: true,
      actions: [{ type: "showPopup" }],
    });
  }
  return out;
}

test("dedup: first activity update sends Configure, 100 identical ones skip (reason=unchanged)", () => {
  const entries = makeEntries(3);
  let lastSpecsJson = "";
  let lastHyperJson = "";
  let sends = 0;
  let skips = 0;

  // Reproduce main.ts logic exactly (lines 231-245).
  for (let i = 0; i < 101; i++) {
    const specs = buildNativeShortcutConfig(entries, context);
    const hyperSpec = buildNativeHyperSpec(context, entries);
    const currentSpecsJson = JSON.stringify(specs);
    const currentHyperJson = JSON.stringify(hyperSpec);
    if (currentSpecsJson === lastSpecsJson && currentHyperJson === lastHyperJson) {
      skips += 1; // main.ts logs `[native-config] skip reason=unchanged`
      continue;
    }
    lastSpecsJson = currentSpecsJson;
    lastHyperJson = currentHyperJson;
    sends += 1; // main.ts: nativeConfigVersion += 1; helper.setShortcuts(...)
  }

  assert.equal(sends, 1, "exactly one Configure for 101 identical activity updates");
  assert.equal(skips, 100, "100 updates skipped as unchanged");
});

test("dedup: actual semantic change (new shortcut) increments version and re-sends", () => {
  const base = makeEntries(2);
  let lastSpecsJson = "";
  let lastHyperJson = "";
  let sends = 0;
  let versions = [];

  for (const round of [base, base, [...base, makeEntries(1)[0]], [...base, makeEntries(1)[0]]]) {
    const specs = buildNativeShortcutConfig(round, context);
    const hyperSpec = buildNativeHyperSpec(context, round);
    const curS = JSON.stringify(specs);
    const curH = JSON.stringify(hyperSpec);
    if (curS === lastSpecsJson && curH === lastHyperJson) {
      continue;
    }
    lastSpecsJson = curS;
    lastHyperJson = curH;
    sends += 1;
    versions.push(sends);
  }

  assert.equal(sends, 2, "only real changes (adding a shortcut) re-send");
  assert.deepEqual(versions, [1, 2], "versions increment monotonically per real change");
});

test("dedup: transient UI context (safeMode unchanged false) does not re-send", () => {
  const entries = makeEntries(2);
  let lastSpecsJson = "";
  let lastHyperJson = "";
  let sends = 0;
  let skips = 0;

  // Activity like opening popup/notes updates `context` object identity but the
  // compiled native config stays identical.
  for (let i = 0; i < 50; i++) {
    const ctx = { ...context, transientUiTick: i };
    const specs = buildNativeShortcutConfig(entries, ctx);
    const hyperSpec = buildNativeHyperSpec(ctx, entries);
    const curS = JSON.stringify(specs);
    const curH = JSON.stringify(hyperSpec);
    if (curS === lastSpecsJson && curH === lastHyperJson) {
      skips += 1;
      continue;
    }
    lastSpecsJson = curS;
    lastHyperJson = curH;
    sends += 1;
  }

  assert.equal(sends, 1);
  assert.equal(skips, 49);
});
