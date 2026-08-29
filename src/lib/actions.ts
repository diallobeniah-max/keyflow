import { Action, Settings } from "../types";
import { useStore } from "../store/useStore";
import { invoke, isTauri } from "./tauri";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function popupPosition(settings: Settings): { x: number; y: number } {
  const p = settings.popup.position;
  const w = settings.popup.size === "large" ? 500 : settings.popup.size === "compact" ? 360 : 420;
  if (p === "center") return { x: window.innerWidth / 2 - w / 2, y: window.innerHeight / 2 - 240 };
  const m = (window as unknown as { __lastMouse?: { x: number; y: number } }).__lastMouse;
  if (p === "cursor" && m) return { x: Math.min(m.x, window.innerWidth - w - 16), y: Math.min(m.y, window.innerHeight - 360) };
  return { x: window.innerWidth / 2 - w / 2, y: 120 };
}

const ELECTRON_ACTION_TYPES = new Set<Action["type"]>([
  "openApp", "openFile", "openFolder", "openWebsite", "runCommand", "runPowershell", "runBatch",
  "pasteText", "typeText", "pressShortcut", "volumeControl", "mediaControl", "toggleMute",
"brightnessControl", "screenshot", "lockScreen", "openSettings", "showNotification", "copySelected",
  "clipboardHistory", "minimizeWindow", "maximizeWindow", "closeWindow", "moveWindow", "alwaysOnTop",
  "toggleWasdNavigation", "notesPopup",
]);
export async function runAction(action: Action): Promise<void> {
  const store = useStore.getState();
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.actions?.run && ELECTRON_ACTION_TYPES.has(action.type)) {
    try {
      const result = await electronAPI.actions.run(action);
      if (result && result.ok === false) {
        store.toast(`Action failed: ${result.error ?? "Unknown error"}`, "danger");
      }
      return;
    } catch (error) {
      store.toast("Desktop action failed: " + String(error), "danger");
      return;
    }
  }
  const settings = store.data.settings;
  const { type, payload } = action;

  if (isTauri()) {
    try {
      switch (type) {
        case "openApp": return await invoke("open_app", { path: payload.path ?? "", args: payload.args ?? "" });
        case "openFile":
        case "openFolder": return await invoke("open_path", { path: payload.path ?? "" });
        case "openWebsite": return await invoke("open_website", { url: payload.url ?? "" });
        case "runCommand": return await invoke("run_command", { command: payload.path ?? "", args: payload.args ?? "" });
        case "runPowershell": return await invoke("run_powershell", { script: payload.script ?? payload.path ?? "" });
        case "runBatch": return await invoke("run_batch", { path: payload.path ?? "" });
        case "pasteText": return await invoke("paste_text", { text: payload.text ?? "" });
        case "typeText": return await invoke("type_text", { text: payload.text ?? "" });
        case "pressShortcut": return await invoke("send_keys", { keys: payload.shortcut ?? "" });
        case "volumeControl": return await invoke("volume_control", { action: String(payload.volume ?? "up") });
        case "mediaControl": return await invoke("media_control", { action: payload.media ?? "playpause" });
        case "toggleMute": return await invoke("toggle_mute");
        case "screenshot": return await invoke("take_screenshot");
        case "lockScreen": return await invoke("lock_screen");
        case "openSettings": return await invoke("open_settings", { uri: payload.settingsPage ?? "ms-settings:" });
        case "showNotification": return await invoke("show_notification", { title: payload.notificationTitle ?? "KeyFlow", body: payload.notificationBody ?? "" });
        case "copySelected": return await invoke("copy_selected");
        case "clipboardHistory": return await invoke("open_clipboard_history");
        case "minimizeWindow": return await invoke("window_control", { action: "minimize" });
        case "maximizeWindow": return await invoke("window_control", { action: "maximize" });
        case "closeWindow": return await invoke("window_control", { action: "close" });
        case "moveWindow": return await invoke("window_control", { action: "move", direction: payload.direction ?? "left" });
        case "alwaysOnTop": return await invoke("window_control", { action: "alwaysontop" });
        case "brightnessControl": return await invoke("brightness_control", { action: String(payload.brightness ?? "up") });
      }
    } catch (e) {
      store.toast("Desktop action failed: " + String(e), "danger");
      return;
    }
  }

  switch (type) {
    case "openWebsite":
      if (payload.url) window.open(payload.url, "_blank", "noopener");
      store.toast("Opened website in browser mode", "success");
      break;
    case "pasteText":
      try {
        await navigator.clipboard?.writeText(payload.text ?? "");
        store.toast("Copied snippet to clipboard", "success");
      } catch {
        store.toast("Snippet: " + (payload.text ?? "").slice(0, 50), "info");
      }
      break;
    case "typeText": {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        el.value += payload.text ?? "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        store.toast("Typed into focused field", "success");
      } else {
        store.toast("Type text: " + (payload.text ?? "").slice(0, 40), "info");
      }
      break;
    }
    case "showPopup":
      if (electronAPI?.popup?.show) {
        try {
          await electronAPI.popup.show({ items: payload.popupItems ?? [], title: payload.title ?? "KeyFlow" });
        } catch (error) {
          store.toast("Popup failed: " + String(error), "danger");
        }
      } else {
        store.requestPopup({ items: payload.popupItems ?? [], ...popupPosition(settings), title: "KeyFlow" });
      }
      break;
    case "showNotification":
      if (settings.general.showNotifications && "Notification" in window) {
        try {
          if (Notification.permission === "default") await Notification.requestPermission();
          if (Notification.permission === "granted") new Notification(payload.notificationTitle ?? "KeyFlow", { body: payload.notificationBody ?? "" });
        } catch { /* noop */ }
      }
      store.toast(payload.notificationTitle ?? "Notification", "info");
      break;
    case "switchProfile":
      if (payload.profileId) store.setActiveProfile(payload.profileId);
      break;
    case "delay":
      await sleep(payload.delayMs ?? 500);
      break;
    case "multiAction":
      for (const a of payload.actions ?? []) await runAction(a);
      break;
    case "toggleMute":
      store.toast("Toggle mute needs desktop mode. Simulated now.", "warning");
      break;
    case "openApp":
    case "openFile":
    case "openFolder":
    case "runCommand":
    case "runPowershell":
    case "runBatch":
    case "pressShortcut":
    case "volumeControl":
    case "brightnessControl":
    case "mediaControl":
    case "screenshot":
    case "lockScreen":
    case "openSettings":
    case "copySelected":
    case "clipboardHistory":
    case "minimizeWindow":
    case "maximizeWindow":
    case "closeWindow":
case "moveWindow":
    case "alwaysOnTop":
    case "toggleWasdNavigation":
    case "notesPopup":
      store.toast(`${type} needs the Windows desktop build. Simulated now.`, "info");
      break;
  }
}

export async function runActions(actions: Action[]): Promise<void> {
  for (const action of actions) await runAction(action);
}
