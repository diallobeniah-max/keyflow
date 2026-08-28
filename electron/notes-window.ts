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

interface NotesConfig {
  customSaveDirectory?: string;
}

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
    try {
      const notesPath = this.getNotesPath();
      if (existsSync(notesPath)) {
        const raw = readFileSync(notesPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.error("[Notes] Failed to read notes.json:", err);
    }

    // Default seed note if empty
    return [
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
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    // Save configuration
    this.saveConfig({ customSaveDirectory: dirPath });

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
      loadedNotes = this.getNotes();
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

    this.window = new BrowserWindow({
      width: 760,
      height: 580,
      minWidth: 420,
      minHeight: 320,
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

    return this.window;
  }

  public toggle() {
    const win = this.createOrGetWindow();
    if (win.isVisible()) {
      win.hide();
    } else {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const bounds = display.workArea;

      const [w, h] = win.getSize();
      const x = Math.max(bounds.x + 20, Math.min(cursor.x - Math.round(w / 2), bounds.x + bounds.width - w - 20));
      const y = Math.max(bounds.y + 20, Math.min(cursor.y - 40, bounds.y + bounds.height - h - 20));

      win.setPosition(x, y, false);

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
