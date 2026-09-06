export const ELECTRON_DESKTOP_ACTIONS = new Set([
  "openApp", "openFile", "openFolder", "openWebsite", "runCommand", "runPowershell", "runBatch",
  "pasteText", "typeText", "pressShortcut", "volumeControl", "mediaControl", "toggleMute",
  "brightnessControl", "screenshot", "lockScreen", "openSettings", "showNotification", "copySelected",
  "clipboardHistory", "notesPopup", "minimizeWindow", "maximizeWindow", "closeWindow", "moveWindow", "alwaysOnTop",
  "showPopup", "toggleWasdNavigation", "toggleCapsLock", "toggleDimScreen", "dimScreenControl",
]);

export function routesToDesktop(actionType: string): boolean {
  return ELECTRON_DESKTOP_ACTIONS.has(actionType);
}
