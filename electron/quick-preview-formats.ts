export type PreviewFileKind = "image" | "pdf" | "text" | "document" | "audio" | "video" | "archive" | "unsupported";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif", ".tif", ".tiff"]);
const TEXT_EXTS = new Set([
  ".txt", ".md", ".markdown", ".js", ".mjs", ".ts", ".jsx", ".tsx", ".json", ".xml", ".csv", ".yaml", ".yml", ".toml", ".ini", ".cfg",
  ".conf", ".sh", ".bat", ".ps1", ".py", ".rb", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".sql", ".log", ".env", ".gitignore", ".lock",
]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a", ".opus", ".wma"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mkv", ".avi", ".mov", ".wmv", ".m4v"]);

/** PSD/PSB and other shell-provider formats are resolved separately. */
export function detectKind(extension: string): PreviewFileKind {
  const ext = extension.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "document";
  if (ext === ".zip" || ext === ".cbz") return "archive";
  if (TEXT_EXTS.has(ext)) return "text";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "unsupported";
}
