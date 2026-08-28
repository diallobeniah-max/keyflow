import test from "node:test";
import assert from "node:assert/strict";
import {
  allCatalogKeys,
  isCatalogKey,
  KEY_GROUPS,
  keyLabel,
  searchKeys,
} from "../src/lib/keyCatalog.ts";
import { FUNCTION_KEYS_EXTENDED, REMAP_TARGETS } from "../src/lib/constants.ts";

test("key_picker_catalog_has_all_required_groups", () => {
  const ids = KEY_GROUPS.map((g) => g.id);
  assert.ok(ids.includes("common"));
  assert.ok(ids.includes("letters"));
  assert.ok(ids.includes("numbers"));
  assert.ok(ids.includes("function"));
  assert.ok(ids.includes("navigation"));
  assert.ok(ids.includes("modifiers"));
  assert.ok(ids.includes("numpad"));
  assert.ok(ids.includes("system"));
  assert.ok(ids.includes("media"));
});

test("key_picker_function_keys_extend_to_f24", () => {
  assert.equal(FUNCTION_KEYS_EXTENDED.length, 24);
  assert.equal(FUNCTION_KEYS_EXTENDED[0], "F1");
  assert.equal(FUNCTION_KEYS_EXTENDED[23], "F24");
  const fn = KEY_GROUPS.find((g) => g.id === "function");
  assert.ok(fn.keys.includes("F13"));
  assert.ok(fn.keys.includes("F24"));
});

test("key_picker_system_group_has_all_lock_and_app_keys", () => {
  const sys = KEY_GROUPS.find((g) => g.id === "system");
  for (const k of ["PrintScreen", "ScrollLock", "Pause", "NumLock", "Menu"]) {
    assert.ok(sys.keys.includes(k), `missing system key ${k}`);
  }
});

test("key_picker_modifiers_are_split_left_right", () => {
  const mods = KEY_GROUPS.find((g) => g.id === "modifiers");
  for (const k of ["LCtrl", "RCtrl", "LAlt", "RAlt", "LShift", "RShift", "LWin", "RWin"]) {
    assert.ok(mods.keys.includes(k), `missing modifier ${k}`);
  }
});

test("key_picker_media_group_has_volume_playback", () => {
  const media = KEY_GROUPS.find((g) => g.id === "media");
  for (const k of ["VolumeUp", "VolumeDown", "VolumeMute", "PlayPause", "NextTrack", "PrevTrack", "Stop"]) {
    assert.ok(media.keys.includes(k), `missing media key ${k}`);
  }
});

test("key_picker_search_examples", () => {
  assert.ok(searchKeys("caps").includes("CapsLock"), "caps -> CapsLock");
  assert.ok(searchKeys("tab").includes("Tab"), "tab -> Tab");
  assert.ok(searchKeys("right alt").includes("RAlt"), "right alt -> RAlt");
  assert.ok(searchKeys("volume").includes("VolumeUp"), "volume -> VolumeUp");
  assert.ok(searchKeys("arrow").length > 0, "arrow has results");
  assert.ok(searchKeys("").length === 0, "empty query returns nothing");
});

test("key_picker_search_exact_direct_keys", () => {
  assert.ok(searchKeys("F").includes("F"));
  assert.ok(searchKeys("7").includes("7"));
  assert.ok(searchKeys("F24").includes("F24"));
});

test("key_picker_no_fn_vk_entry", () => {
  // Fn has no normal virtual-key mapping — it must not appear as a pickable key.
  assert.equal(isCatalogKey("Fn"), false);
  assert.equal(allCatalogKeys().includes("Fn"), false);
  const fn = KEY_GROUPS.find((g) => g.id === "function");
  assert.equal(fn.keys.includes("Fn"), false);
});

test("key_picker_remap_targets_include_extended_f_keys", () => {
  const values = REMAP_TARGETS.map((t) => t.value);
  assert.ok(values.includes("F13"));
  assert.ok(values.includes("F24"));
  assert.ok(values.includes("Tab"));
  assert.ok(values.includes("Right"));
});

test("key_picker_labels_humanize", () => {
  assert.equal(keyLabel("CapsLock"), "Caps Lock");
  assert.equal(keyLabel("VolumeMute"), "Mute");
  assert.equal(keyLabel("VolumeUp"), "Volume Up");
  assert.equal(keyLabel("A"), "A");
});