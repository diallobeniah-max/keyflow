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
  windowPresetSizes?: Partial<Record<"comfortable" | "compact", NotesWindowSize>>;
  customPresets?: NotesCustomPreset[];
}

export type NotesWindowSizePreset = "comfortable" | "compact" | string;

export interface NotesWindowSize {
  width: number;
  height: number;
}

export interface NotesWindowPreferences {
  windowSizePreset: NotesWindowSizePreset;
  followMouseOnOpen: boolean;
  windowPresetSizes: Record<"comfortable" | "compact", NotesWindowSize>;
  customPresets?: NotesCustomPreset[];
}

const NOTES_WINDOW_PRESETS: Record<"comfortable" | "compact", NotesWindowSize> = {
  // A focused working window that stays comfortably inside a standard laptop display.
  comfortable: { width: 960, height: 800 },
  compact: { width: 700, height: 640 },
};

const DEFAULT_NOTES_WINDOW_PREFERENCES: NotesWindowPreferences = {
  windowSizePreset: "comfortable",
  followMouseOnOpen: true,
  windowPresetSizes: NOTES_WINDOW_PRESETS,
  customPresets: [],
};

class NotesWindowService {
  private window: BrowserWindow | null = null;
  private configPath: string;

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

    return {
      windowSizePreset: config.windowSizePreset || DEFAULT_NOTES_WINDOW_PREFERENCES.windowSizePreset,
      followMouseOnOpen: config.followMouseOnOpen !== false,
      windowPresetSizes: {
        comfortable: toValidSize(config.windowPresetSizes?.comfortable, NOTES_WINDOW_PRESETS.comfortable),
        compact: toValidSize(config.windowPresetSizes?.compact, NOTES_WINDOW_PRESETS.compact),
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
      : (preferences.windowPresetSizes[preferences.windowSizePreset as "comfortable" | "compact"] ?? preferences.windowPresetSizes.comfortable);
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
    const next: NotesWindowPreferences = {
      windowSizePreset: patch.windowSizePreset || current.windowSizePreset,
      followMouseOnOpen: typeof patch.followMouseOnOpen === "boolean" ? patch.followMouseOnOpen : current.followMouseOnOpen,
      windowPresetSizes: {
        comfortable: patch.windowPresetSizes?.comfortable ?? current.windowPresetSizes.comfortable,
        compact: patch.windowPresetSizes?.compact ?? current.windowPresetSizes.compact,
      },
      customPresets: patch.customPresets ?? current.customPresets ?? [],
    };

    const isChangingPreset = next.windowSizePreset !== current.windowSizePreset;
    this.saveConfig({
      ...config,
      ...next,
      ...(isChangingPreset ? { windowBounds: undefined } : {}),
    });

    if (isChangingPreset || patch.windowPresetSizes?.[next.windowSizePreset as "comfortable" | "compact"] || patch.customPresets) {
      this.applyWindowSize();
    }
    return next;
  }

  public saveCurrentWindowSizeAsPreset(preset: NotesWindowSizePreset): NotesWindowPreferences {
    const current = this.getWindowPreferences();
    const [width, height] = this.window && !this.window.isDestroyed()
      ? this.window.getSize()
      : (preset === "comfortable" || preset === "compact"
          ? [current.windowPresetSizes[preset as "comfortable" | "compact"].width, current.windowPresetSizes[preset as "comfortable" | "compact"].height]
          : [current.customPresets?.find((p) => p.id === preset)?.width ?? 800, current.customPresets?.find((p) => p.id === preset)?.height ?? 600]);

    if (preset === "comfortable" || preset === "compact") {
      return this.updatePreferences({
        windowPresetSizes: {
          ...current.windowPresetSizes,
          [preset]: { width, height },
        },
      });
    }

    const updatedCustom = (current.customPresets ?? []).map((cp) =>
      cp.id === preset ? { ...cp, width, height } : cp
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

  public getNotesPath(): string {
    return join(this.getSaveLocation(), "keyflow-notes.json");
  }

  public getNotes(): NoteItem[] {
    const notesPath = this.getNotesPath();
    let shouldPersistInitial = !existsSync(notesPath);
    try {
      if (existsSync(notesPath)) {
        const raw = readFileSync(notesPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
        // Keep an intentionally empty list recoverable in memory without
        // rewriting the user's file until they create another note.
        shouldPersistInitial = false;
      }
    } catch (err) {
      console.error("[Notes] Failed to read notes.json:", err);
      // Never overwrite a malformed notes file automatically; it may still be
      // recoverable by the user. A later explicit save writes a new valid file.
      shouldPersistInitial = false;
    }

    // Persist the first note immediately so a renderer refresh cannot make it disappear.
    const initialNotes: NoteItem[] = [
      {
        id: "welcome-note",
        title: "Welcome to KeyFlow Notes 📝",
        pinned: true,
        content: `<h2>KeyFlow Floating Notepad</h2>
<p>A fast, distraction-free markdown notepad that floats seamlessly above your desktop and apps.</p>
<h3>⚡ Key Features</h3>
<ul>
  <li><b>Rich Formatting:</b> Bold, italic, underline, strikethrough, headings, lists, quotes, and code blocks.</li>
  <li><b>Raycast Slash Commands:</b> Type <code>/</code> to insert headings, lists, tables, callouts, and more.</li>
  <li><b>Custom Save Directory:</b> Set your own folder to auto-save and sync all notes across apps.</li>
  <li><b>Instant Autosave:</b> Never lose your thoughts with continuous debounced saving.</li>
</ul>`,
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now(),
      },
    ];
    if (shouldPersistInitial) this.writeNotes(initialNotes);
    return initialNotes;
  }

  public saveNote(note: NoteItem): NoteItem[] {
    const notes = this.getNotes();
    const idx = notes.findIndex((n) => n.id === note.id);
    if (idx >= 0) {
      notes[idx] = { ...note, updatedAt: Date.now() };
    } else {
      notes.unshift({ ...note, createdAt: Date.now(), updatedAt: Date.now() });
    }
    this.writeNotes(notes);
    return notes;
  }

  public deleteNote(id: string): NoteItem[] {
    const notes = this.getNotes().filter((n) => n.id !== id);
    this.writeNotes(notes);
    return notes;
  }

  public async selectSaveLocation(): Promise<{ path: string; notes: NoteItem[] } | null> {
    const win = this.window && !this.window.isDestroyed() ? this.window : undefined;
    const result = await dialog.showOpenDialog(win!, {
      title: "Select KeyFlow Notes Storage Directory",
      defaultPath: this.getSaveLocation(),
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const chosenDir = result.filePaths[0];
    return this.setSaveLocation(chosenDir);
  }

  public setSaveLocation(dirPath: string): { path: string; notes: NoteItem[] } {
    // Read the current source before changing the config. Otherwise getNotes()
    // would point at the new empty directory and the user's existing notes would
    // be replaced by the default seed note.
    const sourceNotes = this.getNotes();

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    // Save configuration
    this.saveConfig({ ...this.getConfig(), customSaveDirectory: dirPath });

    const targetJson = join(dirPath, "keyflow-notes.json");
    let loadedNotes: NoteItem[] = [];

    if (existsSync(targetJson)) {
      try {
        const raw = readFileSync(targetJson, "utf-8");
        loadedNotes = JSON.parse(raw);
      } catch (e) {
        console.error("[Notes] Failed to parse notes in selected dir:", e);
      }
    }

    // If destination folder was empty, migrate current notes to it
    if (!loadedNotes || loadedNotes.length === 0) {
      loadedNotes = sourceNotes;
      writeFileSync(targetJson, JSON.stringify(loadedNotes, null, 2), "utf-8");
    }

    return { path: dirPath, notes: loadedNotes };
  }

  public async pickFile(options: { type?: "image" | "video" | "file" }): Promise<string | null> {
    const win = this.window && !this.window.isDestroyed() ? this.window : undefined;
    let filters = [{ name: "All Files", extensions: ["*"] }];

    if (options.type === "image") {
      filters = [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }];
    } else if (options.type === "video") {
      filters = [{ name: "Videos", extensions: ["mp4", "webm", "mkv", "mov", "avi"] }];
    }

    const result = await dialog.showOpenDialog(win!, {
      title: `Select ${options.type || "File"} for Note`,
      properties: ["openFile"],
      filters,
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  private writeNotes(notes: NoteItem[]) {
    try {
      const saveDir = this.getSaveLocation();
      if (!existsSync(saveDir)) {
        mkdirSync(saveDir, { recursive: true });
      }
      const notesPath = this.getNotesPath();
      writeFileSync(notesPath, JSON.stringify(notes, null, 2), "utf-8");
    } catch (err) {
      console.error("[Notes] Failed to write notes.json:", err);
    }
  }

  public createOrGetWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      return this.window;
    }

    const candidates = [
      join(__dirname, "../build/icon.ico"),
      join(process.cwd(), "build/icon.ico"),
      join(app.getAppPath(), "build/icon.ico"),
    ];
    const iconPath = candidates.find((p) => existsSync(p));

    const initialSize = this.getInitialWindowSize();
    this.window = new BrowserWindow({
      width: initialSize.width,
      height: initialSize.height,
      minWidth: 560,
      minHeight: 520,
      frame: false,
      resizable: true,
      show: false,
      backgroundColor: "#0d1117",
      paintWhenInitiallyHidden: true,
      alwaysOnTop: true,
      skipTaskbar: false,
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

    this.window.once("ready-to-show", () => {
      // Pre-render is complete
    });

    this.window.on("closed", () => {
      this.window = null;
    });

    this.window.on("resize", () => {
      if (!this.window || this.window.isDestroyed() || this.window.isMaximized() || this.window.isMinimized()) return;
      const [width, height] = this.window.getSize();
      this.saveConfig({ ...this.getConfig(), windowBounds: { width, height } });
    });

    return this.window;
  }

  public toggle() {
    const win = this.createOrGetWindow();
    if (win.isVisible()) {
      win.hide();
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

      if (win.webContents.isLoading()) {
        win.once("ready-to-show", () => {
          win.showInactive();
          win.moveTop();
          setTimeout(() => {
            if (win && !win.isDestroyed()) win.focus();
          }, 50);
        });
      } else {
        win.showInactive();
        win.moveTop();
        setTimeout(() => {
          if (win && !win.isDestroyed()) win.focus();
        }, 50);
      }
    }
  }

  public hide() {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide();
    }
  }

  public setupIPC() {
    ipcMain.handle("notes:get-all", () => this.getNotes());
    ipcMain.handle("notes:save", (_e, note: NoteItem) => this.saveNote(note));
    ipcMain.handle("notes:delete", (_e, id: string) => this.deleteNote(id));
    ipcMain.handle("notes:close", () => this.hide());
    ipcMain.handle("notes:toggle", () => this.toggle());
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
