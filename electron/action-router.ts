/**
 * ActionRouter: single place where a matched shortcut becomes side effects.
 * Runs in the main process for the native (helper) backend; the renderer
 * never re-executes actions on native triggers, so nothing fires twice.
 *
 * The default desktop runner is loaded lazily so unit tests that inject their
 * own runner never pull the electron module into a plain Node process.
 */

import { BrowserWindow } from "electron";
import type { ActionResult } from "./actions.js";
import type { PopupWindowManager } from "./popup-window.js";
import { hasShowPopupAction, popupItemsFromShortcut } from "./popup-routing.js";
import type { ShortcutEntry } from "./input/trigger-matcher.js";
import { inputDebug } from "./input/input-debug.js";

/** Per-completed-activation counter used to tag popup toggle generations. */
let popupGeneration = 0;
export function nextPopupGeneration(): string {
  popupGeneration += 1;
  return `${Date.now()}-${popupGeneration}`;
}

export interface ActionRouterDeps {
  popupManager: PopupWindowManager | null;
  mainWindow: BrowserWindow | null;
}

export type DesktopActionRunner = (action: any, window: BrowserWindow | null) => Promise<ActionResult>;

let defaultRunner: DesktopActionRunner | null = null;

/** Lazily loads the real action runner so tests that inject one never load electron. */
async function runnerFor(injected: DesktopActionRunner | undefined): Promise<DesktopActionRunner> {
  if (injected) return injected;
  if (!defaultRunner) {
    const mod = (await import("./actions.js")) as { runDesktopAction?: DesktopActionRunner };
    defaultRunner = mod.runDesktopAction ?? ((_action) => Promise.resolve({ ok: false, action: "?" }));
  }
  return defaultRunner;
}

export async function routeMatchedShortcut(
  sc: ShortcutEntry,
  deps: ActionRouterDeps,
  runAction?: DesktopActionRunner,
): Promise<ActionResult[]> {
  if (hasShowPopupAction(sc)) {
    inputDebug(`[input-debug] dispatch ${sc.id} route=popup`);
    console.log(`[popup] matched ${sc.id} -> toggle global overlay`);
    deps.popupManager?.toggle({
      items: popupItemsFromShortcut(sc),
      title: sc.name,
      triggerKey: sc.key,
      shortcutId: sc.id,
      generatorId: nextPopupGeneration(),
    });
    return [{ ok: true, action: "showPopup" }];
  }

  inputDebug(`[input-debug] dispatch ${sc.id} route=desktop-actions`);
  const runner = await runnerFor(runAction);
  const results: ActionResult[] = [];
  for (const action of sc.actions ?? []) {
    const result = await runner(action, deps.mainWindow);
    results.push(result);
    inputDebug(`[input-debug] action ${sc.id} ${action?.type ?? "?"} -> ok=${result.ok}${result.mode ? ` mode=${result.mode}` : ""}${result.path ? ` path=${result.path}` : ""}${result.error ? ` error=${result.error}` : ""}`);
  }
  return results;
}

/** Notifies the renderer for informational UI (recent list, debug toast). */
export function notifyRendererMatched(sc: ShortcutEntry, mainWindow: BrowserWindow | null): void {
  if (hasShowPopupAction(sc)) return;
  inputDebug(`[input-debug] notify renderer ${sc.id} (informational only)`);
  mainWindow?.webContents.send("shortcut:triggered", sc);
}
