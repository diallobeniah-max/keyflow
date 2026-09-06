/** Pure clipboard classification rules, kept Electron-free for repeatable tests. */
export type ClipboardKind = "text" | "html" | "url" | "email" | "image" | "screenshot" | "files" | "color" | "code" | "json" | "xml" | "csv";

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function classifyClipboardText(text: string, html: string): ClipboardKind {
  const trimmed = text.trim();
  if (HEX_COLOR.test(trimmed)) return "color";
  if (URL_PATTERN.test(trimmed)) return "url";
  if (EMAIL.test(trimmed)) return "email";
  if (/^[{[]/.test(trimmed)) {
    try { JSON.parse(trimmed); return "json"; } catch { /* not JSON */ }
  }
  if (/^<\?xml|^<[^>]+>/.test(trimmed)) return "xml";
  if (/^.+,.+\n/m.test(trimmed) || /^.+\t.+\n/m.test(trimmed)) return "csv";
  if (/\b(function|const|let|class|SELECT|FROM|import|export)\b/.test(trimmed) && /[{};=]/.test(trimmed)) return "code";
  if (html.trim()) return "html";
  return "text";
}

export type ClipboardOverlayLayout = "horizontal" | "center" | "right";
export type ClipboardHorizontalPosition = "bottom" | "top";
export type ClipboardScrollDirection = "horizontal" | "vertical";

export interface ClipboardUrlMeta {
  domain: string;
  title?: string;
  description?: string;
  favicon?: string;
  siteName?: string;
  /** Direct URL to a preview thumbnail (og:image, YouTube HQ thumbnail, etc.) */
  thumbnailUrl?: string;
  /** True when the URL points to a YouTube video — enables the "Play on YouTube" action */
  isYouTube?: boolean;
}

/** Extract a YouTube video ID from a watch URL or short URL.
 *  Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./i, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id.length >= 6 ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = parsed.searchParams.get("v");
      if (id && id.length >= 6) return id;
      const embed = parsed.pathname.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{6,})/);
      return embed ? embed[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build a high-quality YouTube thumbnail URL from a video ID (no network request needed). */
export function youTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function parseUrlDetails(rawUrl: string): { domain: string; title: string; favicon: string; thumbnailUrl?: string; isYouTube?: boolean } {
  try {
    const parsed = new URL(rawUrl.trim());
    const domain = parsed.hostname.replace(/^www\./i, "");
    const pathname = parsed.pathname.replace(/\/$/, "");
    const segments = pathname.split("/").filter(Boolean);
    
    let fallbackTitle = domain;
    if (segments.length > 0) {
      const last = decodeURIComponent(segments[segments.length - 1]).replace(/[-_]+/g, " ");
      if (segments.length >= 2) {
        const parent = decodeURIComponent(segments[segments.length - 2]).replace(/[-_]+/g, " ");
        fallbackTitle = `${parent} / ${last}`;
      } else {
        fallbackTitle = `${last} — ${domain}`;
      }
    }
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    // YouTube: extract video ID and build a free HQ thumbnail without a network request
    const ytId = extractYouTubeId(rawUrl);
    if (ytId) {
      return {
        domain,
        title: fallbackTitle,
        favicon,
        thumbnailUrl: youTubeThumbnail(ytId),
        isYouTube: true,
      };
    }

    return { domain, title: fallbackTitle, favicon };
  } catch {
    return { domain: rawUrl, title: rawUrl, favicon: "" };
  }
}

export function isPinboardColor(color: string): boolean {
  if (/^var\(--(?:color-accent|cat-color-(?:cyan|green|amber|rose|purple|blue))\)$/.test(color)) return true;
  return HEX_COLOR.test(color.trim());
}

export type ClipboardGridRows = 1 | 2 | 3;

/** Persisted capture preferences. Protected clipboard formats are always excluded. */
export interface ClipboardCaptureSettings {
  captureText: boolean;
  captureImages: boolean;
  captureFiles: boolean;
  captureLinks: boolean;
  ignorePasswordManagers: boolean;
  retentionDays: 0 | 7 | 30;
}

export const DEFAULT_CAPTURE_SETTINGS: ClipboardCaptureSettings = {
  captureText: true, captureImages: true, captureFiles: true, captureLinks: true,
  ignorePasswordManagers: true, retentionDays: 0,
};

export function shouldCaptureKind(kind: ClipboardKind, settings: ClipboardCaptureSettings): boolean {
  if (kind === "image" || kind === "screenshot") return settings.captureImages;
  if (kind === "files") return settings.captureFiles;
  if (kind === "url") return settings.captureLinks;
  return settings.captureText;
}

/** Respect Windows' history opt-out flags as well as password-manager markers.
 * https://learn.microsoft.com/windows/win32/dataxchg/clipboard-formats
 */
export function isProtectedClipboard(formats: string[], readBuffer: (format: string) => Uint8Array): boolean {
  if (formats.some(format => /password|credential|keepass|bitwarden|ExcludeClipboardContentFromMonitorProcessing/i.test(format))) return true;
  const flag = formats.find(format => format.toLowerCase() === "canincludeinclipboardhistory");
  if (!flag) return false;
  try {
    const value = readBuffer(flag);
    return value.length < 4 || (value[0] === 0 && value[1] === 0 && value[2] === 0 && value[3] === 0);
  } catch { return true; }
}

/** Keep the entire popup inside the work area, including on scaled/small monitors. */
export function clipboardPopupBounds(area: { x: number; y: number; width: number; height: number }, layout: ClipboardOverlayLayout, position: ClipboardHorizontalPosition, rows: ClipboardGridRows = 1) {
  const margin = Math.min(16, Math.floor(Math.min(area.width, area.height) / 10));
  const availableWidth = Math.max(1, area.width - margin * 2);
  const availableHeight = Math.max(1, area.height - margin * 2);
  const width = Math.min(availableWidth, layout === "right" ? 420 : layout === "center" ? 880 : 1360);
  const height = Math.min(availableHeight, layout === "right" ? availableHeight : layout === "center" ? 620 : 150 + rows * 230);
  return {
    x: area.x + (layout === "right" ? area.width - width - margin : Math.round((area.width - width) / 2)),
    y: area.y + (layout === "center" ? Math.round((area.height - height) / 2) : position === "top" || layout === "right" ? margin : area.height - height - margin),
    width, height,
  };
}

export function normalizeClipboardSettings(input?: Partial<{
  layout: ClipboardOverlayLayout;
  horizontalPosition: ClipboardHorizontalPosition;
  scrollDirection: ClipboardScrollDirection;
  gridRows: ClipboardGridRows;
  useAppAccentColor: boolean;
}>): {
  layout: ClipboardOverlayLayout;
  horizontalPosition: ClipboardHorizontalPosition;
  scrollDirection: ClipboardScrollDirection;
  gridRows: ClipboardGridRows;
  useAppAccentColor: boolean;
} {
  return {
    layout: input?.layout === "center" || input?.layout === "right" ? input.layout : "horizontal",
    horizontalPosition: input?.horizontalPosition === "top" ? "top" : "bottom",
    scrollDirection: input?.scrollDirection === "vertical" ? "vertical" : "horizontal",
    gridRows: input?.gridRows === 2 || input?.gridRows === 3 ? input.gridRows : 1,
    useAppAccentColor: input?.useAppAccentColor !== false,
  };
}
