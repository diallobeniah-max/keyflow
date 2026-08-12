export const ELECTRON_DESKTOP_ACTIONS = new Set([
  "openApp", "openFile", "openFolder", "openWebsite", "runCommand", "runPowershell", "runBatch",
  "pasteText", "typeText", "pressShortcut", "volumeControl", "mediaControl", "toggleMute",
  "brightnessControl", "screenshot", "lockScreen", "openSettings", "showNotification", "copySelected",
  "clipboardHistory", "minimizeWindow", "maximizeWindow", "closeWindow", "moveWindow", "alwaysOnTop",
  "showPopup",
]);

export function routesToDesktop(actionType: string): boolean {
  return ELECTRON_DESKTOP_ACTIONS.has(actionType);
}
