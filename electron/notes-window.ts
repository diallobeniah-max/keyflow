import { app, BrowserWindow, ipcMain, screen } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

class NotesWindowService {
  private window: BrowserWindow | null = null;
  private notesPath: string;

  constructor() {
    this.notesPath = join(app.getPath("userData"), "keyflow-notes.json");
  }

  public getNotes(): NoteItem[] {
    try {
      if (existsSync(this.notesPath)) {
        const raw = readFileSync(this.notesPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[Notes] Failed to read notes.json:", err);
    }
    // Default seed note if empty
    return [
      {
        id: "default-note-1",
        title: "Welcome to KeyFlow Notes",
        content: "<h2>Welcome to KeyFlow Notes</h2><p>This is your floating desktop notepad. Supports <b>bold</b>, <i>italic</i>, <u>underline</u>, headings, lists, and instant debounced autosave.</p><ul><li>Launch via <b>Hyper + N</b> or any trigger</li><li>Stays pinned on top for quick reference</li></ul>",
        createdAt: Date.now(),
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

  private writeNotes(notes: NoteItem[]) {
    try {
      writeFileSync(this.notesPath, JSON.stringify(notes, null, 2), "utf-8");
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
      width: 720,
      height: 560,
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
      // Pre-render is complete; the next toggle() will show without flash
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
      // Clamp position inside primary display
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
