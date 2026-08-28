import test from "node:test";
import assert from "node:assert/strict";
import { analyzeShortcutConflicts, areTriggersConflicting, formatTriggerLabel } from "../src/lib/conflict.ts";
import { resolveTiming } from "../src/lib/timing.ts";

test("single/double/triple coexist on one key; only same-gesture is a conflict", () => {
  // The native trigger engine arbitrates tap counts (deferred singles,
  // triple-upgrade), so distinct tap gestures share a key without conflict.
  assert.deepEqual(areTriggersConflicting("single", "double"), { conflicting: false, exact: false });
  assert.deepEqual(areTriggersConflicting("double", "triple"), { conflicting: false, exact: false });
  assert.deepEqual(areTriggersConflicting("single", "triple"), { conflicting: false, exact: false });
  // Same-kind taps are exact duplicates
  assert.deepEqual(areTriggersConflicting("triple", "triple"), { conflicting: true, exact: true });
  assert.deepEqual(areTriggersConflicting("double", "double"), { conflicting: true, exact: true });
});

test("tap badges show the tap count for the shared group", () => {
  assert.equal(formatTriggerLabel({ trigger: "single" }), "×1");
  assert.equal(formatTriggerLabel({ trigger: "double" }), "×2");
  assert.equal(formatTriggerLabel({ trigger: "triple" }), "×3");
});

test("auto timing resolves to fast multi-tap defaults", () => {
  const auto = resolveTiming(undefined, "auto");
  assert.equal(auto.tapInterval, 200);
  assert.equal(auto.holdDuration, 360);
});

test("custom timing is preserved verbatim for multi-tap windows", () => {
  const custom = resolveTiming({ tapInterval: 150, holdDuration: 400, delay: 10, cooldown: 50 }, "custom");
  assert.equal(custom.tapInterval, 150);
  assert.equal(custom.holdDuration, 400);
  assert.equal(custom.delay, 10);
  assert.equal(custom.cooldown, 50);
});

test("a bare printable key warned as risky only for single tap, not remap", () => {
  // conflict engine: remap of a printable key is deliberate, no typing-activation warning
  const remapReport = analyzeShortcutConflicts({
    id: "r", key: "F", modifiers: [], trigger: "remap", remapTo: "Tab", profileId: "p", enabled: true,
  }, []);
  assert.equal(remapReport.hasWarning, false, "deliberate remap must not warn about typing");
  const singleReport = analyzeShortcutConflicts({
    id: "s", key: "F", modifiers: [], trigger: "single", profileId: "p", enabled: true,
  }, []);
  assert.equal(singleReport.hasWarning, true);
});