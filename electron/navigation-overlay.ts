/**
 * WASD Navigation Mode overlay — a lightweight click-through halo shown at the
 * cursor when the mode toggles on/off. It is a dedicated frameless transparent
 * BrowserWindow (never touches the popup window) that auto-destroys after a
 * short show, guarded by a generation counter so a superseded overlay can
 * never linger or destroy a newer one.
 */

import { BrowserWindow, screen } from "electron";

const OVERLAY_WIDTH = 224;
const OVERLAY_HEIGHT = 96;
const SHOW_MS = 950;
const FADE_MS = 200;

let overlayGeneration = 0;

function overlayHtml(active: boolean): string {
  const text = active ? "WASD → Arrows" : "WASD Normal";
  const sub = active ? "Navigation mode active" : "Navigation mode off";
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { background: transparent; margin: 0; overflow: hidden; }
  .halo {
    position: fixed; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px;
    border-radius: 20px;
    background: rgba(18, 19, 22, 0.92);
    border: 2px solid #3b82f6;
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.35), 0 0 24px rgba(59, 130, 246, 0.4), 0 12px 32px rgba(0, 0, 0, 0.5);
    opacity: 1; transition: opacity ${FADE_MS}ms ease-out;
    font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    color: #ffffff;
    user-select: none;
  }
  .main { font-size: 16px; font-weight: 650; letter-spacing: 0.3px; color: #ffffff; }
  .sub { font-size: 11.5px; font-weight: 500; opacity: 0.8; color: #93c5fd; }
  .dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: #3b82f6;
    box-shadow: 0 0 10px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.8);
  }
  body.hide .halo { opacity: 0; }
</style>
</head>
<body>
  <div class="halo">
    <div class="dot"></div>
    <div class="main">${text}</div>
    <div class="sub">${sub}</div>
  </div>
</body>
</html>`;
}

export function showNavigationOverlay(active: boolean): void {
  const gen = ++overlayGeneration;
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point).workArea;
  const x = Math.min(Math.max(Math.round(point.x - OVERLAY_WIDTH / 2), display.x), display.x + display.width - OVERLAY_WIDTH);
  const y = Math.round(Math.min(Math.max(point.y - OVERLAY_HEIGHT - 28, display.y), display.y + display.height - OVERLAY_HEIGHT));

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    movable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setMenuBarVisibility(false);

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml(active))}`).catch(() => {});
  win.once("ready-to-show", () => {
    if (gen === overlayGeneration && !win.isDestroyed()) win.showInactive();
  });

  setTimeout(() => {
    if (win.isDestroyed()) return;
    if (gen !== overlayGeneration) {
      win.destroy(); // superseded by a newer overlay
      return;
    }
    win.webContents.executeJavaScript(`document.body.classList.add("hide")`).catch(() => {});
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, FADE_MS + 20);
  }, SHOW_MS);
}

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { app } from "electron";

let isBlueCursorActive = false;

function resolveCursorPath(): string | null {
  const appPath = typeof app?.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const candidates = [
    join(appPath, "public", "cursors", "blue-cursor.cur"),
    join(process.cwd(), "public", "cursors", "blue-cursor.cur"),
    join(appPath, "resources", "blue-cursor.cur"),
  ];
  if (typeof process.resourcesPath === "string") {
    candidates.push(join(process.resourcesPath, "blue-cursor.cur"));
    candidates.push(join(process.resourcesPath, "cursors", "blue-cursor.cur"));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function setSystemCursorBlue(active: boolean): void {
  if (active === isBlueCursorActive) return;
  isBlueCursorActive = active;

  if (active) {
    const curPath = resolveCursorPath();
    if (!curPath) {
      console.warn("[cursor] blue-cursor.cur not found");
      return;
    }
    const escaped = curPath.replace(/\\/g, "\\\\").replace(/'/g, "''");
    const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CurMgr {
    [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr LoadImage(IntPtr h, string n, uint t, int w, int h2, uint f);
    [DllImport("user32.dll")]
    public static extern bool SetSystemCursor(IntPtr c, uint id);
    public static void Apply(string p) {
        IntPtr h1 = LoadImage(IntPtr.Zero, p, 2, 32, 32, 0x10);
        if (h1 != IntPtr.Zero) SetSystemCursor(h1, 32512);
    }
}
'@
[CurMgr]::Apply('${escaped}')
`;
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    console.log(`[cursor] set blue cursor active=true path=${curPath}`);
  } else {
    const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CurMgr {
    [DllImport("user32.dll")]
    public static extern bool SystemParametersInfo(uint a, uint b, IntPtr p, uint f);
    public static void Reset() {
        SystemParametersInfo(0x0057, 0, IntPtr.Zero, 0);
    }
}
'@
[CurMgr]::Reset()
`;
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    console.log("[cursor] restored default system cursor active=false");
  }
}

export function restoreSystemCursor(): void {
  if (!isBlueCursorActive) return;
  setSystemCursorBlue(false);
}
