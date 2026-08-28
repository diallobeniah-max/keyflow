import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  feedbackSoundName,
  soundFileFor,
  soundCandidates,
  resolveSoundPath,
} from "../dist-electron/sound-paths.js";

const NAMES = ["topmost-on", "topmost-off", "navigation-on", "navigation-off"];

function devContext() {
  return {
    appPath: process.cwd(),
    cwd: process.cwd(),
    resourcesPath: undefined,
    bundleDir: undefined,
  };
}

test("feedbackSoundName maps kind+state to the exact asset names", () => {
  assert.equal(feedbackSoundName("topmost", true), "topmost-on");
  assert.equal(feedbackSoundName("topmost", false), "topmost-off");
  assert.equal(feedbackSoundName("navigation", true), "navigation-on");
  assert.equal(feedbackSoundName("navigation", false), "navigation-off");
});

test("ON and OFF assets are distinct names and files", () => {
  assert.notEqual(feedbackSoundName("topmost", true), feedbackSoundName("topmost", false));
  assert.notEqual(feedbackSoundName("navigation", true), feedbackSoundName("navigation", false));
  const topOn = resolveSoundPath("topmost-on", devContext());
  const topOff = resolveSoundPath("topmost-off", devContext());
  assert.ok(topOn && topOff, "both topmost assets must resolve in dev");
  assert.notEqual(topOn, topOff);
});

test("all four assets resolve to existing files in dev", () => {
  for (const name of NAMES) {
    const path = resolveSoundPath(name, devContext());
    assert.ok(path, `${name} must resolve`);
    assert.ok(existsSync(path), `${name} resolved path must exist: ${path}`);
  }
});

test("dev candidate ordering puts public/sounds first", () => {
  const candidates = soundCandidates(devContext(), "topmost-on");
  assert.equal(candidates[0], join(process.cwd(), "public", "sounds", "topmost-on.wav"));
  assert.equal(candidates[1], join(process.cwd(), "public", "sounds", "topmost-on.wav"));
  assert.ok(existsSync(candidates[0]), "dev asset must exist");
});

test("packaged context adds resources/ candidates", () => {
  const ctx = { appPath: "C:\\pkg", cwd: "C:\\pkg", resourcesPath: "C:\\pkg\\resources", bundleDir: "C:\\pkg\\dist-electron" };
  const candidates = soundCandidates(ctx, "navigation-off");
  assert.ok(candidates.includes("C:\\pkg\\resources\\sounds\\navigation-off.wav"));
  assert.ok(candidates.includes("C:\\pkg\\resources\\navigation-off.wav"));
  assert.ok(candidates.includes("C:\\pkg\\sounds\\navigation-off.wav"));
  assert.ok(candidates.includes("C:\\pkg\\sounds\\navigation-off.wav"), "bundle-adjacent candidate normalizes to <app>/sounds");
});

test("missing asset resolves to null (controlled failure, not a throw)", () => {
  assert.equal(resolveSoundPath("topmost-on", { appPath: "C:\\nope", cwd: "C:\\nope" }), null);
  assert.equal(soundFileFor("topmost-on"), "topmost-on.wav");
});