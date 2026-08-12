/**
 * Pure predicates used by the native input service to prevent duplicate
 * processing when the suppression helper consumes or injects keys.
 */

export function isIgnoredKey(keycode: number, ignoredKeys: ReadonlySet<number>): boolean {
  return ignoredKeys.has(keycode);
}

/** True when a key was recently injected by the helper (replacement events). */
export function isRecentlyInjected(keycode: number, injected: Map<number, number>, now: number, windowMs = 250): boolean {
  const until = injected.get(keycode);
  if (until === undefined) return false;
  if (now > until) {
    injected.delete(keycode);
    return false;
  }
  return true;
}

export function markInjected(injected: Map<number, number>, keycode: number, now: number, windowMs = 250): void {
  injected.set(keycode, now + windowMs);
}