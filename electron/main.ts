import {
  app,
  BrowserWindow,
  ipcMain,
} from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { createWindowState } from "./window-state.js";
import { NativeInputService } from "./input/native-input-service.js";
import { runDesktopAction, ActionResult } from "./actions.js";
import { PopupWindowManager } from "./popup-window.js";
import { nextPopupGeneration, routeMatchedShortcut, notifyRendererMatched } from "./action-router.js";
import { NativeInputHelper, buildNativeKeyConfig, resolveNativeHelperPath } from "./native-input-helper.js";
import { nativeKeyName } from "./vk-catalog.js";
import { AhkSuppressionManager } from "./ahk-suppression-manager.js";
import { findAhkExecutable } from "./ahk-detect.js";
import { buildNativeShortcutConfig, buildSuppressionConfig, buildNativeHyperSpec } from "./suppression-config.js";
import { initInputDebug, inputDebug } from "./input/input-debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_URL = process.env.KEYFLOW_DEV_SERVER_URL || "http://127.0.0.1:1420";
const FILE_PROTOCOL = "file://";
const PRELOAD_PATH = join(__dirname, "preload.js");

let mainWindow: BrowserWindow | null = null;
let inputService: NativeInputService | null = null;
let popupManager: PopupWindowManager | null = null;
let ahkManager: AhkSuppressionManager | null = null;
let nativeHelper: NativeInputHelper | null = null;
let inputBackend: "native" | "legacy" = "native";
let suppressionContext: Record<string, unknown> = {};
let lastShortcutEntries: any[] = [];
let suppressionStatus = "unavailable";
let suppressionBackend = "unavailable";
/** keyName -> mode for keys owned by the AHK suppression helper. */
let suppressionKeyModes = new Map<string, string>();

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

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

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
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-platform", () => process.platform);

  ipcMain.handle("input:update-shortcuts", async (_event, entries: any[], context: any) => {
    if (inputService) inputService.updateShortcuts(entries);
    suppressionContext = context ?? {};
    lastShortcutEntries = entries ?? [];
    if (inputBackend === "native") {
      if (context?.extendedAccess !== undefined && nativeHelper) {
        await nativeHelper.setElevated(!!context.extendedAccess);
      }
      const specs = buildNativeShortcutConfig(entries ?? [], suppressionContext);
      const hyperSpec = buildNativeHyperSpec(suppressionContext);
      nativeHelper?.setShortcuts(specs, hyperSpec);
      inputDebug(`[input-debug] update-shortcuts (native): ${specs.length} native specs, context.paused=${suppressionContext.paused} safeMode=${suppressionContext.safeMode} elevated=${nativeHelper?.isElevatedMode()}`);
      console.log(`[native-input] owner=native-rust gesture-engine=native-rust shortcuts=${specs.length} paused=${!!suppressionContext.paused} elevated=${nativeHelper?.isElevatedMode()}`);
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

  ipcMain.handle("native:begin-capture", () => {
    if (inputBackend === "native") {
      nativeHelper?.beginCapture();
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

  ipcMain.handle("input:get-suppression", () => {
    return {
      available: suppressionStatus === "ready" || suppressionStatus === "starting",
      status: suppressionStatus,
      backend: suppressionBackend,
    };
  });

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
  const sc = (lastShortcutEntries ?? []).find((s) => s?.id === msg.shortcutId);
  if (!sc) {
    console.warn(`[native-input] triggered ${msg.shortcutId} but no matching shortcut (stale config?)`);
    inputDebug(`[input-debug] native triggered ${msg.shortcutId} UNROUTED (no shortcut entry)`);
    return;
  }
  console.log(`[native-input] route ${msg.shortcutId} gen=${msg.generation} key=${sc.key} trigger=${sc.trigger}`);
  inputDebug(`[input-debug] native route ${msg.shortcutId} gen=${msg.generation} trigger=${sc.trigger}`);
  void routeMatchedShortcut(sc, { popupManager, mainWindow }).then((results) => {
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
    console.log("[native-input] keyboard source=native-helper");
    console.log("[native-input] uiohook keyboard disabled");
    nativeHelper = new NativeInputHelper(
      (e) => {},
      (status) => {
        if (status === "failed") fallbackToLegacy("helper failed");
      },
    );
    nativeHelper.setOnTrigger((msg) => routeNativeTriggered(msg));
    nativeHelper.setOnCapturedKey((msg: import("./native-input-helper.js").NativeCapturedKeyMessage) => {
      mainWindow?.webContents.send("native:captured-key", msg);
    });
    nativeHelper.start(process.pid);
  } else {
    console.log("[native-input] keyboard source=uiohook (legacy)");
    initLegacyAhk();
  }

  mainWindow?.on("maximize", () => sendMaximizedChange(true));
  mainWindow?.on("unmaximize", () => sendMaximizedChange(false));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  inputService?.stop();
  ahkManager?.stop();
  nativeHelper?.shutdown();
  app.quit();
});

app.on("will-quit", () => {
  inputService?.stop();
  ahkManager?.stop();
  nativeHelper?.shutdown();
});







