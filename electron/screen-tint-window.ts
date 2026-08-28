import { BrowserWindow, screen } from "electron";

interface ScreenTintConfig {
  enabled?: boolean;
  color?: string;
  strength?: number;
}

interface ScreenTintWindowOptions {
  devUrl: string;
  preloadPath: string;
  isDev: boolean;
  appPath: string;
}

/** Transparent, click-through overlays that tint every connected display. */
export class ScreenTintWindowManager {
  private readonly windows = new Map<number, BrowserWindow>();
  private config: ScreenTintConfig = { enabled: false, color: "#F2C078", strength: 18 };
  private mainWindowFocused = false;
  private readonly onDisplayChange = () => this.syncWindows();

  constructor(private readonly options: ScreenTintWindowOptions) {
    screen.on("display-added", this.onDisplayChange);
    screen.on("display-removed", this.onDisplayChange);
    screen.on("display-metrics-changed", this.onDisplayChange);
  }

  update(config: ScreenTintConfig | undefined): void {
    this.config = {
      enabled: !!config?.enabled,
      color: normalizeColor(config?.color),
      strength: clamp(Number(config?.strength ?? 18), 0, 100),
    };
    console.log(`[screen-tint] update enabled=${this.config.enabled} color=${this.config.color} strength=${this.config.strength}`);
    this.syncWindows();
    this.broadcast();
  }

  setMainWindowFocused(focused: boolean): void {
    this.mainWindowFocused = focused;
    this.syncWindows();
  }

  destroy(): void {
    screen.off("display-added", this.onDisplayChange);
    screen.off("display-removed", this.onDisplayChange);
    screen.off("display-metrics-changed", this.onDisplayChange);
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) window.destroy();
    }
    this.windows.clear();
  }

  private syncWindows(): void {
    if (!this.config.enabled || this.mainWindowFocused) {
      for (const window of this.windows.values()) {
        if (!window.isDestroyed()) window.hide();
      }
      console.log(`[screen-tint] overlays hidden enabled=${this.config.enabled} focused=${this.mainWindowFocused}`);
      return;
    }

    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((display) => display.id));
    for (const [id, window] of this.windows) {
      if (!ids.has(id)) {
        if (!window.isDestroyed()) window.destroy();
        this.windows.delete(id);
      }
    }

    for (const display of displays) {
      let window = this.windows.get(display.id);
      if (!window || window.isDestroyed()) {
        window = this.createWindow(display.id);
        this.windows.set(display.id, window);
      }
      window.setBounds(display.bounds);
      if (!window.isVisible()) window.showInactive();
    }
    console.log(`[screen-tint] overlays=${this.windows.size} focused=${this.mainWindowFocused}`);
  }

  private createWindow(displayId: number): BrowserWindow {
    const window = new BrowserWindow({
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.setAlwaysOnTop(true, "screen-saver");
    window.setIgnoreMouseEvents(true, { forward: true });
    window.on("closed", () => {
      if (this.windows.get(displayId) === window) this.windows.delete(displayId);
    });
    window.webContents.on("did-finish-load", () => this.send(window));

    const url = `${this.options.devUrl}/?window=screen-tint`;
    if (this.options.isDev) {
      void window.loadURL(url).catch((error) => console.error(`[screen-tint] load failed: ${error.message}`));
    } else {
      void window.loadFile(`${this.options.appPath}/dist/index.html`, { query: { window: "screen-tint" } })
        .catch((error) => console.error(`[screen-tint] load failed: ${error.message}`));
    }
    return window;
  }

  private broadcast(): void {
    for (const window of this.windows.values()) this.send(window);
  }

  private send(window: BrowserWindow): void {
    if (!window.isDestroyed() && window.webContents.isLoading() === false) {
      window.webContents.send("screen-tint:update", this.config);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeColor(value: string | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#F2C078";
}
