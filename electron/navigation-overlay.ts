/**
 * WASD Navigation Mode overlay — a lightweight click-through halo shown at the
 * cursor when the mode toggles on/off. It is a dedicated frameless transparent
 * BrowserWindow (never touches the popup window) that auto-destroys after a
 * short show, guarded by a generation counter so a superseded overlay can
 * never linger or destroy a newer one.
 */

import { BrowserWindow, nativeTheme, screen } from "electron";
import type { NavigationFeedbackConfig } from "./navigation-mode.js";

const OVERLAY_WIDTH = 270;
const OVERLAY_HEIGHT = 88;
const SHOW_MS = 1100;
const FADE_MS = 220;

let overlayGeneration = 0;

function normalizeAccent(value?: string): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#4f7cff";
}

function hexToRgba(hex: string, alpha: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function overlayHtml(active: boolean, config: NavigationFeedbackConfig): string {
  const accent = normalizeAccent(config.accent);
  const accentSoft = hexToRgba(accent, 0.22);
  const accentGlow = hexToRgba(accent, 0.35);
  const isDark = nativeTheme.shouldUseDarkColors;
  const surface = isDark ? "rgba(22, 26, 33, 0.92)" : "rgba(255, 255, 255, 0.94)";
  const textColor = isDark ? "#f1f5f9" : "#0f172a";
  const subColor = isDark ? "#94a3b8" : "#64748b";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body {
    background: transparent;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .halo {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px 10px 12px;
    border-radius: 18px;
    background: ${surface};
    border: 1px solid ${isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"};
    box-shadow:
      0 0 0 1px ${isDark ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.04)"},
      0 12px 28px rgba(0, 0, 0, ${isDark ? "0.45" : "0.14"}),
      0 4px 10px rgba(0, 0, 0, 0.08),
      0 0 0 3px ${active ? accentSoft : "transparent"};
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    color: ${textColor};
    user-select: none;
    animation: hudPop 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes hudPop {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(4px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
  body.hide .halo {
    opacity: 0;
    transform: scale(0.94) translateY(2px);
    transition: all ${FADE_MS}ms cubic-bezier(0.4, 0, 1, 1);
  }
  .icon-pod {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 11px;
    background: ${active ? accent : isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)"};
    color: ${active ? "#ffffff" : isDark ? "#cbd5e1" : "#475569"};
    box-shadow: ${active ? `0 2px 10px ${accentGlow}` : "none"};
    flex-shrink: 0;
  }
  .text-stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .top-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .main-title {
    font-size: 13.5px;
    font-weight: 650;
    letter-spacing: -0.01em;
    color: ${textColor};
    line-height: 1.2;
  }
  .status-badge {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1.5px 6px;
    border-radius: 999px;
    background: ${active ? accentSoft : isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)"};
    color: ${active ? accent : subColor};
    border: 1px solid ${active ? accentSoft : isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.08)"};
  }
  .sub-text {
    font-size: 11px;
    font-weight: 500;
    color: ${subColor};
    line-height: 1.2;
  }
</style>
</head>
<body>
  <div class="halo">
    <div class="icon-pod">
      ${active ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 8 9 8 12 2"></polygon><polygon points="12 22 9 16 15 16 12 22"></polygon><polygon points="2 12 8 9 8 15 2 12"></polygon><polygon points="22 12 16 15 16 9 22 12"></polygon></svg>` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2.5"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"></path></svg>`}
    </div>
    <div class="text-stack">
      <div class="top-row">
        <span class="main-title">${active ? "WASD Navigation" : "Standard Typing"}</span>
        <span class="status-badge">${active ? "Active" : "Normal"}</span>
      </div>
      <span class="sub-text">${active ? "W A S D → Arrow Keys" : "Navigation mode off"}</span>
    </div>
  </div>
</body>
</html>`;
}

export function showNavigationOverlay(active: boolean, config: NavigationFeedbackConfig): void {
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

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml(active, config))}`).catch(() => {});
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
