import type { AppIconId } from "../types";

export const APP_ICON_ASSETS: Record<AppIconId, string> = {
  monochrome: "/app-icons/keyflow-monochrome.png",
  blue: "/app-icons/keyflow-blue.png",
  green: "/app-icons/keyflow-green.png",
  red: "/app-icons/keyflow-red.png",
};

export function getAppIconAsset(icon?: AppIconId): string {
  return APP_ICON_ASSETS[icon ?? "monochrome"];
}
