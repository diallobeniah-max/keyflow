import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

test("1. Default configuration includes production-quality dimScreen settings", async () => {
  const defaultsMod = await import("../src/lib/defaults.ts");
  const defaults = defaultsMod.createDefaultSettings();

  assert.ok(defaults.dimScreen, "createDefaultSettings must contain dimScreen");
  assert.strictEqual(defaults.dimScreen.enabled, false);
  assert.strictEqual(defaults.dimScreen.level, 30);
  assert.strictEqual(defaults.dimScreen.extraDimEnabled, false);
  assert.strictEqual(defaults.dimScreen.extraDimStrength, 40);
  assert.strictEqual(defaults.dimScreen.applyTo, "all");
  assert.deepStrictEqual(defaults.dimScreen.selectedDisplayIds, []);
  assert.strictEqual(defaults.dimScreen.startEnabled, false);
  assert.strictEqual(defaults.dimScreen.rememberLevel, true);
});

test("2. DimScreenSettings and DimScreenApplyTo types are exported in src/types/index.ts", () => {
  const typesContent = fs.readFileSync(path.join(root, "src", "types", "index.ts"), "utf-8");
  assert.ok(typesContent.includes("export type DimScreenApplyTo ="), "Must export DimScreenApplyTo");
  assert.ok(typesContent.includes("export interface DimScreenSettings {"), "Must export DimScreenSettings");
  assert.ok(typesContent.includes("dimScreen?: DimScreenSettings;"), "Settings interface must include dimScreen");
  assert.ok(typesContent.includes('"toggleDimScreen"'), "ActionType must include toggleDimScreen");
  assert.ok(typesContent.includes('"dimScreenControl"'), "ActionType must include dimScreenControl");
  assert.ok(typesContent.includes("dimScreenMode?:"), "ActionPayload must include dimScreenMode");
});

test("3. DimScreenPage exists and implements all UI anchor rows", () => {
  const pagePath = path.join(root, "src", "pages", "settings", "DimScreenPage.tsx");
  assert.ok(fs.existsSync(pagePath), "DimScreenPage.tsx must exist");

  const content = fs.readFileSync(pagePath, "utf-8");
  assert.ok(content.includes('id="row-dim-enable"'), "Must have row-dim-enable");
  assert.ok(content.includes('id="row-dim-hardware-status"'), "Must have row-dim-hardware-status");
  assert.ok(content.includes('id="row-dim-level"'), "Must have row-dim-level");
  assert.ok(content.includes('id="row-dim-extra-enable"'), "Must have row-dim-extra-enable");
  assert.ok(content.includes('id="row-dim-extra-strength"'), "Must have row-dim-extra-strength");
  assert.ok(content.includes('id="row-dim-apply-to"'), "Must have row-dim-apply-to");
  assert.ok(content.includes('id="row-dim-startup"'), "Must have row-dim-startup");
  assert.ok(content.includes('id="row-dim-remember-level"'), "Must have row-dim-remember-level");
});

test("4. Navigation groups in types.ts include Dim Screen in Interface category", () => {
  const typesPath = path.join(root, "src", "pages", "settings", "types.ts");
  const content = fs.readFileSync(typesPath, "utf-8");

  assert.ok(content.includes('| "dimScreen"'), "SettingsSectionId must include dimScreen");
  assert.ok(content.includes('id: "dimScreen"'), "SETTINGS_NAV_GROUPS must include dimScreen");
  assert.ok(content.includes('label: "Dim Screen"'), "Must have label 'Dim Screen'");
  assert.ok(content.includes('if (lower === "dim" || lower === "dimscreen" || lower === "dim-screen") return "dimScreen";'), "resolveSettingsSectionId must handle dim screen aliases");
});

test("5. Settings.tsx routes to DimScreenPage", () => {
  const settingsPath = path.join(root, "src", "pages", "Settings.tsx");
  const content = fs.readFileSync(settingsPath, "utf-8");

  assert.ok(content.includes('import { DimScreenPage } from "./settings/DimScreenPage";'), "Must import DimScreenPage");
  assert.ok(content.includes('case "dimScreen":'), "renderActivePage must route dimScreen");
});

test("6. Settings index covers Dim Screen with non-empty keywords and valid anchors", () => {
  const idxPath = path.join(root, "src", "lib", "settingsIndex.ts");
  const content = fs.readFileSync(idxPath, "utf-8");

  assert.ok(content.includes('| "dimScreen"'), "SettingSearchItem category union must include dimScreen");
  assert.ok(content.includes('id: "dim-screen"'), "Must index dim-screen");
  assert.ok(content.includes('id: "dim-screen-level"'), "Must index dim-screen-level");
  assert.ok(content.includes('id: "dim-screen-extra"'), "Must index dim-screen-extra");
  assert.ok(content.includes('id: "dim-screen-monitors"'), "Must index dim-screen-monitors");
});

test("7. Preload API exposes typed dimScreen methods", () => {
  const preloadPath = path.join(root, "electron", "preload.ts");
  const content = fs.readFileSync(preloadPath, "utf-8");

  assert.ok(content.includes("dimScreen: {"), "electronAPI must expose dimScreen");
  assert.ok(content.includes('getState: () => ipcRenderer.invoke("dim-screen:get-state")'));
  assert.ok(content.includes('update: (config) => ipcRenderer.invoke("dim-screen:update", config)'));
  assert.ok(content.includes('setEnabled: (enabled) => ipcRenderer.invoke("dim-screen:set-enabled", enabled)'));
  assert.ok(content.includes('setLevel: (level) => ipcRenderer.invoke("dim-screen:set-level", level)'));
  assert.ok(content.includes('setExtraDim: (enabled, strength) => ipcRenderer.invoke("dim-screen:set-extra-dim", enabled, strength)'));
  assert.ok(content.includes('toggle: () => ipcRenderer.invoke("dim-screen:toggle")'));
  assert.ok(content.includes('listDisplays: () => ipcRenderer.invoke("dim-screen:list-displays")'));
  assert.ok(content.includes('onStateChanged: (callback) => {'));
});

test("8. Main process registers dim-screen IPC handlers and lifecycle hooks", () => {
  const mainPath = path.join(root, "electron", "main.ts");
  const content = fs.readFileSync(mainPath, "utf-8");

  assert.ok(content.includes('import { DimScreenManager } from "./dim-screen-manager.js";'), "Must import DimScreenManager");
  assert.ok(content.includes('let dimScreenManager: DimScreenManager | null = null;'), "Must declare dimScreenManager");
  assert.ok(content.includes('ipcMain.handle("dim-screen:update"'), "Must register dim-screen:update");
  assert.ok(content.includes('ipcMain.handle("dim-screen:get-state"'), "Must register dim-screen:get-state");
  assert.ok(content.includes('ipcMain.handle("dim-screen:set-enabled"'), "Must register dim-screen:set-enabled");
  assert.ok(content.includes('ipcMain.handle("dim-screen:set-level"'), "Must register dim-screen:set-level");
  assert.ok(content.includes('ipcMain.handle("dim-screen:set-extra-dim"'), "Must register dim-screen:set-extra-dim");
  assert.ok(content.includes('ipcMain.handle("dim-screen:toggle"'), "Must register dim-screen:toggle");
  assert.ok(content.includes('ipcMain.handle("dim-screen:list-displays"'), "Must register dim-screen:list-displays");
  assert.ok(content.includes("dimScreenManager = new DimScreenManager();"), "Must instantiate DimScreenManager");
  assert.ok(content.includes("dimScreenManager?.destroy();"), "Must clean up dimScreenManager on quit");
});

test("9. Action router and desktop actions include Dim Screen actions", () => {
  const routingPath = path.join(root, "electron", "action-routing.ts");
  const actionsPath = path.join(root, "electron", "actions.ts");

  const routingContent = fs.readFileSync(routingPath, "utf-8");
  assert.ok(routingContent.includes('"toggleDimScreen"'), "ELECTRON_DESKTOP_ACTIONS must include toggleDimScreen");
  assert.ok(routingContent.includes('"dimScreenControl"'), "ELECTRON_DESKTOP_ACTIONS must include dimScreenControl");

  const actionsContent = fs.readFileSync(actionsPath, "utf-8");
  assert.ok(actionsContent.includes("export function setDimScreenManager("), "Must export setDimScreenManager");
  assert.ok(actionsContent.includes('case "toggleDimScreen":'), "runDesktopAction must handle toggleDimScreen");
  assert.ok(actionsContent.includes('case "dimScreenControl":'), "runDesktopAction must handle dimScreenControl");
});

test("10. Hardware brightness provider file exists and has baseline recovery", () => {
  const hwPath = path.join(root, "electron", "hardware-brightness.ts");
  assert.ok(fs.existsSync(hwPath), "hardware-brightness.ts must exist");

  const content = fs.readFileSync(hwPath, "utf-8");
  assert.ok(content.includes("export class HardwareBrightnessProvider"), "Must export HardwareBrightnessProvider");
  assert.ok(content.includes("async captureBaseline():"), "Must implement captureBaseline");
  assert.ok(content.includes("async restoreBaseline():"), "Must implement restoreBaseline");
  assert.ok(content.includes("async setBrightness("), "Must implement setBrightness");
  assert.ok(content.includes("async getBrightness():"), "Must implement getBrightness");
});

test("11. DimScreenManager implements hybrid hardware + overlay architecture", () => {
  const mgrPath = path.join(root, "electron", "dim-screen-manager.ts");
  assert.ok(fs.existsSync(mgrPath), "dim-screen-manager.ts must exist");

  const content = fs.readFileSync(mgrPath, "utf-8");
  assert.ok(content.includes("export class DimScreenManager"), "Must export DimScreenManager");
  assert.ok(content.includes("private readonly hardware = new HardwareBrightnessProvider();"), "Must use HardwareBrightnessProvider");
  assert.ok(content.includes("async toggle():"), "Must implement toggle");
  assert.ok(content.includes("async setEnabled("), "Must implement setEnabled");
  assert.ok(content.includes("async setLevel("), "Must implement setLevel");
  assert.ok(content.includes("async setExtraDim("), "Must implement setExtraDim");
  assert.ok(content.includes("listDisplays():"), "Must implement listDisplays");
  assert.ok(content.includes("setAlwaysOnTop(true, \"screen-saver\")"), "Must set alwaysOnTop to screen-saver");
  assert.ok(content.includes("setIgnoreMouseEvents(true, { forward: true })"), "Must be click-through");
  assert.ok(!content.includes("setMainWindowFocused"), "Must NOT hide when main window is focused (stays dim on app switch)");
});

test("12. Screen Tint and Dim Screen coexist independently without interference", () => {
  const tintPath = path.join(root, "src", "pages", "settings", "ScreenTintPage.tsx");
  const dimPath = path.join(root, "src", "pages", "settings", "DimScreenPage.tsx");
  const tintWinPath = path.join(root, "electron", "screen-tint-window.ts");
  const dimMgrPath = path.join(root, "electron", "dim-screen-manager.ts");

  assert.ok(fs.existsSync(tintPath), "ScreenTintPage must exist");
  assert.ok(fs.existsSync(dimPath), "DimScreenPage must exist");
  assert.ok(fs.existsSync(tintWinPath), "screen-tint-window.ts must exist");
  assert.ok(fs.existsSync(dimMgrPath), "dim-screen-manager.ts must exist");

  const tintContent = fs.readFileSync(tintPath, "utf-8");
  const dimContent = fs.readFileSync(dimPath, "utf-8");

  assert.ok(tintContent.includes("row-tint-enable"), "Tint must have row-tint-enable");
  assert.ok(!tintContent.includes("row-dim-enable"), "Tint must not contain dim controls");
  assert.ok(dimContent.includes("row-dim-enable"), "Dim must have row-dim-enable");
  assert.ok(!dimContent.includes("row-tint-enable"), "Dim must not contain tint controls");
});

test("13. Command registry includes Toggle Dim Screen action", () => {
  const regPath = path.join(root, "src", "lib", "command-registry.ts");
  const content = fs.readFileSync(regPath, "utf-8");

  assert.ok(content.includes('id: "action.toggle-dim-screen"'), "Must include action.toggle-dim-screen in Command Registry");
  assert.ok(content.includes('title: "Toggle Dim Screen"'), "Must have title 'Toggle Dim Screen'");
});
