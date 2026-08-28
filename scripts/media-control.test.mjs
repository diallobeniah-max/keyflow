import { test } from "node:test";
import assert from "node:assert/strict";
import { keyToVk, isExtendedVk } from "../dist-electron/win-vk.js";
import { mediaKeyPlan, volumeKeyPlan, MEDIA_VKS } from "../dist-electron/media-keys.js";

test("win-vk maps media key names to canonical Win32 VKs", () => {
  assert.equal(keyToVk("PlayPause"), 0xb3);
  assert.equal(keyToVk("NextTrack"), 0xb0);
  assert.equal(keyToVk("PrevTrack"), 0xb1);
  assert.equal(keyToVk("Stop"), 0xb2);
  assert.equal(keyToVk("VolumeUp"), 0xaf);
  assert.equal(keyToVk("VolumeDown"), 0xae);
  assert.equal(keyToVk("VolumeMute"), 0xad);
});

test("legacy wrong media VKs are gone from win-vk", () => {
  assert.notEqual(keyToVk("PlayPause"), 0xcd);
  assert.notEqual(keyToVk("NextTrack"), 0xb5);
  assert.notEqual(keyToVk("PrevTrack"), 0xb6);
  assert.notEqual(keyToVk("Stop"), 0xb7);
});

test("media VKs are not treated as extended keys", () => {
  for (const vk of [0xb0, 0xb1, 0xb2, 0xb3, 0xad, 0xae, 0xaf]) {
    assert.equal(isExtendedVk(vk), false, `VK 0x${vk.toString(16)} must not be extended`);
  }
  assert.equal(isExtendedVk(0xa5, "AltRight"), true);
});

test("MEDIA_VKS catalog holds the canonical 7 values", () => {
  assert.deepEqual(MEDIA_VKS, {
    PlayPause: 0xb3,
    NextTrack: 0xb0,
    PrevTrack: 0xb1,
    Stop: 0xb2,
    VolumeUp: 0xaf,
    VolumeDown: 0xae,
    VolumeMute: 0xad,
  });
});

test("mediaKeyPlan resolves each media command to its canonical VK", () => {
  assert.deepEqual(mediaKeyPlan("playpause"), { key: "PlayPause", vk: 0xb3, extended: false, command: "playpause" });
  assert.deepEqual(mediaKeyPlan("next"), { key: "NextTrack", vk: 0xb0, extended: false, command: "next" });
  assert.deepEqual(mediaKeyPlan("prev"), { key: "PrevTrack", vk: 0xb1, extended: false, command: "prev" });
  assert.deepEqual(mediaKeyPlan("stop"), { key: "Stop", vk: 0xb2, extended: false, command: "stop" });
});

test("volumeKeyPlan resolves volume actions to canonical VKs", () => {
  assert.equal(volumeKeyPlan("up").vk, 0xaf);
  assert.equal(volumeKeyPlan("down").vk, 0xae);
  assert.equal(volumeKeyPlan("mute").vk, 0xad);
  assert.equal(volumeKeyPlan("toggle").vk, 0xad);
  assert.equal(volumeKeyPlan("unmute").vk, 0xaf, "unmute falls back to volume up");
  assert.equal(volumeKeyPlan("mute", "toggleMute").command, "toggleMute");
});

test("every media plan carries extended=false for native SendInput", () => {
  for (const command of ["playpause", "next", "prev", "stop"]) {
    assert.equal(mediaKeyPlan(command).extended, false);
  }
  for (const volume of ["up", "down", "mute", "toggle"]) {
    assert.equal(volumeKeyPlan(volume).extended, false);
  }
});