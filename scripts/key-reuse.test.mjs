import test from "node:test";
import assert from "node:assert/strict";
import {
  allTapGesturesTaken,
  getGestureAvailability,
} from "../src/lib/conflict.ts";

const PHOTOSHOP = {
  scopeType: "executable",
  executablePath: String.raw`C:\Program Files\Adobe\Photoshop\Photoshop.exe`,
  processName: "Photoshop",
  displayName: "Adobe Photoshop",
};

function shortcut(id, key, trigger, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    modifiers: [],
    trigger,
    timing: { tapInterval: 100, holdDuration: 300, delay: 0, cooldown: 0 },
    actions: [],
    enabled: true,
    createdAt: 0,
    ...extra,
  };
}

const CANDIDATE = { key: "CapsLock", modifiers: [], profileId: "p" };

test("key_reuse_capture_never_blocks_on_existing_key", () => {
  // A key that already exists in the list yields a full availability row set,
  // not an empty/error result — the capture path stays open.
  const existing = [
    shortcut("s1", "CapsLock", "single"),
    shortcut("s2", "CapsLock", "double"),
  ];
  const avail = getGestureAvailability(CANDIDATE, existing);
  assert.equal(avail.length, 3);
  assert.equal(avail[0].trigger, "single");
  assert.equal(avail[1].trigger, "double");
  assert.equal(avail[2].trigger, "triple");
});

test("key_reuse_suggestion_order_single_double_triple", () => {
  const avail = getGestureAvailability(CANDIDATE, []);
  assert.deepEqual(
    avail.map((g) => g.trigger),
    ["single", "double", "triple"]
  );
});

test("key_reuse_reports_free_gestures_only", () => {
  // A Hold shortcut occupies the single-tap slot (single collides with hold)
  // but leaves double/triple free — the UI lists exactly the free ones.
  const existing = [shortcut("s1", "CapsLock", "hold")];
  const avail = getGestureAvailability(CANDIDATE, existing);
  const free = avail.filter((g) => g.available).map((g) => g.trigger);
  assert.deepEqual(free, ["double", "triple"]);
});

test("key_reuse_scope_aware_coexists_with_other_scopes", () => {
  // Photoshop CapsLock Single may coexist with General CapsLock Single: the
  // general candidate still sees Single as free.
  const existing = [shortcut("sc-ps", "CapsLock", "single", { appScope: PHOTOSHOP })];
  const avail = getGestureAvailability(CANDIDATE, existing);
  assert.ok(avail.find((g) => g.trigger === "single")?.available);
  assert.ok(avail.every((g) => g.available));
});

test("key_reuse_all_tap_gestures_taken_in_scope", () => {
  const existing = [
    shortcut("s1", "CapsLock", "single"),
    shortcut("s2", "CapsLock", "double"),
    shortcut("s3", "CapsLock", "triple"),
  ];
  assert.equal(allTapGesturesTaken(CANDIDATE, existing), true);
  assert.equal(getGestureAvailability(CANDIDATE, existing).filter((g) => g.available).length, 0);
});

test("key_reuse_same_scope_still_conflicts_for_that_gesture", () => {
  // Same scope, same gesture = taken; a DIFFERENT tap gesture stays free
  // (single and double are distinct gestures the native engine arbitrates).
  const avail = getGestureAvailability({ ...CANDIDATE, appScope: PHOTOSHOP }, [
    shortcut("s1", "CapsLock", "single", { appScope: PHOTOSHOP }),
  ]);
  assert.equal(avail.find((g) => g.trigger === "single")?.available, false);
  assert.equal(avail.find((g) => g.trigger === "double")?.available, true);
  assert.equal(avail.find((g) => g.trigger === "triple")?.available, true);
});

test("key_reuse_editing_own_shortcut_does_not_block", () => {
  // While editing, the shortcut being edited is excluded from the taken set.
  const existing = [shortcut("s1", "CapsLock", "single")];
  const avail = getGestureAvailability(CANDIDATE, existing, { currentShortcutId: "s1" });
  assert.ok(avail.find((g) => g.trigger === "single")?.available);
});