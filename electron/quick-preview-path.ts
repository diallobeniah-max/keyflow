/** Validate an absolute Windows filesystem path without rejecting legal names. */
export function isValidLocalPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 32767 || /[\x00-\x1f<>"|?*]/.test(path)) return false;
  if (/^[a-zA-Z]:[\\/]/.test(path)) return !path.slice(2).includes(':');
  if (/^\\\\[^\\/]+[\\/][^\\/]+/.test(path)) return !path.includes(':');
  return false;
}
