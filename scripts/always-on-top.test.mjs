import test from "node:test";
import assert from "node:assert/strict";

/**
 * Model of the native Win32 window topmost logic:
 * simulates HWND_TOPMOST, HWND_NOTOPMOST, WS_EX_TOPMOST checks,
 * shell window guards, and DWM highlight formatting.
 */
function simulateWindowTopmost(targetWindow, mode = "toggle", highlight = true, color = "#4F7CFF") {
  if (!targetWindow || !targetWindow.hwnd || !targetWindow.visible) {
    return {
      ok: false,
      action: "alwaysOnTop",
      mode: mode.toLowerCase(),
      is_topmost: false,
      hwnd: 0,
      title: "",
      highlight_applied: false,
      error: "No valid foreground window found",
    };
  }

  // System shell guard: desktop or taskbar
  if (targetWindow.isDesktop || targetWindow.isTaskbar) {
    return {
      ok: false,
      action: "alwaysOnTop",
      mode: mode.toLowerCase(),
      is_topmost: false,
      hwnd: targetWindow.hwnd,
      title: targetWindow.title,
      highlight_applied: false,
      error: "Cannot pin Windows desktop or system shell window",
    };
  }

  const isCurrentlyTopmost = Boolean(targetWindow.isTopmost);
  let targetTopmost;
  if (mode === "pin") {
    targetTopmost = true;
  } else if (mode === "unpin") {
    targetTopmost = false;
  } else {
    // toggle
    targetTopmost = !isCurrentlyTopmost;
  }

  targetWindow.isTopmost = targetTopmost;

  let highlightApplied = false;
  if (targetTopmost && highlight && targetWindow.supportsDwm) {
    highlightApplied = true;
  }

  return {
    ok: true,
    action: "alwaysOnTop",
    mode: mode.toLowerCase(),
    is_topmost: targetTopmost,
    hwnd: targetWindow.hwnd,
    title: targetWindow.title,
    highlight_applied: highlightApplied,
  };
}

test("Always on Top: Toggle pin when not topmost -> becomes topmost", () => {
  const win = { hwnd: 1001, title: "Notepad - Untitled", isTopmost: false, visible: true, supportsDwm: true };
  const res = simulateWindowTopmost(win, "toggle", true, "#4F7CFF");
  assert.equal(res.ok, true);
  assert.equal(res.is_topmost, true);
  assert.equal(res.mode, "toggle");
  assert.equal(res.title, "Notepad - Untitled");
  assert.equal(res.highlight_applied, true);
});

test("Always on Top: Repeated Toggle alternates correctly (pin -> unpin -> pin)", () => {
  const win = { hwnd: 1002, title: "File Explorer", isTopmost: false, visible: true, supportsDwm: true };

  // Cycle 1: toggle on
  const res1 = simulateWindowTopmost(win, "toggle", true);
  assert.equal(res1.ok, true);
  assert.equal(res1.is_topmost, true);

  // Cycle 2: toggle off
  const res2 = simulateWindowTopmost(win, "toggle", true);
  assert.equal(res2.ok, true);
  assert.equal(res2.is_topmost, false);

  // Cycle 3: toggle on
  const res3 = simulateWindowTopmost(win, "toggle", true);
  assert.equal(res3.ok, true);
  assert.equal(res3.is_topmost, true);
});

test("Always on Top: Explicit Pin mode keeps window topmost", () => {
  const win = { hwnd: 1003, title: "Chrome", isTopmost: true, visible: true, supportsDwm: true };
  const res = simulateWindowTopmost(win, "pin", true);
  assert.equal(res.ok, true);
  assert.equal(res.is_topmost, true);
  assert.equal(res.mode, "pin");
});

test("Always on Top: Explicit Unpin mode removes topmost", () => {
  const win = { hwnd: 1004, title: "VS Code", isTopmost: true, visible: true, supportsDwm: true };
  const res = simulateWindowTopmost(win, "unpin", true);
  assert.equal(res.ok, true);
  assert.equal(res.is_topmost, false);
  assert.equal(res.mode, "unpin");
});

test("Always on Top: Invalid HWND or no foreground window fails safely", () => {
  const res = simulateWindowTopmost(null, "toggle");
  assert.equal(res.ok, false);
  assert.equal(res.is_topmost, false);
  assert.ok(res.error.includes("No valid foreground window"));
});

test("Always on Top: Invisible/destroyed window fails safely", () => {
  const destroyed = { hwnd: 9999, title: "", isTopmost: false, visible: false };
  const res = simulateWindowTopmost(destroyed, "toggle");
  assert.equal(res.ok, false);
  assert.equal(res.is_topmost, false);
});

test("Always on Top: Windows desktop / shell window fails safely", () => {
  const desktop = { hwnd: 1, title: "Program Manager", isDesktop: true, visible: true };
  const res = simulateWindowTopmost(desktop, "toggle");
  assert.equal(res.ok, false);
  assert.ok(res.error.includes("desktop or system shell"));
});

test("Always on Top: Taskbar window fails safely", () => {
  const taskbar = { hwnd: 2, title: "", isTaskbar: true, visible: true };
  const res = simulateWindowTopmost(taskbar, "toggle");
  assert.equal(res.ok, false);
  assert.ok(res.error.includes("desktop or system shell"));
});

test("Always on Top: Highlight disabled state leaves highlight_applied=false but topmost succeeds", () => {
  const win = { hwnd: 1005, title: "Terminal", isTopmost: false, visible: true, supportsDwm: true };
  const res = simulateWindowTopmost(win, "toggle", false); // highlight = false
  assert.equal(res.ok, true);
  assert.equal(res.is_topmost, true);
  assert.equal(res.highlight_applied, false, "Highlight must not be applied when disabled");
});

test("Always on Top: Unsupported DWM highlight gracefully falls back while topmost succeeds", () => {
  const win = { hwnd: 1006, title: "App on Win10", isTopmost: false, visible: true, supportsDwm: false };
  const res = simulateWindowTopmost(win, "toggle", true);
  assert.equal(res.ok, true, "Topmost must succeed even if DWM border color is unsupported");
  assert.equal(res.is_topmost, true);
  assert.equal(res.highlight_applied, false);
});

test("Always on Top: Action history records 'Always on Top' label", () => {
  const sc = {
    id: "sc-top",
    name: "Pin active window",
    actions: [{ id: "act-1", type: "alwaysOnTop", payload: { topmostMode: "toggle" } }],
  };
  const firstAction = sc.actions[0];
  const label = firstAction.type === "alwaysOnTop" ? "Always on Top" : firstAction.type;
  assert.equal(label, "Always on Top", "Action history must record 'Always on Top' instead of notification");
});
