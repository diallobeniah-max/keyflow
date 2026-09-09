import { BrowserWindow, screen } from "electron";
import { existsSync } from "fs";
import { join } from "path";
import type { ClipboardItemSummary, ClipboardSettings } from "./clipboard-engine.js";

export interface ClipboardCopyFeedbackWindowOptions {
  devUrl: string;
  preloadPath: string;
  isDev: boolean;
  appPath: string;
}

type FeedbackPayload = Pick<ClipboardItemSummary, "kind" | "title"> & { anchor: "top" | "bottom" | "right" };

const FEEDBACK_WIDTH = 300;
const FEEDBACK_HEIGHT = 76;
const VISIBLE_MS = 1350;
const EXIT_MS = 220;

export class ClipboardCopyFeedbackWindowManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private payload: FeedbackPayload | null = null;
  private settings: ClipboardSettings | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ClipboardCopyFeedbackWindowOptions) {}

  show(item: ClipboardItemSummary, settings: ClipboardSettings): void {
    if (settings.copyFeedbackEnabled === false) return;
    this.clearTimers();
    const anchor = settings.layout === "right" ? "right" : settings.horizontalPosition === "top" ? "top" : "bottom";
    this.payload = { kind: item.kind, title: item.title, anchor };
    console.log(`[clipboard-feedback] captured kind=${item.kind} anchor=${anchor}`);
    this.settings = settings;
    if (!this.window || this.window.isDestroyed()) this.createWindow();
    this.present();
  }

  destroy(): void {
    this.clearTimers();
    this.window?.destroy();
    this.window = null;
    this.ready = false;
  }

  private present(): void {
    if (!this.ready || !this.window || this.window.isDestroyed() || !this.payload || !this.settings) return;
    this.window.setBounds(this.calculateBounds(this.settings));
    this.window.webContents.send("clipboard-copy-feedback:show", this.payload);
    this.window.showInactive();
    this.exitTimer = setTimeout(() => {
      this.window?.webContents.send("clipboard-copy-feedback:hide");
      this.hideTimer = setTimeout(() => this.window?.hide(), EXIT_MS);
    }, VISIBLE_MS);
  }

  private clearTimers(): void {
    if (this.exitTimer) clearTimeout(this.exitTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.exitTimer = null;
    this.hideTimer = null;
  }

  private calculateBounds(settings: ClipboardSettings) {
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const margin = 20;
    let x = area.x + Math.round((area.width - FEEDBACK_WIDTH) / 2);
    let y = area.y + area.height - FEEDBACK_HEIGHT - margin;
    if (settings.layout === "right") {
      x = area.x + area.width - FEEDBACK_WIDTH - margin;
      y = area.y + Math.round((area.height - FEEDBACK_HEIGHT) / 2);
    } else if (settings.horizontalPosition === "top") {
      y = area.y + margin;
    }
    return { x, y, width: FEEDBACK_WIDTH, height: FEEDBACK_HEIGHT };
  }

  private createWindow(): void {
    const iconCandidates = [
      join(this.options.appPath, "public", "icon.png"),
      join(this.options.appPath, "dist", "icon.png"),
    ];
    this.window = new BrowserWindow({
      width: FEEDBACK_WIDTH,
      height: FEEDBACK_HEIGHT,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      icon: iconCandidates.find((candidate) => existsSync(candidate)),
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    this.window.setAlwaysOnTop(true, "pop-up-menu");
    this.window.setIgnoreMouseEvents(true);
    this.window.webContents.on("did-finish-load", () => {
      this.ready = true;
      console.log("[clipboard-feedback] renderer ready");
      this.present();
    });
    this.window.on("closed", () => {
      this.clearTimers();
      this.window = null;
      this.ready = false;
    });

    const devUrl = process.env.KEYFLOW_DEV_SERVER_URL || process.env.VITE_DEV_SERVER_URL || this.options.devUrl;
    if (this.options.isDev && devUrl) {
      void this.window.loadURL(`${devUrl}?window=clipboard-copy-feedback`);
    } else {
      void this.window.loadFile(join(this.options.appPath, "dist", "index.html"), {
        query: { window: "clipboard-copy-feedback" },
      });
    }
  }
}
