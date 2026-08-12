import { app, screen, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

interface WindowState {
  bounds: WindowBounds;
  maximized: boolean;
}

function statePath(): string {
  const dir = join(app.getPath("userData"), "window-state.json");
  return dir;
}

function save(state: WindowState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(state));
  } catch {
    // silent
  }
}

function load(): WindowState | null {
  try {
    const p = statePath();
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf-8");
    return JSON.parse(raw) as WindowState;
  } catch {
    return null;
  }
}

function isVisible(bounds: WindowBounds): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const { x, y, width, height } = d.workArea;
    return (
      bounds.x !== undefined &&
      bounds.y !== undefined &&
      bounds.x + bounds.width > x &&
      bounds.x < x + width &&
      bounds.y + bounds.height > y &&
      bounds.y < y + height
    );
  });
}

export function createWindowState(defaults: WindowBounds): {
  restore: (win: BrowserWindow) => void;
  watch: (win: BrowserWindow) => void;
} {
  const saved = load();
  const safeBounds: WindowBounds =
    saved && isVisible(saved.bounds) ? saved.bounds : defaults;
  const wasMaximized = saved?.maximized ?? false;

  return {
    restore: (win: BrowserWindow) => {
      win.setBounds(safeBounds);
      if (wasMaximized) win.maximize();
    },
    watch: (win: BrowserWindow) => {
      const saveState = () => {
        const maximized = win.isMaximized();
        if (maximized) {
          save({ bounds: safeBounds, maximized: true });
        } else {
          const b = win.getNormalBounds();
          save({
            bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
            maximized: false,
          });
        }
      };
      win.on("resize", saveState);
      win.on("move", saveState);
      win.on("maximize", saveState);
      win.on("unmaximize", saveState);
    },
  };
}
