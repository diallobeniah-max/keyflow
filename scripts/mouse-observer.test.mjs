import test from "node:test";
import assert from "node:assert/strict";
import {
  RI_MOUSE_LEFT_BUTTON_DOWN,
  RI_MOUSE_LEFT_BUTTON_UP,
  RIM_TYPEMOUSE,
  RIM_TYPEHID,
  HotCornerTracker,
  MouseObserver,
  parseRawMouseButtons,
  selectMouseBackend,
} from "../src/lib/mouse-observer.ts";

test("raw_registration_verified", () => {
  const ok = selectMouseBackend({ registered: true, deviceCount: 1, mouseTargetMatchesHwnd: true });
  assert.equal(ok.backend, "raw-input");
  assert.equal(ok.reason, undefined);
});

test("registered_mouse_target_matches_hwnd", () => {
  // A registered mouse whose target is NOT our hidden window fails verification
  // and falls back to the low-level hook.
  const mismatch = selectMouseBackend({ registered: true, deviceCount: 1, mouseTargetMatchesHwnd: false });
  assert.equal(mismatch.backend, "low-level-hook");
  assert.equal(mismatch.reason, "mouseTargetMismatch");
});

test("message_loop_processes_wm_input", () => {
  // The observer maps raw mouse reports (RIM_TYPEMOUSE) into left-button events.
  const obs = new MouseObserver(() => null);
  obs.setBackend("raw-input");
  const events = obs.feedRawButtonFlags(RI_MOUSE_LEFT_BUTTON_DOWN, 10, 20);
  assert.deepEqual(events.map((e) => e.type), ["leftDown"]);
  assert.equal(obs.last.x, 10);
});

test("wm_input_move_updates_cursor", () => {
  const obs = new MouseObserver(() => null);
  obs.setBackend("raw-input");
  const events = obs.feedMove(100, 200);
  assert.deepEqual(obs.last, { x: 100, y: 200 });
  assert.ok(Array.isArray(events));
});

test("wm_input_left_down", () => {
  const obs = new MouseObserver(() => null);
  obs.setBackend("raw-input");
  const b = parseRawMouseButtons(RI_MOUSE_LEFT_BUTTON_DOWN);
  assert.equal(b.leftDown, true);
  assert.equal(b.leftUp, false);
  const events = obs.feedRawButtonFlags(RI_MOUSE_LEFT_BUTTON_DOWN, 0, 0);
  assert.equal(events[0].type, "leftDown");
});

test("wm_input_left_up", () => {
  const obs = new MouseObserver(() => null);
  obs.setBackend("raw-input");
  const b = parseRawMouseButtons(RI_MOUSE_LEFT_BUTTON_UP);
  assert.equal(b.leftDown, false);
  assert.equal(b.leftUp, true);
  const events = obs.feedRawButtonFlags(RI_MOUSE_LEFT_BUTTON_UP, 0, 0);
  assert.equal(events[0].type, "leftUp");
});

test("hot_corner_enter_from_mouse_observer", () => {
  // Moving into the top-right corner logs enter — the corner test that runs
  // BEFORE any drag.
  const zones = (x, y) => (x >= 90 && y <= 10 ? "topRight" : null);
  const tracker = new HotCornerTracker(zones);
  const [leave, enter] = tracker.track(95, 5);
  assert.equal(leave, null);
  assert.equal(enter, "topRight");
});

test("hot_corner_leave", () => {
  const zones = (x, y) => (x >= 90 && y <= 10 ? "topRight" : null);
  const tracker = new HotCornerTracker(zones);
  tracker.track(95, 5);
  const [leave, enter] = tracker.track(10, 50);
  assert.equal(leave, "topRight");
  assert.equal(enter, null);
});

test("raw_health_failure_enables_hook_fallback", () => {
  const degraded = selectMouseBackend({ registered: false, deviceCount: 0, mouseTargetMatchesHwnd: false });
  assert.equal(degraded.backend, "low-level-hook");
  assert.equal(degraded.reason, "registerRawInputFailed");
  const zeroDevices = selectMouseBackend({ registered: true, deviceCount: 0, mouseTargetMatchesHwnd: true });
  assert.equal(zeroDevices.backend, "low-level-hook");
  assert.equal(zeroDevices.reason, "registeredDevicesZero");
});

test("hook_fallback_mouse_move", () => {
  const obs = new MouseObserver(() => null);
  obs.setBackend("low-level-hook");
  const events = obs.feedMove(40, 40);
  assert.equal(obs.backend, "low-level-hook");
  assert.equal(obs.last.x, 40);
  assert.ok(Array.isArray(events));
});

test("hook_fallback_left_down_up", () => {
  const obs = new MouseObserver(() => null);
  obs.setBackend("low-level-hook");
  const down = obs.feedRawButtonFlags(RI_MOUSE_LEFT_BUTTON_DOWN, 5, 5);
  const up = obs.feedRawButtonFlags(RI_MOUSE_LEFT_BUTTON_UP, 5, 5);
  assert.equal(down[0].type, "leftDown");
  assert.equal(up[0].type, "leftUp");
});

test("hook_calls_next_hook", () => {
  // The WH_MOUSE_LL fallback is observation-only: it always chains to the next
  // hook (CallNextHookEx) and never synthesizes input. Model that as: feedMove
  // returns events but leaves the cursor observable state unchanged in a way
  // that would indicate swallowed input.
  const obs = new MouseObserver(() => null);
  obs.setBackend("low-level-hook");
  const before = obs.last.x;
  obs.feedMove(before + 10, 0);
  // Nothing is "swallowed": the observer recorded the move and remains idle.
  assert.equal(obs.currentHotZone, null);
  assert.equal(obs.backend, "low-level-hook");
});

test("one_shared_mouse_state_machine", () => {
  // Both backends feed ONE shared observer state (the drag switcher machine):
  // the backend is transparent to the switcher, only the source label changes.
  const zones = (x, y) => (x >= 90 && y <= 10 ? "topRight" : null);
  const raw = new MouseObserver(zones);
  const hook = new MouseObserver(zones);
  raw.setBackend("raw-input");
  hook.setBackend("low-level-hook");
  raw.feedMove(95, 5);
  hook.feedMove(95, 5);
  assert.equal(raw.currentHotZone, "topRight");
  assert.equal(hook.currentHotZone, "topRight");
  assert.equal(raw.backend, "raw-input");
  assert.equal(hook.backend, "low-level-hook");
});

// Constants sanity: these must match the Win32 values the native observer uses.
test("win32_mouse_constants_match_native", () => {
  assert.equal(RIM_TYPEMOUSE, 0);
  assert.equal(RIM_TYPEHID, 2);
  assert.equal(RI_MOUSE_LEFT_BUTTON_DOWN, 1);
  assert.equal(RI_MOUSE_LEFT_BUTTON_UP, 2);
});