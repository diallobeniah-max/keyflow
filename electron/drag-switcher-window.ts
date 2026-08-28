/**
 * DragSwitcherWindowManager: owns the dedicated Drag Corner Switcher overlay
 * BrowserWindow. The overlay is a transparent, always-on-top, mouse-transparent
 * window that covers the active monitor's work area and renders one tile per
 * eligible window. The user is still physically dragging a file, so the overlay
 * must never steal focus or swallow the drag — setIgnoreMouseEvents(true,
 * { forward: true }) passes clicks through while still delivering mousemove
 * to the page for hover-dwell hit-testing.
 *
 * The native helper drives the lifecycle: DragSwitcherShow positions + shows,
 * DragSwitcherMove / page mousemove drive hover, DragSwitcherHide hides.
 * Window activation is requested by the renderer via `drag-switcher:activate`
 * IPC and fulfilled by the native helper (never synthesized mouse).
 */

import { BrowserWindow } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import type { DragSwitcherShowMessage } from "./native-input-helper.js";

const OVERLAY_LEVEL = "screen-saver";

export class DragSwitcherWindowManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private pendingShow: DragSwitcherShowMessage | null = null;

  private readonly devUrl: string;
  private readonly preloadPath: string;
  private readonly isDev: boolean;
  private readonly appPath: string;

  constructor(options: { devUrl: string; preloadPath: string; isDev: boolean; appPath: string }) {
    this.devUrl = options.devUrl;
    this.preloadPath = options.preloadPath;
    this.isDev = options.isDev;
    this.appPath = options.appPath;
  }

  get isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }

  /** Position the overlay over the reported work area and reveal it. */
  show(msg: DragSwitcherShowMessage): void {
    if (!this.window || this.window.isDestroyed()) {
      this.ensureWindow();
    }
    const win = this.window;
    if (!win) return;
    const bounds = {
      x: msg.workLeft,
      y: msg.workTop,
      width: Math.max(1, msg.workRight - msg.workLeft),
      height: Math.max(1, msg.workBottom - msg.workTop),
    };
    win.setBounds(bounds);
    win.setAlwaysOnTop(true, OVERLAY_LEVEL);
    win.setIgnoreMouseEvents(true, { forward: true });
    if (!this.ready) {
      this.pendingShow = msg;
      return;
    }
    win.webContents.send("drag-switcher:data", msg);
    win.showInactive();
    console.log(`[drag-v2] electronShowReceived positioned windows=${msg.windows.length} bounds=${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`);
  }

  /** Forward the native cursor position so the renderer can hit-test. */
  move(x: number, y: number): void {
    const win = this.window;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    win.webContents.send("drag-switcher:move", { x, y });
  }

  /** Hide the overlay (mouse up / escape / source gone / disable / etc.). */
  hide(reason: string): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    if (win.isVisible()) {
      win.webContents.send("drag-switcher:hide", { reason });
      win.hide();
    }
    this.pendingShow = null;
    console.log(`[drag-v2] electronHideReceived reason=${reason}`);
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.ready = false;
    this.pendingShow = null;
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;
    const iconPath = join(this.appPath, "build/icon.ico");
    this.window = new BrowserWindow({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      icon: existsSync(iconPath) ? iconPath : undefined,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      focusable: false,
      fullscreenable: false,
      hasShadow: false,
      roundedCorners: false,
      thickFrame: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    const win = this.window;
    win.setAlwaysOnTop(true, OVERLAY_LEVEL);
    win.setMenuBarVisibility(false);
    win.setIgnoreMouseEvents(true, { forward: true });

    win.webContents.on("preload-error", (_event, preloadPath, error) => {
      console.error(`[drag-switcher] preload-error | path=${preloadPath} error=${error.message}`);
    });
    win.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[drag-switcher] renderer process gone | reason=${details.reason} exitCode=${details.exitCode}`);
    });
    win.webContents.on("console-message", (_event, _level, message) => {
      if (message) console.log(`[drag-switcher-renderer] ${message}`);
    });
    win.webContents.on("did-finish-load", () => {
      this.ready = true;
      console.log("[drag-switcher] overlay renderer loaded — ready");
      const pending = this.pendingShow;
      this.pendingShow = null;
      if (pending) {
        const bounds = {
          x: pending.workLeft,
          y: pending.workTop,
          width: Math.max(1, pending.workRight - pending.workLeft),
          height: Math.max(1, pending.workBottom - pending.workTop),
        };
        win.setBounds(bounds);
        win.webContents.send("drag-switcher:data", pending);
        win.showInactive();
      }
    });

    win.on("closed", () => {
      this.window = null;
      this.ready = false;
      this.pendingShow = null;
    });

    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    if (this.isDev) {
      win.loadURL(`${this.devUrl}/?window=drag-switcher`).catch((err) => {
        console.error(`[drag-switcher] loadURL failed: ${err.message}`);
      });
    } else {
      win.loadFile(join(this.appPath, "dist", "index.html"), { query: { window: "drag-switcher" } }).catch((err) => {
        console.error(`[drag-switcher] loadFile failed: ${err.message}`);
      });
    }
  }
}