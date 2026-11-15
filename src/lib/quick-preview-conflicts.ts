/** Only a global or Explorer-scoped shortcut can conflict in Explorer. */
export function appliesToExplorer(scope?: { executablePath?: string; processName?: string } | null): boolean {
  if (!scope) return true;
  const path = scope.executablePath?.trim();
  if (path) return path.replace(/\//g, "\\").split("\\").pop()?.toLowerCase() === "explorer.exe";
  const process = scope.processName?.trim();
  return process ? process.toLowerCase() === "explorer.exe" : true;
}
