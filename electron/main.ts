import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
} from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { createWindowState } from "./window-state.js";
import { NativeInputService } from "./input/native-input-service.js";
import { runDesktopAction, ActionResult } from "./actions.js";
import { PopupWindowManager } from "./popup-window.js";
import { DragSwitcherWindowManager } from "./drag-switcher-window.js";
import { HotCornersManager } from "./hot-corners.js";
import { ScreenTintWindowManager } from "./screen-tint-window.js";
import { notesService } from "./notes-window.js";
import { nextPopupGeneration, routeMatchedShortcut, notifyRendererMatched } from "./action-router.js";
import { NativeInputHelper, buildNativeKeyConfig, resolveNativeHelperPath } from "./native-input-helper.js";
import { NavigationModeController } from "./navigation-mode.js";
import { showNavigationOverlay, setSystemCursorBlue, restoreSystemCursor } from "./navigation-overlay.js";
import { playKeyFlowSound } from "./sound.js";
import { setNavigationModeController } from "./actions.js";
import { setNativeKeyInjector } from "./actions.js";
import { nativeKeyName } from "./vk-catalog.js";
import { AhkSuppressionManager } from "./ahk-suppression-manager.js";
import { findAhkExecutable } from "./ahk-detect.js";
import { buildNativeShortcutConfig, buildSuppressionConfig, buildNativeHyperSpec, HYPER_TAP_SYNTHETIC_ID, resolveActionForHyperTap } from "./suppression-config.js";
import { keyToVk } from "./win-vk.js";
import { initInputDebug, inputDebug } from "./input/input-debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_URL = process.env.KEYFLOW_DEV_SERVER_URL || "http://127.0.0.1:1420";
const FILE_PROTOCOL = "file://";
const PRELOAD_PATH = join(__dirname, "preload.js");

let mainWindow: BrowserWindow | null = null;
let inputService: NativeInputService | null = null;
let popupManager: PopupWindowManager | null = null;
let dragSwitcherManager: DragSwitcherWindowManager | null = null;
let hotCornersManager: HotCornersManager | null = null;
let screenTintManager: ScreenTintWindowManager | null = null;
let ahkManager: AhkSuppressionManager | null = null;
let nativeHelper: NativeInputHelper | null = null;
let navigationModeController: NavigationModeController | null = null;
let inputBackend: "native" | "legacy" = "native";
let nativeEngineStatus: string = "stopped";
let suppressionContext: Record<string, unknown> = {};
let lastShortcutEntries: any[] = [];
let suppressionStatus = "unavailable";
let suppressionBackend = "unavailable";
/** keyName -> mode for keys owned by the AHK suppression helper. */
let suppressionKeyModes = new Map<string, string>();

let nativeConfigVersion = 0;
let lastSentSpecsJson = "";
let lastSentHyperSpecJson = "";

function isPopupAction(action: any): boolean {
  return action?.type === "showPopup";
}

async function runActionsDesktop(actions: any[]): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  for (const action of actions ?? []) {
    if (isPopupAction(action)) {
      popupManager?.toggle({
        items: action.payload?.popupItems ?? [],
        title: action.payload?.title,
        generatorId: nextPopupGeneration(),
      });
      results.push({ ok: true, action: "showPopup" });
      continue;
    }
    results.push(await runDesktopAction(action, mainWindow));
  }
  return results;
}

function isAllowedOrigin(url: string): boolean {
  if (url.startsWith(DEV_URL)) return true;
  if (url.startsWith(FILE_PROTOCOL)) return true;
  return false;
}

function errorFallbackHtml(error: string): string {
  return `<!DOCTYPE html><html><body style="background:#0B1630;color:#F7FAFF;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
    <h2 style="margin-bottom:8px">KeyFlow ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Load Error</h2>
    <pre style="color:#FF6B7A;font-size:14px;max-width:520px;text-align:center">${error}</pre>
    <p style="color:#7F8DA8;font-size:13px">Check that the dev server is running and try reloading.</p>
  </body></html>`;
}

function createWindow(): void {
  const ws = createWindowState({ width: 1280, height: 800 });

  console.log(`[keyflow] preload path: ${PRELOAD_PATH}`);
  console.log(`[keyflow] preload exists: ${existsSync(PRELOAD_PATH)}`);
  console.log(`[keyflow] __dirname: ${__dirname}`);
  console.log(`[keyflow] DEV_URL: ${DEV_URL}`);

  const iconPath = join(__dirname, "../build/icon.ico");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    center: true,
    frame: false,
    show: false,
    icon: existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#0B1630",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`[keyflow] preload-error | path=${preloadPath} error=${error.message}`);
  });

  mainWindow.webContents.on("console-message", (event) => {
    if (typeof event === "object" && "message" in event) {
      console.log(`[renderer] ${event.message}`);
    }
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[keyflow] renderer process gone | reason=${details.reason} exitCode=${details.exitCode}`);
  });

  ws.restore(mainWindow);

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error(`[keyflow] did-fail-load | frame=${isMainFrame} code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    if (isMainFrame) {
      mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorFallbackHtml(`Navigation failed (${errorCode}): ${errorDescription}\nURL: ${validatedURL}`))}`);
    }
  });

  const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

  const devToolsEnabled = isDev && process.env.KEYFLOW_OPEN_DEVTOOLS === "1";

  if (isDev) {
    mainWindow.loadURL(DEV_URL).then(() => {
      console.log(`[keyflow] Loaded ${DEV_URL} successfully`);
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }).catch((err) => {
      console.error(`[keyflow] loadURL failed for ${DEV_URL}:`, err.message);
      mainWindow?.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorFallbackHtml(`Could not connect to Vite dev server.\n${err.message}`))}`);
    });
    if (devToolsEnabled) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const prodPath = join(app.getAppPath(), "dist", "index.html");
    mainWindow.loadFile(prodPath).catch((err) => {
      console.error(`[keyflow] loadFile failed:`, err.message);
    });
  }

  let shown = false;
  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed() && !shown) {
      shown = true;
      mainWindow.show();
      mainWindow.focus();
      console.log("[keyflow] window shown via ready-to-show");
    }
  });

  // Fallback: force-show window after 3s if ready-to-show hasn't fired
  const showFallbackRef = mainWindow;
  setTimeout(() => {
    if (showFallbackRef && !showFallbackRef.isDestroyed() && !shown) {
      shown = true;
      showFallbackRef.show();
      showFallbackRef.focus();
      console.log("[keyflow] window shown via fallback timeout");
    }
  }, 3000);

  ws.watch(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedOrigin(url)) {
      console.warn(`[keyflow] navigation blocked: ${url}`);
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    popupManager?.destroy();
    dragSwitcherManager?.destroy();
  });
}

function registerIPC(): void {
  ipcMain.handle("action:run", (_event, action: any) => {
    if (isPopupAction(action)) {
      popupManager?.toggle({
        items: action.payload?.popupItems ?? [],
        title: action.payload?.title,
        shortcutId: "renderer",
        generatorId: nextPopupGeneration(),
      });
      return { ok: true, action: "showPopup" } as ActionResult;
    }
    return runDesktopAction(action, mainWindow);
  });
  ipcMain.handle("popup:show", (_event, data: any) => {
    popupManager?.toggle({
      items: data?.items ?? [],
      title: data?.title,
      shortcutId: "renderer",
      generatorId: nextPopupGeneration(),
    });
    return { ok: true, action: "showPopup" } as ActionResult;
  });
  ipcMain.handle("popup:report-content-size", (_event, width: number, height: number) => {
    popupManager?.reportContentSize(width, height);
  });
  ipcMain.handle("popup:update-data", (_event, snapshot: any) => {
    popupManager?.updateData(snapshot ?? {});
  });
  ipcMain.handle("popup:execute-action", (_event, actions: any[]) => runActionsDesktop(actions));
  ipcMain.handle("popup:hide", (_event, gen?: string) => {
    popupManager?.hide(gen);
  });
  ipcMain.handle("drag-switcher:activate", (_event, hwnd: string) => {
    if (inputBackend === "native" && nativeHelper) {
      nativeHelper.activateDragSwitcherWindow(hwnd);
      return true;
    }
    return false;
  });
  ipcMain.handle("input:set-drag-switcher", (_event, config: { enabled: boolean; zones: number; activationMs: number; hoverMs: number; cornerSize: number }) => {
    if (inputBackend === "native" && nativeHelper) {
      nativeHelper.setDragSwitcher({
        enabled: !!config?.enabled,
        zones: config?.zones ?? 0,
        activationMs: config?.activationMs ?? 0,
        hoverMs: config?.hoverMs ?? 400,
        cornerSize: config?.cornerSize ?? 16,
      });
      return true;
    }
    return false;
  });
  ipcMain.handle("hot-corners:configure", (_event, config: any, shortcuts: any[]) => {
    hotCornersManager?.update(config, shortcuts);
    return true;
  });
  ipcMain.handle("screen-tint:update", (_event, config: any) => {
    screenTintManager?.update(config);
    return true;
  });
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-platform", () => process.platform);

  notesService.setupIPC();

  ipcMain.handle("input:update-shortcuts", async (_event, entries: any[], context: any) => {
    if (inputService) inputService.updateShortcuts(entries);
    suppressionContext = context ?? {};
    lastShortcutEntries = entries ?? [];
    if (inputBackend === "native") {
      if (context?.extendedAccess !== undefined && nativeHelper) {
        await nativeHelper.setElevated(!!context.extendedAccess);
      }
      const specs = buildNativeShortcutConfig(entries ?? [], suppressionContext);
      const hyperSpec = buildNativeHyperSpec(suppressionContext, entries ?? []);

      const currentSpecsJson = JSON.stringify(specs);
      const currentHyperJson = JSON.stringify(hyperSpec);

      if (currentSpecsJson === lastSentSpecsJson && currentHyperJson === lastSentHyperSpecJson) {
        console.log(`[native-config] skip reason=unchanged version=${nativeConfigVersion}`);
        return;
      }

      lastSentSpecsJson = currentSpecsJson;
      lastSentHyperSpecJson = currentHyperJson;
      nativeConfigVersion += 1;
      nativeHelper?.setShortcuts(specs, hyperSpec, nativeConfigVersion);
      const hkCfg = (suppressionContext as any)?.hyperKeyConfig ?? {};
      const resolvedVk = keyToVk(hkCfg.key);
      const tapAction = hkCfg.tapActionId || "showPopup";
      const syntheticTapEntryExists = !!(hyperSpec?.tapActionId);
      const syntheticTapAction = tapAction;

      console.log("[hyper-forensic] ===== HYPER STARTUP =====");
      console.log(`[hyper-forensic] settings.enabled=${!!hkCfg.enabled}`);
      console.log(`[hyper-forensic] settings.physicalKey=${hkCfg.key || "(none)"}`);
      console.log(`[hyper-forensic] settings.tapAction=${tapAction}`);
      console.log(`[hyper-forensic] includeShift=${!!hkCfg.includeShift}`);
      console.log(`[hyper-forensic] resolvedVk=${resolvedVk ?? "undefined"}`);
      console.log(`[hyper-forensic] nativeConfigVersion=${nativeConfigVersion}`);
      console.log(`[hyper-forensic] nativeRuleCount=${specs.length}`);
      console.log(`[hyper-forensic] syntheticTapEntryExists=${syntheticTapEntryExists}`);
      console.log(`[hyper-forensic] syntheticTapAction=${syntheticTapAction}`);
      console.log("[hyper-forensic] =========================");

      for (const spec of specs) {
        if (spec.name?.includes("Hyper") || (spec.modifiers ?? []).some((m: string) => m.toLowerCase() === "hyper" || (m.toLowerCase() === "ctrl" && spec.modifiers?.includes("alt") && spec.modifiers?.includes("win")))) {
          console.log(`[hyper-forensic] RULE id=${spec.id} display=${spec.name || spec.id} keyVk=${spec.key.vk} compiledModifiers=${spec.modifiers.join(",")} enabled=true profile=Default`);
        }
      }

      inputDebug(`[input-debug] update-shortcuts (native) v${nativeConfigVersion}: ${specs.length} native specs, context.paused=${suppressionContext.paused} safeMode=${suppressionContext.safeMode} elevated=${nativeHelper?.isElevatedMode()}`);
      console.log(`[native-config] send version=${nativeConfigVersion} rules=${specs.length} hyperEnabled=${!!hyperSpec?.enabled} hyperPhysical=${hkCfg.key || "(none)"} hyperTap=${hkCfg.tapActionId || "none"}`);
      return;
    }
    const config = buildSuppressionConfig(entries ?? [], suppressionContext);
    suppressionKeyModes = new Map<string, string>();
    for (const entry of config.entries ?? []) {
      suppressionKeyModes.set(entry.keyName.toLowerCase(), entry.mode);
      console.log(`[suppress] configured key: ${entry.keyName} mode=${entry.mode}`);
    }
    inputDebug(`[input-debug] update-shortcuts (legacy): ${(entries ?? []).length} shortcuts, context.paused=${suppressionContext.paused} safeMode=${suppressionContext.safeMode}, suppressed=${[...suppressionKeyModes.entries()].map(([k, m]) => `${k}:${m}`).join(",") || "(none)"}`);
    ahkManager?.updateConfig(config);
    inputService?.setIgnoredKeyNames((config.entries ?? []).map((e) => e.keyName));
  });

  ipcMain.handle("input:set-paused", (_event, paused: boolean) => {
    if (inputService) {
      if (paused) inputService.pause();
      else inputService.resume();
    }
    if (inputBackend === "native") {
      nativeHelper?.setPaused(paused);
    } else {
      ahkManager?.setPaused(paused);
    }
  });

  ipcMain.on("native:capture-log", (_event, line: string) => {
    if (typeof line === "string" && line) console.log(line);
  });

  ipcMain.handle("native:begin-capture", async () => {
    if (inputBackend === "native") {
      console.log("[key-capture-electron] request");
      const armed = await nativeHelper?.beginCapture();
      console.log(`[key-capture-electron] armed=${armed === true}`);
      return armed === true;
    }
    console.warn("[key-capture-electron] begin skipped (backend not native)");
    return false;
  });

  ipcMain.handle("native:cancel-capture", () => {
    if (inputBackend === "native") {
      console.log("[key-capture-electron] StopKeyCapture");
      nativeHelper?.cancelCapture();
      return true;
    }
    return false;
  });

ipcMain.handle("native:set-key-stream", (_event, enabled: boolean) => {
    if (inputBackend === "native") {
      nativeHelper?.setKeyStream(enabled);
      return true;
    }
    return false;
  });

  ipcMain.handle("native:list-apps", async () => {
    if (inputBackend !== "native" || !nativeHelper) return [];
    return nativeHelper.listApps();
  });

  ipcMain.handle("native:get-active-app", async () => {
    if (inputBackend !== "native" || !nativeHelper) return null;
    return nativeHelper.getActiveApp();
  });

  ipcMain.handle("native:browse-exe", async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: "Choose an application",
      properties: ["openFile"],
      filters: [{ name: "Applications", extensions: ["exe", "bat", "cmd", "com"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

ipcMain.handle("input:get-suppression", () => {
    const status = inputBackend === "native" ? nativeEngineStatus : suppressionStatus;
    return {
      available: status === "ready" || status === "starting",
      status,
      backend: inputBackend === "native" ? "native" : suppressionBackend,
    };
  });

  ipcMain.handle("native:get-status", () => {
    const diag = nativeHelper?.getDiagnostics();
    const hk = (suppressionContext as any)?.hyperKeyConfig ?? {};
    return {
      backend: inputBackend,
      engineStatus: diag?.status ?? nativeEngineStatus ?? "unavailable",
      configSynced: diag?.synced ?? false,
      requestedVersion: diag?.requested ?? 0,
      ackedVersion: diag?.acked ?? 0,
      ruleCount: diag?.ruleCount ?? 0,
      hyperEnabled: diag?.hyperEnabled ?? !!hk.enabled,
      hyperVk: diag?.hyperVk ?? (keyToVk(hk.key) ?? 0),
      includeShift: !!hk.includeShift,
      extendedAccess: !!suppressionContext?.extendedAccess,
    };
  });

  ipcMain.handle("navigation:get-state", () => navigationModeController?.isActive() ?? false);

  ipcMain.handle("input:get-status", () => {
    return inputService?.getStatus() ?? "stopped";
  });
}

function sendMaximizedChange(maximized: boolean): void {
  mainWindow?.webContents.send("window:maximized-change", maximized);
}

function initInputService(): void {
  inputService = new NativeInputService(
    (sc) => {
      void routeMatchedShortcut(sc, { popupManager, mainWindow }).then((results) => {
        notifyRendererMatched(sc, mainWindow, results);
      });
    },
    {
      keyboardSource: inputBackend === "native" ? "native" : "uiohook",
      keyName: nativeKeyName,
    },
  );
  inputService.start();
}

/**
 * Native path: Rust owns keyboard gesture recognition and emits `triggered`.
 * Look up the shortcut by id and route exactly like a TS matcher match — the
 * renderer never re-evaluates the key stream.
 */
function routeNativeTriggered(msg: { shortcutId: string; generation: number }): void {
  console.log(`[hyper-forensic] ELECTRON RECEIVE type=triggered shortcutId=${msg.shortcutId}`);
  console.log(`[hyper-chord #10] electronReceived=${msg.shortcutId}`);
  let sc = (lastShortcutEntries ?? []).find((s) => s?.id === msg.shortcutId);
  const isSynthetic = !sc && (msg.shortcutId === HYPER_TAP_SYNTHETIC_ID || msg.shortcutId === "showPopup" || msg.shortcutId === "notesPopup" || msg.shortcutId === "screenshot" || msg.shortcutId === "alwaysOnTop");
  if (isSynthetic) {
    const tapActionId = (suppressionContext as any)?.hyperKeyConfig?.tapActionId || msg.shortcutId;
    const actions = resolveActionForHyperTap(tapActionId);
    console.log(`[hyper-forensic] TAP ENTRY exists=true actionType=${tapActionId}`);
    if (actions.length > 0) {
      sc = {
        id: msg.shortcutId,
        name: "Hyper Tap Action",
        profileId: "all",
        key: (suppressionContext as any)?.hyperKeyConfig?.key || "AltRight",
        modifiers: [],
        trigger: "single",
        actions,
        enabled: true,
      };
    }
  } else {
    console.log(`[hyper-forensic] TAP ENTRY exists=${!!sc} actionType=${sc ? sc.actions?.[0]?.type ?? "custom" : "none"}`);
  }

  if (!sc) {
    console.warn(`[native-input] triggered ${msg.shortcutId} but no matching shortcut (stale config?)`);
    console.log(`[hyper-forensic] ACTION ROUTER shortcutId=${msg.shortcutId} action=none result=failed_no_shortcut`);
    inputDebug(`[input-debug] native triggered ${msg.shortcutId} UNROUTED (no shortcut entry)`);
    return;
  }
  const primaryAction = sc.actions?.[0]?.type ?? "unknown";
  console.log(`[hyper-chord #11] action=${primaryAction}`);
  console.log(`[hyper-forensic] ACTION ROUTER shortcutId=${msg.shortcutId} action=${primaryAction} result=executing`);
  console.log(`[native-input] route ${msg.shortcutId} gen=${msg.generation} key=${sc.key} trigger=${sc.trigger}`);
  inputDebug(`[input-debug] native route ${msg.shortcutId} gen=${msg.generation} trigger=${sc.trigger}`);
  void routeMatchedShortcut(sc, { popupManager, mainWindow }).then((results) => {
    console.log(`[hyper-forensic] ACTION ROUTER shortcutId=${msg.shortcutId} action=${primaryAction} result=ok`);
    notifyRendererMatched(sc, mainWindow, results);
  });
}

/** Fallback from the native helper to the legacy (uiohook + AHK) pipeline. */
function fallbackToLegacy(reason: string): void {
  if (inputBackend !== "native") return;
  console.error(`[native-input] falling back to legacy backend (${reason})`);
  inputDebug(`[input-debug] backend fallback native -> legacy (${reason})`);
  inputBackend = "legacy";
  inputService?.setKeyboardSource("uiohook");
  initLegacyAhk();
}

/** Legacy pipeline: AutoHotkey suppression helper feeding the same matcher. */
function initLegacyAhk(): void {
  const ahkExe = findAhkExecutable();
  suppressionBackend = ahkExe ? "autohotkey" : "unavailable";
  if (ahkManager) return;
  ahkManager = new AhkSuppressionManager({
    ahkExe,
    runtimeDir: join(app.getPath("userData"), "runtime"),
    onEvent: (e) => {
      const mode = suppressionKeyModes.get(e.key.toLowerCase());
      inputDebug(`[input-debug] ahk ${e.state} ${e.key} seq=${e.sequence} mode=${mode ?? "(none)"}`);
      if (mode === "suppress") {
        // AHK consumed the key from Windows/uiohook; feed it into the matcher so
        // the shortcut action (e.g. screenshot) still fires exactly once.
        inputService?.injectKeyEvent(e.state, e.key);
      }
    },
    onStatus: (status: string) => { suppressionStatus = status; },
  });
  ahkManager.start();
  // Keys AHK suppresses are invisible to uiohook; the AHK event path feeds them.
  const config = buildSuppressionConfig(lastShortcutEntries, suppressionContext);
  ahkManager.updateConfig(config);
  suppressionKeyModes = new Map<string, string>();
  for (const entry of config.entries ?? []) {
    suppressionKeyModes.set(entry.keyName.toLowerCase(), entry.mode);
  }
  inputService?.setIgnoredKeyNames((config.entries ?? []).map((e) => e.keyName));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  initInputDebug(join(app.getPath("userData"), "runtime"));
  popupManager = new PopupWindowManager({
    devUrl: DEV_URL,
    preloadPath: PRELOAD_PATH,
    isDev: process.env.NODE_ENV === "development" || process.argv.includes("--dev"),
    appPath: app.getAppPath(),
  });
  dragSwitcherManager = new DragSwitcherWindowManager({
    devUrl: DEV_URL,
    preloadPath: PRELOAD_PATH,
    isDev: process.env.NODE_ENV === "development" || process.argv.includes("--dev"),
    appPath: app.getAppPath(),
  });
  hotCornersManager = new HotCornersManager({
    getMainWindow: () => mainWindow,
    executeActions: (actions) => runActionsDesktop(actions),
  });
  hotCornersManager.start();
  screenTintManager = new ScreenTintWindowManager({
    devUrl: DEV_URL,
    preloadPath: PRELOAD_PATH,
    isDev: process.env.NODE_ENV === "development" || process.argv.includes("--dev"),
    appPath: app.getAppPath(),
  });
  registerIPC();
  createWindow();

  const envBackend = process.env.KEYFLOW_INPUT_BACKEND;
  if (envBackend === "legacy") {
    inputBackend = "legacy";
    console.log("[native-input] backend=legacy (forced by KEYFLOW_INPUT_BACKEND)");
  } else {
    inputBackend = resolveNativeHelperPath() ? "native" : "legacy";
    console.log(`[native-input] backend=${inputBackend}`);
  }

  initInputService();

  if (inputBackend === "native") {
    const helperPath = resolveNativeHelperPath();
    console.log(`[native-input] helper path=${helperPath}`);
    console.log("[native-input] captureProtocol=true");
    console.log("[native-input] keyboard source=native-helper");
    console.log("[native-input] uiohook keyboard disabled");
    nativeHelper = new NativeInputHelper(
      (e) => {},
      (status) => {
        if (status === "failed") {
          nativeEngineStatus = "failed";
          fallbackToLegacy("helper failed");
          return;
        }
        nativeEngineStatus = status;
        if (status === "ready" && navigationModeController?.isActive()) {
          nativeHelper?.setWasdNavigation(true);
        }
      },
    );
    nativeHelper.setOnTrigger((msg) => routeNativeTriggered(msg));
    nativeHelper.setOnCapturedKey((msg: import("./native-input-helper.js").NativeCapturedKeyMessage) => {
      console.log(`[key-capture-electron] received vk=${msg.vk} key=${msg.name}`);
      mainWindow?.webContents.send("native:captured-key", msg);
    });
    nativeHelper.setOnCaptureCancelled(() => {
      console.log("[key-capture-electron] cancelled");
      mainWindow?.webContents.send("native:capture-cancelled");
    });
    nativeHelper.setOnDragSwitcherShow((msg) => dragSwitcherManager?.show(msg));
    nativeHelper.setOnDragSwitcherMove((msg) => dragSwitcherManager?.move(msg.x, msg.y));
    nativeHelper.setOnDragSwitcherHide((msg) => dragSwitcherManager?.hide(msg.reason));
    nativeHelper.setOnWindowActivationResult((msg) => {
      mainWindow?.webContents.send("drag-switcher:activation-result", msg);
    });
    nativeHelper.start(process.pid);
    setNativeKeyInjector((vk, extended, down) => (nativeHelper ? nativeHelper.injectKey(vk, extended, down) : Promise.resolve(false)));
  } else {
    console.log("[native-input] keyboard source=uiohook (legacy)");
    initLegacyAhk();
  }

  navigationModeController = new NavigationModeController({
    sendToNative: (enabled, cursor) => nativeHelper?.setWasdNavigation(enabled, cursor?.size, cursor?.customPath),
    getMainWindow: () => mainWindow,
    playSound: (name) => playKeyFlowSound(name),
    showOverlay: (active) => showNavigationOverlay(active),
    setCursor: (active) => setSystemCursorBlue(active),
  });
  setNavigationModeController(navigationModeController);

  mainWindow?.on("maximize", () => sendMaximizedChange(true));
  mainWindow?.on("unmaximize", () => sendMaximizedChange(false));
  mainWindow?.on("focus", () => screenTintManager?.setMainWindowFocused(true));
  mainWindow?.on("blur", () => screenTintManager?.setMainWindowFocused(false));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  restoreSystemCursor();
  inputService?.stop();
  ahkManager?.stop();
  nativeHelper?.shutdown();
  app.quit();
});

app.on("will-quit", () => {
  restoreSystemCursor();
  inputService?.stop();
  ahkManager?.stop();
  nativeHelper?.shutdown();
  dragSwitcherManager?.destroy();
  hotCornersManager?.stop();
  screenTintManager?.destroy();
});
