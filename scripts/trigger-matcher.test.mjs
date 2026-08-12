import test from "node:test";
import assert from "node:assert/strict";
import { KEY_MAP, TriggerMatcher, nativeKeyName } from "../dist-electron/input/trigger-matcher.js";

const timing = { tapInterval: 100, holdDuration: 30, delay: 0, cooldown: 0 };

function shortcut(id, trigger, key = "A", extra = {}) {
  return {
    id,
    name: id,
    profileId: "profile",
    key,
    modifiers: [],
    trigger,
    timing: { ...timing },
    actions: [],
    enabled: true,
    ...extra,
  };
}

function keyEvent(type, keycode = 30, modifiers = {}) {
  return {
    type,
    keycode,
    rawcode: keycode,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

function keyPress(matcher, shortcuts, keycode = 30, modifiers = {}) {
  matcher.onKeyEvent(keyEvent("keydown", keycode, modifiers), shortcuts);
  matcher.onKeyEvent(keyEvent("keyup", keycode, modifiers), shortcuts);
}

function keyDown(matcher, shortcuts, keycode = 30, modifiers = {}) {
  matcher.onKeyEvent(keyEvent("keydown", keycode, modifiers), shortcuts);
}

function keyUp(matcher, shortcuts, keycode = 30, modifiers = {}) {
  matcher.onKeyEvent(keyEvent("keyup", keycode, modifiers), shortcuts);
}

function mouseEvent(type, button, modifiers = {}) {
  return {
    type,
    button,
    clicks: 1,
    x: 0,
    y: 0,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

function mousePress(matcher, shortcuts, button, modifiers = {}) {
  matcher.onMouseEvent(mouseEvent("mousedown", button, modifiers), shortcuts);
  matcher.onMouseEvent(mouseEvent("mouseup", button, modifiers), shortcuts);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("native keyboard and modifier mapping", () => {
  assert.equal(nativeKeyName(30), "A");
  assert.equal(nativeKeyName(3675), "Win");
  assert.equal(KEY_MAP[29], "Ctrl");
  assert.equal(KEY_MAP[42], "Shift");
  assert.equal(KEY_MAP[56], "Alt");

  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("ctrl-alt-a", "combo", "A", { modifiers: ["Ctrl", "Alt"] })];
  keyPress(matcher, shortcuts, 30, { ctrlKey: true, altKey: true });
  assert.equal(fired, 1);
  matcher.reset();
});

test("mouse button mapping covers MB1 through MB5", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [1, 2, 3, 4, 5].map((button) => shortcut(`mouse-${button}`, "single", `MB${button}`, { mouse: true }));
  for (let button = 1; button <= 5; button += 1) mousePress(matcher, shortcuts, button);
  assert.equal(fired, 5);
  matcher.reset();
});

test("single tap fires once", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("single", "single")];
  keyPress(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("double tap fires after two distinct presses", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("double", "double")];
  keyPress(matcher, shortcuts);
  keyPress(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("triple tap fires after three distinct presses", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("triple", "triple")];
  keyPress(matcher, shortcuts);
  keyPress(matcher, shortcuts);
  keyPress(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("long press fires only after the hold duration", async () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("long-press", "longPress")];
  keyDown(matcher, shortcuts);
  assert.equal(fired, 0);
  await wait(45);
  assert.equal(fired, 1);
  keyUp(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("hold fires only after the hold duration", async () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("hold", "hold")];
  keyDown(matcher, shortcuts);
  await wait(45);
  assert.equal(fired, 1);
  keyUp(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("combo fires with the configured modifier set", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("combo", "combo", "C", { modifiers: ["Ctrl", "Shift"] })];
  keyPress(matcher, shortcuts, 46, { ctrlKey: true, shiftKey: true });
  assert.equal(fired, 1);
  matcher.reset();
});

test("sequence currently fires on two presses of the same configured key", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("sequence", "sequence")];
  keyPress(matcher, shortcuts);
  keyPress(matcher, shortcuts);
  assert.equal(fired, 1);
  matcher.reset();
});

test("tap-then-hold fires on a tap followed by a held press", async () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("tap-then-hold", "tapThenHold")];
  keyPress(matcher, shortcuts);
  keyDown(matcher, shortcuts);
  assert.equal(fired, 0);
  await wait(45);
  assert.equal(fired, 1);
  keyUp(matcher, shortcuts);
  matcher.reset();
});

test("repeat-key protection ignores repeated keydown events while held", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("repeat", "single")];
  keyDown(matcher, shortcuts);
  keyDown(matcher, shortcuts);
  assert.equal(fired, 1);
  keyUp(matcher, shortcuts);
  matcher.reset();
});

test("reset clears pending tap and hold timers", async () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const doubleShortcut = [shortcut("pending-double", "double")];
  keyPress(matcher, doubleShortcut);
  matcher.reset();
  await wait(120);
  assert.equal(fired, 0);

  const holdShortcut = [shortcut("pending-hold", "hold")];
  keyDown(matcher, holdShortcut);
  matcher.reset();
  await wait(45);
  assert.equal(fired, 0);
});

const CAPS_LOCK_KEYCODE = 58;
const F_KEYCODE = 33;

test("CapsLock single tap fires exactly once", () => {
  assert.equal(KEY_MAP[CAPS_LOCK_KEYCODE], "CapsLock");
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("caps-shot", "single", "CapsLock")];
  keyPress(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.equal(fired, 1);
  matcher.reset();
});

test("holding CapsLock does not repeat the single-tap screenshot", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("caps-shot", "single", "CapsLock")];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.equal(fired, 1);
  keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.equal(fired, 1);
  matcher.reset();
});

test("CapsLock keeps firing after repeated taps and releases", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("caps-shot", "single", "CapsLock")];
  for (let i = 0; i < 3; i += 1) {
    keyPress(matcher, shortcuts, CAPS_LOCK_KEYCODE);
    keyPress(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  }
  assert.equal(fired, 6);
  matcher.reset();
});

test("CapsLock release clears matcher state", () => {
  let fired = 0;
  const matcher = new TriggerMatcher(() => { fired += 1; });
  const shortcuts = [shortcut("caps-shot", "single", "CapsLock")];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.equal(fired, 2);
  matcher.reset();
});

test("quick tap with both single and longPress fires only the single action", () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [
    shortcut("caps-shot", "single", "CapsLock"),
    shortcut("hyper-caps", "longPress", "CapsLock"),
  ];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.deepEqual(fired, ["caps-shot"]);
  matcher.reset();
});

test("long hold with both single and longPress fires only the hold action", async () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [
    shortcut("caps-shot", "single", "CapsLock"),
    shortcut("hyper-caps", "longPress", "CapsLock"),
  ];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  await wait(45);
  assert.deepEqual(fired, ["hyper-caps"]);
  keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.deepEqual(fired, ["hyper-caps"]);
  matcher.reset();
});

test("tap-versus-hold never fires both actions for one press", async () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [
    shortcut("caps-shot", "single", "CapsLock"),
    shortcut("hyper-caps", "longPress", "CapsLock"),
  ];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  await wait(45);
  keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  assert.deepEqual(fired, ["hyper-caps"]);
  matcher.reset();
});

test("repeated separate taps each fire the single action once", () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [
    shortcut("caps-shot", "single", "CapsLock"),
    shortcut("hyper-caps", "longPress", "CapsLock"),
  ];
  for (let i = 0; i < 3; i += 1) {
    keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
    keyUp(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  }
  assert.deepEqual(fired, ["caps-shot", "caps-shot", "caps-shot"]);
  matcher.reset();
});

test("reset clears pending tap-versus-hold timers", async () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [
    shortcut("caps-shot", "single", "CapsLock"),
    shortcut("hyper-caps", "longPress", "CapsLock"),
  ];
  keyDown(matcher, shortcuts, CAPS_LOCK_KEYCODE);
  matcher.reset();
  await wait(45);
  assert.deepEqual(fired, []);
  matcher.reset();
});

test("double-tap with first tap inside the previous cooldown still fires (popup reopen)", async () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [shortcut("ff-popup", "double", "F", { timing: { tapInterval: 500, holdDuration: 600, delay: 0, cooldown: 350 } })];
  // First activation: open (sets a cooldown until ~now+350ms).
  keyPress(matcher, shortcuts, F_KEYCODE);
  keyPress(matcher, shortcuts, F_KEYCODE);
  assert.equal(fired.length, 1);
  // Reopen attempt: first tap lands inside the previous cooldown window; the
  // second tap lands just past it. The first tap must still be counted.
  await wait(80);
  keyDown(matcher, shortcuts, F_KEYCODE);
  keyUp(matcher, shortcuts, F_KEYCODE);
  await wait(300); // advance past the cooldown so the second tap can fire
  keyDown(matcher, shortcuts, F_KEYCODE);
  assert.equal(fired.length, 2, "second double-tap must fire even though its first tap fell inside the previous cooldown");
  matcher.reset();
});

test("a double-tap fully inside the cooldown window is consumed without firing", async () => {
  const fired = [];
  const matcher = new TriggerMatcher((sc) => { fired.push(sc.id); });
  const shortcuts = [shortcut("ff-popup", "double", "F", { timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 350 } })];
  keyPress(matcher, shortcuts, F_KEYCODE);
  keyPress(matcher, shortcuts, F_KEYCODE);
  assert.equal(fired.length, 1);
  await wait(20);
  keyDown(matcher, shortcuts, F_KEYCODE);
  keyUp(matcher, shortcuts, F_KEYCODE);
  keyDown(matcher, shortcuts, F_KEYCODE);
  assert.equal(fired.length, 1, "activation fully inside cooldown is gated by the cooldown");
  await wait(310);
  assert.equal(fired.length, 1);
  matcher.reset();
});
