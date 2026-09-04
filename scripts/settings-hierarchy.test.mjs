import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

test("1. All 17 dedicated settings pages exist", () => {
  const expectedPages = [
    "AppBehaviorPage.tsx",
    "NotificationsPage.tsx",
    "KeyboardPage.tsx",
    "CommandPalettePage.tsx",
    "ShortcutBindingPage.tsx",
    "WasdPage.tsx",
    "HotCornersPage.tsx",
    "AlwaysOnTopPage.tsx",
    "AppearancePage.tsx",
    "SmoothScrollPage.tsx",
    "ScreenTintPage.tsx",
    "AppIconPage.tsx",
    "PopupMenuPage.tsx",
    "PrivacyPage.tsx",
    "BackupPage.tsx",
    "AdvancedPage.tsx",
    "AboutPage.tsx",
  ];

  for (const page of expectedPages) {
    const filePath = path.join(root, "src", "pages", "settings", page);
    assert.ok(fs.existsSync(filePath), `Expected ${page} to exist in src/pages/settings/`);
  }
});

test("2. Backward-compatible route resolver handles legacy keys", async () => {
  const typesContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "types.ts"), "utf-8");
  
  // Verify resolveSettingsSectionId handles legacy aliases
  assert.ok(typesContent.includes('if (lower === "general") return "appBehavior";'));
  assert.ok(typesContent.includes('if (lower === "shortcuts") return "keyboard";'));
  assert.ok(typesContent.includes('if (lower === "data") return "backup";'));
});

test("3. Navigation groups cover all 6 Apple-style categories and 17 pages", () => {
  const typesContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "types.ts"), "utf-8");

  const expectedIds = [
    "appBehavior",
    "notifications",
    "keyboard",
    "commandPalette",
    "shortcutBinding",
    "wasd",
    "hotCorners",
    "alwaysOnTop",
    "appearance",
    "smoothScroll",
    "screenTint",
    "appIcon",
    "popup",
    "privacy",
    "backup",
    "advanced",
    "about",
  ];

  for (const id of expectedIds) {
    assert.ok(typesContent.includes(`id: "${id}"`), `Expected SETTINGS_NAV_GROUPS to include ${id}`);
  }
});

test("4. Emergency pause and Safe Mode shortcuts moved visually to Privacy & Safety", () => {
  const privContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "PrivacyPage.tsx"), "utf-8");
  const kbContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "KeyboardPage.tsx"), "utf-8");

  // Should be in Privacy
  assert.ok(privContent.includes('id="row-sc-pause"'), "PrivacyPage must contain row-sc-pause");
  assert.ok(privContent.includes('id="row-sc-emergency"'), "PrivacyPage must contain row-sc-emergency");
  assert.ok(privContent.includes('id="row-priv-safe"'), "PrivacyPage must contain row-priv-safe");

  // Must NOT be in Keyboard
  assert.ok(!kbContent.includes('id="row-sc-pause"'), "KeyboardPage must NOT contain row-sc-pause");
  assert.ok(!kbContent.includes('id="row-sc-emergency"'), "KeyboardPage must NOT contain row-sc-emergency");
});

test("5. Notifications separated cleanly from App Behavior", () => {
  const appBehaviorContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "AppBehaviorPage.tsx"), "utf-8");
  const notifContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "NotificationsPage.tsx"), "utf-8");

  assert.ok(appBehaviorContent.includes('id="row-gen-startup"'));
  assert.ok(appBehaviorContent.includes('id="row-gen-profile"'));
  assert.ok(!appBehaviorContent.includes('id="row-gen-notifications"'), "AppBehavior must not contain notifications toggle");

  assert.ok(notifContent.includes('id="row-gen-notifications"'));
  assert.ok(notifContent.includes('id="row-gen-sound"'));
});

test("6. Screen Tint and App Icon separated cleanly from Appearance", () => {
  const appContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "AppearancePage.tsx"), "utf-8");
  const tintContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "ScreenTintPage.tsx"), "utf-8");
  const iconContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "AppIconPage.tsx"), "utf-8");

  assert.ok(!appContent.includes('id="row-tint-enable"'), "Appearance must not contain screen tint controls");
  assert.ok(!appContent.includes('app-icon-showcase-grid'), "Appearance must not contain full app icon showcase");

  assert.ok(tintContent.includes('id="row-tint-enable"'));
  assert.ok(tintContent.includes('id="row-tint-presets"'));

  assert.ok(iconContent.includes('app-icon-showcase-grid'));
  assert.ok(iconContent.includes('id="row-app-icon-accent"'));
});

test("7. Factory reset visually separated in Danger Zone", () => {
  const backupContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "BackupPage.tsx"), "utf-8");
  assert.ok(backupContent.includes('className="settings-danger-zone'), "BackupPage must contain .settings-danger-zone");
  assert.ok(backupContent.includes('id="row-data-reset"'), "BackupPage must contain row-data-reset");
  assert.ok(backupContent.includes("Reset All Data…"), "Must have explicit reset modal confirmation");
});

test("8. Settings index covers new category architecture without orphaned anchors", () => {
  const idxContent = fs.readFileSync(path.join(root, "src", "lib", "settingsIndex.ts"), "utf-8");

  assert.ok(idxContent.includes('category: "appBehavior"'));
  assert.ok(idxContent.includes('category: "notifications"'));
  assert.ok(idxContent.includes('category: "keyboard"'));
  assert.ok(idxContent.includes('category: "backup"'));
  assert.ok(idxContent.includes('category: "privacy"'));
});

test("9. Settings width setting allows picking Small vs Large with animated layout", () => {
  const appPageContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "AppearancePage.tsx"), "utf-8");
  const settingsPageContent = fs.readFileSync(path.join(root, "src", "pages", "Settings.tsx"), "utf-8");
  const cssContent = fs.readFileSync(path.join(root, "src", "index.css"), "utf-8");

  assert.ok(appPageContent.includes('id="row-app-settings-width"'), "AppearancePage must have row-app-settings-width");
  assert.ok(appPageContent.includes('settingsWidth: "small"'), "Must have small width picker");
  assert.ok(appPageContent.includes('settingsWidth: "large"'), "Must have large width picker");

  assert.ok(settingsPageContent.includes("is-width-${settingsWidth}"), "Settings.tsx must apply width class");
  assert.ok(cssContent.includes(".settings-layout.is-width-small .settings-nav"), "CSS must define is-width-small nav");
  assert.ok(cssContent.includes(".settings-layout.is-width-large .settings-nav"), "CSS must define is-width-large nav");
  assert.ok(cssContent.includes("transition: width"), "CSS must animate width transition");
});

test("10. Smooth Scrolling and Shortcut Bindings pages are wired and styled correctly", () => {
  const ssContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "SmoothScrollPage.tsx"), "utf-8");
  const scContent = fs.readFileSync(path.join(root, "src", "pages", "settings", "ShortcutBindingPage.tsx"), "utf-8");
  const settingsContent = fs.readFileSync(path.join(root, "src", "pages", "Settings.tsx"), "utf-8");
  const appContent = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf-8");
  const engineContent = fs.readFileSync(path.join(root, "src", "lib", "smooth-scroll-engine.ts"), "utf-8");

  assert.ok(ssContent.includes('id="row-ss-enabled"'), "SmoothScrollPage must have row-ss-enabled");
  assert.ok(ssContent.includes("ss-preset-grid"), "SmoothScrollPage must have preset cards");
  assert.ok(ssContent.includes("ss-preview-container"), "SmoothScrollPage must have live preview");

  assert.ok(scContent.includes("sc-key-chip"), "ShortcutBindingPage must have key chips");
  assert.ok(scContent.includes("sc-capture-panel"), "ShortcutBindingPage must have capture panel");

  assert.ok(settingsContent.includes("SmoothScrollPage"), "Settings.tsx must import SmoothScrollPage");
  assert.ok(settingsContent.includes("ShortcutBindingPage"), "Settings.tsx must import ShortcutBindingPage");

  assert.ok(appContent.includes("useSmoothScroll"), "App.tsx must attach useSmoothScroll");
  assert.ok(engineContent.includes("class SmoothScrollEngine"), "SmoothScrollEngine must be defined");
});


