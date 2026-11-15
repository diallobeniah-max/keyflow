import type { ExplorerSelectionSnapshot } from './quick-preview-window.js';

export interface PreviewNativePort {
  configureQuickPreview(config: { enabled: boolean; key: number; modifiers: number }): void;
  setQuickPreviewSnapshot(revision: number, foreground: number, focus: number, valid: boolean): void;
  requestQuickPreviewRevision(): void;
}

/** Keep an Explorer snapshot fresh without doing COM work inside a key hook. */
export class QuickPreviewMonitor {
  private port: PreviewNativePort | null = null;
  private config = { enabled: false, key: 0, modifiers: 0 };
  private revision: number | null = null;
  private available: boolean | null = null;
  private waitingSince = 0;
  private timer: NodeJS.Timeout | null = null;
  private pending = false;
  private generation = 0;
  private readonly selection: () => Promise<ExplorerSelectionSnapshot | null>;
  constructor(selection: () => Promise<ExplorerSelectionSnapshot | null>) { this.selection = selection; }

  setPort(port: PreviewNativePort | null): void {
    this.port = port; this.revision = null; this.available = null; this.waitingSince = Date.now(); this.generation++;
    port?.configureQuickPreview(this.config);
    if (this.config.enabled && port) { port.requestQuickPreviewRevision(); this.schedule(0); }
    else this.clearTimer();
  }

  configure(config: { enabled: boolean; key: number; modifiers: number }): void {
    if (config.enabled === this.config.enabled && config.key === this.config.key && config.modifiers === this.config.modifiers) return;
    this.config = { ...config }; this.revision = null; this.available = null; this.waitingSince = Date.now(); this.generation++;
    this.port?.configureQuickPreview(config);
    if (config.enabled && this.port) { this.port.requestQuickPreviewRevision(); this.schedule(0); }
    else this.clearTimer();
  }

  onRevision(revision: number, available: boolean): void {
    if (!this.config.enabled || !Number.isSafeInteger(revision) || revision < 0) return;
    // IPC is ordered per helper process; never roll back to an older revision.
    if (this.revision !== null && revision < this.revision) return;
    if (revision !== this.revision || available !== this.available) {
      this.revision = revision;
      this.available = available;
      // A click or key changed Explorer's selection. Do not wait for the
      // ordinary refresh timer before checking the new revision.
      this.clearTimer();
      this.schedule(0);
    }
  }

  getHealth(): "starting" | "ready" | "unavailable" {
    if (!this.port) return "unavailable";
    if (!this.config.enabled) return "starting";
    if (this.available === null) return Date.now() - this.waitingSince > 3000 ? "unavailable" : "starting";
    return this.available ? "ready" : "unavailable";
  }

  destroy(): void { this.config.enabled = false; this.generation++; this.clearTimer(); this.port?.configureQuickPreview({ enabled: false, key: 0, modifiers: 0 }); this.port = null; }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private schedule(delay: number): void {
    if (!this.port || !this.config.enabled || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.poll(); }, delay);
    this.timer.unref();
  }
  private async poll(): Promise<void> {
    if (!this.port || !this.config.enabled) return;
    if (this.pending) { this.schedule(20); return; }
    if (this.revision === null || !this.available) { this.port.requestQuickPreviewRevision(); this.schedule(500); return; }
    const revision = this.revision, generation = this.generation, port = this.port;
    this.pending = true;
    try {
      const result = await this.selection();
      if (generation !== this.generation || revision !== this.revision || port !== this.port) return;
      const foreground = Number(result?.foreground ?? 0), focus = Number(result?.focus ?? 0);
      const valid = !!result && Number.isSafeInteger(foreground) && foreground > 0 && Number.isSafeInteger(focus) && focus > 0;
      port.setQuickPreviewSnapshot(revision, valid ? foreground : 0, valid ? focus : 0, valid);
    } catch {
      if (generation === this.generation && revision === this.revision && port === this.port) port.setQuickPreviewSnapshot(revision, 0, 0, false);
    } finally {
      this.pending = false;
      this.schedule(150);
    }
  }
}
