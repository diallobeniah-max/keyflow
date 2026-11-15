export interface QuickPreviewControllerSettings {
  enabled: boolean;
  paused: boolean;
  shortcut: string;
  closeWithEscape: boolean;
}

interface PreviewWindow {
  isVisible(): boolean;
  openPreview(path: string): Promise<boolean>;
  closePreview(): void;
}

/** Owns preview activation and invalidates asynchronous selection on disable. */
export class QuickPreviewController {
  private settings: QuickPreviewControllerSettings = { enabled: false, paused: false, shortcut: 'Space', closeWithEscape: true };
  private generation = 0;
  private opening = false;

  private window: PreviewWindow;
  private selection: () => Promise<string | null>;
  private warm: () => void;
  private dispose: () => void;
  constructor(window: PreviewWindow, selection: () => Promise<string | null>, warm: () => void, dispose: () => void) {
    this.window = window; this.selection = selection; this.warm = warm; this.dispose = dispose;
  }

  configure(settings: QuickPreviewControllerSettings): void {
    if (settings.enabled === this.settings.enabled && settings.paused === this.settings.paused && settings.shortcut === this.settings.shortcut && settings.closeWithEscape === this.settings.closeWithEscape) return;
    this.settings = { ...settings };
    this.generation++;
    this.opening = false;
    if (settings.enabled && !settings.paused) this.warm();
    else { this.window.closePreview(); this.dispose(); }
  }

  async toggle(): Promise<boolean> {
    if (!this.settings.enabled || this.settings.paused) return false;
    if (this.opening || this.window.isVisible()) {
      this.close();
      return true;
    }
    const generation = ++this.generation;
    this.opening = true;
    try {
      const path = await this.selection();
      if (!path || generation !== this.generation || !this.settings.enabled || this.settings.paused) return false;
      return await this.window.openPreview(path);
    } catch { return false; }
    finally { if (generation === this.generation) this.opening = false; }
  }

  close(): void { this.generation++; this.opening = false; this.window.closePreview(); }

  destroy(): void { this.close(); this.dispose(); }
}
