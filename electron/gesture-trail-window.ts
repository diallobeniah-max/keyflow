/**
 * GestureTrailWindowManager: owns the dedicated Hyper Gesture visual trail
 * BrowserWindow. The overlay is a transparent, frameless, click-through,
 * always-on-top window positioned over the screen.
 *
 * It renders the real-time drawing line and recognized action preview pill.
 * Because the user is moving the mouse with Hyper held, it uses
 * setIgnoreMouseEvents(true, { forward: true }) so it never captures or
 * interferes with mouse clicks, drags, or OS window interactions.
 */

import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import type { GestureTrailMessage } from "./native-input-helper.js";

const OVERLAY_LEVEL = "screen-saver";

export class GestureTrailWindowManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private pendingTrail: GestureTrailMessage | null = null;
  private hideTimer: NodeJS.Timeout | null = null;

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

  /** Update trail points and preview state. */
  updateTrail(msg: GestureTrailMessage): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (msg.status === "idle" || msg.status === "cancelled") {
      if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
        this.window.webContents.send("gesture:trail", msg);
        this.hideTimer = setTimeout(() => {
          if (this.window && !this.window.isDestroyed()) {
            this.window.hide();
          }
        }, 120);
      }
      this.pendingTrail = null;
      return;
    }

    // Active trail ("capturing" or "matched")
    if (!this.window || this.window.isDestroyed()) {
      this.ensureWindow();
    }
    const win = this.window;
    if (!win) return;

    // Position window across all displays or nearest display
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = display.bounds;

    const currentBounds = win.getBounds();
    if (
      currentBounds.x !== bounds.x ||
      currentBounds.y !== bounds.y ||
      currentBounds.width !== bounds.width ||
      currentBounds.height !== bounds.height
    ) {
      win.setBounds(bounds);
    }

    win.setAlwaysOnTop(true, OVERLAY_LEVEL);
    win.setIgnoreMouseEvents(true, { forward: true });

    if (!this.ready) {
      this.pendingTrail = msg;
      return;
    }

    win.webContents.send("gesture:trail", msg);
    if (!win.isVisible()) {
      win.showInactive();
    }
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.webContents.send("gesture:trail", {
        type: "gestureTrail",
        version: 1,
        status: "idle",
        points: [],
        stroke: "",
      });
      this.window.hide();
    }
    this.pendingTrail = null;
  }

  destroy(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.ready = false;
    this.pendingTrail = null;
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;
    const iconPath = join(this.appPath, "build/icon.ico");
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);

    this.window = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
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

    win.webContents.on("did-finish-load", () => {
      this.ready = true;
      const pending = this.pendingTrail;
      this.pendingTrail = null;
      if (pending && win && !win.isDestroyed()) {
        win.webContents.send("gesture:trail", pending);
        win.showInactive();
      }
    });

    win.on("closed", () => {
      this.window = null;
      this.ready = false;
      this.pendingTrail = null;
    });

    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    if (this.isDev) {
      win.loadURL(`${this.devUrl}/?window=gesture-trail`).catch((err) => {
        console.error(`[gesture-trail] loadURL failed: ${err.message}`);
      });
    } else {
      win.loadFile(join(this.appPath, "dist", "index.html"), { query: { window: "gesture-trail" } }).catch((err) => {
        console.error(`[gesture-trail] loadFile failed: ${err.message}`);
      });
    }
  }
}