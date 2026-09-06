import { BrowserWindow, screen } from "electron";
import { HardwareBrightnessProvider } from "./hardware-brightness.js";

/**
 * Target display scope for Dim Screen
 */
export type DimScreenApplyTo = "all" | "primary" | "selected";

export interface DimScreenConfig {
  /** Master on/off for the dim system */
  enabled?: boolean;
  /** Brightness / dim level (0–100, where 0 is deepest dim, and 100 is full brightness / no dimming) */
  level?: number;
  /** Enable extra dimming overlay below normal hardware brightness */
  extraDimEnabled?: boolean;
  /** Extra-dim overlay opacity percentage (0–100) */
  extraDimStrength?: number;
  /** Which displays to dim */
  applyTo?: DimScreenApplyTo;
  /** Display IDs to dim when applyTo === "selected" */
  selectedDisplayIds?: number[];
  /** Restore dim state at startup */
  startEnabled?: boolean;
  /** Remember brightness level between sessions */
  rememberLevel?: boolean;
}

export interface DimScreenWindowOptions {
  devUrl: string;
  preloadPath: string;
  isDev: boolean;
  appPath: string;
}

export interface DimScreenDisplayInfo {
  id: number;
  label: string;
  bounds: Electron.Rectangle;
  isPrimary: boolean;
  hasHardwareBrightness: boolean;
}

/**
 * DimScreenManager
 *
 * Hybrid Windows display dimming system combining:
 *   1. HardwareBrightnessProvider: Direct physical backlight control via WMI
 *      for internal laptop displays with automatic baseline capture & restoration.
 *   2. ExtraDimOverlay: Seamless, click-through, always-on-top black overlay windows
 *      that provide guaranteed, flicker-free dimming across ALL graphics modes
 *      (including dedicated GPU / MUX mode, external monitors, and integrated graphics).
 *
 * Key guarantees:
 *   • Guaranteed dimming: Overlay is ALWAYS active on target displays when enabled,
 *     ensuring laptops in dedicated GPU mode (where WMI backlight fails) dim reliably.
 *   • Never hides on app switch or Alt+Tab.
 *   • Never steals keyboard/mouse focus (focusable: false, showInactive).
 *   • 100% click-through (setIgnoreMouseEvents(true, { forward: true })).
 *   • Restores user's exact baseline brightness upon disable.
 */
export class DimScreenManager {
  private readonly windows = new Map<number, BrowserWindow>();
  private readonly hardware = new HardwareBrightnessProvider();
  private hasHardwareControl: boolean | null = null;
  private options?: DimScreenWindowOptions;
  private config: Required<DimScreenConfig> = {
    enabled: false,
    level: 30,
    extraDimEnabled: false,
    extraDimStrength: 40,
    applyTo: "all",
    selectedDisplayIds: [],
    startEnabled: false,
    rememberLevel: true,
  };

  private onStateChangedCallback?: (state: Required<DimScreenConfig>) => void;
  private readonly onDisplayChange = () => this.syncWindows();

  constructor(options?: DimScreenWindowOptions) {
    if (options) this.options = options;
    screen.on("display-added", this.onDisplayChange);
    screen.on("display-removed", this.onDisplayChange);
    screen.on("display-metrics-changed", this.onDisplayChange);
    void this.initHardwareSupport();
  }

  setWindowOptions(options: DimScreenWindowOptions): void {
    this.options = options;
  }

  private async initHardwareSupport(): Promise<void> {
    this.hasHardwareControl = await this.hardware.isSupported();
    console.log(`[dim-screen] hardware backlight provider detected: ${this.hasHardwareControl}`);
  }

  /** Register state change callback to notify renderer */
  setOnStateChanged(callback: (state: Required<DimScreenConfig>) => void): void {
    this.onStateChangedCallback = callback;
  }

  /** Apply a configuration update and adjust hardware & overlay */
  async update(partial: Partial<DimScreenConfig> | undefined): Promise<Required<DimScreenConfig>> {
    const wasEnabled = this.config.enabled;

    if (partial) {
      if (partial.enabled !== undefined) this.config.enabled = !!partial.enabled;
      if (partial.level !== undefined) this.config.level = clamp(Number(partial.level), 0, 100);
      if (partial.extraDimEnabled !== undefined) this.config.extraDimEnabled = !!partial.extraDimEnabled;
      if (partial.extraDimStrength !== undefined) this.config.extraDimStrength = clamp(Number(partial.extraDimStrength), 0, 100);
      if (partial.applyTo !== undefined) this.config.applyTo = normalizeApplyTo(partial.applyTo);
      if (partial.selectedDisplayIds !== undefined) this.config.selectedDisplayIds = Array.isArray(partial.selectedDisplayIds) ? partial.selectedDisplayIds : [];
      if (partial.startEnabled !== undefined) this.config.startEnabled = !!partial.startEnabled;
      if (partial.rememberLevel !== undefined) this.config.rememberLevel = !!partial.rememberLevel;
    }

    console.log(
      `[dim-screen] update: enabled=${this.config.enabled} level=${this.config.level}% ` +
      `extraDim=${this.config.extraDimEnabled}@${this.config.extraDimStrength}% applyTo=${this.config.applyTo}`
    );

    // Synchronize physical hardware brightness in background (best-effort for non-dGPU laptops)
    if (this.config.enabled) {
      if (!wasEnabled) {
        await this.hardware.captureBaseline();
      }
      if (this.hasHardwareControl) {
        void this.hardware.setBrightness(100 - this.config.level);
      }
    } else if (wasEnabled) {
      await this.hardware.restoreBaseline();
    }

    // Always synchronize visual overlay windows for guaranteed, instant dimming
    this.syncWindows();
    this.broadcast();
    return this.getState();
  }

  /** Toggle Dim Screen on/off */
  async toggle(): Promise<Required<DimScreenConfig>> {
    return this.update({ enabled: !this.config.enabled });
  }

  /** Set enabled directly */
  async setEnabled(enabled: boolean): Promise<Required<DimScreenConfig>> {
    return this.update({ enabled });
  }

  /** Set brightness / dim level (0–100) */
  async setLevel(level: number): Promise<Required<DimScreenConfig>> {
    return this.update({ level });
  }

  /** Increase brightness level by delta (default +10) */
  async increaseLevel(delta = 10): Promise<Required<DimScreenConfig>> {
    const newLevel = clamp(this.config.level + delta, 0, 100);
    return this.update({ level: newLevel });
  }

  /** Decrease brightness level by delta (default -10) */
  async decreaseLevel(delta = 10): Promise<Required<DimScreenConfig>> {
    const newLevel = clamp(this.config.level - delta, 0, 100);
    return this.update({ level: newLevel });
  }

  /** Toggle Extra Dim mode */
  async toggleExtraDim(): Promise<Required<DimScreenConfig>> {
    return this.update({ extraDimEnabled: !this.config.extraDimEnabled });
  }

  /** Set Extra Dim mode and optional strength */
  async setExtraDim(enabled: boolean, strength?: number): Promise<Required<DimScreenConfig>> {
    return this.update({
      extraDimEnabled: enabled,
      extraDimStrength: strength !== undefined ? strength : this.config.extraDimStrength,
    });
  }

  /** Return current configuration state */
  getState(): Required<DimScreenConfig> {
    return { ...this.config };
  }

  /** Return connected display information */
  listDisplays(): DimScreenDisplayInfo[] {
    const primary = screen.getPrimaryDisplay();
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: d.id === primary.id
        ? `Display ${i + 1} (Primary) — ${d.size.width}×${d.size.height}`
        : `Display ${i + 1} — ${d.size.width}×${d.size.height}`,
      bounds: d.bounds,
      isPrimary: d.id === primary.id,
      hasHardwareBrightness: d.id === primary.id && (this.hasHardwareControl ?? false),
    }));
  }

  /** Clean up on app exit */
  async destroy(): Promise<void> {
    screen.off("display-added", this.onDisplayChange);
    screen.off("display-removed", this.onDisplayChange);
    screen.off("display-metrics-changed", this.onDisplayChange);

    // Restore physical baseline brightness before quitting
    if (this.config.enabled) {
      await this.hardware.restoreBaseline();
    }

    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.windows.clear();
  }

  // ─── Window Management ──────────────────────────────────────────────────────

  /**
   * Calculates the target dark overlay opacity for guaranteed visual dimming.
   *
   * Level represents brightness (0 = deepest dark dimming, 100 = full bright / no dimming):
   *   • Level 100: baseOpacity = 0.00 (screen completely clear)
   *   • Level 70:  baseOpacity = 0.26 (subtle comfortable dimming)
   *   • Level 50:  baseOpacity = 0.44 (medium night dimming)
   *   • Level 30:  baseOpacity = 0.62 (strong dark dimming)
   *   • Level 0:   baseOpacity = 0.88 (maximum normal darkness)
   *
   * If Extra Dim is enabled, it adds additional darkness on top:
   *   • Extra Dim applies up to 0.96 total opacity for ultra-dark night use.
   */
  calculateTargetOpacity(): number {
    if (!this.config.enabled) return 0;
    const dimLevel = clamp(this.config.level, 0, 100);
    const baseDim = (dimLevel / 100) * 0.70;

    let extraDim = 0;
    if (this.config.extraDimEnabled) {
      const strength = clamp(this.config.extraDimStrength, 0, 100);
      extraDim = (strength / 100) * 0.15;
    }

    const combined = baseDim + extraDim;
    return Math.min(0.85, Math.max(0, combined));
  }

  private syncWindows(): void {
    if (!this.config.enabled) {
      for (const win of this.windows.values()) {
        if (!win.isDestroyed() && win.isVisible()) win.hide();
      }
      return;
    }

    const allDisplays = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;
    const targetIds = new Set<number>(this.resolveTargetDisplayIds(allDisplays, primaryId));

    // Clean up windows for disconnected or non-target displays
    for (const [id, win] of this.windows) {
      if (!allDisplays.find((d) => d.id === id) || !targetIds.has(id)) {
        if (!win.isDestroyed()) win.destroy();
        this.windows.delete(id);
      }
    }

    const targetOpacity = this.calculateTargetOpacity();

    for (const display of allDisplays) {
      if (!targetIds.has(display.id)) continue;

      let win = this.windows.get(display.id);

      if (!win || win.isDestroyed()) {
        win = this.createWindow(display);
        this.windows.set(display.id, win);
      } else {
        win.setBounds(display.bounds);
        this.applyOverlayOpacity(win, targetOpacity);
      }

      if (this.config.enabled && targetOpacity > 0) {
        if (!win.isVisible()) {
          win.showInactive();
        }
        win.setAlwaysOnTop(true, "screen-saver");
      } else if (win.isVisible()) {
        win.hide();
      }
    }
  }

  private resolveTargetDisplayIds(displays: Electron.Display[], primaryId: number): number[] {
    switch (this.config.applyTo) {
      case "primary":
        return [primaryId];
      case "selected": {
        const chosen = this.config.selectedDisplayIds ?? [];
        return displays.filter((d) => chosen.includes(d.id)).map((d) => d.id);
      }
      case "all":
      default:
        return displays.map((d) => d.id);
    }
  }

  private createWindow(display: Electron.Display): BrowserWindow {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: this.options?.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true, { forward: true });

    win.on("closed", () => {
      if (this.windows.get(display.id) === win) {
        this.windows.delete(display.id);
      }
    });

    win.webContents.on("did-finish-load", () => {
      this.send(win);
      this.applyOverlayOpacity(win, this.calculateTargetOpacity());
    });

    const url = `${this.options?.devUrl}/?window=dim-screen`;
    if (this.options?.isDev) {
      void win.loadURL(url).catch((err) => {
        console.error(`[dim-screen] loadURL failed displayId=${display.id}:`, err.message);
      });
    } else if (this.options) {
      void win.loadFile(`${this.options.appPath}/dist/index.html`, { query: { window: "dim-screen" } })
        .catch((err) => {
          console.error(`[dim-screen] loadFile failed displayId=${display.id}:`, err.message);
        });
    }

    return win;
  }

  private broadcast(): void {
    for (const win of this.windows.values()) {
      this.send(win);
      this.applyOverlayOpacity(win, this.calculateTargetOpacity());
    }
    this.notifyStateChanged();
  }

  private send(win: BrowserWindow): void {
    if (!win.isDestroyed() && !win.webContents.isLoading()) {
      win.webContents.send("dim-screen:state-changed", this.getState());
    }
  }

  private applyOverlayOpacity(win: BrowserWindow, opacity: number): void {
    if (win.isDestroyed()) return;
    this.send(win);

    const script = `(function() {
      var el = document.getElementById('dim') || document.querySelector('.dim-screen-overlay');
      if (el) {
        el.style.opacity = '${opacity.toFixed(4)}';
        el.style.display = '${opacity > 0 ? "block" : "none"}';
      }
    })();`;

    win.webContents.executeJavaScript(script).catch(() => {});
  }

  private notifyStateChanged(): void {
    if (this.onStateChangedCallback) {
      this.onStateChangedCallback(this.getState());
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeApplyTo(value: string | undefined): DimScreenApplyTo {
  if (value === "primary" || value === "selected") return value;
  return "all";
}
