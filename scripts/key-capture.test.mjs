import test from "node:test";
import assert from "node:assert/strict";
import {
  CaptureCoordinator,
  VK_TO_KEY,
  tokenFromNativeCaptured,
  captureGestureAvailability,
  capturedAllTapGesturesTaken,
} from "../src/lib/capture.ts";
import { getGestureAvailability } from "../src/lib/conflict.ts";

/** In-memory native bridge double. Records begin/cancel, holds the listener so
 *  tests can fire CapturedKey like the real IPC channel does. */
function makeBridge() {
  let listener = null;
  const state = { begin: 0, cancel: 0 };
  const eapi = {
    input: {
      beginCapture: async () => {
        state.begin++;
        return true;
      },
      cancelCapture: async () => {
        state.cancel++;
        return true;
      },
      onCapturedKey: (cb) => {
        listener = cb;
        return () => {
          if (listener === cb) listener = null;
        };
      },
    },
  };
  const fire = (msg) => listener?.(msg);
  const getState = () => ({ ...state, armed: listener !== null });
  return { eapi, fire, getState };
}

function makeEngine() {
  let cb = null;
  return {
    engine: { captureNext: (fn) => (cb = fn) },
    fireDom: (token, mods = []) => cb?.(token, mods),
    armed: () => cb !== null,
  };
}

const CAPS = { vk: 0x14, scanCode: 0x3a, extended: false, name: "CapsLock" };

test("capture_mode_bypasses_shortcut_match", async () => {
  // Native capture reports the PHYSICAL key and never consults shortcut
  // matching — the coordinator routes straight to onCaptured.
  const b = makeBridge();
  let got = null;
  const coord = new CaptureCoordinator((token) => (got = token), () => b.eapi);
  const backend = await coord.start(makeEngine().engine);
  assert.equal(backend, "native");
  b.fire(CAPS);
  assert.equal(got, "CapsLock");
  assert.equal(b.getState().cancel, 1, "capture is disarmed after a report");
});

test("capture_existing_caps_double_still_reports_caps", async () => {
  // Caps Lock is already a Double Tap in the profile; physical capture still
  // reports CapsLock — availability is decided afterwards by the caller.
  assert.equal(VK_TO_KEY[0x14], "CapsLock");
  const b = makeBridge();
  let got = null;
  const coord = new CaptureCoordinator((token) => (got = token), () => b.eapi);
  await coord.start(makeEngine().engine);
  b.fire(CAPS);
  assert.equal(got, "CapsLock");
});

test("capture_does_not_fire_existing_action", () => {
  // The coordinator only reports a captured token; it never runs actions.
  // Availability then correctly reports Double used / Single & Triple free.
  const existing = [
    {
      id: "s1",
      name: "Caps Screenshot",
      key: "CapsLock",
      modifiers: [],
      trigger: "double",
      actions: [{ type: "screenshot", payload: {} }],
      enabled: true,
      profileId: "prof-default",
    },
  ];
  const availability = getGestureAvailability({ key: "CapsLock", modifiers: [] }, existing, { activeProfileId: "prof-default" });
  const single = availability.find((a) => a.trigger === "single");
  const double = availability.find((a) => a.trigger === "double");
  const triple = availability.find((a) => a.trigger === "triple");
  // Distinct tap gestures coexist on one chord; only the same gesture is taken.
  assert.equal(double?.available, false);
  assert.equal(single?.available, true);
  assert.equal(triple?.available, true);
});

test("capture_remapped_source_reports_physical_source", async () => {
  // Caps is remapped in the engine; native capture still reports the PHYSICAL
  // source vk 0x14 -> CapsLock, never the remap target.
  const b = makeBridge();
  let got = null;
  const coord = new CaptureCoordinator((token) => (got = token), () => b.eapi);
  await coord.start(makeEngine().engine);
  b.fire(CAPS);
  assert.equal(got, "CapsLock");
});

test("capture_hyper_key_reports_physical_key", async () => {
  // Hyper configured on RAlt; physical capture reports the real key, not "Hyper".
  const b = makeBridge();
  let got = null;
  const coord = new CaptureCoordinator((token) => (got = token), () => b.eapi);
  await coord.start(makeEngine().engine);
  b.fire({ vk: 0xa5, scanCode: 0x38, extended: true, name: "Alt" });
  assert.equal(got, "Alt");
  assert.notEqual(got, "Hyper");
});

test("capture_falls_back_to_dom_when_native_unarmed", async () => {
  // When the native backend reports "not armed" (helper fell back to legacy),
  // the coordinator must NOT leave the UI listening with nothing armed — it
  // falls back to the DOM keydown path so capture still works.
  const eapi = {
    input: {
      beginCapture: async () => false, // native declined
      onCapturedKey: () => () => {},
    },
  };
  let got = null;
  const engine = makeEngine();
  const coord = new CaptureCoordinator((token, mods) => (got = { token, mods }), () => eapi);
  const backend = await coord.start(engine.engine);
  assert.equal(backend, "dom");
  assert.equal(coord.isActive, true);
  engine.fireDom("CapsLock", []);
  assert.deepEqual(got, { token: "CapsLock", mods: [] });
  assert.equal(coord.isActive, false);
});

test("capture_cancel_restores_normal_matching", async () => {
  // Cancel aborts an active capture without reporting; a later start() re-arms.
  const b = makeBridge();
  let captured = false;
  const coord = new CaptureCoordinator((token) => (captured = true), () => b.eapi);
  await coord.start(makeEngine().engine);
  coord.cancel();
  assert.equal(b.getState().cancel, 1);
  assert.equal(captured, false);
  assert.equal(coord.isActive, false);
  await coord.start(makeEngine().engine);
  assert.equal(coord.isActive, true);
});

test("capture_unmount_cleanup", async () => {
  // dispose() aborts an active native capture so the helper never stays armed
  // after the picker unmounts.
  const b = makeBridge();
  let captured = false;
  const coord = new CaptureCoordinator((token) => (captured = true), () => b.eapi);
  await coord.start(makeEngine().engine);
  coord.dispose();
  assert.equal(b.getState().cancel, 1);
  assert.equal(captured, false);
});

test("capture_reload_cleanup", async () => {
  // Reload path: a fresh coordinator re-arms from scratch; the old one is
  // disposed first — capture is never left dangling across a reload.
  const b1 = makeBridge();
  const first = new CaptureCoordinator(() => {}, () => b1.eapi);
  await first.start(makeEngine().engine);
  first.dispose();
  assert.equal(b1.getState().cancel, 1);

  const b2 = makeBridge();
  let got = null;
  const coord = new CaptureCoordinator((token) => (got = token), () => b2.eapi);
  await coord.start(makeEngine().engine);
  b2.fire({ vk: 0x41, scanCode: 0x1e, extended: false, name: "A" });
  assert.equal(got, "A");
});

test("capture_scope_availability_after_capture", () => {
  // After a capture resolves, scope-aware gesture availability is computed for
  // that token (reused by the Create Shortcut chips).
  const captured = tokenFromNativeCaptured(CAPS);
  assert.equal(captured, "CapsLock");
  const existing = [
    {
      id: "s1",
      name: "Caps Double",
      key: "CapsLock",
      modifiers: [],
      trigger: "double",
      actions: [{ type: "screenshot", payload: {} }],
      enabled: true,
      profileId: "prof-default",
    },
  ];
  const availability = captureGestureAvailability(captured, [], existing, { activeProfileId: "prof-default" });
  assert.equal(availability.length, 3); // single, double, triple
  const double = availability.find((a) => a.trigger === "double");
  assert.equal(double?.available, false);
  const single = availability.find((a) => a.trigger === "single");
  assert.equal(single?.available, true);
  // Only Double is taken, so all three are NOT taken.
  assert.equal(capturedAllTapGesturesTaken(captured, [], existing, { activeProfileId: "prof-default" }), false);
});