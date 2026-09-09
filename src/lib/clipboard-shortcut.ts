import { resolveTiming } from "./timing.ts";

/**
 * Native system override marker for KeyFlow's clipboard accelerator.
 *
 * Clipboard is deliberately modeled outside of regular shortcut setup: Windows
 * reserves several Win-key combinations, so this binding has to be consumed by
 * the native hook as one complete chord rather than as a single key policy.
 */
export const CLIPBOARD_SYSTEM_SHORTCUT_ID = "__system_clipboard_history";

type ClipboardShortcutEntry = {
  id: string;
  key: string;
  modifiers?: string[];
  actions?: Array<{ type?: string }>;
  suppressKey?: boolean;
  keyBehavior?: string;
  [key: string]: unknown;
};

function parseBinding(value: string): { key: string; modifiers: string[] } | null {
  const parts = value.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const key = parts.at(-1);
  if (!key) return null;
  return { key, modifiers: parts.slice(0, -1) };
}

function sameBinding(entry: ClipboardShortcutEntry, binding: { key: string; modifiers: string[] }): boolean {
  const entryModifiers = (entry.modifiers ?? []).map((modifier) => modifier.toLowerCase()).sort().join("+");
  const bindingModifiers = binding.modifiers.map((modifier) => modifier.toLowerCase()).sort().join("+");
  return entry.key.toLowerCase() === binding.key.toLowerCase() && entryModifiers === bindingModifiers;
}

/**
 * Give the clipboard manager one authoritative keyboard binding. The matching
 * user shortcut is retained and upgraded to a native system override; a
 * conflicting non-clipboard shortcut is removed only from this runtime list.
 */
export function installClipboardShortcutBinding<T extends ClipboardShortcutEntry>(
  entries: T[],
  settings: { clipboardShortcut?: string; clipboardShortcutEnabled?: boolean },
  profileId: string,
): T[] {
  const configured = settings.clipboardShortcut?.trim() || "Win+V";
  if (!configured || settings.clipboardShortcutEnabled === false) return entries;

  const binding = parseBinding(configured);
  if (!binding) return entries;

  const retained = entries.filter((entry) => {
    if (!sameBinding(entry, binding)) return true;
    return entry.actions?.some((action) => action.type === "clipboardHistory") === true;
  });

  const existingIndex = retained.findIndex((entry) =>
    sameBinding(entry, binding) && entry.actions?.some((action) => action.type === "clipboardHistory"));

  if (existingIndex >= 0) {
    retained[existingIndex] = {
      ...retained[existingIndex],
      // Runtime-only identity: the native helper uses this to recognize the
      // protected system chord while the saved user shortcut remains intact.
      id: CLIPBOARD_SYSTEM_SHORTCUT_ID,
      suppressKey: true,
      keyBehavior: "suppress",
    } as T;
    return retained;
  }

  retained.push({
    id: CLIPBOARD_SYSTEM_SHORTCUT_ID,
    profileId,
    key: binding.key,
    mouse: false,
    modifiers: binding.modifiers,
    trigger: "combo",
    timing: resolveTiming(undefined),
    actions: [{ type: "clipboardHistory" }],
    enabled: true,
    suppressKey: true,
    keyBehavior: "suppress",
    remapTo: undefined,
    appScope: undefined,
  } as unknown as T);
  return retained;
}
