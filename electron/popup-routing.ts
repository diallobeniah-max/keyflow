import type { ShortcutEntry } from "./input/trigger-matcher.js";

export function firstShowPopupAction(sc: ShortcutEntry | null | undefined): any {
  if (!sc?.actions) return null;
  return sc.actions.find((action: any) => action?.type === "showPopup") ?? null;
}

export function hasShowPopupAction(sc: ShortcutEntry | null | undefined): boolean {
  return firstShowPopupAction(sc) !== null;
}

export function popupItemsFromShortcut(sc: ShortcutEntry | null | undefined): any[] {
  const action = firstShowPopupAction(sc);
  return action?.payload?.popupItems ?? [];
}
