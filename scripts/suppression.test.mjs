import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { behaviorOf, buildSuppressionConfig } from "../dist-electron/suppression-config.js";
import { isIgnoredKey, isRecentlyInjected, markInjected } from "../dist-electron/input/key-skip.js";
import { keyToVk, comboToVks } from "../dist-electron/win-vk.js";
import { parseAhkEvent, encodeAhkKeyEvent } from "../dist-electron/ahk-protocol.js";
import { generateAhkScript } from "../dist-electron/ahk-generator.js";
import { ahkKeyName } from "../dist-electron/ahk-keys.js";
import { AhkSuppressionManager } from "../dist-electron/ahk-suppression-manager.js";

const timing = { tapInterval: 100, holdDuration: 30, delay: 0, cooldown: 0 };

function shortcut(id, key, extra = {}) {
  return {
    id,
    name: id,
    profileId: "p",
    key,
    modifiers: [],
    trigger: "single",
    timing: { ...timing },
    actions: [],
    enabled: true,
    ...extra,
  };
}

test("behaviorOf defaults to pass through unless suppressKey is set", () => {
  assert.equal(behaviorOf({}), "passThrough");
  assert.equal(behaviorOf({ suppressKey: true }), "suppress");
  assert.equal(behaviorOf({ keyBehavior: "disable" }), "disable");
  assert.equal(behaviorOf({ keyBehavior: "remap" }), "remap");
});

test("pass-through shortcuts produce an empty suppression config", () => {
  const config = buildSuppressionConfig([shortcut("a", "A")], {});
  assert.equal(config.consumed.length, 0);
  assert.equal(config.ignoreInMatcher.length, 0);
});

test("suppress mode consumes the key but still fires the action (not ignored in matcher)", () => {
  const config = buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "suppress" })], {});
  assert.deepEqual(config.consumed, [keyToVk("A")]);
  assert.equal(config.ignoreInMatcher.length, 0);
});

test("disable mode consumes the key and ignores it in the matcher", () => {
  const config = buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "disable" })], {});
  assert.deepEqual(config.consumed, [keyToVk("A")]);
  assert.deepEqual(config.ignoreInMatcher, [keyToVk("A")]);
});

test("remap mode consumes the original and maps to a replacement", () => {
  const config = buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "remap", remapTo: "F13" })], {});
  assert.deepEqual(config.consumed, [keyToVk("A")]);
  assert.equal(config.remaps[keyToVk("A")], keyToVk("F13"));
  assert.equal(config.ignoreInMatcher.length, 0);
});

test("remap to the same key is ignored", () => {
  const config = buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "remap", remapTo: "A" })], {});
  assert.equal(config.consumed.length, 0);
});

test("modifier combos are not suppressed by the vk-only helper", () => {
  const config = buildSuppressionConfig([shortcut("k", "K", { keyBehavior: "suppress", modifiers: ["Ctrl"] })], {});
  assert.equal(config.consumed.length, 0);
});

test("the emergency bypass key is never suppressed", () => {
  const config = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], {
    emergencySafe: "Ctrl+Shift+K",
  });
  assert.ok(config.consumed.includes(keyToVk("CapsLock")));
  const blocked = buildSuppressionConfig([shortcut("k", "K", { keyBehavior: "suppress" })], {
    emergencySafe: "Ctrl+Shift+K",
  });
  assert.equal(blocked.consumed.length, 0);
});

test("paused and safe mode produce an empty config (suppression stops)", () => {
  assert.equal(buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "suppress" })], { paused: true }).consumed.length, 0);
  assert.equal(buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "suppress" })], { safeMode: true }).consumed.length, 0);
});

test("CapsLock suppression enables the Hyper+Shift genuine-passthrough entry", () => {
  const config = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], { hyperKey: "Alt" });
  const entry = config.entries.find((e) => e.vk === keyToVk("CapsLock"));
  assert.equal(entry?.conditionalCapsPassThrough, true);
  assert.equal(entry?.hyperVk, keyToVk("Alt"));
});

test("disabled shortcuts are excluded from suppression", () => {
  const config = buildSuppressionConfig([shortcut("a", "A", { keyBehavior: "suppress", enabled: false })], {});
  assert.equal(config.consumed.length, 0);
});

test("win-vk mapping covers common keys", () => {
  assert.equal(keyToVk("CapsLock"), 0x14);
  assert.equal(keyToVk("A"), 0x41);
  assert.equal(keyToVk("Enter"), 0x0d);
  assert.equal(keyToVk("F13"), 0x7c);
  assert.equal(keyToVk("unknown-key"), undefined);
  assert.deepEqual([...comboToVks("Ctrl+Shift+K")].sort(), [0x10, 0x11, 0x4b]);
});

test("key-skip: ignored keys are skipped; injected keys expire", () => {
  assert.equal(isIgnoredKey(0x41, new Set([0x41])), true);
  assert.equal(isIgnoredKey(0x41, new Set([0x42])), false);
  const injected = new Map();
  markInjected(injected, 0x41, 1000);
  assert.equal(isRecentlyInjected(0x41, injected, 1100), true);
  assert.equal(isRecentlyInjected(0x41, injected, 1400), false);
  assert.equal(injected.has(0x41), false);
});

test("AHK protocol parses valid key events and rejects malformed lines", () => {
  const down = parseAhkEvent(encodeAhkKeyEvent("down", "CapsLock", 42));
  assert.deepEqual(down, { type: "key", state: "down", key: "CapsLock", source: "autohotkey-suppression", sequence: 42 });
  const up = parseAhkEvent('{"type":"key","state":"up","key":"F","source":"autohotkey-suppression","sequence":7}');
  assert.equal(up.state, "up");
  assert.equal(up.key, "F");
  assert.deepEqual(parseAhkEvent('{"type":"ready","source":"autohotkey-suppression"}'), { type: "ready", source: "autohotkey-suppression" });
  assert.equal(parseAhkEvent("not-json"), null);
  assert.equal(parseAhkEvent('{"type":"key","state":"sideways","key":"F","source":"autohotkey-suppression","sequence":1}'), null);
  assert.equal(parseAhkEvent('{"type":"key","state":"down","key":"F","source":"other","sequence":1}'), null);
  assert.equal(parseAhkEvent('{"type":"mouse","source":"autohotkey-suppression"}'), null);
});

test("AHK key mapping covers the configured keys", () => {
  assert.equal(ahkKeyName("CapsLock"), "CapsLock");
  assert.equal(ahkKeyName("F"), "f");
  assert.equal(ahkKeyName("F13"), "F13");
  assert.equal(ahkKeyName("Num4"), "Numpad4");
  assert.equal(ahkKeyName("Space"), "Space");
  assert.equal(ahkKeyName("Win"), "LWin");
  assert.equal(ahkKeyName("VolumeUp"), "Volume_Up");
  assert.equal(ahkKeyName("not-a-key"), undefined);
});

test("AHK script generation suppresses configured keys without `~`", () => {
  const script = generateAhkScript([
    { ahkKey: "capslock", mode: "suppress" },
    { ahkKey: "f13", mode: "remap", remapTo: "Space" },
  ]);
  assert.match(script, /#Requires AutoHotkey v2\.0/);
  assert.match(script, /Hotkey\("\$\*capslock"/);
  assert.match(script, /Hotkey\("\$\*capslock up"/);
  assert.match(script, /SendEvent\("\{Space\}"\)/);
  assert.match(script, /FileAppend/);
  assert.doesNotMatch(script, /~\*capslock/i);
});

test("suppress mode is preserved when saving (keyBehavior wins over legacy flags)", () => {
  const saved = shortcut("c", "CapsLock", { keyBehavior: "suppress", suppressKey: true });
  assert.equal(behaviorOf(saved), "suppress");
  // A shortcut saved/loaded still carries keyBehavior -> suppress survives round-trip.
  const config = buildSuppressionConfig([saved], {});
  assert.ok(config.entries.some((e) => e.keyName === "CapsLock" && e.mode === "suppress"));
});

test("suppress mode is preserved when loading (loaded store keeps keyBehavior)", () => {
  // Simulate a persisted shortcut that was read back from storage.
  const loaded = { ...shortcut("c", "CapsLock"), keyBehavior: "suppress" };
  assert.equal(behaviorOf(loaded), "suppress");
  const config = buildSuppressionConfig([loaded], {});
  assert.ok(config.consumed.includes(keyToVk("CapsLock")));
  // When no suppress intent exists, pass through (no entry).
  const clean = buildSuppressionConfig([shortcut("c", "CapsLock")], {});
  assert.equal(clean.entries.length, 0);
});

test("suppress config includes CapsLock and ignoreInMatcher stays empty (uiohook still fires action)", () => {
  const config = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], {});
  assert.ok(config.consumed.includes(keyToVk("CapsLock")));
  const entry = config.entries.find((e) => e.vk === keyToVk("CapsLock"));
  assert.equal(entry?.mode, "suppress");
  // Suppress keeps the matcher active so the screenshot action still fires once.
  assert.equal(config.ignoreInMatcher.includes(keyToVk("CapsLock")), false);
});

test("generated AHK CapsLock handlers: down + up, no ~, hook-safe", () => {
  const config = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], {});
  const keys = config.entries.map((e) => ({ ahkKey: ahkKeyName(e.keyName), mode: e.mode }));
  const script = generateAhkScript(keys);
  assert.match(script, /Hotkey\("\$\*CapsLock"/);            // down handler
  assert.match(script, /Hotkey\("\$\*CapsLock up"/);        // up handler
  assert.doesNotMatch(script, /~\*CapsLock/i);               // no pass-through prefix
  assert.match(script, /Emit\("down", "CapsLock"\)/);
  assert.match(script, /Emit\("up", "CapsLock"\)/);
  // The handler never re-sends CapsLock back to Windows (no SendEvent for suppress).
  assert.doesNotMatch(script, /SendEvent\(.*CapsLock.*\)/i);
});

test("paused, safe mode, and boss-key stop Caps Lock suppression (fail open)", () => {
  for (const context of [{ paused: true }, { safeMode: true }]) {
    const config = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], context);
    assert.equal(config.entries.length, 0);
    assert.equal(config.consumed.includes(keyToVk("CapsLock")), false);
  }
});

test("Caps Lock uiohook duplicate ignore list is populated only in disable mode", () => {
  const disable = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "disable" })], {});
  assert.ok(disable.ignoreInMatcher.includes(keyToVk("CapsLock")));
  const suppress = buildSuppressionConfig([shortcut("c", "CapsLock", { keyBehavior: "suppress" })], {});
  assert.equal(suppress.ignoreInMatcher.length, 0);
});

test("personal AutoHotkey processes are never part of generated suppression (only keyflow file)", () => {
  const script = generateAhkScript([{ ahkKey: "capslock", mode: "suppress" }]);
  assert.doesNotMatch(script, /Dropshelf/i);
  assert.match(script, /keyflow|Emit|Hotkey/);
});

test("generated AHK v2: KF_Seq is initialized exactly once at top level", () => {
  const script = generateAhkScript([{ ahkKey: "CapsLock", mode: "suppress" }]);
  assert.match(script, /^KF_Seq := 0$/m);
  assert.equal((script.match(/KF_Seq := 0/g) ?? []).length, 1);
  assert.doesNotMatch(script, /global KF_Seq := 0/);
});

test("generated AHK v2: event function declares global KF_Seq before incrementing", () => {
  const script = generateAhkScript([{ ahkKey: "CapsLock", mode: "suppress" }]);
  const fn = script.slice(script.indexOf("Emit(state, key)"));
  const decl = fn.indexOf("global KF_Seq");
  const inc = fn.indexOf("KF_Seq += 1");
  assert.ok(decl >= 0, "function must contain `global KF_Seq`");
  assert.ok(inc >= 0, "function must contain `KF_Seq += 1`");
  assert.ok(decl < inc, "`global KF_Seq` must appear before the increment");
  // Single monotonically increasing counter shared by down and up events.
  assert.equal((script.match(/KF_Seq \+= 1/g) ?? []).length, 1);
  assert.doesNotMatch(script, /KF_Seq := KF_Seq \+ 1/);
});

test("generated AHK v2: CapsLock down/up handlers remain, no ~ pass-through, syntax sane", () => {
  const script = generateAhkScript([{ ahkKey: "CapsLock", mode: "suppress" }]);
  assert.match(script, /#Requires AutoHotkey v2\.0/);
  assert.match(script, /#SingleInstance Force/);
  assert.match(script, /Persistent/);
  assert.match(script, /Hotkey\("\$\*CapsLock"/);
  assert.match(script, /Hotkey\("\$\*CapsLock up"/);
  assert.doesNotMatch(script, /~\*CapsLock/i);
  assert.doesNotMatch(script, /SendEvent\(.*CapsLock.*\)/i);
  // Balanced braces for a structurally valid v2 script.
  assert.equal((script.match(/\{/g) ?? []).length, (script.match(/\}/g) ?? []).length);
  assert.equal(script.split("\n").pop(), "");
});

function fakeAhkProc({ ready = false, exitCode = 1 } = {}) {
  const proc = new EventEmitter();
  proc.killed = false;
  proc.kill = () => { proc.killed = true; };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  if (ready) {
    setImmediate(() => proc.stdout.emit("data", Buffer.from('{"type":"ready","source":"autohotkey-suppression"}\n')));
  }
  setImmediate(() => proc.emit("exit", exitCode));
  return proc;
}

class SpawnCountingManager extends AhkSuppressionManager {
  constructor(opts) {
    super(opts);
    this.spawnCount = 0;
    this.nextProc = () => fakeAhkProc();
  }
  spawnHelper() {
    this.spawnCount++;
    return this.nextProc();
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("startup failure before ready does not create a restart loop (fail open)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keyflow-loop-"));
  const statuses = [];
  const manager = new SpawnCountingManager({
    ahkExe: "C:\\fake\\AutoHotkey64.exe",
    runtimeDir: dir,
    onEvent: () => {},
    onStatus: (s) => statuses.push(s),
  });
  const caps = { entries: [{ keyName: "CapsLock", mode: "suppress" }] };
  const f = { entries: [{ keyName: "F", mode: "suppress" }] };

  manager.updateConfig(caps); // spawn 1 -> exits before ready
  await tick();
  assert.equal(manager.spawnCount, 1);
  assert.equal(manager.getStatus(), "error");
  assert.ok(statuses.includes("error"));

  manager.updateConfig(caps); // identical failing script -> must not respawn
  await tick();
  assert.equal(manager.spawnCount, 1, "identical failing script must not respawn");
  assert.equal(manager.getStatus(), "error");

  manager.updateConfig(f); // different script is allowed to retry
  await tick();
  assert.equal(manager.spawnCount, 2);
  assert.equal(manager.getStatus(), "error");

  manager.setPaused(true); // explicit resume force-retries the current script
  manager.setPaused(false);
  await tick();
  assert.equal(manager.spawnCount, 3);
  assert.equal(manager.getStatus(), "error");

  manager.stop();
});

test("helper that reached ready then exits is not a startup failure (fail open, can respawn)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "keyflow-ready-"));
  const statuses = [];
  const manager = new SpawnCountingManager({
    ahkExe: "C:\\fake\\AutoHotkey64.exe",
    runtimeDir: dir,
    onEvent: () => {},
    onStatus: (s) => statuses.push(s),
  });
  manager.nextProc = () => fakeAhkProc({ ready: true, exitCode: 0 });
  const caps = { entries: [{ keyName: "CapsLock", mode: "suppress" }] };

  manager.updateConfig(caps);
  await tick();
  assert.equal(manager.spawnCount, 1);
  assert.ok(statuses.includes("ready"));
  assert.equal(manager.getStatus(), "unavailable"); // clean exit after ready, not "error"

  manager.updateConfig(caps); // same script but never marked failed -> respawn allowed
  await tick();
  assert.equal(manager.spawnCount, 2);
  assert.equal(manager.getStatus(), "unavailable");

  manager.stop();
});
