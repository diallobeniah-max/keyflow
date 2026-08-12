/**
 * Pure helper for the popup trigger-key guard.
 * Determines whether a keyboard input event belongs to the key that triggered
 * the popup, so only that key is discarded while the popup is opening.
 */
export function matchesTriggerKey(inputKey: string | undefined, triggerKey: string | undefined): boolean {
  if (!inputKey || !triggerKey) return false;
  const a = inputKey.trim().toLowerCase();
  const b = triggerKey.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
}
