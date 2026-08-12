import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { toggleWindowTopmost } from "./window-control.js";

export class FloatingPinManager {
  private window: BrowserWindow | null = null;
  private timer: NodeJS.Timeout | null = null;
  private enabled = false;
  private isDev: boolean;
  private devUrl: string;
  private preloadPath: string;
  private appPath: string;
  private lastHwnd = 0;

  constructor(options: { devUrl: string; preloadPath: string; isDev: boolean; appPath: string }) {
    this.devUrl = options.devUrl;
    this.preloadPath = options.preloadPath;
    this.isDev = options.isDev;
    this.appPath = options.appPath;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.ensureWindow();
      this.startTracking();
    } else {
      this.stopTracking();
      if (this.window && !this.window.isDestroyed()) {
        this.window.hide();
      }
    }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: 40,
      height: 40,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.window.setAlwaysOnTop(true, "screen-saver");
    this.window.setIgnoreMouseEvents(false);

    if (this.isDev) {
      this.window.loadURL(`${this.devUrl}/?window=floating-pin`).catch(() => {});
    } else {
      this.window.loadFile(join(this.appPath, "dist", "index.html"), { query: { window: "floating-pin" } }).catch(() => {});
    }
  }

  private startTracking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.enabled) return;
      // In a minimal, lightweight implementation, the pin stays ready
    }, 1000);
  }

  private stopTracking(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async toggleCurrentTopmost(mode = "toggle"): Promise<any> {
    return toggleWindowTopmost({ mode: mode as any });
  }

  destroy(): void {
    this.stopTracking();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
