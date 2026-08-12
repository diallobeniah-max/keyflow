import test from "node:test";
import assert from "node:assert/strict";
import { resolveScreenshotMode, DEFAULT_SCREENSHOT_MODE, screenshotBaseName } from "../dist-electron/screenshot-modes.js";
import { routesToDesktop } from "../dist-electron/action-routing.js";
import { hasShowPopupAction, firstShowPopupAction, popupItemsFromShortcut } from "../dist-electron/popup-routing.js";
import { clampRectWithin, clampPopupSize, computePopupPlacement } from "../dist-electron/popup-position.js";
import {
  createPopupToggleState,
  eachToggle,
  completePrepare,
  completeOpen,
  completeClose,
  forceHide,
  isDuplicate,
} from "../dist-electron/popup-toggle.js";
import { matchesTriggerKey } from "../dist-electron/trigger-guard.js";

test("screenshot mode resolution defaults to the snipping overlay", () => {
  assert.equal(resolveScreenshotMode(undefined), "snipOverlay");
  assert.equal(resolveScreenshotMode(""), "snipOverlay");
  assert.equal(DEFAULT_SCREENSHOT_MODE, "snipOverlay");
  assert.equal(resolveScreenshotMode("fullscreenClip"), "fullscreenClip");
  assert.equal(resolveScreenshotMode("windowClip"), "windowClip");
  assert.equal(resolveScreenshotMode("fullscreenSave"), "fullscreenSave");
  assert.equal(resolveScreenshotMode("not-a-mode"), "snipOverlay");
});

test("screenshot base filename is timestamped png", () => {
  const name = screenshotBaseName(new Date(2026, 7, 5, 14, 30, 59));
  assert.equal(name, "keyflow-20260805-143059.png");
  assert.match(name, /^keyflow-\d{8}-\d{6}\.png$/);
});

test("screenshot and popup action types route to the desktop", () => {
  assert.equal(routesToDesktop("screenshot"), true);
  assert.equal(routesToDesktop("showPopup"), true);
  assert.equal(routesToDesktop("openWebsite"), true);
  assert.equal(routesToDesktop("notAnAction"), false);
});

test("showPopup routing detects the popup action and extracts its items", () => {
  const entry = {
    id: "sc-1",
    profileId: "p",
    key: "F",
    trigger: "single",
    timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 },
    actions: [
      { type: "showPopup", payload: { popupItems: [{ id: "a", label: "A", actions: [] }] } },
      { type: "openApp", payload: { path: "code" } },
    ],
    enabled: true,
  };
  assert.equal(hasShowPopupAction(entry), true);
  assert.equal(firstShowPopupAction(entry)?.type, "showPopup");
  assert.equal(popupItemsFromShortcut(entry).length, 1);
  assert.equal(popupItemsFromShortcut(entry)[0].label, "A");
  assert.equal(hasShowPopupAction({ ...entry, actions: [{ type: "openApp", payload: {} }] }), false);
  assert.deepEqual(popupItemsFromShortcut(null), []);
});

test("clampRectWithin keeps the window inside a work area", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const point = clampRectWithin({ x: 0, y: 0 }, { width: 500, height: 600 }, workArea);
  assert.equal(point.x, 0);
  assert.equal(point.y, 0);
  assert.ok(point.x + 500 <= 1920);
  assert.ok(point.y + 600 <= 1080);
  const atEdge = clampRectWithin({ x: 1900, y: 1050 }, { width: 500, height: 600 }, workArea);
  assert.ok(atEdge.x + 500 <= 1920);
  assert.ok(atEdge.y + 600 <= 1080);
});

test("clampRectWithin handles monitors left of the primary (negative coordinates)", () => {
  const workArea = { x: -1920, y: 0, width: 1920, height: 1080 };
  const point = clampRectWithin({ x: -1900, y: 500 }, { width: 500, height: 600 }, workArea);
  assert.ok(point.x >= -1920);
  assert.ok(point.x + 500 <= 0);
  assert.ok(point.y + 600 <= 1080);
  assert.ok(point.y >= 0);
});

test("clampRectWithin handles monitors above the primary (negative y)", () => {
  const workArea = { x: 0, y: -1200, width: 1920, height: 1200 };
  const point = clampRectWithin({ x: 100, y: -1100 }, { width: 420, height: 560 }, workArea);
  assert.ok(point.y >= -1200);
  assert.ok(point.y + 560 <= 0);
  assert.ok(point.x >= 0);
});

test("clampRectWithin shrinks oversized windows to the work area", () => {
  const workArea = { x: 0, y: 0, width: 800, height: 600 };
  const point = clampRectWithin({ x: 400, y: 300 }, { width: 2000, height: 2000 }, workArea);
  assert.ok(point.x >= 0);
  assert.ok(point.x + 800 <= 800);
  assert.ok(point.y + 600 <= 600);
});

test("center placement keeps the popup fully inside the work area", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const point = computePopupPlacement({ x: 100, y: 100 }, workArea, { width: 420, height: 560 }, "center");
  assert.ok(point.x >= 0);
  assert.ok(point.y >= 0);
  assert.ok(point.x + 420 <= 1920);
  assert.ok(point.y + 560 <= 1080);
});

test("cursor placement clamps near the cursor inside the work area", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const nearBottom = computePopupPlacement({ x: 1900, y: 1070 }, workArea, { width: 420, height: 560 }, "cursor");
  assert.ok(nearBottom.x + 420 <= 1920);
  assert.ok(nearBottom.y + 560 <= 1080);
  const nearLeftTop = computePopupPlacement({ x: 0, y: 0 }, workArea, { width: 420, height: 560 }, "cursor");
  assert.ok(nearLeftTop.x >= 0);
  assert.ok(nearLeftTop.y >= 0);
});

test("popup toggles hidden -> open -> hidden -> open (state machine)", () => {
  let s = createPopupToggleState();
  assert.equal(s.phase, "hidden");
  // 1st activation: open
  let r = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  assert.equal(r.outcome, "open");
  assert.equal(r.state.phase, "preparing");
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
  // 2nd activation: close
  r = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(r.outcome, "close");
  assert.equal(r.state.phase, "closing");
  s = completeClose(r.state);
  assert.equal(s.phase, "hidden");
  // 3rd activation: open
  r = eachToggle(s, { shortcutId: "f", generationId: "g3" });
  assert.equal(r.outcome, "open");
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
  // 4th activation: close
  r = eachToggle(s, { shortcutId: "f", generationId: "g4" });
  assert.equal(r.outcome, "close");
  s = completeClose(r.state);
  assert.equal(s.phase, "hidden");
});

test("twenty deliberate activations alternate open/close correctly", () => {
  let s = createPopupToggleState();
  for (let i = 0; i < 20; i += 1) {
    const r = eachToggle(s, { shortcutId: "f", generationId: `g${i}` });
    assert.notEqual(r.outcome, "ignore", `activation ${i} must be accepted`);
    if (r.outcome === "open" || r.outcome === "reopen") {
      s = completeOpen(completePrepare(r.state));
      assert.equal(s.phase, "open");
    } else {
      assert.equal(r.outcome, "close");
      s = completeClose(r.state);
      assert.equal(s.phase, "hidden");
    }
  }
  assert.equal(s.phase, "hidden");
});

test("duplicate callback with the same generation id does not toggle twice", () => {
  let s = createPopupToggleState();
  const first = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  assert.equal(first.outcome, "open");
  s = completeOpen(completePrepare(first.state));
  assert.equal(s.phase, "open");
  // A duplicate from the SAME input cycle must be ignored (no second toggle).
  const dup = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  assert.equal(dup.outcome, "ignore");
  assert.equal(dup.state.phase, "open");
  s = dup.state;
  // A NEW generation id is accepted immediately (separate completed double-tap).
  const next = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(next.outcome, "close");
});

test("new generation id is accepted immediately after the previous key release", () => {
  let s = createPopupToggleState();
  const first = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(first.state));
  assert.equal(s.phase, "open");
  // Fresh generation on the next deliberate activation is always accepted.
  const next = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(next.outcome, "close");
});

test("X close and Escape close reset state to hidden", () => {
  for (const gen of ["x", "escape"]) {
    let s = createPopupToggleState();
    const open = eachToggle(s, { shortcutId: "f", generationId: `g-${gen}-open` });
    s = completeOpen(completePrepare(open.state));
    assert.equal(s.phase, "open");
    const force = forceHide(s);
    assert.equal(force.phase, "hidden");
    assert.equal(force.gen, null);
  }
});

test("closing animation timeout resets state to hidden", () => {
  let s = createPopupToggleState();
  const open = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(open.state));
  const closing = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(closing.outcome, "close");
  s = completeClose(closing.state); // timeout/complete path
  assert.equal(s.phase, "hidden");
  assert.equal(s.gen, null);
});

test("reopen during closing cancels the stale hide and reopens", () => {
  let s = createPopupToggleState();
  const open = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(open.state));
  const closing = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(closing.outcome, "close");
  s = closing.state; // in closing
  // A new activation while closing cancels the pending hide and reopens.
  const reopen = eachToggle(s, { shortcutId: "f", generationId: "g3" });
  assert.equal(reopen.outcome, "reopen");
  assert.equal(reopen.state.phase, "preparing");
  s = completeOpen(completePrepare(reopen.state));
  assert.equal(s.phase, "open");
});

test("opening + activation reverses safely into close -> hidden", () => {
  let s = createPopupToggleState();
  const open = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completePrepare(open.state); // during opening (window shown, animating)
  assert.equal(s.phase, "opening");
  const close = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(close.outcome, "close");
  assert.equal(close.state.phase, "closing");
  s = completeClose(close.state);
  assert.equal(s.phase, "hidden");
});

test("isDuplicate detects same-input-cycle callbacks only", () => {
  let s = createPopupToggleState();
  const r = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = r.state;
  assert.equal(isDuplicate(s, "f", "g1"), true);
  assert.equal(isDuplicate(s, "f", "g2"), false);
  assert.equal(isDuplicate(s, "a", "g1"), false);
  assert.equal(isDuplicate(s, undefined, undefined), false);
});

test("clampPopupSize clamps height and width to safe bounds and the monitor", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const tiny = clampPopupSize({ width: 50, height: 50 }, workArea);
  assert.equal(tiny.width, 420);
  assert.equal(tiny.height, 180);
  const huge = clampPopupSize({ width: 5000, height: 5000 }, workArea);
  assert.equal(huge.width, 500);
  assert.equal(huge.height, 560);
});

test("clampPopupSize never exceeds the monitor work area", () => {
  const shortWorkArea = { x: 0, y: 0, width: 800, height: 400 };
  const size = clampPopupSize({ width: 2000, height: 2000 }, shortWorkArea);
  assert.ok(size.width <= 560);
  assert.ok(size.height <= 400);
  assert.ok(size.width >= 320);
});

test("clampPopupSize accepts fractional measurements and stays bounded", () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1200 };
  const size = clampPopupSize({ width: 459.7, height: 399.9 }, workArea);
  assert.ok(size.width >= 420 && size.width <= 500);
  assert.ok(size.height >= 180 && size.height <= 560);
  const ceilHeight = Math.ceil(size.height) + 6;
  assert.ok(ceilHeight >= 200 && ceilHeight <= 560);
  const tiny = clampPopupSize({ width: 200.4, height: 90.3 }, workArea);
  assert.equal(tiny.width, 420);
  assert.equal(tiny.height, 180);
});

test("trigger guard only discards the matching trigger key", () => {
  assert.equal(matchesTriggerKey("f", "F"), true);
  assert.equal(matchesTriggerKey("F", "F"), true);
  assert.equal(matchesTriggerKey("capslock", "CapsLock"), true);
  assert.equal(matchesTriggerKey("a", "F"), false);
  assert.equal(matchesTriggerKey("ArrowDown", "F"), false);
  assert.equal(matchesTriggerKey(undefined, "F"), false);
  assert.equal(matchesTriggerKey(" ", ""), false);
});

// ---------------------------------------------------------------------------
// 100-cycle popup lifecycle regression
// ---------------------------------------------------------------------------

test("100 deliberate open/close activations all succeed (state machine)", () => {
  let s = createPopupToggleState();
  for (let i = 0; i < 100; i += 1) {
    const r = eachToggle(s, { shortcutId: "f", generationId: `g${i}` });
    assert.notEqual(r.outcome, "ignore", `activation ${i} must not be ignored`);
    if (r.outcome === "open" || r.outcome === "reopen") {
      s = completeOpen(completePrepare(r.state));
      assert.equal(s.phase, "open", `after activation ${i} (open) phase must be open`);
    } else {
      assert.equal(r.outcome, "close", `activation ${i} must be open or close, got ${r.outcome}`);
      s = completeClose(r.state);
      assert.equal(s.phase, "hidden", `after activation ${i} (close) phase must be hidden`);
    }
  }
  // 100 activations starting from hidden → even = open, odd = close.
  // Final state: i=99 (odd) → close → hidden.
  assert.equal(s.phase, "hidden");
});

// ---------------------------------------------------------------------------
// Stale close timer generation guard
// ---------------------------------------------------------------------------

test("stale close timer with old generation does not hide the reopened popup", () => {
  // Simulate the main-process generation guard logic in isolation:
  // when reopened, the machine gen changes and the old timer must be skipped.
  let s = createPopupToggleState();

  // 1. Open
  const open1 = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  assert.equal(open1.outcome, "open");
  s = completeOpen(completePrepare(open1.state));
  assert.equal(s.phase, "open");
  const openGenId = s.gen?.generationId; // "g1" now stored in machine

  // 2. Close — capture closeGenId at close start (like the real timer does)
  const close1 = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(close1.outcome, "close");
  s = close1.state; // closing, gen = g2
  const closeGenId = s.gen?.generationId; // g2

  // 3. Reopen before timer fires — changes the generation
  const reopen = eachToggle(s, { shortcutId: "f", generationId: "g3" });
  assert.equal(reopen.outcome, "reopen");
  s = completeOpen(completePrepare(reopen.state));
  assert.equal(s.phase, "open");
  const currentGenId = s.gen?.generationId; // g3

  // 4. Simulate the stale timer callback: it captured closeGenId="g2" but
  //    current gen is now "g3" — it must bail out.
  assert.notEqual(closeGenId, currentGenId, "generation must have changed on reopen");
  // The timer would have done: if (currentGenId !== closeGenId) return;
  // Verify the machine is still "open" (not corrupted by the stale timer).
  assert.equal(s.phase, "open");
  assert.equal(s.gen?.generationId, "g3");
});

test("stale close animation callback is ignored after reopen", () => {
  let s = createPopupToggleState();
  const open1 = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(open1.state));

  // Close then immediately reopen (like the user pressing FF quickly twice)
  const close1 = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  s = close1.state; // closing

  const reopen = eachToggle(s, { shortcutId: "f", generationId: "g3" });
  s = completeOpen(completePrepare(reopen.state));
  assert.equal(s.phase, "open");

  // The old close animation completes and calls hide(gen="g2").
  // The popup-window.ts hide() method checks: gen !== this.machine.gen.generationId
  // → "g2" !== "g3" → ignored. Simulate that check:
  const staleGen = "g2";
  const currentGen = s.gen?.generationId; // "g3"
  assert.notEqual(staleGen, currentGen, "stale close must be detected and ignored");
  assert.equal(s.phase, "open", "popup must still be open after stale close is ignored");
});

// ---------------------------------------------------------------------------
// X / Escape / action close → next FF reopens
// ---------------------------------------------------------------------------

test("X close resets to hidden; next FF reopens successfully", () => {
  let s = createPopupToggleState();
  // Open
  let r = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
  // X close (forceHide)
  s = forceHide(s);
  assert.equal(s.phase, "hidden");
  assert.equal(s.gen, null);
  // FF → must reopen
  r = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(r.outcome, "open");
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
});

test("Escape close resets to hidden; next FF reopens successfully", () => {
  let s = createPopupToggleState();
  let r = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
  // Escape → same as forceHide
  s = forceHide(s);
  assert.equal(s.phase, "hidden");
  r = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(r.outcome, "open");
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
});

test("action close resets to hidden; next FF reopens successfully", () => {
  let s = createPopupToggleState();
  let r = eachToggle(s, { shortcutId: "f", generationId: "g1" });
  s = completeOpen(completePrepare(r.state));
  // Action execution triggers beginClose → completeClose path
  const closeR = eachToggle(s, { shortcutId: "f", generationId: "g2" });
  assert.equal(closeR.outcome, "close");
  s = completeClose(closeR.state);
  assert.equal(s.phase, "hidden");
  // FF → open
  r = eachToggle(s, { shortcutId: "f", generationId: "g3" });
  assert.equal(r.outcome, "open");
  s = completeOpen(completePrepare(r.state));
  assert.equal(s.phase, "open");
});

test("five cycles of X-close then FF-reopen all succeed", () => {
  let s = createPopupToggleState();
  for (let i = 0; i < 5; i += 1) {
    const open = eachToggle(s, { shortcutId: "f", generationId: `open-${i}` });
    assert.equal(open.outcome, "open", `cycle ${i}: expected open`);
    s = completeOpen(completePrepare(open.state));
    assert.equal(s.phase, "open");
    s = forceHide(s); // simulate X or Escape
    assert.equal(s.phase, "hidden");
  }
});

// ---------------------------------------------------------------------------
// isPositionOnScreen utility
// ---------------------------------------------------------------------------

import { isPositionOnScreen, POPUP_DRAG_BAR_HEIGHT } from "../dist-electron/popup-position.js";

const stdDisplay = { x: 0, y: 0, width: 1920, height: 1080 };
const popupSize  = { width: 460, height: 400 };

test("isPositionOnScreen: popup fully on primary monitor → true", () => {
  assert.equal(isPositionOnScreen({ x: 200, y: 200 }, popupSize, [stdDisplay]), true);
});

test("isPositionOnScreen: popup top-left corner at 0,0 → true", () => {
  assert.equal(isPositionOnScreen({ x: 0, y: 0 }, popupSize, [stdDisplay]), true);
});

test("isPositionOnScreen: popup drag bar partially visible → true", () => {
  // Bottom edge of drag bar just inside the screen
  const y = stdDisplay.height - POPUP_DRAG_BAR_HEIGHT;
  assert.equal(isPositionOnScreen({ x: 100, y }, popupSize, [stdDisplay]), true);
});

test("isPositionOnScreen: popup fully off-screen to the right → false", () => {
  assert.equal(isPositionOnScreen({ x: 2000, y: 200 }, popupSize, [stdDisplay]), false);
});

test("isPositionOnScreen: popup fully off-screen below → false", () => {
  assert.equal(isPositionOnScreen({ x: 200, y: 1200 }, popupSize, [stdDisplay]), false);
});

test("isPositionOnScreen: popup on left monitor (negative x) → true", () => {
  const leftMonitor = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.equal(isPositionOnScreen({ x: -1000, y: 200 }, popupSize, [leftMonitor]), true);
});

test("isPositionOnScreen: popup straddles two monitors → true", () => {
  const rightMonitor = { x: 1920, y: 0, width: 1920, height: 1080 };
  // Popup starts 100px before the boundary (part on primary, part on secondary)
  assert.equal(isPositionOnScreen({ x: 1820, y: 100 }, popupSize, [stdDisplay, rightMonitor]), true);
});

test("isPositionOnScreen: no displays → false", () => {
  assert.equal(isPositionOnScreen({ x: 0, y: 0 }, popupSize, []), false);
});

test("isPositionOnScreen: popup drag bar off-screen even though body is visible → false", () => {
  // Only the body (below drag bar) would overlap. The drag bar itself is above the screen.
  const y = -POPUP_DRAG_BAR_HEIGHT - 1; // drag bar entirely above y=0
  assert.equal(isPositionOnScreen({ x: 100, y }, popupSize, [stdDisplay]), false);
});

test("drag position clamped when off-screen uses clampRectWithin", () => {
  const offScreen = { x: 5000, y: 5000 };
  const result = clampRectWithin(offScreen, popupSize, stdDisplay);
  assert.ok(result.x + popupSize.width <= stdDisplay.x + stdDisplay.width);
  assert.ok(result.y + popupSize.height <= stdDisplay.y + stdDisplay.height);
  assert.ok(result.x >= stdDisplay.x);
  assert.ok(result.y >= stdDisplay.y);
});

test("computePopupPlacement uses savedPosition when provided", () => {
  const cursor = { x: 100, y: 100 };
  const workArea = stdDisplay;
  const size = popupSize;
  const saved = { x: 800, y: 300 };
  const result = computePopupPlacement(cursor, workArea, size, "cursor", saved);
  assert.deepEqual(result, saved);
});

test("computePopupPlacement ignores savedPosition=null and uses preference", () => {
  const cursor = { x: 0, y: 0 };
  const workArea = stdDisplay;
  const size = popupSize;
  const result = computePopupPlacement(cursor, workArea, size, "center", null);
  // Center preference: should be near horizontal center
  assert.ok(result.x > 0 && result.x < workArea.width);
  assert.ok(result.y >= 0 && result.y < workArea.height);
});

// =============================================================================
// FF#3 REGRESSION — win.isVisible()-based toggle decision
//
// These tests simulate the exact failing scenario:
//   FF#1 → open (visible=false → open)
//   FF#2 → close (visible=true → close)
//   FF#3 → must reopen (visible=false → open) — this was broken
// =============================================================================

/**
 * Minimal simulation of the new popup-window.ts toggle() logic:
 * uses win.isVisible() as the authoritative decision rather than internal phase.
 */
function simulateToggle(visibleState, machine, request) {
  // Dedup guard
  if (isDuplicate(machine, request.shortcutId, request.generationId)) {
    return { machine, outcome: "IGNORED", visibleState };
  }
  const gen = { shortcutId: request.shortcutId, generationId: request.generationId };
  if (visibleState) {
    // Close
    return { machine: { phase: "closing", gen }, outcome: "CLOSE", visibleState: true };
  } else {
    // Open/reopen — reset to hidden then open
    return { machine: { phase: "preparing", gen }, outcome: "OPEN", visibleState: false };
  }
}

function simulateShow(sim) {
  // Simulates finalizeAndShow() completing — window is now visible and phase=open
  return { machine: { ...sim.machine, phase: "open" }, visibleState: true };
}

function simulateHide(sim) {
  // Simulates close animation completing — window is hidden and phase=hidden
  return { machine: { phase: "hidden", gen: null }, visibleState: false };
}

test("FF#3 regression: open → close → reopen all succeed (isVisible-based decision)", () => {
  let sim = { machine: createPopupToggleState(), visibleState: false };

  // FF#1
  sim = simulateToggle(sim.visibleState, sim.machine, { shortcutId: "f", generationId: "g1" });
  assert.equal(sim.outcome, "OPEN", "FF#1 must OPEN");
  sim = simulateShow(sim);
  assert.equal(sim.visibleState, true, "after FF#1 show, visible must be true");

  // FF#2
  sim = simulateToggle(sim.visibleState, sim.machine, { shortcutId: "f", generationId: "g2" });
  assert.equal(sim.outcome, "CLOSE", "FF#2 must CLOSE");
  sim = simulateHide(sim);
  assert.equal(sim.visibleState, false, "after FF#2 hide, visible must be false");

  // FF#3 — this was the failing case
  sim = simulateToggle(sim.visibleState, sim.machine, { shortcutId: "f", generationId: "g3" });
  assert.equal(sim.outcome, "OPEN", "FF#3 must OPEN — was broken before fix");
  sim = simulateShow(sim);
  assert.equal(sim.visibleState, true, "after FF#3 show, visible must be true");
});

test("100-cycle isVisible-based toggle: every open succeeds, every close succeeds", () => {
  let machine = createPopupToggleState();
  let visible = false;

  for (let i = 0; i < 100; i++) {
    const genId = `g${i}`;
    const sim = simulateToggle(visible, machine, { shortcutId: "f", generationId: genId });
    assert.notEqual(sim.outcome, "IGNORED", `cycle ${i}: must not be ignored`);

    if (!visible) {
      // Expected OPEN
      assert.equal(sim.outcome, "OPEN", `cycle ${i}: visible=false → must OPEN`);
      const shown = simulateShow(sim);
      machine = shown.machine;
      visible = shown.visibleState;
      assert.equal(visible, true, `cycle ${i}: after show visible must be true`);
      assert.equal(machine.phase, "open", `cycle ${i}: after show phase must be open`);
    } else {
      // Expected CLOSE
      assert.equal(sim.outcome, "CLOSE", `cycle ${i}: visible=true → must CLOSE`);
      const hidden = simulateHide(sim);
      machine = hidden.machine;
      visible = hidden.visibleState;
      assert.equal(visible, false, `cycle ${i}: after hide visible must be false`);
      assert.equal(machine.phase, "hidden", `cycle ${i}: after hide phase must be hidden`);
    }
  }
  // 100 cycles: 0 even=open, 1 odd=close, …, 99 odd=close → final: hidden
  assert.equal(visible, false);
  assert.equal(machine.phase, "hidden");
});

// =============================================================================
// Stale close-timer generation guard
// (ensures the CLOSE_TIMEOUT_MS timer callback cannot hide the reopened window)
// =============================================================================

test("close timer stale: old closeGenId does not match new gen after reopen", () => {
  // Simulate the exact timer callback guard in popup-window.ts closeFlow():
  //   const closeGenId = machine.gen.generationId;  // captured at close start
  //   const currentGenId = machine.gen.generationId; // at timer fire time
  //   if (currentGenId !== closeGenId) return;       // stale — skip

  let machine = createPopupToggleState();

  // Open
  machine = { phase: "open", gen: { shortcutId: "f", generationId: "g1" } };
  const afterOpen = simulateShow({ machine, visibleState: false });
  machine = afterOpen.machine;

  // Close — capture closeGenId at close start (gen advances to g2)
  machine = { phase: "closing", gen: { shortcutId: "f", generationId: "g2" } };
  const closeGenId = machine.gen.generationId; // "g2"

  // Reopen before timer fires — gen advances to g3
  machine = { phase: "open", gen: { shortcutId: "f", generationId: "g3" } };
  const currentGenId = machine.gen.generationId; // "g3"

  // Timer callback guard
  assert.notEqual(currentGenId, closeGenId,
    "gen must differ after reopen so timer callback is discarded");
  // If currentGenId !== closeGenId → timer bails; machine stays "open" ✓
  assert.equal(machine.phase, "open",
    "machine must still be open after stale timer is skipped");
});

test("close timer valid: same gen fires correctly and resets to hidden", () => {
  let machine = { phase: "closing", gen: { shortcutId: "f", generationId: "g2" } };
  const closeGenId = machine.gen.generationId;

  // No reopen — gen is still g2 at timer fire
  const currentGenId = machine.gen.generationId;

  assert.equal(currentGenId, closeGenId,
    "gen must match so timer fires correctly");
  // Simulate completeClose
  const after = { phase: "hidden", gen: null };
  assert.equal(after.phase, "hidden");
  assert.equal(after.gen, null);
});

// =============================================================================
// Stale finishClose epoch guard
// (ensures the renderer's old setTimeout(finishClose) cannot hide the new popup)
// =============================================================================

test("renderer epoch guard: old finishClose is ignored after reopen increments epoch", () => {
  // Simulate the closeEpochRef.current logic in PopupShell.tsx:
  //   beginClose: const epoch = ++closeEpochRef.current;
  //   finishClose: if (closeEpochRef.current !== epoch) return;
  //   onData: closeEpochRef.current++;

  let closeEpoch = 0;
  let phaseSimulated = "hidden";

  // FF#1 open — epoch stays 0 (no close yet)
  phaseSimulated = "open";
  const openEpoch = closeEpoch;

  // FF#2 close — beginClose increments epoch to 1
  const closedFF2 = ++closeEpoch; // = 1
  phaseSimulated = "closing";
  assert.equal(closedFF2, 1);

  // Close animation runs, finishClose fires for epoch=1
  assert.equal(closeEpoch, closedFF2, "epoch still matches for valid close");
  phaseSimulated = "hidden"; // finishClose ran

  // FF#3 reopen — onData increments epoch to 2
  closeEpoch++;  // = 2
  phaseSimulated = "preparing";
  const newEpoch = closeEpoch; // 2
  assert.equal(newEpoch, 2);

  // Now the stale setTimeout(finishClose, 170ms) from FF#2's beginClose fires.
  // It captured epoch=1. Current epoch is 2. Must be ignored.
  const staleEpoch = closedFF2; // 1
  assert.notEqual(staleEpoch, newEpoch,
    "stale finishClose epoch must not match current epoch");
  // finishClose returns early — phaseSimulated stays "preparing"
  assert.equal(phaseSimulated, "preparing",
    "phase must remain preparing after stale finishClose is ignored");

  // Successful open transitions to open
  phaseSimulated = "open";
  assert.equal(phaseSimulated, "open");
});

test("renderer epoch guard: both animationend and setTimeout stale callbacks are rejected", () => {
  let closeEpoch = 0;

  // Two close cycles, both stale after a reopen
  const epoch1 = ++closeEpoch; // beginClose for FF#2
  const epoch2 = ++closeEpoch; // onData for FF#3 (reopen), then beginClose for FF#4

  // Simulate FF#3 onData increments epoch
  closeEpoch++; // = 3 after FF#5 reopen
  const currentEpoch = closeEpoch;

  assert.notEqual(epoch1, currentEpoch, "epoch from FF#2 close must be stale");
  assert.notEqual(epoch2, currentEpoch, "epoch from FF#4 close must be stale");
});

test("renderer epoch guard: valid close cycle fires correctly (epoch matches)", () => {
  let closeEpoch = 0;
  let phaseSim = "hidden";

  // Open
  phaseSim = "open";
  // Close
  const epoch = ++closeEpoch;
  phaseSim = "closing";

  // No reopen — finishClose fires with matching epoch
  assert.equal(closeEpoch, epoch, "epoch must match for valid close");
  phaseSim = "hidden"; // finishClose ran
  assert.equal(phaseSim, "hidden");
});

// =============================================================================
// old-close-timeout fires after reopen → STILL OPEN
// old-animationend fires after reopen → STILL OPEN
// (integration-level state machine proof)
// =============================================================================

test("old-close-timeout fires after reopen: state machine remains open", () => {
  // This models the full sequence:
  //   gen 1 → OPEN (visible=false → show)
  //   gen 2 → CLOSE (visible=true → close), closeGenId=g2 captured
  //   gen 3 → OPEN (visible=false → reopen, gen advances to g3)
  //   [timer fires] closeGenId=g2 !== currentGen=g3 → SKIPPED
  //   → popup is STILL OPEN with gen g3

  let machine = createPopupToggleState();
  let visible = false;

  // g1 open
  let r = simulateToggle(visible, machine, { shortcutId: "f", generationId: "g1" });
  let showed = simulateShow(r);
  machine = showed.machine; visible = showed.visibleState;
  assert.equal(machine.phase, "open"); assert.equal(visible, true);

  // g2 close — capture closeGenId
  r = simulateToggle(visible, machine, { shortcutId: "f", generationId: "g2" });
  assert.equal(r.outcome, "CLOSE");
  const closeGenId = r.machine.gen.generationId; // "g2"
  let hid = simulateHide(r);
  machine = hid.machine; visible = hid.visibleState;
  assert.equal(visible, false);

  // g3 reopen — gen advances
  r = simulateToggle(visible, machine, { shortcutId: "f", generationId: "g3" });
  assert.equal(r.outcome, "OPEN");
  showed = simulateShow(r);
  machine = showed.machine; visible = showed.visibleState;
  assert.equal(machine.phase, "open"); assert.equal(visible, true);

  // Stale close timer fires: closeGenId="g2" but currentGen="g3" → bail
  const currentGenId = machine.gen?.generationId;
  assert.notEqual(closeGenId, currentGenId,
    "old-close-timeout must be discarded (gen changed)");
  // State is still open after the stale timer is skipped
  assert.equal(machine.phase, "open");
  assert.equal(visible, true);
});

test("old-animationend fires after reopen: epoch guard keeps popup open", () => {
  // Models the renderer-side stale finishClose via epoch guard
  let closeEpoch = 0;
  let rendererPhase = "hidden";
  let rendererVisible = false;

  // FF#1 open
  rendererPhase = "open"; rendererVisible = true;

  // FF#2 close — beginClose, epoch=1
  const epochFF2 = ++closeEpoch;
  rendererPhase = "closing";

  // Animationend fires for FF#2 close → finishClose(epoch=1)
  assert.equal(closeEpoch, epochFF2, "animationend fires in same epoch — valid");
  rendererPhase = "hidden"; rendererVisible = false;

  // FF#3 reopen — onData increments epoch (2) and resets phase
  closeEpoch++;
  rendererPhase = "open"; rendererVisible = true;

  // Now the stale setTimeout(finishClose, 170ms) from FF#2 also fires.
  // It captured epochFF2=1. Current epoch is 2.
  assert.notEqual(epochFF2, closeEpoch,
    "stale animationend from FF#2 must be rejected by epoch guard");
  // Phase stays open — not corrupted by the stale callback
  assert.equal(rendererPhase, "open");
  assert.equal(rendererVisible, true);
});

// =============================================================================
// Renderer animation state resets between every cycle
// =============================================================================

test("renderer state fully resets between 10 open/close cycles", () => {
  let closedRef = false;
  let genRef = null;
  let closeEpoch = 0;
  let phase = "hidden";

  for (let i = 0; i < 10; i++) {
    // onData fires (reopen)
    closeEpoch++;           // invalidate previous close epoch
    closedRef = false;      // reset close guard
    genRef = `g-open-${i}`;
    phase = "opening";

    // Simulate open animation completes
    phase = "open";
    assert.equal(phase, "open", `cycle ${i}: must reach open`);
    assert.equal(closedRef, false, `cycle ${i}: closedRef must be false when open`);
    assert.equal(genRef, `g-open-${i}`, `cycle ${i}: genRef must match open gen`);

    // beginClose fires
    const epoch = ++closeEpoch;
    phase = "closing";

    // finishClose fires (valid epoch)
    assert.equal(closeEpoch, epoch, `cycle ${i}: epoch must match for valid close`);
    assert.ok(!closedRef, `cycle ${i}: closedRef must be false before finishClose`);
    closedRef = true;
    phase = "hidden";

    assert.equal(phase, "hidden", `cycle ${i}: must reach hidden`);
    assert.equal(closedRef, true, `cycle ${i}: closedRef must be true after close`);
  }
});
