/**
 * Pure popup menu resolution helpers. No React/Electron imports so Node tests
 * can verify the exact behavior of the runtime menu.
 */

import type { PopupItem } from "../types";

/** Effective activation key for an item: explicit `key` or its 1-based position. */
export function effectivePopupKey(item: PopupItem, index: number): string {
  const k = item.key?.trim();
  if (k && k.length === 1) return k;
  return String(index + 1);
}

/**
 * Runtime menu: the globally configured menu wins; a per-shortcut popup
 * (payload items) is used only as a fallback so users never see an empty menu.
 */
export function resolvePopupItems(payloadItems: PopupItem[], configuredItems: PopupItem[] | undefined): PopupItem[] {
  const configured = Array.isArray(configuredItems) ? configuredItems : [];
  const source = configured.length > 0 ? configured : (Array.isArray(payloadItems) ? payloadItems : []);
  return source.filter((it) => it && it.enabled !== false);
}

/** key -> item index, first (highest priority) item wins a duplicate key. */
export function popupKeyMap(items: PopupItem[]): Map<string, number> {
  const map = new Map<string, number>();
  items.forEach((it, i) => {
    const key = effectivePopupKey(it, i);
    if (!map.has(key)) map.set(key, i);
  });
  return map;
}

/** Activation keys used by more than one item (KeyFlow conflict treatment: first wins). */
export function findDuplicatePopupKeys(items: PopupItem[]): string[] {
  const seen = new Map<string, number>();
  for (let i = 0; i < items.length; i += 1) {
    const key = effectivePopupKey(items[i], i);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return Array.from(seen.entries()).filter(([, count]) => count > 1).map(([key]) => key).sort();
}
