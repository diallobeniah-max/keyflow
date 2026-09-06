import { BrowserWindow, screen } from "electron";

export type MediaPlayerPosition = "top-center" | "top-right" | "bottom-center" | "bottom-right" | "custom";

export interface MediaPlayerConfig {
  enabled?: boolean;
  position?: MediaPlayerPosition;
  customX?: number;
  customY?: number;
  autoHide?: boolean;
}

export interface MediaPlayerWindowOptions {
  devUrl: string;
  preloadPath: string;
  isDev: boolean;
  appPath: string;
}

const PILL_WIDTH = 360;
const PILL_HEIGHT = 60;

export class MediaPlayerWindowManager {
  private window: BrowserWindow | null = null;
  private config: MediaPlayerConfig = {
    enabled: false,
    position: "top-center",
    autoHide: false,
  };
  private onPositionChanged?: (pos: { customX: number; customY: number }) => void;

  constructor(private readonly options: MediaPlayerWindowOptions) {
    screen.on("display-metrics-changed", () => {
      if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
        this.reposition();
      }
    });
  }

  setOnPositionChanged(cb: (pos: { customX: number; customY: number }) => void): void {
    this.onPositionChanged = cb;
  }

  update(config: MediaPlayerConfig | undefined): void {
    this.config = {
      enabled: !!config?.enabled,
      position: config?.position ?? "top-center",
      customX: config?.customX,
      customY: config?.customY,
      autoHide: !!config?.autoHide,
    };
    console.log(`[media-player] update enabled=${this.config.enabled} pos=${this.config.position}`);

    if (!this.config.enabled) {
      this.hide();
      return;
    }

    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
    } else {
      this.reposition();
      if (!this.window.isVisible()) {
        this.window.showInactive();
      }
      this.sendState();
    }
  }

  toggle(): boolean {
    if (!this.window || this.window.isDestroyed()) {
      this.config.enabled = true;
      this.createWindow();
      return true;
    }
    if (this.window.isVisible()) {
      this.hide();
      this.config.enabled = false;
      return false;
    } else {
      this.reposition();
      this.window.showInactive();
      this.config.enabled = true;
      this.sendState();
      return true;
    }
  }

  show(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
    } else {
      this.reposition();
      this.window.showInactive();
      this.sendState();
    }
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  getState(): { enabled: boolean; position: MediaPlayerPosition; customX?: number; customY?: number } {
    return {
      enabled: !!(this.window && !this.window.isDestroyed() && this.window.isVisible()),
      position: this.config.position ?? "top-center",
      customX: this.config.customX,
      customY: this.config.customY,
    };
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  private calculateBounds(): { x: number; y: number; width: number; height: number } {
    const primary = screen.getPrimaryDisplay();
    const { x: dx, y: dy, width: dw, height: dh } = primary.workArea;

    const width = PILL_WIDTH;
    const height = PILL_HEIGHT;

    switch (this.config.position) {
      case "top-right":
        return {
          x: dx + dw - width - 24,
          y: dy + 16,
          width,
          height,
        };
      case "bottom-center":
        return {
          x: dx + Math.round((dw - width) / 2),
          y: dy + dh - height - 20,
          width,
          height,
        };
      case "bottom-right":
        return {
          x: dx + dw - width - 24,
          y: dy + dh - height - 20,
          width,
          height,
        };
      case "custom":
        if (typeof this.config.customX === "number" && typeof this.config.customY === "number") {
          return {
            x: Math.max(dx, Math.min(dx + dw - width, this.config.customX)),
            y: Math.max(dy, Math.min(dy + dh - height, this.config.customY)),
            width,
            height,
          };
        }
        // Fallback to top-center
        return {
          x: dx + Math.round((dw - width) / 2),
          y: dy + 16,
          width,
          height,
        };
      case "top-center":
      default:
        return {
          x: dx + Math.round((dw - width) / 2),
          y: dy + 16,
          width,
          height,
        };
    }
  }

  private reposition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.calculateBounds();
    this.window.setBounds(bounds);
  }

  private createWindow(): void {
    const bounds = this.calculateBounds();

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: true,
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

    this.window.setAlwaysOnTop(true, "screen-saver");

    this.window.on("moved", () => {
      if (!this.window || this.window.isDestroyed()) return;
      const [x, y] = this.window.getPosition();
      this.config.customX = x;
      this.config.customY = y;
      this.config.position = "custom";
      this.onPositionChanged?.({ customX: x, customY: y });
    });

    this.window.on("closed", () => {
      this.window = null;
    });

    this.window.webContents.on("did-finish-load", () => {
      this.sendState();
    });

    const url = `${this.options.devUrl}/?window=media-player`;
    if (this.options.isDev) {
      void this.window.loadURL(url).catch((err) => console.error("[media-player] load URL failed:", err.message));
    } else {
      void this.window.loadFile(`${this.options.appPath}/dist/index.html`, { query: { window: "media-player" } })
        .catch((err) => console.error("[media-player] load file failed:", err.message));
    }

    this.window.showInactive();
  }

  private sendState(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("media-player:state-changed", this.getState());
    }
  }
}
