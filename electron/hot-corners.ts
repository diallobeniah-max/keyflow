import { screen, BrowserWindow } from "electron";

type CornerPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

interface HotCornerConfig {
  enabled?: boolean;
  activationMs?: number;
  cooldownMs?: number;
  cornerSize?: number;
  corners?: Record<CornerPosition, { type: "builtin" | "shortcut"; action?: string; shortcutId?: string; delayMs?: number }>;
}

interface HotCornersOptions {
  getMainWindow: () => BrowserWindow | null;
  executeActions: (actions: any[]) => Promise<unknown>;
}

const BUILTIN_SHORTCUTS: Record<string, string> = {
  taskView: "Win+Tab",
  start: "Win",
  search: "Win+S",
  desktop: "Win+D",
  quickSettings: "Win+A",
  previousDesktop: "Win+Ctrl+Left",
  nextDesktop: "Win+Ctrl+Right",
};

/** System-wide cursor polling for Charmy-style hover corners. */
export class HotCornersManager {
  private config: HotCornerConfig = { enabled: false };
  private shortcuts = new Map<string, any>();
  private timer: NodeJS.Timeout | null = null;
  private candidate: { key: string; enteredAt: number; fired: boolean } | null = null;
  private lastTriggeredAt = new Map<string, number>();
  private lastObservedCorner: string | null = null;

  constructor(private readonly options: HotCornersOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sample(), 60);
    console.log("[hot-corners] polling started");
  }

  update(config: HotCornerConfig | undefined, shortcuts: any[] | undefined): void {
    this.config = config ?? { enabled: false };
    this.shortcuts = new Map((shortcuts ?? []).map((shortcut) => [String(shortcut?.id ?? ""), shortcut]));
    const actions = Object.entries(this.config.corners ?? {})
      .map(([corner, action]) => `${corner}:${action?.type === "shortcut" ? `shortcut/${action.shortcutId ?? ""}` : action?.action ?? "none"}`)
      .join(",");
    console.log(`[hot-corners] update enabled=${!!this.config.enabled} activationMs=${this.config.activationMs ?? 400} cornerSize=${this.config.cornerSize ?? 24} actions=${actions || "none"}`);
    if (!this.config.enabled) this.resetCandidate();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.resetCandidate();
  }

  private resetCandidate(): void {
    this.candidate = null;
  }

  private sample(): void {
    if (!this.config.enabled) return;
    try {
      const point = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(point);
      const corner = this.findCorner(display.bounds, point, clamp(this.config.cornerSize ?? 24, 8, 160));
      if (!corner) {
        this.lastObservedCorner = null;
        this.resetCandidate();
        return;
      }

      const key = `${display.id}:${corner}`;
      if (this.lastObservedCorner !== key) {
        this.lastObservedCorner = key;
        console.log(`[hot-corners] pointer entered ${key} at=${point.x},${point.y}`);
      }
      const now = Date.now();
      if (!this.candidate || this.candidate.key !== key) {
        this.candidate = { key, enteredAt: now, fired: false };
      }
      if (this.candidate.fired) return;

      const cooldownMs = clamp(this.config.cooldownMs ?? 800, 0, 10_000);
      if (now - (this.lastTriggeredAt.get(key) ?? 0) < cooldownMs) return;

      const cornerAction = this.config.corners?.[corner];
      const specificDelay = cornerAction?.delayMs ?? this.config.activationMs ?? 400;
      const activationMs = clamp(specificDelay, 0, 10_000);
      if (now - this.candidate.enteredAt < activationMs) return;

      this.candidate.fired = true;
      this.lastTriggeredAt.set(key, now);
      void this.trigger(corner);
    } catch {
      // Electron's screen module can briefly be unavailable while displays change.
      this.resetCandidate();
    }
  }

  private findCorner(bounds: Electron.Rectangle, point: Electron.Point, size: number): CornerPosition | null {
    const left = point.x <= bounds.x + size;
    const right = point.x >= bounds.x + bounds.width - size;
    const top = point.y <= bounds.y + size;
    const bottom = point.y >= bounds.y + bounds.height - size;
    if (top && left) return "topLeft";
    if (top && right) return "topRight";
    if (bottom && left) return "bottomLeft";
    if (bottom && right) return "bottomRight";
    return null;
  }

  private async trigger(corner: CornerPosition): Promise<void> {
    const action = this.config.corners?.[corner];
    if (!action || action.type === "builtin" && (!action.action || action.action === "none")) return;

    try {
      if (action.type === "builtin") {
        const shortcut = BUILTIN_SHORTCUTS[action.action ?? ""];
        if (!shortcut) return;
        const results = await this.options.executeActions([{ type: "pressShortcut", payload: { shortcut } }]);
        this.options.getMainWindow()?.webContents.send("hot-corners:triggered", { corner, action: action.action });
        console.log(`[hot-corners] triggered corner=${corner} action=${action.action} result=${JSON.stringify(results)}`);
        return;
      }

      const shortcut = this.shortcuts.get(String(action.shortcutId ?? ""));
      if (!shortcut?.enabled || !Array.isArray(shortcut.actions)) return;
      const results = await this.options.executeActions(shortcut.actions);
      this.options.getMainWindow()?.webContents.send("hot-corners:triggered", { corner, shortcutId: shortcut.id });
      console.log(`[hot-corners] triggered corner=${corner} shortcut=${shortcut.id} result=${JSON.stringify(results)}`);
    } catch (error) {
      console.error(`[hot-corners] action failed corner=${corner}`, error);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
