import type { AppScope } from "../types";

/**
 * Pure app-scope helpers. All matching is done on the NORMALIZED executable
 * path — window titles never participate in scope identity (matching is exact
 * and title-independent). Kept dependency-free so Node can unit-test it.
 */

/** Normalize a Windows executable path for identity comparison. */
export function normalizeExecutablePath(path: string | undefined | null): string {
  if (!path) return "";
  return path
    .replace(/\0/g, "")
    .trim()
    .replace(/\//g, "\\")
    .toLowerCase();
}

/** Whether `scope` matches the current foreground app (by normalized path). */
export function appScopeMatches(scope: AppScope | undefined | null, activeApp: { executablePath?: string } | null): boolean {
  if (!scope || scope.scopeType !== "executable") return true;
  const scopePath = normalizeExecutablePath(scope.executablePath);
  if (!scopePath) return true; // degenerate scope = everywhere
  const activePath = normalizeExecutablePath(activeApp?.executablePath);
  return activePath === scopePath;
}

/** Whether a shortcut's scope is active for the given foreground app. */
export function isScopeActive(scope: AppScope | undefined | null, activeApp: { executablePath?: string } | null): boolean {
  if (!scope || scope.scopeType !== "executable") return true;
  return appScopeMatches(scope, activeApp);
}

/** Stable deduplication key for a scope (normalized executable path). */
export function appScopeKey(scope: AppScope | undefined | null): string {
  if (!scope || scope.scopeType !== "executable") return "everywhere";
  return normalizeExecutablePath(scope.executablePath);
}

/** Short display label for a scope (display name > process name > file base). */
export function formatScopeLabel(scope: AppScope | undefined | null): string {
  if (!scope || scope.scopeType !== "executable") return "Everywhere";
  if (scope.displayName) return scope.displayName;
  if (scope.processName) return scope.processName;
  const path = scope.executablePath.replace(/\\/g, "/");
  const base = path.split("/").pop() ?? "";
  return base.replace(/\.exe$/i, "") || base;
}

/** Deduplicate running apps by normalized executable path. */
export function filterRunningApps(apps: { executablePath?: string; processName?: string; displayName?: string; icon?: string }[]): {
  executablePath: string;
  processName: string;
  displayName: string;
  icon?: string;
}[] {
  const seen = new Set<string>();
  const out: { executablePath: string; processName: string; displayName: string; icon?: string }[] = [];
  for (const a of apps) {
    if (!a.executablePath) continue;
    const key = normalizeExecutablePath(a.executablePath);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      executablePath: a.executablePath,
      processName: a.processName ?? "",
      displayName: a.displayName ?? a.processName ?? "",
      icon: a.icon,
    });
  }
  return out.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));
}

/** Build a scope from a picked running app. */
export function scopeFromPickedApp(app: { executablePath: string; processName?: string; displayName?: string }): AppScope {
  return {
    scopeType: "executable",
    executablePath: app.executablePath,
    processName: app.processName,
    displayName: app.displayName ?? app.processName,
  };
}

/** Build a scope from a user-browsed executable path (display name = base name). */
export function scopeFromBrowsePath(executablePath: string): AppScope | null {
  const path = executablePath.trim();
  if (!path) return null;
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
  const display = base.replace(/\.exe$/i, "") || base;
  return {
    scopeType: "executable",
    executablePath: path,
    processName: display,
    displayName: display,
  };
}

/**
 * Diff two snapshots of the running-app list by normalized executable identity.
 * Returns only what changed so the UI can update a live "Running Now" list
 * without rebuilding the whole modal (no flicker, no re-render churn).
 * `prev`/`next` entries only need an executable path; display fields are
 * carried through from `next`.
 */
export function diffRunningApps(
  prev: { executablePath?: string }[],
  next: { executablePath?: string; processName?: string; displayName?: string; icon?: string }[],
): { added: { executablePath: string; processName: string; displayName: string; icon?: string }[]; removed: string[] } {
  const prevKeys = new Set(prev.map((a) => normalizeExecutablePath(a?.executablePath)).filter(Boolean));
  const nextKeys = new Set<string>();
  const added: { executablePath: string; processName: string; displayName: string; icon?: string }[] = [];
  for (const a of next) {
    const key = normalizeExecutablePath(a?.executablePath);
    if (!key || !a.executablePath) continue;
    nextKeys.add(key);
    if (!prevKeys.has(key)) {
      added.push({
        executablePath: a.executablePath,
        processName: a.processName ?? "",
        displayName: a.displayName ?? a.processName ?? "",
        icon: a.icon,
      });
    }
  }
  const removed: string[] = [];
  for (const key of prevKeys) {
    if (!nextKeys.has(key)) removed.push(key);
  }
  return { added, removed };
}

/**
 * App scopes already saved on shortcuts in this profile (deduped by normalized
 * identity). These are the "saved apps" that must survive even when their
 * process is no longer running — closing an app only removes it from the live
 * "Running Now" list, never from saved shortcut scopes.
 */
export function savedScopes(shortcuts: { appScope?: AppScope | null }[]): AppScope[] {
  const seen = new Set<string>();
  const out: AppScope[] = [];
  for (const s of shortcuts) {
    const scope = s?.appScope;
    if (!scope || scope.scopeType !== "executable") continue;
    const key = appScopeKey(scope);
    if (!key || key === "everywhere" || seen.has(key)) continue;
    seen.add(key);
    out.push(scope);
  }
  return out;
}
