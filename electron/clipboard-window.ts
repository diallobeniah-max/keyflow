import { app, BrowserWindow, screen } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import { clipboardPopupBounds, type ClipboardOverlayLayout, type ClipboardHorizontalPosition, type ClipboardGridRows } from "./clipboard-contract.js";
import type { ClipboardSnapshot } from "./clipboard-engine.js";

export interface ClipboardWindowOptions {
  devUrl: string;
  preloadPath: string;
  isDev: boolean;
  appPath: string;
}

export class ClipboardWindowManager {
  private window: BrowserWindow | null = null;
  private isReady = false;
  private layout: ClipboardOverlayLayout = "horizontal";
  private horizontalPosition: ClipboardHorizontalPosition = "bottom";
  private keepOpen = false;
  private closeOnBlur = true;
  private openedAt = 0;
  private wantsVisible = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private gridRows: ClipboardGridRows = 1;
  private previousWindow: BrowserWindow | null = null;

  async hideForPaste(): Promise<void> {
    this.hide();
    // Electron may reactivate its primary window instead of the previously
    // focused sibling. Restore that sibling explicitly; external apps use
    // Windows' normal focus restoration after the shelf is hidden.
    if (this.previousWindow && !this.previousWindow.isDestroyed()) this.previousWindow.focus();
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  sync(snapshot: ClipboardSnapshot): void {
    const { settings } = snapshot;
    const layout = settings.layout ?? "horizontal";
    const position = settings.horizontalPosition ?? "bottom";
    const rows = settings.gridRows ?? 1;
    const changed = this.layout !== layout || this.horizontalPosition !== position || this.gridRows !== rows;
    this.layout = layout;
    this.horizontalPosition = position;
    this.gridRows = rows;
    this.setCloseOnBlur(settings.closeOnBlur !== false);
    if (this.window && !this.window.isDestroyed()) {
      if (changed) this.reposition();
      this.window.webContents.send("clipboard:changed", snapshot);
    }
  }

  private cancelClose(): void {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  requestClose(): void {
    this.cancelClose();
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send("clipboard-popup:request-close");
    this.closeTimer = setTimeout(() => this.hide(), 240);
  }

  restoreAfterPaste(forceKeepOpen = false): void {
    if (!(forceKeepOpen || this.keepOpen) || !this.window || this.window.isDestroyed()) return;
    this.cancelClose();
    this.wantsVisible = true;
    this.openedAt = Date.now();
    this.window.showInactive();
    this.window.webContents.send("clipboard-popup:show");
  }

  constructor(private readonly options: ClipboardWindowOptions) {
    screen.on("display-metrics-changed", () => {
      if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
        this.reposition();
      }
    });
  }

  get isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }

  setLayout(layout: ClipboardOverlayLayout, position?: ClipboardHorizontalPosition): void {
    this.layout = layout;
    if (position) this.horizontalPosition = position;
    if (this.window && !this.window.isDestroyed()) {
      this.reposition();
      this.window.webContents.send("clipboard-popup:layout-changed", {
        layout: this.layout,
        position: this.horizontalPosition,
      });
    }
  }

  setKeepOpen(keepOpen: boolean): void {
    this.keepOpen = keepOpen;
    if (keepOpen) this.cancelClose();
  }

  setCloseOnBlur(closeOnBlur: boolean): void {
    this.closeOnBlur = closeOnBlur;
    if (!closeOnBlur) this.cancelClose();
  }

  toggle(): boolean {
    if (this.isVisible || this.wantsVisible) {
      this.requestClose();
      return false;
    } else {
      this.show();
      return true;
    }
  }

  show(): void {
    const focused = BrowserWindow.getFocusedWindow();
    if (focused !== this.window) this.previousWindow = focused;
    this.cancelClose();
    this.wantsVisible = true;
    this.openedAt = Date.now();
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
      return;
    }
    this.reposition();
    if (!this.isReady) return;
    this.window.show();
    this.window.focus();
    this.window.webContents.send("clipboard-popup:show");
    this.window.webContents.send("clipboard-popup:focus-search");
  }

  hide(): void {
    this.cancelClose();
    this.wantsVisible = false;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide();
    }
  }

  destroy(): void {
    this.cancelClose();
    this.wantsVisible = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  private calculateBounds(): { x: number; y: number; width: number; height: number } {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    return clipboardPopupBounds(display.workArea, this.layout, this.horizontalPosition, this.gridRows);
  }

  private reposition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.calculateBounds();
    this.window.setBounds(bounds);
  }

  private createWindow(): void {
    const bounds = this.calculateBounds();
    let iconPath: string | undefined;
    const isPackaged = app.isPackaged;
    if (isPackaged) {
      const packagedIcon = join(process.resourcesPath, "icon.png");
      if (existsSync(packagedIcon)) iconPath = packagedIcon;
    } else {
      const devIcon = join(this.options.appPath, "public/icon.png");
      if (existsSync(devIcon)) iconPath = devIcon;
    }

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      maximizable: false,
      minimizable: false,
      focusable: true,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      icon: iconPath,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.window.setAlwaysOnTop(true, "pop-up-menu");
    this.window.setMenuBarVisibility(false);

    this.window.on("blur", () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused !== this.window) this.previousWindow = focused;
      // Prevent instant dismissal during initial window creation or when keepOpen is enabled
      if (this.keepOpen) return;
      if (Date.now() - this.openedAt < 600) return;
      if (this.closeOnBlur) {
        if (this.window && !this.window.isDestroyed()) {
          this.requestClose();
        } else {
          this.hide();
        }
      }
    });

    this.window.on("closed", () => {
      this.cancelClose();
      this.window = null;
      this.isReady = false;
    });

    this.window.webContents.on("did-finish-load", () => {
      this.isReady = true;
      if (this.wantsVisible && this.window && !this.window.isDestroyed()) {
        this.reposition();
        this.window.show();
        this.window.focus();
        this.window.webContents.send("clipboard-popup:show");
        this.window.webContents.send("clipboard-popup:focus-search");
        this.window.webContents.send("clipboard-popup:layout-changed", {
          layout: this.layout,
          position: this.horizontalPosition,
        });
      }
    });

    const isDev = this.options.isDev;
    const devUrl = process.env.KEYFLOW_DEV_SERVER_URL || process.env.VITE_DEV_SERVER_URL || this.options.devUrl;
    if (isDev && devUrl) {
      void this.window.loadURL(`${devUrl}?window=clipboard-popup`).catch((err) =>
        console.error("[clipboard-window] load URL failed:", err.message)
      );
    } else {
      void this.window
        .loadFile(join(this.options.appPath, "dist", "index.html"), {
          query: { window: "clipboard-popup" },
        })
        .catch((err) => console.error("[clipboard-window] load file failed:", err.message));
    }
  }
}

