import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const contract = await import(pathToFileURL(resolve("dist-electron/clipboard-contract.js")).href);

for (const [text, html, expected] of [
  ["#2563EB", "", "color"],
  ["https://keyflow.app", "", "url"],
  ["hello@keyflow.app", "", "email"],
  ['{"name":"KeyFlow"}', "", "json"],
  ["<?xml version=\"1.0\"?><item />", "", "xml"],
  ["name,count\nKeyFlow,1", "", "csv"],
  ["const clipboard = {};", "", "code"],
  ["Copied rich content", "<strong>Copied rich content</strong>", "html"],
  ["Plain copied content", "", "text"],
]) {
  assert.equal(contract.classifyClipboardText(text, html), expected, `${text} should classify as ${expected}`);
}

assert.equal(contract.isPinboardColor("var(--color-accent)"), true);
assert.equal(contract.isPinboardColor("#2563EB"), true);
assert.equal(contract.isPinboardColor("purple"), false);

// URL parsing tests
const ghUrl = contract.parseUrlDetails("https://github.com/Deepender25/Edge-Drop");
assert.equal(ghUrl.domain, "github.com");
assert.match(ghUrl.title, /Deepender25/);
assert.equal(ghUrl.favicon, "https://www.google.com/s2/favicons?domain=github.com&sz=64");

const rootUrl = contract.parseUrlDetails("https://keyflow.app");
assert.equal(rootUrl.domain, "keyflow.app");
assert.equal(rootUrl.title, "keyflow.app");
assert.equal(rootUrl.favicon, "https://www.google.com/s2/favicons?domain=keyflow.app&sz=64");

// YouTube URL parsing & instant thumbnail resolution
const ytWatch = contract.parseUrlDetails("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
assert.equal(ytWatch.domain, "youtube.com");
assert.equal(ytWatch.isYouTube, true);
assert.equal(ytWatch.thumbnailUrl, "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");

const ytShort = contract.parseUrlDetails("https://youtu.be/dQw4w9WgXcQ");
assert.equal(ytShort.isYouTube, true);
assert.equal(ytShort.thumbnailUrl, "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");

assert.equal(contract.extractYouTubeId("https://www.youtube.com/watch?v=abc12345"), "abc12345");
assert.equal(contract.extractYouTubeId("https://youtu.be/xyz98765"), "xyz98765");
assert.equal(contract.extractYouTubeId("https://notyoutube.com/watch?v=123"), null);

// Win+V shortcut override verification
const suppressionMod = await import(pathToFileURL(resolve("dist-electron/suppression-config.js")).href);
const sampleShortcut = {
  id: "sc-clipboard-history",
  name: "Clipboard history popup",
  profileId: "prof-default",
  key: "V",
  modifiers: ["Win"],
  trigger: "combo",
  timing: { tapInterval: 300, holdDuration: 600, delay: 0, cooldown: 250 },
  actions: [{ id: "act-clip-pop", type: "clipboardHistory" }],
  enabled: true,
  keyBehavior: "suppress",
};

const specs = suppressionMod.buildNativeShortcutConfig([sampleShortcut], {});
assert.equal(specs.length, 1, "Win+V shortcut should produce exactly 1 native spec");
assert.equal(specs[0].key.vk, 0x56, "V key should map to VK 0x56");
assert.equal(specs[0].behavior, "suppress", "Win+V shortcut must be marked as suppress to override Windows clipboard");
assert.deepEqual(specs[0].modifiers, ["win"], "Win modifier must be compiled to lowercase 'win'");

// Settings contract and normalizer defaults
const defaultNorm = contract.normalizeClipboardSettings();
assert.equal(defaultNorm.scrollDirection, "horizontal", "scrollDirection should default to horizontal");
assert.equal(defaultNorm.useAppAccentColor, true, "useAppAccentColor should default to true");
assert.equal(defaultNorm.layout, "horizontal", "layout should default to horizontal");

const customNorm = contract.normalizeClipboardSettings({ scrollDirection: "vertical", useAppAccentColor: false });
assert.equal(customNorm.scrollDirection, "vertical", "scrollDirection should normalize to vertical");
assert.equal(customNorm.useAppAccentColor, false, "useAppAccentColor should normalize to false");

console.log("clipboard contract & Win+V override tests passed");

assert.equal(contract.isPinboardColor("var(--cat-color-purple)"), true);
assert.equal(contract.isPinboardColor("var(--unknown-color)"), false);
for (const kind of ["text", "html", "json", "image", "screenshot", "files", "url"]) {
  assert.equal(contract.shouldCaptureKind(kind, contract.DEFAULT_CAPTURE_SETTINGS), true);
}
assert.equal(contract.shouldCaptureKind("json", { ...contract.DEFAULT_CAPTURE_SETTINGS, captureText: false }), false);
assert.equal(contract.shouldCaptureKind("url", { ...contract.DEFAULT_CAPTURE_SETTINGS, captureLinks: false }), false);
assert.equal(contract.shouldCaptureKind("screenshot", { ...contract.DEFAULT_CAPTURE_SETTINGS, captureImages: false }), false);
for (const area of [{ x: 0, y: 0, width: 360, height: 300 }, { x: -1920, y: -200, width: 1920, height: 1080 }]) {
  for (const layout of ["horizontal", "center", "right"]) {
    for (const rows of [1, 2, 3]) {
      const bounds = contract.clipboardPopupBounds(area, layout, "bottom", rows);
      assert.ok(bounds.x >= area.x && bounds.y >= area.y);
      assert.ok(bounds.x + bounds.width <= area.x + area.width);
      assert.ok(bounds.y + bounds.height <= area.y + area.height);
    }
  }
}
console.log("clipboard capture preferences & small-monitor bounds tests passed");
assert.equal(contract.isProtectedClipboard(["ExcludeClipboardContentFromMonitorProcessing"], () => Buffer.alloc(0)), true);
assert.equal(contract.isProtectedClipboard(["CanIncludeInClipboardHistory"], () => Buffer.from([0, 0, 0, 0])), true);
assert.equal(contract.isProtectedClipboard(["CanIncludeInClipboardHistory"], () => Buffer.from([1, 0, 0, 0])), false);
assert.equal(contract.isProtectedClipboard(["1Password"], () => Buffer.alloc(0)), true);
assert.equal(contract.isProtectedClipboard(["text/plain"], () => Buffer.alloc(0)), false);
