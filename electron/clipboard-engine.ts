/**
 * KeyFlow Clipboard Engine
 *
 * Main-process only clipboard capture, persistence, replay and drag staging.
 * The renderer receives summaries first and asks for an item detail on demand.
 * This implementation is original; its settle/coalesce shape was informed by
 * Edge-Drop's Apache-2.0 documented Windows clipboard behaviour.
 */
import { app, clipboard, nativeImage, safeStorage } from "electron";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, join, normalize, resolve } from "path";
import { readClipboardFiles, writeClipboardFiles } from "./clipboard-files.js";
import {
  classifyClipboardText,
  DEFAULT_CAPTURE_SETTINGS,
  shouldCaptureKind,
  isProtectedClipboard,
  type ClipboardCaptureSettings,
  isPinboardColor,
  parseUrlDetails,
  type ClipboardKind,
  type ClipboardOverlayLayout,
  type ClipboardHorizontalPosition,
  type ClipboardScrollDirection,
  type ClipboardGridRows,
  type ClipboardUrlMeta,
} from "./clipboard-contract.js";

export type { ClipboardKind, ClipboardOverlayLayout, ClipboardHorizontalPosition, ClipboardScrollDirection, ClipboardGridRows, ClipboardUrlMeta } from "./clipboard-contract.js";
export type ClipboardSurface = "edge" | "bottom" | "center";

export interface ClipboardItemSummary {
  id: string;
  kind: ClipboardKind;
  title: string;
  preview: string;
  capturedAt: number;
  lastUsedAt?: number;
  copyCount: number;
  useCount: number;
  pinned: boolean;
  pinboardIds: string[];
  sourceApp?: string;
  bytes?: number;
  fileCount?: number;
  color?: string;
  dimensions?: { width: number; height: number };
  thumbnailDataUrl?: string;
  urlMeta?: ClipboardUrlMeta;
}

export interface ClipboardItemDetail extends ClipboardItemSummary {
  text?: string;
  html?: string;
  url?: string;
  paths?: string[];
  imageDataUrl?: string;
  imagePath?: string;
  formats: string[];
  nativeFormats: string[];
}

export interface Pinboard {
  id: string;
  name: string;
  color: string;
  order: number;
  icon?: string;
}

export interface ClipboardSettings extends ClipboardCaptureSettings {
  paused: boolean;
  maxItems: number;
  defaultSurface: ClipboardSurface;
  excludedApps: string[];
  layout?: ClipboardOverlayLayout;
  horizontalPosition?: ClipboardHorizontalPosition;
  scrollDirection?: ClipboardScrollDirection;
  gridRows?: ClipboardGridRows;
  useAppAccentColor?: boolean;
  closeOnBlur?: boolean;
}

export interface ClipboardSnapshot {
  items: ClipboardItemSummary[];
  pinboards: Pinboard[];
  settings: ClipboardSettings;
}

export interface ClipboardSourceApp {
  displayName?: string;
  processName?: string;
  executablePath?: string;
}

type StoredItem = ClipboardItemDetail & { signature: string };
type PersistedPayload = { version: 1; items: StoredItem[]; pinboards: Pinboard[]; settings: ClipboardSettings };

const DEFAULT_SETTINGS: ClipboardSettings = {
  ...DEFAULT_CAPTURE_SETTINGS,
  paused: false,
  maxItems: 500,
  defaultSurface: "center",
  excludedApps: [],
  layout: "horizontal",
  horizontalPosition: "bottom",
  scrollDirection: "horizontal",
  gridRows: 1,
  useAppAccentColor: true,
  closeOnBlur: true,
};

const POLL_MS = 350;
const SETTLE_MS = 220;
const COALESCE_MS = 650;
const MAX_TEXT_BYTES = 1_000_000;

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeText(value: string, max = 220): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function isPathInside(child: string, parent: string): boolean {
  const absoluteChild = resolve(child).toLowerCase();
  const absoluteParent = resolve(parent).toLowerCase();
  return absoluteChild === absoluteParent || absoluteChild.startsWith(`${absoluteParent}\\`);
}

function parseFileNameW(): string[] {
  try {
    const raw = clipboard.readBuffer("FileNameW");
    if (!raw?.length) return [];
    const fromBuffer = raw.toString("utf16le").split("\0").map((value) => value.trim()).filter(Boolean);
    // Explorer frequently mirrors a multi-file copy as newline-separated text.
    const text = clipboard.readText().split(/\r?\n/).map((value) => value.trim().replace(/^"|"$/g, "")).filter(Boolean);
    return text.length > fromBuffer.length && text.every((path) => /^(?:[a-z]:\\|\\\\)/i.test(path)) ? text : fromBuffer;
  } catch {
    return [];
  }
}

function titleFor(kind: ClipboardKind, text: string, paths: string[]): string {
  if (kind === "files") return paths.length > 1 ? `${paths.length} files` : basename(paths[0] ?? "File");
  if (kind === "color") return text.trim().toUpperCase();
  if (kind === "url") { try { return new URL(text.trim()).hostname; } catch { return text.trim(); } }
  if (kind === "email") return text.trim();
  if (kind === "image" || kind === "screenshot") return kind === "screenshot" ? "Screenshot" : "Image";
  return safeText(text, 72) || kind.toUpperCase();
}

export class ClipboardEngine {
  private items: StoredItem[] = [];
  private pinboards: Pinboard[] = [];
  private settings: ClipboardSettings = { ...DEFAULT_SETTINGS };
  private timer: NodeJS.Timeout | null = null;
  private settleTimer: NodeJS.Timeout | null = null;
  private lastObservedSignature = "";
  private lastCapturedSignature = "";
  private lastCapturedAt = 0;
  private captureGeneration = 0;
  private restoring = false;
  private listeners = new Set<(snapshot: ClipboardSnapshot) => void>();
  private sourceAppProvider: (() => Promise<ClipboardSourceApp | null>) | null = null;

  private get root(): string { return join(app.getPath("userData"), "clipboard"); }
  private get imageRoot(): string { return join(this.root, "images"); }
  private get stagingRoot(): string { return join(this.root, "staging"); }
  private get indexPath(): string { return join(this.root, "history.json"); }

  start(): void {
    this.ensureDirectories();
    this.load();
    this.cleanupStaging();
    this.lastObservedSignature = this.peekSignature();
    if (!this.timer) this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  stop(): void {
    this.captureGeneration += 1;
    if (this.timer) clearInterval(this.timer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.timer = null;
    this.settleTimer = null;
  }

  subscribe(listener: (snapshot: ClipboardSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  /** The input helper owns foreground-app lookup; this keeps the engine reusable. */
  setSourceAppProvider(provider: (() => Promise<ClipboardSourceApp | null>) | null): void {
    this.sourceAppProvider = provider;
  }

  snapshot(): ClipboardSnapshot {
    return { items: this.items.map((item) => this.summary(item)), pinboards: [...this.pinboards].sort((a, b) => a.order - b.order), settings: { ...this.settings, excludedApps: [...this.settings.excludedApps] } };
  }

  getItem(id: string): ClipboardItemDetail | null {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    const detail = { ...item, pinboardIds: [...item.pinboardIds], paths: item.paths ? [...item.paths] : undefined, formats: [...item.formats], nativeFormats: [...item.nativeFormats] };
    if (item.imagePath && existsSync(item.imagePath)) {
      detail.imageDataUrl = `data:image/png;base64,${readFileSync(item.imagePath).toString("base64")}`;
    }
    return detail;
  }

  setSettings(patch: Partial<ClipboardSettings>): ClipboardSnapshot {
    // Reject invalid IPC data rather than persisting settings the runtime cannot use.
    for (const key of ["paused", "captureText", "captureImages", "captureFiles", "captureLinks", "ignorePasswordManagers", "useAppAccentColor", "closeOnBlur"] as const) {
      if (patch[key] !== undefined && typeof patch[key] !== "boolean") throw new Error(`Invalid ${key} setting.`);
    }
    if (patch.maxItems !== undefined && (!Number.isInteger(patch.maxItems) || patch.maxItems < 1 || patch.maxItems > 10000)) throw new Error("Invalid clipboard capacity.");
    if (patch.retentionDays !== undefined && ![0, 7, 30].includes(patch.retentionDays)) throw new Error("Invalid retention period.");
    if (patch.layout !== undefined && !["horizontal", "center", "right"].includes(patch.layout)) throw new Error("Invalid clipboard layout.");
    if (patch.gridRows !== undefined && ![1, 2, 3].includes(patch.gridRows)) throw new Error("Invalid clipboard rows.");
    if (patch.horizontalPosition !== undefined && !["top", "bottom"].includes(patch.horizontalPosition)) throw new Error("Invalid clipboard position.");
    if (patch.scrollDirection !== undefined && !["horizontal", "vertical"].includes(patch.scrollDirection)) throw new Error("Invalid clipboard scroll direction.");
    if (patch.excludedApps !== undefined && (!Array.isArray(patch.excludedApps) || patch.excludedApps.some((value) => typeof value !== "string"))) throw new Error("Invalid excluded applications.");
    this.captureGeneration += 1;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.settings = { ...this.settings, ...patch, excludedApps: patch.excludedApps ? [...patch.excludedApps] : this.settings.excludedApps };
    this.lastObservedSignature = this.peekSignature();
    this.enforceRetention();
    this.persist(); this.emit(); return this.snapshot();
  }

  createPinboard(input: Partial<Pick<Pinboard, "name" | "color" | "icon">>): ClipboardSnapshot {
    const name = (input.name ?? "").trim().slice(0, 48) || "New Folder";
    this.pinboards.push({
      id: randomUUID(),
      name,
      color: input.color && isPinboardColor(input.color) ? input.color : "var(--color-accent)",
      icon: input.icon || "Folder",
      order: this.pinboards.length,
    });
    this.persist(); this.emit(); return this.snapshot();
  }

  updatePinboard(id: string, patch: Partial<Pick<Pinboard, "name" | "color" | "order" | "icon">>): ClipboardSnapshot {
    const board = this.pinboards.find((entry) => entry.id === id);
    if (!board) throw new Error("Pinboard not found.");
    if (patch.name !== undefined) board.name = patch.name.trim().slice(0, 48) || board.name;
    if (patch.color && isPinboardColor(patch.color)) board.color = patch.color;
    if (patch.icon !== undefined) board.icon = patch.icon;
    if (typeof patch.order === "number") board.order = Math.max(0, Math.floor(patch.order));
    this.persist(); this.emit(); return this.snapshot();
  }

  deletePinboard(id: string): ClipboardSnapshot {
    this.pinboards = this.pinboards.filter((entry) => entry.id !== id);
    this.items.forEach((item) => { item.pinboardIds = item.pinboardIds.filter((boardId) => boardId !== id); });
    this.persist(); this.emit(); return this.snapshot();
  }

  setPinned(id: string, pinned: boolean): ClipboardSnapshot {
    const item = this.requireItem(id); item.pinned = pinned; this.persist(); this.emit(); return this.snapshot();
  }

  moveToPinboard(id: string, pinboardId: string | null): ClipboardSnapshot {
    const item = this.requireItem(id);
    if (pinboardId && !this.pinboards.some((entry) => entry.id === pinboardId)) throw new Error("Pinboard not found.");
    item.pinboardIds = pinboardId ? Array.from(new Set([...item.pinboardIds, pinboardId])) : [];
    if (pinboardId) item.pinned = true;
    this.persist(); this.emit(); return this.snapshot();
  }

  assignPinboard(itemId: string, pinboardId: string): ClipboardSnapshot {
    const item = this.requireItem(itemId);
    if (!this.pinboards.some((entry) => entry.id === pinboardId)) throw new Error("Pinboard not found.");
    item.pinboardIds = Array.from(new Set([...item.pinboardIds, pinboardId]));
    item.pinned = true;
    this.persist(); this.emit(); return this.snapshot();
  }

  unassignPinboard(itemId: string, pinboardId: string): ClipboardSnapshot {
    const item = this.requireItem(itemId);
    item.pinboardIds = item.pinboardIds.filter((id) => id !== pinboardId);
    this.persist(); this.emit(); return this.snapshot();
  }

  reorderItems(sourceId: string, targetId: string): ClipboardSnapshot {
    const sourceIdx = this.items.findIndex((item) => item.id === sourceId);
    const targetIdx = this.items.findIndex((item) => item.id === targetId);
    if (sourceIdx >= 0 && targetIdx >= 0 && sourceIdx !== targetIdx) {
      const [item] = this.items.splice(sourceIdx, 1);
      this.items.splice(targetIdx, 0, item);
      this.persist();
      this.emit();
    }
    return this.snapshot();
  }

  rename(id: string, title: string): ClipboardSnapshot {
    const item = this.requireItem(id); item.title = title.trim().slice(0, 120) || item.title; this.persist(); this.emit(); return this.snapshot();
  }

  delete(id: string): ClipboardSnapshot {
    const item = this.requireItem(id); this.removeFiles(item); this.items = this.items.filter((entry) => entry.id !== id); this.persist(); this.emit(); return this.snapshot();
  }

  clearUnpinned(): ClipboardSnapshot {
    const removed = this.items.filter((item) => !item.pinned);
    removed.forEach((item) => this.removeFiles(item));
    this.items = this.items.filter((item) => item.pinned);
    this.persist(); this.emit(); return this.snapshot();
  }

  probeFormats(): Array<{ format: string; size?: number }> {
    try {
      const formats = clipboard.availableFormats();
      return formats.map((format) => {
        try {
          const buf = clipboard.readBuffer(format);
          return { format, size: buf?.length ?? 0 };
        } catch {
          return { format };
        }
      });
    } catch {
      return [];
    }
  }

  async restoreToClipboard(id: string, plainText = false): Promise<ClipboardItemDetail> {
    const item = this.requireItem(id);
    this.restoring = true;
    this.captureGeneration += 1;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    try {
    if (item.kind === "files" && item.paths?.length) {
      if (plainText) clipboard.writeText(item.paths.join("\r\n"));
      else {
        if (item.paths.some((path) => !existsSync(path))) throw new Error("A copied file has moved or was deleted.");
        await writeClipboardFiles(item.paths);
      }
    } else if (item.imagePath) {
      if (!existsSync(item.imagePath)) throw new Error("This clipboard image is no longer available.");
      clipboard.writeImage(nativeImage.createFromBuffer(readFileSync(item.imagePath)));
    } else if (item.html && !plainText) {
      clipboard.write({ text: item.text ?? "", html: item.html });
    } else {
      clipboard.writeText(item.text ?? item.url ?? "");
    }
    item.lastUsedAt = Date.now(); item.useCount += 1; this.persist(); this.emit(); return item;
    } finally {
      this.lastObservedSignature = this.peekSignature();
      this.restoring = false;
    }
  }

  stageForDrag(id: string): { file: string; files: string[] } {
    const item = this.requireItem(id);
    if (item.kind === "files" && item.paths?.length) return { file: item.paths[0], files: item.paths };
    this.ensureDirectories();
    const base = join(this.stagingRoot, `${item.id}-${Date.now()}`);
    if (item.imagePath && existsSync(item.imagePath)) {
      const output = `${base}.png`; writeFileSync(output, readFileSync(item.imagePath)); return { file: output, files: [output] };
    }
    const extension = item.kind === "json" ? ".json" : item.kind === "xml" ? ".xml" : item.kind === "csv" ? ".csv" : item.kind === "html" ? ".html" : ".txt";
    const output = `${base}${extension}`; writeFileSync(output, item.text ?? item.url ?? "", "utf8"); return { file: output, files: [output] };
  }

  addDroppedFiles(paths: unknown): ClipboardSnapshot {
    if (!Array.isArray(paths)) throw new Error("Invalid file drop.");
    const valid = paths.filter((path): path is string => typeof path === "string" && path.length > 0 && existsSync(path) && !isPathInside(path, this.stagingRoot));
    if (!valid.length) return this.snapshot();
    this.capture({ kind: "files", paths: valid, formats: ["FileNameW"], nativeFormats: ["FileNameW"] }); return this.snapshot();
  }

  private poll(): void {
    if (this.settings.paused || this.restoring) return;
    const observed = this.peekSignature();
    if (!observed || observed === this.lastObservedSignature) return;
    this.lastObservedSignature = observed;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => { this.settleTimer = null; void this.captureCurrent(); }, SETTLE_MS);
  }

  private peekSignature(): string {
    try {
      const formats = clipboard.availableFormats();
      if (!formats.length) return "";
      if (isProtectedClipboard(formats, (format) => clipboard.readBuffer(format))) return "sensitive";
      const paths = parseFileNameW();
      if (paths.length) return `files:${sha(paths.map((path) => normalize(path).toLowerCase()).join("\n"))}`;
      const hasImage = formats.some((f) => f.startsWith("image/") || f.includes("DIB") || f.includes("Bitmap"));
      if (hasImage) {
        const image = clipboard.readImage();
        if (!image.isEmpty()) {
          const sz = image.getSize();
          // Fast uncompressed sample: dimensions + raw bitmap header sample without expensive 350ms PNG re-encoding
          const bmpSample = image.toBitmap().subarray(0, 128);
          return `image:${sz.width}x${sz.height}:${sha(bmpSample)}`;
        }
      }
      const text = clipboard.readText();
      const html = clipboard.readHTML();
      if (text || html) {
        // Fast peek: length + slice sample
        const textSample = text.length > 512 ? `${text.slice(0, 256)}\0${text.slice(-256)}\0${text.length}` : text;
        const htmlSample = html.length > 512 ? `${html.slice(0, 256)}\0${html.slice(-256)}\0${html.length}` : html;
        return `text:${sha(`${textSample}\0${htmlSample}`)}`;
      }
      return formats.join("|");
    } catch { return ""; }
  }

  private async captureCurrent(): Promise<void> {
    try {
      if (this.settings.paused || this.restoring) return;
      const generation = this.captureGeneration;
      const signature = this.peekSignature();
      const source = await this.getSourceApp();
      if (generation !== this.captureGeneration || signature !== this.peekSignature() || this.settings.paused) return;
      const formats = clipboard.availableFormats();
      if (isProtectedClipboard(formats, (format) => clipboard.readBuffer(format))) return;
      if (source && this.isExcludedSource(source)) return;
      let paths = parseFileNameW();
      if (paths.length) {
        if (!this.settings.captureFiles) return;
        paths = await readClipboardFiles();
        if (generation !== this.captureGeneration || signature !== this.peekSignature()) return;
      }
      if (paths.length) { this.capture({ kind: "files", paths, formats, nativeFormats: formats, sourceApp: source }); return; }
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const png = image.toPNG();
        const kind: ClipboardKind = formats.some((format) => /screenshot|snip|screenclip/i.test(format)) ? "screenshot" : "image";
        const thumbnailDataUrl = image.resize({ width: 320 }).toDataURL();
        this.capture({ kind, imagePng: png, thumbnailDataUrl, dimensions: image.getSize(), formats, nativeFormats: formats, sourceApp: source }); return;
      }
      const text = clipboard.readText().slice(0, MAX_TEXT_BYTES);
      const html = clipboard.readHTML().slice(0, MAX_TEXT_BYTES);
      if (!text && !html) return;
      this.capture({ kind: classifyClipboardText(text, html), text, html: html || undefined, formats, nativeFormats: formats, sourceApp: source });
    } catch (error) { console.warn("[clipboard] capture skipped", error); }
  }

  private capture(input: { kind: ClipboardKind; text?: string; html?: string; paths?: string[]; imagePng?: Buffer; thumbnailDataUrl?: string; dimensions?: { width: number; height: number }; formats: string[]; nativeFormats: string[]; sourceApp?: ClipboardSourceApp | null }): void {
    if (this.settings.paused || !shouldCaptureKind(input.kind, this.settings)) return;
    const signature = input.kind === "files"
      ? `files:${sha((input.paths ?? []).map((path) => normalize(path).toLowerCase()).join("\n"))}`
      : input.imagePng ? `image:${sha(input.imagePng)}` : `${input.kind}:${sha(`${input.text ?? ""}\0${input.html ?? ""}`)}`;
    const now = Date.now();
    const existing = this.items.find((item) => item.signature === signature);
    if (existing) {
      if (signature === this.lastCapturedSignature && now - this.lastCapturedAt < COALESCE_MS) return;
      existing.copyCount += 1; existing.capturedAt = now;
      this.items = [existing, ...this.items.filter((item) => item.id !== existing.id)];
      this.lastCapturedSignature = signature; this.lastCapturedAt = now; this.persist(); this.emit(); return;
    }
    const id = randomUUID();
    let imagePath: string | undefined;
    if (input.imagePng) { this.ensureDirectories(); imagePath = join(this.imageRoot, `${id}.png`); writeFileSync(imagePath, input.imagePng); }
    const text = input.text ?? "";
    const rawUrlMeta = input.kind === "url" && text ? parseUrlDetails(text) : undefined;
    const urlMeta: ClipboardUrlMeta | undefined = rawUrlMeta
      ? {
          domain: rawUrlMeta.domain,
          title: rawUrlMeta.title,
          favicon: rawUrlMeta.favicon,
          thumbnailUrl: rawUrlMeta.thumbnailUrl,
          isYouTube: rawUrlMeta.isYouTube,
        }
      : undefined;
    const initialTitle = urlMeta ? (urlMeta.title ?? urlMeta.domain) : titleFor(input.kind, text, input.paths ?? []);
    const item: StoredItem = {
      id, signature, kind: input.kind, title: initialTitle, preview: input.kind === "files" ? (input.paths ?? []).map((filePath) => basename(filePath)).join(", ") : safeText(text || (input.kind === "image" ? "Copied image" : "")),
      capturedAt: now, copyCount: 1, useCount: 0, pinned: false, pinboardIds: [], text: text || undefined, html: input.html, url: input.kind === "url" ? text.trim() : undefined, paths: input.paths, imagePath,
      thumbnailDataUrl: input.thumbnailDataUrl,
      bytes: input.imagePng?.length ?? Buffer.byteLength(text), fileCount: input.paths?.length, color: input.kind === "color" ? text.trim().toUpperCase() : undefined, dimensions: input.dimensions, sourceApp: input.sourceApp?.displayName ?? input.sourceApp?.processName,
      formats: input.formats.slice(0, 60), nativeFormats: input.nativeFormats.slice(0, 60),
      urlMeta,
    };
    this.items.unshift(item); this.lastCapturedSignature = signature; this.lastCapturedAt = now; this.enforceRetention(); this.persist(); this.emit();
    // For YouTube URLs, thumbnailUrl is already set without a network request.
    // For other URLs, fetch Open Graph metadata (including og:image) in the background.
    if (input.kind === "url" && text.startsWith("http") && !urlMeta?.isYouTube) {
      void this.fetchLinkMetadata(id, text.trim());
    }
  }

  private async fetchLinkMetadata(id: string, targetUrl: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "KeyFlow/0.3 (Windows NT 10.0; Win64; x64)" },
      });
      clearTimeout(timeout);
      if (!res.ok) return;
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return;
      const html = (await res.text()).slice(0, 150000);
      
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
      const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
      const ogSiteMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
      // Extract Open Graph image for rich thumbnail previews
      const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

      const resolvedTitle = ogTitleMatch?.[1] || titleMatch?.[1]?.trim();
      const resolvedDesc = ogDescMatch?.[1]?.trim();
      const resolvedSiteName = ogSiteMatch?.[1]?.trim();
      const resolvedImage = ogImageMatch?.[1]?.trim();

      const item = this.items.find((entry) => entry.id === id);
      if (item && item.urlMeta) {
        let changed = false;
        if (resolvedTitle && resolvedTitle !== item.title) {
          item.title = resolvedTitle.slice(0, 120);
          item.urlMeta.title = resolvedTitle.slice(0, 120);
          changed = true;
        }
        if (resolvedDesc) {
          item.urlMeta.description = resolvedDesc.slice(0, 240);
          changed = true;
        }
        if (resolvedSiteName) {
          item.urlMeta.siteName = resolvedSiteName;
          changed = true;
        }
        // Only set thumbnailUrl if we got a valid absolute URL for the OG image
        if (resolvedImage && resolvedImage.startsWith("http") && !item.urlMeta.thumbnailUrl) {
          item.urlMeta.thumbnailUrl = resolvedImage.slice(0, 512);
          changed = true;
        }
        if (changed) {
          this.persist();
          this.emit();
        }
      }
    } catch {
      // Non-critical background enrichment failure
    }
  }

  private summary(item: StoredItem): ClipboardItemSummary {
    const { text: _text, html: _html, url: _url, paths: _paths, imagePath: _imagePath, formats: _formats, nativeFormats: _nativeFormats, signature: _signature, ...summary } = item;
    return { ...summary, thumbnailDataUrl: item.thumbnailDataUrl, pinboardIds: [...summary.pinboardIds], urlMeta: item.urlMeta ? { ...item.urlMeta } : undefined };
  }

  private requireItem(id: string): StoredItem { const item = this.items.find((entry) => entry.id === id); if (!item) throw new Error("Clipboard item not found."); return item; }
  private async getSourceApp(): Promise<ClipboardSourceApp | null> { try { return await this.sourceAppProvider?.() ?? null; } catch { return null; } }
  private isExcludedSource(source: ClipboardSourceApp): boolean {
    const identity = `${source.displayName ?? ""}\n${source.processName ?? ""}\n${source.executablePath ?? ""}`.toLowerCase();
    if (this.settings.ignorePasswordManagers && /1password|bitwarden|keepass|dashlane|lastpass|keeper|proton.?pass/.test(identity)) return true;
    return this.settings.excludedApps.some((entry) => entry.trim() && identity.includes(entry.trim().toLowerCase()));
  }
  private ensureDirectories(): void { [this.root, this.imageRoot, this.stagingRoot].forEach((folder) => { if (!existsSync(folder)) mkdirSync(folder, { recursive: true }); }); }
  private cleanupStaging(): void { if (!existsSync(this.stagingRoot)) return; for (const name of readdirSync(this.stagingRoot)) { try { rmSync(join(this.stagingRoot, name), { force: true, recursive: true }); } catch { /* non-critical */ } } }
  private removeFiles(item: StoredItem): void { if (item.imagePath && isPathInside(item.imagePath, this.imageRoot)) { try { rmSync(item.imagePath, { force: true }); } catch { /* non-critical */ } } }
  private enforceRetention(): void {
    const cutoff = this.settings.retentionDays ? Date.now() - this.settings.retentionDays * 86400000 : 0;
    let count = 0;
    this.items = this.items.filter((item) => {
      if (item.pinned) return true;
      if (item.capturedAt < cutoff || ++count > this.settings.maxItems) { this.removeFiles(item); return false; }
      return true;
    });
  }
  private emit(): void { const snapshot = this.snapshot(); this.listeners.forEach((listener) => listener(snapshot)); }

  private load(): void {
    if (!existsSync(this.indexPath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.indexPath, "utf8")) as { encrypted?: string; payload?: PersistedPayload };
      const payload = raw.encrypted && safeStorage.isEncryptionAvailable()
        ? JSON.parse(safeStorage.decryptString(Buffer.from(raw.encrypted, "base64"))) as PersistedPayload
        : raw.payload;
      if (!payload || payload.version !== 1 || !Array.isArray(payload.items)) return;
      this.items = payload.items.filter((item) => item && typeof item.id === "string").map((item) => {
        if ((item.kind === "image" || item.kind === "screenshot") && !item.thumbnailDataUrl && item.imagePath && existsSync(item.imagePath)) {
          try {
            item.thumbnailDataUrl = nativeImage.createFromPath(item.imagePath).resize({ width: 320 }).toDataURL();
          } catch { /* non-critical */ }
        }
        return item;
      });
      this.pinboards = Array.isArray(payload.pinboards) ? payload.pinboards : [];
      this.settings = { ...DEFAULT_SETTINGS, ...(payload.settings ?? {}) };
    } catch (error) { console.warn("[clipboard] retained unreadable history file without deleting it", error); }
  }

  private persist(): void {
    this.ensureDirectories();
    const payload: PersistedPayload = { version: 1, items: this.items, pinboards: this.pinboards, settings: this.settings };
    const serialized = JSON.stringify(payload);
    const data = safeStorage.isEncryptionAvailable()
      ? JSON.stringify({ encrypted: safeStorage.encryptString(serialized).toString("base64") })
      : JSON.stringify({ payload });
    const temporary = `${this.indexPath}.tmp`;
    writeFileSync(temporary, data, "utf8"); renameSync(temporary, this.indexPath);
  }
}

export const clipboardEngine = new ClipboardEngine();
