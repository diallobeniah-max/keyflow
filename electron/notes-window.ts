import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NotesCustomPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

interface NotesConfig {
  customSaveDirectory?: string;
  windowSizePreset?: NotesWindowSizePreset;
  followMouseOnOpen?: boolean;
  windowBounds?: { width: number; height: number };
  windowPresetSizes?: Partial<Record<"large" | "compact" | "comfortable", NotesWindowSize>>;
  customPresets?: NotesCustomPreset[];
}

export type NotesWindowSizePreset = "large" | "compact" | "comfortable" | string;

export interface NotesWindowSize {
  width: number;
  height: number;
}

export interface NotesWindowPreferences {
  windowSizePreset: NotesWindowSizePreset;
  followMouseOnOpen: boolean;
  windowPresetSizes: Record<"large" | "compact", NotesWindowSize> & { comfortable?: NotesWindowSize };
  customPresets?: NotesCustomPreset[];
}

const NOTES_WINDOW_PRESETS: Record<"large" | "compact", NotesWindowSize> = {
  // A focused working window that stays comfortably inside a standard laptop display.
  large: { width: 960, height: 800 },
  compact: { width: 700, height: 640 },
};

const DEFAULT_NOTES_WINDOW_PREFERENCES: NotesWindowPreferences = {
  windowSizePreset: "large",
  followMouseOnOpen: true,
  windowPresetSizes: {
    large: NOTES_WINDOW_PRESETS.large,
    compact: NOTES_WINDOW_PRESETS.compact,
    comfortable: NOTES_WINDOW_PRESETS.large,
  },
  customPresets: [],
};

class NotesWindowService {
  private window: BrowserWindow | null = null;
  private configPath: string;
  private isTestMode: boolean = false;
  private testPresetInfo: { presetId: string; presetName: string } | null = null;

  constructor() {
    this.configPath = join(app.getPath("userData"), "keyflow-notes-config.json");
  }

  private getConfig(): NotesConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[Notes] Failed to read notes config:", err);
    }
    return {};
  }

  private saveConfig(config: NotesConfig) {
    try {
      writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (err) {
      console.error("[Notes] Failed to save notes config:", err);
    }
  }

  private getWindowPreferences(config = this.getConfig()): NotesWindowPreferences {
    const toValidSize = (candidate: NotesWindowSize | undefined, fallback: NotesWindowSize): NotesWindowSize => ({
      width: Math.max(560, Math.min(Number(candidate?.width) || fallback.width, 1600)),
      height: Math.max(520, Math.min(Number(candidate?.height) || fallback.height, 1200)),
    });
    const customPresets: NotesCustomPreset[] = Array.isArray(config.customPresets)
      ? config.customPresets.map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || "Custom Preset"),
          width: Math.max(560, Math.min(Number(p.width) || 800, 1600)),
          height: Math.max(520, Math.min(Number(p.height) || 600, 1200)),
        }))
      : [];

    let presetKey = config.windowSizePreset === "comfortable" ? "large" : (config.windowSizePreset || "large");
    const rawSizes = config.windowPresetSizes as any;
    const largeSize = toValidSize(rawSizes?.large ?? rawSizes?.comfortable, NOTES_WINDOW_PRESETS.large);
    const compactSize = toValidSize(rawSizes?.compact, NOTES_WINDOW_PRESETS.compact);

    return {
      windowSizePreset: presetKey,
      followMouseOnOpen: config.followMouseOnOpen !== false,
      windowPresetSizes: {
        large: largeSize,
        compact: compactSize,
        comfortable: largeSize,
      },
      customPresets,
    };
  }

  public getPreferences(): NotesWindowPreferences {
    return this.getWindowPreferences();
  }

  private getInitialWindowSize(config = this.getConfig()) {
    const preferences = this.getWindowPreferences(config);
    const custom = preferences.customPresets?.find((p) => p.id === preferences.windowSizePreset);
    const preset = custom
      ? { width: custom.width, height: custom.height }
      : (preferences.windowPresetSizes[preferences.windowSizePreset as "large" | "compact"] ?? preferences.windowPresetSizes.large);
    const saved = config.windowBounds;
    return {
      width: Math.max(560, Math.min(saved?.width ?? preset.width, 1600)),
      height: Math.max(520, Math.min(saved?.height ?? preset.height, 1200)),
    };
  }

  private applyWindowSize() {
    if (!this.window || this.window.isDestroyed()) return;
    const { width, height } = this.getInitialWindowSize();
    this.window.setSize(width, height, true);
  }

  public updatePreferences(patch: Partial<NotesWindowPreferences>): NotesWindowPreferences {
    const config = this.getConfig();
    const current = this.getWindowPreferences(config);
    const targetPreset = patch.windowSizePreset === "comfortable" ? "large" : (patch.windowSizePreset || current.windowSizePreset);

    const next: NotesWindowPreferences = {
      windowSizePreset: targetPreset,
      followMouseOnOpen: typeof patch.followMouseOnOpen === "boolean" ? patch.followMouseOnOpen : current.followMouseOnOpen,
      windowPresetSizes: {
        large: patch.windowPresetSizes?.large ?? (patch.windowPresetSizes as any)?.comfortable ?? current.windowPresetSizes.large,
        compact: patch.windowPresetSizes?.compact ?? current.windowPresetSizes.compact,
        comfortable: patch.windowPresetSizes?.large ?? (patch.windowPresetSizes as any)?.comfortable ?? current.windowPresetSizes.large,
      },
      customPresets: patch.customPresets ?? current.customPresets ?? [],
    };

    const isChangingPreset = next.windowSizePreset !== current.windowSizePreset;
    this.saveConfig({
      ...config,
      ...next,
      ...(isChangingPreset ? { windowBounds: undefined } : {}),
    });

    if (isChangingPreset || patch.windowPresetSizes?.[next.windowSizePreset as "large" | "compact"] || patch.customPresets) {
      this.applyWindowSize();
    }
    return next;
  }

  public saveCurrentWindowSizeAsPreset(preset: NotesWindowSizePreset): NotesWindowPreferences {
    const current = this.getWindowPreferences();
    const normalizedKey = preset === "comfortable" ? "large" : preset;
    const [width, height] = this.window && !this.window.isDestroyed()
      ? this.window.getSize()
      : (normalizedKey === "large" || normalizedKey === "compact"
          ? [current.windowPresetSizes[normalizedKey as "large" | "compact"].width, current.windowPresetSizes[normalizedKey as "large" | "compact"].height]
          : [current.customPresets?.find((p) => p.id === normalizedKey)?.width ?? 800, current.customPresets?.find((p) => p.id === normalizedKey)?.height ?? 600]);

    if (normalizedKey === "large" || normalizedKey === "compact") {
      return this.updatePreferences({
        windowPresetSizes: {
          ...current.windowPresetSizes,
          [normalizedKey]: { width, height },
        },
      });
    }

    const updatedCustom = (current.customPresets ?? []).map((cp) =>
      cp.id === normalizedKey ? { ...cp, width, height } : cp
    );
    return this.updatePreferences({
      customPresets: updatedCustom,
    });
  }

  public resetWindowSize(): NotesWindowPreferences {
    const config = this.getConfig();
    this.saveConfig({ ...config, windowBounds: undefined });
    this.applyWindowSize();
    return this.getWindowPreferences(config);
  }

  public getSaveLocation(): string {
    const cfg = this.getConfig();
    if (cfg.customSaveDirectory && existsSync(cfg.customSaveDirectory)) {
      return cfg.customSaveDirectory;
    }
    return app.getPath("userData");
  }

  public async selectSaveLocation(): Promise<{ success: boolean; path?: string }> {
    const res = await dialog.showOpenDialog({
      title: "Select Notes Storage Folder",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: this.getSaveLocation(),
    });

    if (!res.canceled && res.filePaths.length > 0) {
      const selected = res.filePaths[0];
      this.setSaveLocation(selected);
      return { success: true, path: selected };
    }
    return { success: false };
  }

  public setSaveLocation(dirPath: string): { success: boolean } {
    try {
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
      this.saveConfig({ ...this.getConfig(), customSaveDirectory: dirPath });
      return { success: true };
    } catch (err) {
      console.error("[Notes] Failed to set save location:", err);
      return { success: false };
    }
  }

  private getNotesFilePath(): string {
    return join(this.getSaveLocation(), "keyflow-notes.json");
  }

  public getNotes(): NoteItem[] {
    const filePath = this.getNotesFilePath();
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[Notes] Error reading notes:", err);
    }
    return [];
  }

  public saveNote(note: NoteItem): { success: boolean; id: string } {
    const notes = this.getNotes();
    const idx = notes.findIndex((n) => n.id === note.id);
    if (idx >= 0) {
      notes[idx] = { ...notes[idx], ...note, updatedAt: Date.now() };
    } else {
      notes.unshift({ ...note, createdAt: Date.now(), updatedAt: Date.now() });
    }

    try {
      const filePath = this.getNotesFilePath();
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(notes, null, 2), "utf-8");
      return { success: true, id: note.id };
    } catch (err) {
      console.error("[Notes] Error saving note:", err);
      return { success: false, id: note.id };
    }
  }

  public deleteNote(id: string): { success: boolean } {
    let notes = this.getNotes();
    notes = notes.filter((n) => n.id !== id);
    try {
      const filePath = this.getNotesFilePath();
      writeFileSync(filePath, JSON.stringify(notes, null, 2), "utf-8");
      return { success: true };
    } catch (err) {
      console.error("[Notes] Error deleting note:", err);
      return { success: false };
    }
  }

  public async pickFile(options: { type?: "image" | "video" | "file" }): Promise<string | null> {
    const filters = [];
    if (options.type === "image") {
      filters.push({ name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"] });
    } else if (options.type === "video") {
      filters.push({ name: "Videos", extensions: ["mp4", "webm", "ogg", "mov"] });
    } else {
      filters.push({ name: "All Files", extensions: ["*"] });
    }

    const res = await dialog.showOpenDialog({
      title: "Select File to Insert",
      properties: ["openFile"],
      filters,
    });

    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0];
    }
    return null;
  }

  public createOrGetWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const { width, height } = this.getInitialWindowSize();

    let iconPath: string | undefined;
    const isPackaged = app.isPackaged;
    if (isPackaged) {
      const packagedIcon = join(process.resourcesPath, "icon.png");
      if (existsSync(packagedIcon)) iconPath = packagedIcon;
    } else {
      const devIcon = join(__dirname, "../public/icon.png");
      if (existsSync(devIcon)) iconPath = devIcon;
    }

    this.window = new BrowserWindow({
      width,
      height,
      minWidth: 560,
      minHeight: 520,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      fullscreenable: false,
      hasShadow: true,
      icon: iconPath,
      webPreferences: {
        preload: join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    const isDev = !app.isPackaged;
    const devUrl = process.env.KEYFLOW_DEV_SERVER_URL || process.env.VITE_DEV_SERVER_URL;
    if (isDev && devUrl) {
      this.window.loadURL(`${devUrl}?window=notes`);
    } else {
      this.window.loadFile(join(__dirname, "../dist/index.html"), { search: "?window=notes" });
    }

    this.window.on("closed", () => {
      this.window = null;
      this.isTestMode = false;
      this.testPresetInfo = null;
    });

    this.window.on("resize", () => {
      if (!this.window || this.window.isDestroyed() || this.window.isMaximized() || this.window.isMinimized()) return;
      const [w, h] = this.window.getSize();
      this.saveConfig({ ...this.getConfig(), windowBounds: { width: w, height: h } });
    });

    return this.window;
  }

  public openTestMode(presetId?: string, presetName?: string) {
    this.isTestMode = true;
    const targetId = presetId === "comfortable" ? "large" : (presetId || "large");
    this.testPresetInfo = {
      presetId: targetId,
      presetName: presetName || (targetId === "compact" ? "Compact" : "Large"),
    };
    this.updatePreferences({ windowSizePreset: targetId });

    const win = this.createOrGetWindow();
    if (!win.isVisible()) {
      if (this.getPreferences().followMouseOnOpen) {
        const cursor = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursor);
        const bounds = display.workArea;

        const [w, h] = win.getSize();
        const x = Math.max(bounds.x + 20, Math.min(cursor.x - Math.round(w / 2), bounds.x + bounds.width - w - 20));
        const y = Math.max(bounds.y + 20, Math.min(cursor.y - 40, bounds.y + bounds.height - h - 20));

        win.setPosition(x, y, false);
      }
      win.show();
    }
    win.focus();

    const sendTestState = () => {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send("notes:test-mode-state", {
          active: true,
          presetId: this.testPresetInfo?.presetId || "large",
          presetName: this.testPresetInfo?.presetName || "Large",
        });
      }
    };

    if (win.webContents.isLoading()) {
      win.once("ready-to-show", sendTestState);
    } else {
      sendTestState();
    }
  }

  public toggle() {
    this.isTestMode = false;
    this.testPresetInfo = null;

    const win = this.createOrGetWindow();
    if (win.isVisible()) {
      win.hide();
      if (win.webContents) {
        win.webContents.send("notes:test-mode-state", { active: false });
      }
    } else {
      if (this.getPreferences().followMouseOnOpen) {
        const cursor = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursor);
        const bounds = display.workArea;

        const [w, h] = win.getSize();
        const x = Math.max(bounds.x + 20, Math.min(cursor.x - Math.round(w / 2), bounds.x + bounds.width - w - 20));
        const y = Math.max(bounds.y + 20, Math.min(cursor.y - 40, bounds.y + bounds.height - h - 20));

        win.setPosition(x, y, false);
      }

      const notifyShow = () => {
        if (win && !win.isDestroyed()) {
          win.showInactive();
          win.moveTop();
          setTimeout(() => {
            if (win && !win.isDestroyed()) {
              win.focus();
              win.webContents.send("notes:test-mode-state", { active: false });
            }
          }, 50);
        }
      };

      if (win.webContents.isLoading()) {
        win.once("ready-to-show", notifyShow);
      } else {
        notifyShow();
      }
    }
  }

  public hide() {
    this.isTestMode = false;
    this.testPresetInfo = null;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide();
      if (this.window.webContents) {
        this.window.webContents.send("notes:test-mode-state", { active: false });
      }
    }
  }

  public setupIPC() {
    ipcMain.handle("notes:get-all", () => this.getNotes());
    ipcMain.handle("notes:save", (_e, note: NoteItem) => this.saveNote(note));
    ipcMain.handle("notes:delete", (_e, id: string) => this.deleteNote(id));
    ipcMain.handle("notes:close", () => this.hide());
    ipcMain.handle("notes:toggle", () => this.toggle());
    ipcMain.handle("notes:open-test-mode", (_e, options?: { presetId?: string; presetName?: string }) => {
      this.openTestMode(options?.presetId, options?.presetName);
      return { success: true };
    });
    ipcMain.handle("notes:get-test-mode", () => {
      return { active: this.isTestMode, ...(this.testPresetInfo || {}) };
    });
    ipcMain.handle("notes:get-save-location", () => this.getSaveLocation());
    ipcMain.handle("notes:select-save-location", () => this.selectSaveLocation());
    ipcMain.handle("notes:set-save-location", (_e, dirPath: string) => this.setSaveLocation(dirPath));
    ipcMain.handle("notes:get-preferences", () => this.getPreferences());
    ipcMain.handle("notes:update-preferences", (_e, patch: Partial<NotesWindowPreferences>) => this.updatePreferences(patch));
    ipcMain.handle("notes:reset-window-size", () => this.resetWindowSize());
    ipcMain.handle("notes:save-current-window-size", (_e, preset: NotesWindowSizePreset) => this.saveCurrentWindowSizeAsPreset(preset));
    ipcMain.handle("notes:pick-file", (_e, options: any) => this.pickFile(options));
    ipcMain.handle("notes:minimize", () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.minimize();
      }
    });
    ipcMain.handle("notes:maximize", () => {
      if (this.window && !this.window.isDestroyed()) {
        if (this.window.isMaximized()) {
          this.window.unmaximize();
        } else {
          this.window.maximize();
        }
      }
    });
  }
}

export const notesService = new NotesWindowService();
