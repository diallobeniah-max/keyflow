import { app, BrowserWindow, clipboard, desktopCapturer, Notification, screen, shell } from "electron";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { resolveScreenshotMode } from "./screenshot-modes.js";
import { screenshotBaseName } from "./screenshot-modes.js";
import { ELECTRON_DESKTOP_ACTIONS } from "./action-routing.js";
import { toggleWindowTopmost } from "./window-control.js";

export interface ActionResult {
  ok: boolean;
  action: string;
  mode?: string;
  path?: string;
  isTopmost?: boolean;
  title?: string;
  highlightApplied?: boolean;
  error?: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function expandEnv(value: string): string {
  return value.replace(/%([^%]+)%/g, (_match, name: string) => process.env[name] ?? _match);
}

function splitArgs(value: string): string[] {
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

function detached(command: string, args: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    let settled = false;
    child.once("error", (error) => {
      if (!settled) { settled = true; reject(error); }
    });
    child.once("spawn", () => {
      if (!settled) { settled = true; child.unref(); resolve(); }
    });
  });
}

function powershell(script: string): Promise<void> {
  return detached("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
}

const VIRTUAL_KEYS: Record<string, number> = {
  Ctrl: 0x11, Alt: 0x12, Shift: 0x10, Win: 0x5b,
  Enter: 0x0d, Tab: 0x09, Space: 0x20, Escape: 0x1b, CapsLock: 0x14,
  Backspace: 0x08, Delete: 0x2e, Insert: 0x2d,
  Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  PrintScreen: 0x2c, ScrollLock: 0x91, Pause: 0x13, NumLock: 0x90,
  VolumeUp: 0xaf, VolumeDown: 0xae, VolumeMute: 0xad,
  PlayPause: 0xb3, NextTrack: 0xb0, PrevTrack: 0xb1, Stop: 0xb2,
  ",": 0xbc, ".": 0xbe, "/": 0xbf, ";": 0xba, "'": 0xde,
  "[": 0xdb, "]": 0xdd, "\\": 0xdc, "-": 0xbd, "=": 0xbb, "`": 0xc0,
  "*": 0x6a, "+": 0x6b,
};

for (let i = 1; i <= 24; i += 1) VIRTUAL_KEYS[`F${i}`] = 0x6f + i;
for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") VIRTUAL_KEYS[character] = character.charCodeAt(0);
for (let i = 0; i <= 9; i += 1) VIRTUAL_KEYS[`Num${i}`] = i === 0 ? 0x60 : 0x60 + i;
VIRTUAL_KEYS["Num."] = 0x6e;
VIRTUAL_KEYS["Num+"] = 0x6b;
VIRTUAL_KEYS["Num-"] = 0x6d;
VIRTUAL_KEYS["Num/"] = 0x6f;

function sendKeys(keys: string): Promise<void> {
  const parts = keys.split("+").map((part) => part.trim()).filter(Boolean);
  const main = parts.pop() ?? "";
  const mainKey = VIRTUAL_KEYS[main] ?? VIRTUAL_KEYS[main.toUpperCase()];
  const modifiers = parts.map((part) => VIRTUAL_KEYS[part] ?? VIRTUAL_KEYS[part[0]?.toUpperCase() ?? ""]).filter((key): key is number => typeof key === "number");
  if (mainKey === undefined) throw new Error(`Unsupported shortcut key: ${main}`);
  const down = modifiers.map((key) => `[NativeKeyboard]::keybd_event(${key},0,0,[UIntPtr]::Zero);`).join(" ");
  const up = modifiers.slice().reverse().map((key) => `[NativeKeyboard]::keybd_event(${key},0,2,[UIntPtr]::Zero);`).join(" ");
  const script = `Add-Type -TypeDefinition @'\nusing System; using System.Runtime.InteropServices; public static class NativeKeyboard { [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo); }\n'@; ${down} [NativeKeyboard]::keybd_event(${mainKey},0,0,[UIntPtr]::Zero); [NativeKeyboard]::keybd_event(${mainKey},0,2,[UIntPtr]::Zero); ${up}`;
  return powershell(script);
}

async function openSnipOverlay(): Promise<void> {
  try {
    await shell.openExternal("ms-screenclip:");
    return;
  } catch {
    await sendKeys("Win+Shift+S");
  }
}

async function screenSource(): Promise<Electron.DesktopCapturerSource | undefined> {
  const cursor = screen.getCursorScreenPoint();
  let nearest: Electron.Display | undefined;
  try { nearest = screen.getDisplayNearestPoint(cursor); } catch { /* fallthrough */ }
  const displays = screen.getAllDisplays();
  const display = displays.find((d) => nearest && d.id === nearest.id) ?? displays[0];
  if (!display) return undefined;
  const width = Math.round(display.bounds.width * display.scaleFactor);
  const height = Math.round(display.bounds.height * display.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width, height } });
  return sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
}

function screenshotsDir(): string {
  return join(app.getPath("pictures"), "KeyFlow", "screenshots");
}

function uniquePath(base: string): string {
  const dir = screenshotsDir();
  mkdirSync(dir, { recursive: true });
  let candidate = join(dir, base);
  let i = 1;
  while (existsSync(candidate)) {
    candidate = join(dir, `${base.slice(0, -4)}-${i}.png`);
    i += 1;
  }
  return candidate;
}

async function saveFullscreen(): Promise<string> {
  const source = await screenSource();
  if (!source) throw new Error("No capture source available for the active display");
  const png = source.thumbnail.toPNG();
  const path = uniquePath(screenshotBaseName());
  writeFileSync(path, png, { flag: "wx" });
  return path;
}

async function captureFullscreenToClipboard(): Promise<void> {
  const source = await screenSource();
  if (!source || source.thumbnail.isEmpty()) throw new Error("No capture source available for the active display");
  clipboard.writeImage(source.thumbnail);
}

export async function runDesktopAction(action: any, mainWindow: BrowserWindow | null): Promise<ActionResult> {
  const payload = action.payload ?? {};
  const actionType = String(action?.type ?? "unknown");
  try {
    switch (action.type) {
      case "openApp": await detached(expandEnv(payload.path ?? ""), splitArgs(payload.args ?? "")); break;
      case "openFile":
      case "openFolder": {
        const error = await shell.openPath(expandEnv(payload.path ?? ""));
        if (error) return { ok: false, action: actionType, error };
        break;
      }
      case "openWebsite": await shell.openExternal(payload.url ?? ""); break;
      case "runCommand": await detached(expandEnv(payload.path ?? ""), splitArgs(payload.args ?? "")); break;
      case "runPowershell": await powershell(payload.script ?? payload.path ?? ""); break;
      case "runBatch": await detached("cmd.exe", ["/C", expandEnv(payload.path ?? "")]); break;
      case "pasteText":
      case "typeText":
        clipboard.writeText(payload.text ?? "");
        await sendKeys("Ctrl+V");
        break;
      case "pressShortcut": await sendKeys(payload.shortcut ?? ""); break;
      case "volumeControl": {
        const key = payload.volume === "down" ? "VolumeDown" : payload.volume === "mute" || payload.volume === "toggle" ? "VolumeMute" : "VolumeUp";
        await sendKeys(key);
        break;
      }
      case "toggleMute": await sendKeys("VolumeMute"); break;
      case "mediaControl": {
        const key = payload.media === "next" ? "NextTrack" : payload.media === "prev" ? "PrevTrack" : payload.media === "stop" ? "Stop" : "PlayPause";
        await sendKeys(key);
        break;
      }
      case "brightnessControl": {
        const amount = payload.brightness === "down" ? -10 : 10;
        await powershell(`$m=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods; $b=(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness; $n=[Math]::Max(0,[Math]::Min(100,$b+${amount})); foreach($x in $m){$x.WmiSetBrightness(1,$n)}`);
        break;
      }
      case "screenshot": {
        const mode = resolveScreenshotMode(payload.screenshotMode);
        if (mode === "fullscreenClip") {
          await captureFullscreenToClipboard();
          return { ok: true, action: actionType, mode };
        }
        if (mode === "windowClip") {
          return { ok: false, action: actionType, mode, error: "Active-window capture is not reliably supported; use the snipping overlay or full-screen capture." };
        }
        if (mode === "fullscreenSave") {
          const path = await saveFullscreen();
          return { ok: true, action: actionType, mode, path };
        }
        await openSnipOverlay();
        return { ok: true, action: actionType, mode: "snipOverlay" };
      }
      case "clipboardHistory": await sendKeys("Win+V"); break;
      case "copySelected": await sendKeys("Ctrl+C"); break;
      case "lockScreen": await detached("rundll32.exe", ["user32.dll,LockWorkStation"]); break;
      case "openSettings": await shell.openExternal(payload.settingsPage ?? "ms-settings:"); break;
      case "showNotification":
        new Notification({ title: payload.notificationTitle ?? "KeyFlow", body: payload.notificationBody ?? "" }).show();
        break;
      case "showPopup":
        break;
      case "minimizeWindow": mainWindow?.minimize(); break;
      case "maximizeWindow": mainWindow?.maximize(); break;
      case "closeWindow": mainWindow?.close(); break;
      case "alwaysOnTop": {
        const mode = payload.topmostMode ?? payload.mode ?? "toggle";
        const highlight = payload.highlight !== false;
        const color = payload.highlightColor ?? "#4F7CFF";
        const sound = payload.sound !== false;
        const res = await toggleWindowTopmost({ mode, highlight, color, sound });
        return {
          ok: res.ok,
          action: actionType,
          mode: res.mode,
          isTopmost: res.is_topmost,
          title: res.title,
          highlightApplied: res.highlight_applied,
          error: res.error,
        };
      }
      case "moveWindow": {
        if (mainWindow) {
          const [x, y] = mainWindow.getPosition();
          mainWindow.setPosition(x + (payload.direction === "right" ? 80 : -80), y);
        }
        break;
      }
      default:
        if (!ELECTRON_DESKTOP_ACTIONS.has(actionType)) {
          return { ok: false, action: actionType, error: `Unsupported Electron action: ${action.type}` };
        }
        return { ok: false, action: actionType, error: `Electron action not implemented: ${action.type}` };
    }
    return { ok: true, action: actionType };
  } catch (err) {
    return { ok: false, action: actionType, error: messageOf(err) };
  }
}