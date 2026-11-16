import { BrowserWindow, ipcMain, screen, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { stat as statFile, readFile, open as openFile } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { readPsdThumbnail, readPsdComposite } from "./psd-preview.js";
import sharp from "sharp";
import { isValidLocalPath } from "./quick-preview-path.js";
import { PreviewStream } from "./quick-preview-stream.js";
import { readShellThumbnail } from "./quick-preview-shell.js";
import { detectKind, type PreviewFileKind } from "./quick-preview-formats.js";
import { readZipListing, type PreviewArchive } from "./quick-preview-archive.js";
import { readDocxText } from "./quick-preview-docx.js";
import { OfficePreviewProcess, type OfficeBounds, type OfficeKeys } from "./quick-preview-office.js";
export type { PreviewFileKind } from "./quick-preview-formats.js";
export { isValidLocalPath } from "./quick-preview-path.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.KEYFLOW_DEV_SERVER_URL || "http://127.0.0.1:1420";
const PRELOAD_PATH = join(__dirname, "preload.js");

/** Maximum bytes of text content to load into the renderer */
const MAX_TEXT_BYTES = 512 * 1024; // 512 KB

/** Default maximum file size in MB for inline image data URL loading */
const MAX_IMAGE_DATA_URL_MB = 20;

/** Explorer selection timeout: we bail out after this many ms */
const SELECTION_TIMEOUT_MS = 5000;

export interface PreviewFileInfo {
  path: string;
  name: string;
  ext: string;
  sizeMb: number;
  kind: PreviewFileKind;
  dataUrl?: string;      // base64 data URL for small images
  streamUrl?: string;    // short-lived URL for the selected file only
  thumbnailSource?: "embedded" | "windows";
  archive?: PreviewArchive;
  textContent?: string;  // bounded text content
}

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".ogg": "audio/ogg", ".opus": "audio/ogg", ".flac": "audio/flac",
    ".aac": "audio/aac", ".m4a": "audio/mp4", ".wma": "audio/x-ms-wma",
    ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
    ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".mov": "video/quicktime", ".wmv": "video/x-ms-wmv",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * Resolve file metadata and content for previewing.
 * This runs in the main process, not on any keyboard hook path.
 */
export async function resolveFileInfo(
  filePath: string,
  maxFileSizeMb: number,
  signal?: AbortSignal,
  knownSize?: number,
): Promise<PreviewFileInfo> {
  const name = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const kind = detectKind(ext);

  let sizeMb = 0;
  try {
    const size = knownSize ?? (await statFile(filePath)).size;
    sizeMb = size / (1024 * 1024);
  } catch {
    // Stat failure — treat as 0; content load will also fail gracefully
  }

  const info: PreviewFileInfo = { path: filePath, name, ext, sizeMb, kind };

  if (kind === "archive") {
    const archive = await readZipListing(filePath, signal);
    if (archive) info.archive = archive;
    return info;
  }

  if (kind === "document") {
    const content = await readDocxText(filePath, signal);
    if (content) {
      info.textContent = content.text + (content.truncated ? "\n\n[Text truncated]" : "");
    } else if (!signal?.aborted) {
      const thumbnail = await readShellThumbnail(filePath, signal);
      if (thumbnail) { info.kind = "image"; info.dataUrl = `data:image/png;base64,${thumbnail.toString("base64")}`; info.thumbnailSource = "windows"; }
    }
    return info;
  }

  // Chromium does not decode TIFF directly. libvips can downsample the first
  // page without loading a full-resolution copy into the renderer.
  if (ext === ".tif" || ext === ".tiff") {
    try {
      const image = await sharp(filePath).rotate().resize({width:2048,height:2048,fit:"inside",withoutEnlargement:true}).png().toBuffer();
      if (!signal?.aborted) info.dataUrl = `data:image/png;base64,${image.toString("base64")}`;
    } catch {
      const thumbnail = await readShellThumbnail(filePath, signal);
      if (thumbnail) { info.dataUrl = `data:image/png;base64,${thumbnail.toString("base64")}`; info.thumbnailSource = "windows"; }
    }
    return info;
  }

  // PSD/PSB may contain a small flattened JPEG preview even when the document
  // itself is many gigabytes. Some documents contain no such resource.
  if (ext === ".psd" || ext === ".psb") {
    try {
      const composite = await readPsdComposite(filePath, signal);
      if (composite) {
        info.kind = "image";
        info.dataUrl = `data:image/png;base64,${composite.toString("base64")}`;
      } else {
        const thumbnail = await readPsdThumbnail(filePath);
        if (thumbnail) {
          info.kind = "image";
          info.dataUrl = `data:image/jpeg;base64,${thumbnail.toString("base64")}`;
          info.thumbnailSource = "embedded";
        }
      }
    } catch {
      // Missing, unreadable, and malformed resources use the regular fallback.
    }
    if (!info.dataUrl && !signal?.aborted) {
      const thumbnail = await readShellThumbnail(filePath, signal);
      if (thumbnail) {
        info.kind = "image";
        info.dataUrl = `data:image/png;base64,${thumbnail.toString("base64")}`;
        info.thumbnailSource = "windows";
      }
    }
    return info;
  }

  // Some installed Windows shell extensions supply previews for formats such
  // as RAW photos and Office files. A thumbnail is not a full document view.
  if (kind === "unsupported") {
    const thumbnail = await readShellThumbnail(filePath, signal);
    if (thumbnail) {
      info.kind = "image";
      info.dataUrl = `data:image/png;base64,${thumbnail.toString("base64")}`;
      info.thumbnailSource = "windows";
    }
    return info;
  }

  // Load image as base64 data URL (bounded by both size limits)
  if (kind === "image" && sizeMb <= MAX_IMAGE_DATA_URL_MB && sizeMb <= maxFileSizeMb) {
    try {
      const buf = await readFile(filePath, {signal});
      const mime = mimeForExt(ext);
      info.dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      // Fall through — renderer will show unsupported fallback
    }
  }

  // Load text content (bounded)
  if (kind === "text") {
    try {
      const fd = await openFile(filePath, "r");
      let buf: Buffer;
      let bytesRead: number;
      try {
        buf = Buffer.alloc(MAX_TEXT_BYTES);
        ({bytesRead} = await fd.read(buf, 0, buf.length, 0));
      } finally {
        await fd.close();
      }
      const truncated = sizeMb * 1024 * 1024 > bytesRead;
      info.textContent = buf.subarray(0, bytesRead).toString("utf-8");
      if (truncated) {
        info.textContent += `\n\n[Truncated — file is ${(sizeMb * 1024).toFixed(0)} KB; showing first ${(MAX_TEXT_BYTES / 1024).toFixed(0)} KB]`;
      }
    } catch {
      info.textContent = "(Could not read file contents.)";
    }
  }

  return info;
}

/**
 * A persistent PowerShell worker resolves selection outside the keyboard hook.
 * Returns null if no Explorer window is focused or no single file is selected.
 *
 * Safety: We use a strict allowlist PS command. No user input is interpolated.
 * The worker is killed after SELECTION_TIMEOUT_MS if it has not replied.
 */
function explorerSelectionScript(): string {
    return [
      "$ErrorActionPreference='SilentlyContinue'",
      "[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)",
      `Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
[ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IKeyFlowServiceProvider {
  [PreserveSig] int QueryService(ref Guid service, ref Guid iid, out IntPtr result);
}
public static class KeyFlowForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint id, ref GuiInfo info);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
  [StructLayout(LayoutKind.Sequential)] public struct GuiInfo { public int size,flags; public IntPtr active,focus,capture,menu,move,caret; public int left,top,right,bottom; }
  public static long FocusWindow() { var g = new GuiInfo(); g.size = Marshal.SizeOf(typeof(GuiInfo)); return GetGUIThreadInfo(0, ref g) ? g.focus.ToInt64() : 0; }
  public static string ClassOf(long hwnd) { var name = new StringBuilder(128); return GetClassName(new IntPtr(hwnd), name, name.Capacity) > 0 ? name.ToString() : ""; }
  public static bool IsTyping() {
    var g = new GuiInfo(); g.size = Marshal.SizeOf(typeof(GuiInfo));
    if (!GetGUIThreadInfo(0, ref g) || g.focus == IntPtr.Zero) return true;
    var name = new StringBuilder(128); if (GetClassName(g.focus, name, name.Capacity) == 0) return true;
    var cls = name.ToString();
    return (g.flags & 1) != 0 || cls.IndexOf("Edit", StringComparison.OrdinalIgnoreCase) >= 0 || cls.IndexOf("Input", StringComparison.OrdinalIgnoreCase) >= 0;
  }
  public static bool IsFocusWithin(long focus, long ancestor) {
    if (focus == 0 || ancestor == 0) return false;
    var child = new IntPtr(focus); var target = new IntPtr(ancestor);
    for (int i = 0; i < 64 && child != IntPtr.Zero; i++) {
      if (child == target) return true;
      child = GetParent(child);
    }
    return false;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetWindowDelegate(IntPtr self, out IntPtr hwnd);
  public static long BrowserWindow(object browser) {
    IntPtr ptr = IntPtr.Zero;
    try {
      var provider = (IKeyFlowServiceProvider)browser;
      var sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
      var iid = new Guid("000214E2-0000-0000-C000-000000000046");
      if (provider.QueryService(ref sid, ref iid, out ptr) != 0 || ptr == IntPtr.Zero) return 0;
      var vtable = Marshal.ReadIntPtr(ptr);
      var method = (GetWindowDelegate)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(vtable, 3 * IntPtr.Size), typeof(GetWindowDelegate));
      IntPtr hwnd; return method(ptr, out hwnd) == 0 ? hwnd.ToInt64() : 0;
    } catch { return 0; } finally { if (ptr != IntPtr.Zero) Marshal.Release(ptr); }
  }
}
'@`,
      "while($null -ne ($request=[Console]::In.ReadLine())){",
      "$foreground=[KeyFlowForeground]::GetForegroundWindow().ToInt64()",
      "$focus=[KeyFlowForeground]::FocusWindow()",
      "$typing=[KeyFlowForeground]::IsTyping()",
      "if($typing -or [KeyFlowForeground]::ClassOf($foreground) -ne 'CabinetWClass'){[Console]::WriteLine((@{id=$request;path=$null;foreground=([string]$foreground);focus=([string]$focus)}|ConvertTo-Json -Compress));continue}",
      "$activeTab=[KeyFlowForeground]::FindWindowEx([IntPtr]$foreground,[IntPtr]::Zero,'ShellTabWindowClass',$null)",
      "if($activeTab -eq [IntPtr]::Zero){$activeTab=[KeyFlowForeground]::FindWindowEx([IntPtr]$foreground,[IntPtr]::Zero,'TabWindowClass',$null)}",
      "if($env:KEYFLOW_PREVIEW_DEBUG -eq '1'){[Console]::Error.WriteLine(('foreground={0} activeTab={1} focus={2}' -f $foreground,$activeTab.ToInt64(),$focus));$parent=[IntPtr]$focus;while($parent -ne [IntPtr]::Zero){[Console]::Error.WriteLine(('parent={0}' -f $parent.ToInt64()));$parent=[KeyFlowForeground]::GetParent($parent)}}",
      "$shell=New-Object -ComObject Shell.Application",
      "$wins=$shell.Windows()",
      "$sel=$null; $candidates=@()",
      "foreach($w in $wins){",
      "  if([int64]$w.HWND -eq $foreground){",
      "    $browser=[KeyFlowForeground]::BrowserWindow($w)",
      "    if($env:KEYFLOW_PREVIEW_DEBUG -eq '1'){[Console]::Error.WriteLine(('candidate={0} browser={1} visible={2} count={3}' -f $w.HWND,$browser,[KeyFlowForeground]::IsWindowVisible([IntPtr]$browser),$w.Document.SelectedItems().Count))}",
      "    if(-not $typing -and $browser -ne 0 -and [KeyFlowForeground]::IsFocusWithin($focus,$browser) -and ($activeTab -eq [IntPtr]::Zero -or $browser -eq $activeTab.ToInt64())){$candidates+=@($w)}",
      "  }",
      "}",
      "if($candidates.Count -eq 1){$d=$candidates[0].Document.SelectedItems();if($d.Count -eq 1){$item=$d.Item(0);if(-not $item.IsFolder){$sel=$item.Path}}}",
      "if(-not ($sel -and [KeyFlowForeground]::GetForegroundWindow().ToInt64() -eq $foreground -and [KeyFlowForeground]::FocusWindow() -eq $focus -and -not [KeyFlowForeground]::IsTyping())){$sel=$null}",
      "[Console]::WriteLine((@{id=$request;path=$sel;foreground=([string]$foreground);focus=([string]$focus)}|ConvertTo-Json -Compress))",
      "}",
    ].join("\n");
}

let selectionWorker: ChildProcessWithoutNullStreams | null = null;
let selectionSequence = 0;
export interface ExplorerSelectionSnapshot { path: string; foreground: string; focus: string }
const selectionPending = new Map<string, { resolve: (snapshot: ExplorerSelectionSnapshot | null) => void; timer: NodeJS.Timeout }>();

export function disposeExplorerSelection(): void {
  const worker = selectionWorker;
  selectionWorker = null;
  if (worker) { worker.stdin.end(); worker.kill(); }
  for (const { resolve, timer } of selectionPending.values()) { clearTimeout(timer); resolve(null); }
  selectionPending.clear();
}

function ensureSelectionWorker(): ChildProcessWithoutNullStreams {
  if (selectionWorker && !selectionWorker.killed) return selectionWorker;
  const encoded = Buffer.from(explorerSelectionScript(), "utf16le").toString("base64");
  const worker = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, stdio: "pipe" });
  selectionWorker = worker;
  let buffered = "";
  worker.stdout.setEncoding("utf8");
  worker.stdout.on("data", (chunk: string) => {
    buffered += chunk;
    if (buffered.length > 131072) { disposeExplorerSelection(); return; }
    for (let newline = buffered.indexOf("\n"); newline >= 0; newline = buffered.indexOf("\n")) {
      const line = buffered.slice(0, newline).trim(); buffered = buffered.slice(newline + 1);
      try {
        const result = JSON.parse(line) as { id?: string; path?: unknown; foreground?: unknown; focus?: unknown };
        const pending = result.id && selectionPending.get(result.id);
        if (!pending) continue;
        selectionPending.delete(result.id!); clearTimeout(pending.timer);
        pending.resolve(isValidLocalPath(result.path) && typeof result.foreground === "string" && /^\d+$/.test(result.foreground) && typeof result.focus === "string" && /^\d+$/.test(result.focus)
          ? { path: result.path, foreground: result.foreground, focus: result.focus } : null);
      } catch { /* malformed worker output is ignored until the bounded timeout */ }
    }
  });
  worker.stderr.on("data", (data: Buffer) => { if (process.env.KEYFLOW_PREVIEW_DEBUG === "1") console.warn("[quick-preview] selection worker:", data.toString()); });
  worker.on("error", () => { if (selectionWorker === worker) disposeExplorerSelection(); });
  worker.on("exit", () => { if (selectionWorker === worker) disposeExplorerSelection(); });
  worker.stdin.on("error", () => { if (selectionWorker === worker) disposeExplorerSelection(); });
  return worker;
}

export function warmExplorerSelection(): void { ensureSelectionWorker(); }

export function getExplorerSelectionSnapshot(): Promise<ExplorerSelectionSnapshot | null> {
  return new Promise(resolve => {
    const worker = ensureSelectionWorker();
    const id = String(++selectionSequence);
    const timer = setTimeout(() => { if (selectionWorker === worker) disposeExplorerSelection(); }, SELECTION_TIMEOUT_MS);
    selectionPending.set(id, { resolve, timer });
    worker.stdin.write(`${id}\n`);
  });
}

export async function getExplorerSelection(): Promise<string | null> {
  return (await getExplorerSelectionSnapshot())?.path ?? null;
}

/**
 * Manage the Quick Preview floating window.
 *
 * Design decisions:
 * - Single persistent window, hidden when closed (avoids re-create overhead).
 * - No low-level keyboard hook; callers obtain the selection before calling openPreview().
 * - File content is loaded in the main process and sent to the renderer via IPC
 *   to keep the renderer's filesystem access sandboxed.
 * - media is streamed through an isolated session's short-lived file capability.
 */
export class QuickPreviewWindowManager {
  private window: BrowserWindow | null = null;
  private currentPath: string | null = null;
  private maxFileSizeMb = 50;
  private isDev: boolean;
  private generation = 0;
  private creating: Promise<void> | null = null;
  private stream = new PreviewStream();
  private previewSession = session.fromPartition(`quick-preview-${randomUUID()}`);
  private loadAbort: AbortController | null = null;
  private destroyed = false;
  private office: OfficePreviewProcess | null = null;
  private officeKeys: OfficeKeys | null = null;
  private officeResizeRevision = 0;

  constructor(isDev: boolean, private readonly officeIntegration?: { available: () => boolean; gate: (window: number, escape: boolean) => void; close: () => void }) {
    this.isDev = isDev;
    this.previewSession.protocol.handle("keyflow-preview", request => this.stream.serve(request));
  }

  setOfficeKeys(keys: OfficeKeys | null): void {
    const old=this.officeKeys;
    if (this.office && (!keys || !old || keys.key!==old.key || keys.modifiers!==old.modifiers || keys.escape!==old.escape)) this.stopOfficePreview();
    this.officeKeys = keys;
    if (!keys) this.stopOfficePreview();
  }

  stopOfficePreview(): void {
    this.officeResizeRevision++;
    this.officeIntegration?.gate(0, false);
    const old = this.office; this.office = null;
    old?.stop();
  }

  private async getOfficeBounds(win: BrowserWindow): Promise<OfficeBounds | null> {
    try {
      const rect = await win.webContents.executeJavaScript(`(() => { const e=document.querySelector('.qpo-content'); if(!e)return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,scale:window.devicePixelRatio}; })()`);
      if (!rect || ![rect.x,rect.y,rect.width,rect.height,rect.scale].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || rect.scale <= 0 || rect.scale > 8) return null;
      const bounds = { x:Math.round(rect.x*rect.scale), y:Math.round(rect.y*rect.scale), width:Math.round(rect.width*rect.scale), height:Math.round(rect.height*rect.scale) };
      return bounds.width > 0 && bounds.height > 0 && bounds.width <= 16000 && bounds.height <= 16000 ? bounds : null;
    } catch { return null; }
  }

  private async resizeOfficePreview(win: BrowserWindow): Promise<void> {
    const worker=this.office, revision=++this.officeResizeRevision;
    if (!worker || win.isDestroyed()) return;
    const bounds=await this.getOfficeBounds(win);
    if (bounds && revision===this.officeResizeRevision && worker===this.office && !win.isDestroyed()) worker.resize(bounds);
  }

  private async startOfficePreview(win: BrowserWindow, path: string, generation: number): Promise<void> {
    if (!this.officeIntegration?.available() || !this.officeKeys || !/\.(docx?|xlsx?|pptx?)$/i.test(path)) return;
    const bounds=await this.getOfficeBounds(win);
    if (!bounds || generation!==this.generation || win.isDestroyed() || !this.officeKeys || !this.officeIntegration.available()) return;
    const handle=win.getNativeWindowHandle();
    const hwnd=handle.length >= 8 ? Number(handle.readBigUInt64LE()) : handle.readUInt32LE();
    if (!Number.isSafeInteger(hwnd) || hwnd <= 0) return;
    let worker: OfficePreviewProcess;
    worker=new OfficePreviewProcess(() => { if (this.office===worker) this.officeIntegration?.close(); }, () => {
      if (this.office===worker) { this.office=null; this.officeIntegration?.gate(0,false); }
    });
    this.office=worker;
    const keys=this.officeKeys;
    const ready=await worker.start(hwnd,path,bounds,keys);
    if (this.office!==worker || generation!==this.generation || win.isDestroyed() || !this.officeIntegration.available()) { if(this.office===worker)this.stopOfficePreview(); else worker.stop(); return; }
    if (!ready) { this.stopOfficePreview(); return; }
    this.officeIntegration.gate(hwnd,keys.escape);
    void this.resizeOfficePreview(win);
  }

  setMaxFileSizeMb(mb: number): void {
    this.maxFileSizeMb = Math.max(1, Math.min(500, mb));
  }

  /** Load the hidden renderer when Quick Preview is enabled, before the first keypress. */
  warm(): void {
    if (this.destroyed || this.creating || (this.window && !this.window.isDestroyed())) return;
    this.creating = this.createWindow().finally(() => { this.creating = null; });
  }

  async openPreview(filePath: string): Promise<boolean> {
    if (this.destroyed) return false;
    if (!isValidLocalPath(filePath)) {
      console.warn("[quick-preview] rejected invalid path");
      return false;
    }
    const generation = ++this.generation;
    this.stopOfficePreview();
    this.loadAbort?.abort();
    this.loadAbort = new AbortController();
    const signal = this.loadAbort.signal;
    this.currentPath = null;
    this.stream.clear();
    let fileSize: number;
    // Filesystem checks can be slow on removable or network drives. Never
    // block Electron's main thread while checking the selected path.
    try {
      const stat = await statFile(filePath);
      if (generation !== this.generation || this.destroyed || !stat.isFile()) return false;
      fileSize = stat.size;
    } catch {
      return false;
    }

    this.currentPath = filePath;

    if (!this.window || this.window.isDestroyed()) this.warm();
    if (this.creating) await this.creating;

    const win = this.window;
    if (generation !== this.generation || !win || win.isDestroyed()) return false;
    win.webContents.send("quick-preview:close"); // Clear the previous file and show loading.
    this.showAndCenter(win);
    // Start the native handler while the text or thumbnail fallback resolves.
    // A slow fallback should not delay the richer document preview.
    void this.startOfficePreview(win, filePath, generation);
    const resolving = resolveFileInfo(filePath, this.maxFileSizeMb, signal, fileSize);
    const ext = extname(filePath).toLowerCase();
    if (ext === ".psd" || ext === ".psb") {
      try {
        const thumbnail = await readPsdThumbnail(filePath);
        if (thumbnail && generation === this.generation && !win.isDestroyed()) {
          const info: PreviewFileInfo = {
            path: filePath, name: basename(filePath), ext,
            sizeMb: fileSize / (1024 * 1024), kind: "image",
            dataUrl: `data:image/jpeg;base64,${thumbnail.toString("base64")}`,
            thumbnailSource: "embedded",
          };
          win.webContents.send("quick-preview:load", info);
        }
      } catch { /* Full composite or fallback may still succeed. */ }
    }
    const info = await resolving;
    if (generation !== this.generation || win.isDestroyed()) return false;
    if (["pdf", "audio", "video"].includes(info.kind) || (info.kind === "image" && !info.dataUrl)) {
      info.streamUrl = (await this.stream.select(filePath, mimeForExt(info.ext))) ?? undefined;
      if (generation !== this.generation || win.isDestroyed()) return false;
    }
    win.webContents.send("quick-preview:load", info);

    return true;
  }

  closePreview(): void {
    this.generation++;
    this.stopOfficePreview();
    this.loadAbort?.abort();
    this.loadAbort = null;
    this.stream.clear();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("quick-preview:close");
      this.window.hide();
    }
    this.currentPath = null;
  }

  openWithDefaultApp(filePath: string): void {
    if (filePath === this.currentPath && isValidLocalPath(filePath)) {
      void shell.openPath(filePath);
    }
  }

  isVisible(): boolean {
    return !!(this.window && !this.window.isDestroyed() && this.window.isVisible());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.generation++;
    this.stopOfficePreview();
    this.loadAbort?.abort();
    this.loadAbort = null;
    this.stream.destroy();
    this.previewSession.protocol.unhandle("keyflow-preview");
    this.window?.destroy();
    this.window = null;
    this.currentPath = null;
  }

  private showAndCenter(win: BrowserWindow): void {
    if (!win.isVisible()) {
      win.center();
      win.show();
    }
    win.focus();
  }

  private async createWindow(): Promise<void> {
    // Size the window to fit the active monitor's work area
    const display = screen.getPrimaryDisplay();
    const { workAreaSize } = display;
    const width = Math.min(900, Math.max(560, workAreaSize.width - 120));
    const height = Math.min(680, Math.max(400, workAreaSize.height - 120));

    this.window = new BrowserWindow({
      width,
      height,
      minWidth: 400,
      minHeight: 300,
      center: true,
      frame: false,
      transparent: false,
      show: false,
      skipTaskbar: false,
      alwaysOnTop: false,
      backgroundColor: "#0d0e11",
      webPreferences: {
        session: this.previewSession,
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        plugins: true,
        allowRunningInsecureContent: false,
      },
    });

    this.window.setMenuBarVisibility(false);
    this.window.setAutoHideMenuBar(true);
    this.window.on('resize', () => { if (this.window) void this.resizeOfficePreview(this.window); });
    this.window.on('move', () => { if (this.window) void this.resizeOfficePreview(this.window); });

    this.window.on("closed", () => {
      this.generation++;
      this.stopOfficePreview();
      this.loadAbort?.abort();
      this.loadAbort = null;
      this.stream.clear();
      this.window = null;
      this.currentPath = null;
    });

    // Block outgoing navigation
    this.window.webContents.on("will-navigate", (event, url) => {
      const allowed = url.startsWith(DEV_URL) || url.startsWith("file://");
      if (!allowed) {
        console.warn("[quick-preview] navigation blocked:", url);
        event.preventDefault();
      }
    });

    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    const url = this.isDev
      ? `${DEV_URL}?window=quick-preview`
      : `file://${join(__dirname, "../dist/index.html")}?window=quick-preview`;

    const win = this.window;
    let removeReady = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { removeReady(); reject(new Error("Quick Preview renderer did not become ready")); }, 10000);
      const onReady = (event: Electron.IpcMainEvent) => {
        if (event.sender !== win.webContents) return;
        removeReady();
        resolve();
      };
      removeReady = () => { clearTimeout(timer); ipcMain.removeListener("quick-preview:ready", onReady); };
      ipcMain.on("quick-preview:ready", onReady);
    });
    try {
      await Promise.all([win.loadURL(url), ready]);
    } catch (err) {
      removeReady();
      if (!win.isDestroyed()) win.destroy();
      console.error("[quick-preview] window load failed:", err);
    }
  }
}
