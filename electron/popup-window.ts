import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { existsSync } from "fs";
import {
  clampPopupSize,
  clampRectWithin,
  computePopupPlacement,
  isPositionOnScreen,
  Rect,
  Point,
  Size,
} from "./popup-position.js";
import {
  PopupToggleState,
  PopupGenerationKey,
  isDuplicate,
  completeClose,
  completeOpen,
  completePrepare,
  createPopupToggleState,
  forceHide,
} from "./popup-toggle.js";
import { matchesTriggerKey } from "./trigger-guard.js";
import { inputDebug } from "./input/input-debug.js";

export interface PopupSnapshot {
  items?: any[];
  settings?: any;
  theme?: string;
  accent?: string;
  profileId?: string;
  title?: string;
  material?: "acrylic" | "fallback";
  /** Popup toggle generation the snapshot belongs to; lets the renderer
   *  stamp its close-hide so a stale close never kills a reopened popup. */
  gen?: string;
}

export interface PopupShowRequest {
  items: any[];
  title?: string;
  triggerKey?: string;
  generatorId?: string;
  shortcutId?: string;
}

type Phase = "hidden" | "preparing" | "opening" | "open" | "closing";

const TRIGGER_GUARD_MS = 350;
const ACTIVATE_DELAY_MS = 40;
const CLOSE_TIMEOUT_MS = 170;
/**
 * How long to wait for the renderer to call reportContentSize before using
 * lastSize as a fallback. Must be longer than the renderer rAF + IPC round
 * trip (~50 ms) but short enough not to feel sluggish.
 * The primary path (renderer eagerly reports size in onData) fires in ~50 ms;
 * this timer is only a safety net.
 */
const PREPARING_FALLBACK_MS = 200;

function sameKey(a: string | undefined, b: string | undefined): boolean {
  return matchesTriggerKey(a, b);
}

function getAllWorkAreaRects(): Rect[] {
  return screen.getAllDisplays().map((d) => ({
    x: d.workArea.x,
    y: d.workArea.y,
    width: d.workArea.width,
    height: d.workArea.height,
  }));
}

export class PopupWindowManager {
  private window: BrowserWindow | null = null;
  private snapshot: PopupSnapshot = {};
  private pendingShow: PopupShowRequest | null = null;
  private ready = false;
  private machine: PopupToggleState = createPopupToggleState();
  /** Mirror of machine.phase kept for quick reads without destructuring. */
  private phase: Phase = "hidden";
  private material: "acrylic" | "fallback" = "fallback";
  private pendingTriggerKey: string | undefined;
  private triggerGuard: { key: string; active: boolean; timer: NodeJS.Timeout | null } | null = null;
  private focusTimer: NodeJS.Timeout | null = null;
  private closeTimer: NodeJS.Timeout | null = null;
  /**
   * Safety net: if the renderer never calls reportContentSize (because
   * ResizeObserver did not fire — content size unchanged since last open),
   * this timer fires after PREPARING_FALLBACK_MS and calls finalizeAndShow
   * with the last known size so the window always becomes visible.
   */
  private preparingTimer: NodeJS.Timeout | null = null;

  /** Position saved when the user drags the popup. In-memory per session. */
  private lastPosition: Point | null = null;
  /** Size at last finalizeAndShow, used as fallback on re-open. */
  private lastSize: Size = { width: 540, height: 380 };

  private readonly devUrl: string;
  private readonly preloadPath: string;
  private readonly isDev: boolean;
  private readonly appPath: string;

  constructor(options: { devUrl: string; preloadPath: string; isDev: boolean; appPath: string }) {
    this.devUrl = options.devUrl;
    this.preloadPath = options.preloadPath;
    this.isDev = options.isDev;
    this.appPath = options.appPath;
  }

  updateData(snapshot: PopupSnapshot): void {
    this.snapshot = { ...this.snapshot, ...snapshot };
    if (this.ready && this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.webContents.send("popup:data", this.dataPayload());
    }
  }

  get isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible();
  }

  getStatus(): Phase {
    return this.phase;
  }

  private dataPayload(): PopupSnapshot {
    return {
      items: this.snapshot.items ?? [],
      settings: this.snapshot.settings ?? {},
      theme: this.snapshot.theme ?? "dark",
      accent: this.snapshot.accent,
      profileId: this.snapshot.profileId,
      title: this.snapshot.title,
      material: this.material,
      gen: this.machine.gen?.generationId ?? undefined,
    };
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.machine = { ...this.machine, phase: p };
  }

  private genLabel(): string {
    return this.machine.gen?.generationId ?? "?";
  }

  // -------------------------------------------------------------------------
  // Public entry point: called by the native trigger engine for every FF press
  // -------------------------------------------------------------------------

  toggle(request: PopupShowRequest): void {
    // ── Trace (1 of 3 required lines) ──────────────────────────────────────
    const win = this.window && !this.window.isDestroyed() ? this.window : null;
    const actuallyVisible = win?.isVisible() ?? false;
    console.log(
      `[popup-trace] trigger=${request.generatorId ?? "?"}\n` +
      `[popup-trace]   RUST_TRIGGER_RECEIVED=true  ACTION_ROUTER_RECEIVED=true\n` +
      `[popup-trace]   windowExists=${win !== null}  windowDestroyed=${!win && this.window !== null}  windowVisible=${actuallyVisible}  windowFocused=${win?.isFocused() ?? false}\n` +
      `[popup-trace]   phase=${this.phase}  closeGeneration=${this.machine.gen?.generationId ?? "null"}  closeTimer=${this.closeTimer !== null}  rendererReady=${this.ready}  closingFlag=${this.phase === "closing"}  resizeFrozen=false`,
    );
    inputDebug(`[input-debug] popup toggle trigger=${request.generatorId ?? "?"} visible=${actuallyVisible} phase=${this.phase}`);

    // ── Duplicate guard (same shortcutId + generationId = same trigger edge) ─
    if (isDuplicate(this.machine, request.shortcutId, request.generatorId)) {
      console.log(`[popup-trace]   decision=IGNORED  reason=duplicate generation ${request.generatorId ?? "?"}`);
      return;
    }

    // ── Advance the generation so stale renderer callbacks are invalidated ──
    const gen: PopupGenerationKey | null =
      request.shortcutId && request.generatorId
        ? { shortcutId: request.shortcutId, generationId: request.generatorId }
        : null;

    this.snapshot = { ...this.snapshot, items: request.items, title: request.title };
    this.pendingTriggerKey = request.triggerKey;

    // ── Decision: use win.isVisible() as the authoritative source of truth ──
    //
    // Internal phase is maintained for rendering transitions, but an open/close
    // decision driven purely by phase can get stuck when:
    //  • phase="closing" but the window already hid (timer beat the toggle)
    //  • phase="preparing" but the window is not yet visible
    //
    // win.isVisible() is always the real answer.

    if (actuallyVisible) {
      // ── CLOSE ─────────────────────────────────────────────────────────────
      console.log(`[popup-trace]   decision=CLOSE  reason=win.isVisible()=true  phase=${this.phase}`);
      this.cancelCloseTimer();
      this.cancelPreparingTimer();
      this.machine = { phase: "closing", gen };
      this.setPhase("closing");
      this.closeFlow();
    } else {
      // ── OPEN / REOPEN ─────────────────────────────────────────────────────
      //
      // Repair any stale phase state before opening. The window is hidden, so
      // regardless of what the phase says, we are effectively "hidden".
      const stalePhaseName = this.phase;
      if (this.phase !== "hidden") {
        console.log(`[popup-trace]   repair: phase=${stalePhaseName} but win.isVisible()=false → resetting to hidden`);
        this.cancelCloseTimer();
        this.cancelPreparingTimer();
        this.clearGuard();
        this.clearFocus();
      } else {
        this.cancelCloseTimer();
        this.cancelPreparingTimer();
      }
      console.log(`[popup-trace]   decision=OPEN  reason=win.isVisible()=false  stalephase=${stalePhaseName}`);
      this.machine = { phase: "hidden", gen };
      this.setPhase("hidden");
      this.openFlow();
    }
  }

  // -------------------------------------------------------------------------
  // reportContentSize — renderer measures its own rendered height and calls
  // this via IPC. Primary path to make the window visible on open.
  // -------------------------------------------------------------------------

  reportContentSize(width: number, height: number): void {
    const win = this.window;
    if (!win || win.isDestroyed()) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    if (this.machine.phase === "preparing") {
      console.log(`[popup-trace]   reportContentSize ${width}×${height} gen=${this.genLabel()} → finalizeAndShow`);
      this.cancelPreparingTimer(); // primary path delivered; timer not needed
      this.finalizeAndShow({ width, height });
    } else if (this.machine.phase === "open" && win.isVisible()) {
      const displays = getAllWorkAreaRects();
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const workArea: Rect = {
        x: display.workArea.x,
        y: display.workArea.y,
        width: display.workArea.width,
        height: display.workArea.height,
      };
      const clamped = clampPopupSize({ width, height }, workArea);
      const current = win.getBounds();
      if (Math.abs(current.height - clamped.height) > 2 || Math.abs(current.width - clamped.width) > 2) {
        win.setBounds({ x: current.x, y: current.y, width: clamped.width, height: clamped.height });
        this.lastSize = clamped;
      }
    }
  }

  // -------------------------------------------------------------------------
  // hide — called by renderer when close animation finishes (X, Escape, etc.)
  // -------------------------------------------------------------------------

  hide(gen?: string): void {
    if (gen !== undefined && gen !== this.machine.gen?.generationId) {
      // Stale close callback from a previous cycle — the popup was reopened
      // with a new generation before this hide arrived. Discard it.
      inputDebug(`[input-debug] popup hide STALE gen=${gen ?? "?"} current=${this.machine.gen?.generationId ?? "?"} — ignored`);
      console.log(`[popup-trace]   hide STALE gen=${gen ?? "?"} current=${this.machine.gen?.generationId ?? "?"} — ignored`);
      return;
    }
    inputDebug(`[input-debug] popup hide accepted gen=${gen ?? "?"} phase=${this.machine.phase}`);
    this.cancelCloseTimer();
    this.cancelPreparingTimer();
    this.machine = forceHide(this.machine);
    this.setPhase("hidden");
    this.clearGuard();
    this.clearFocus();
    this.pendingTriggerKey = undefined;
    this.pendingShow = null;
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide();
    }
  }

  destroy(): void {
    this.clearGuard();
    this.clearFocus();
    this.cancelCloseTimer();
    this.cancelPreparingTimer();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.ready = false;
    this.pendingShow = null;
    this.machine = createPopupToggleState();
    this.setPhase("hidden");
  }

  // -------------------------------------------------------------------------
  // Internal flow helpers
  // -------------------------------------------------------------------------

  private openFlow(): void {
    if (!this.window || this.window.isDestroyed()) {
      this.ensureWindow();
    }
    const win = this.window;
    if (!win) return;
    if (!this.ready) {
      this.pendingShow = {
        ...this.snapshot,
        items: this.snapshot.items ?? [],
        title: this.snapshot.title,
        triggerKey: this.pendingTriggerKey,
      };
      inputDebug(`[input-debug] popup open deferred (renderer not ready) gen=${this.genLabel()}`);
      return;
    }

    this.machine = completePrepare(this.machine);
    this.setPhase("preparing");
    inputDebug(`[input-debug] popup open → preparing gen=${this.genLabel()}`);
    win.webContents.send("popup:data", this.dataPayload());

    // ── Preparing fallback timer ───────────────────────────────────────────
    //
    // The primary show path is: renderer receives popup:data → eagerly
    // measures and calls reportContentSize → main calls finalizeAndShow.
    //
    // On re-opens the ResizeObserver may NOT fire (content size unchanged
    // since the last open). If reportContentSize never arrives, the window
    // would stay hidden in "preparing" state. The fallback timer fires after
    // PREPARING_FALLBACK_MS and forces finalizeAndShow with the last known
    // size, guaranteeing the window is always shown.
    this.armPreparingTimer();
  }

  private armPreparingTimer(): void {
    this.cancelPreparingTimer();
    this.preparingTimer = setTimeout(() => {
      this.preparingTimer = null;
      if (this.machine.phase !== "preparing") return;
      const size = this.lastSize.width > 0 ? this.lastSize : { width: 460, height: 320 };
      console.warn(`[popup] preparing fallback fired after ${PREPARING_FALLBACK_MS}ms — using cached size ${size.width}×${size.height} gen=${this.genLabel()}`);
      this.finalizeAndShow(size);
    }, PREPARING_FALLBACK_MS);
  }

  private cancelPreparingTimer(): void {
    if (this.preparingTimer) {
      clearTimeout(this.preparingTimer);
      this.preparingTimer = null;
    }
  }

  private finalizeAndShow(size: { width: number; height: number }): void {
    const win = this.window;
    if (!win) return;

    this.lastSize = size;
    const displays = getAllWorkAreaRects();
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const workArea: Rect = {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    };
    const clamped = clampPopupSize(size, workArea);

    let savedPos: Point | null = null;
    if (this.lastPosition !== null) {
      if (isPositionOnScreen(this.lastPosition, clamped, displays)) {
        savedPos = this.lastPosition;
      } else {
        const clamped2 = clampRectWithin(this.lastPosition, clamped, workArea);
        savedPos = clamped2;
        this.lastPosition = savedPos;
        console.log(`[popup] saved position clamped: ${savedPos.x},${savedPos.y}`);
      }
    }

    const pref = this.snapshot.settings?.position ?? "cursor";
    const point = computePopupPlacement(cursor, workArea, clamped, pref, savedPos);

    win.setBounds({ x: point.x, y: point.y, width: clamped.width, height: clamped.height });
    win.setAlwaysOnTop(true, "pop-up-menu");
    win.showInactive();
    win.moveTop();
    this.machine = completeOpen(this.machine);
    this.setPhase("open");
    console.log(`[popup-trace]   finalizeAndShow at ${point.x},${point.y} ${clamped.width}×${clamped.height} gen=${this.genLabel()}`);
    inputDebug(`[input-debug] popup shown at ${point.x},${point.y} ${clamped.width}×${clamped.height} gen=${this.genLabel()}`);
    this.armGuard();
  }

  private closeFlow(): void {
    const win = this.window;
    if (!win || win.isDestroyed()) {
      this.machine = completeClose(this.machine);
      this.setPhase("hidden");
      return;
    }
    // phase is already "closing" (set in toggle())
    this.clearGuard();
    this.clearFocus();
    inputDebug(`[input-debug] popup close → closing gen=${this.genLabel()}`);

    // Capture the generation at close-start. If the popup is reopened before
    // this timer fires, gen changes and the timer callback is discarded.
    const closeGenId = this.machine.gen?.generationId ?? null;

    win.webContents.send("popup:closing");
    this.closeTimer = setTimeout(() => {
      this.cancelCloseTimer();
      const currentGenId = this.machine.gen?.generationId ?? null;
      if (currentGenId !== closeGenId) {
        console.log(`[popup-trace]   close timer stale: closeGen=${closeGenId ?? "?"} currentGen=${currentGenId ?? "?"} — skipped`);
        inputDebug(`[input-debug] popup close timer stale (${closeGenId ?? "?"} → ${currentGenId ?? "?"}) — skipped`);
        return;
      }
      this.machine = completeClose(this.machine);
      this.setPhase("hidden");
      this.pendingShow = null;
      if (win && !win.isDestroyed() && win.isVisible()) {
        console.log(`[popup-trace]   close timer → win.hide() gen=${closeGenId ?? "?"}`);
        win.hide();
      }
    }, CLOSE_TIMEOUT_MS);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private armGuard(): void {
    this.clearGuard();
    this.clearFocus();
    const key = this.pendingTriggerKey;
    this.pendingTriggerKey = undefined;
    if (key) {
      this.triggerGuard = { key, active: true, timer: null };
      this.triggerGuard.timer = setTimeout(() => this.releaseTriggerGuard(), TRIGGER_GUARD_MS);
    } else {
      this.focusTimer = setTimeout(() => this.activate(), ACTIVATE_DELAY_MS);
    }
  }

  private releaseTriggerGuard(): void {
    const guard = this.triggerGuard;
    if (guard?.active) {
      guard.active = false;
      if (guard.timer) { clearTimeout(guard.timer); guard.timer = null; }
    }
    this.activate();
  }

  private activate(): void {
    if (this.phase === "hidden" || this.phase === "closing") return;
    this.setPhase("open");
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("popup:activate");
      if (!this.window.isFocused()) this.window.focus();
    }
  }

  private clearGuard(): void {
    if (this.triggerGuard?.timer) clearTimeout(this.triggerGuard.timer);
    this.triggerGuard = null;
  }

  private clearFocus(): void {
    if (this.focusTimer) { clearTimeout(this.focusTimer); this.focusTimer = null; }
  }

  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) return;
    const iconPath = join(this.appPath, "build/icon.ico");
    this.window = new BrowserWindow({
      width: 540,
      height: 380,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      icon: existsSync(iconPath) ? iconPath : undefined,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      focusable: true,
      fullscreenable: false,
      hasShadow: false,
      roundedCorners: true,
      thickFrame: false,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });

    const win = this.window;
    win.setAlwaysOnTop(true, "pop-up-menu");
    win.setMenuBarVisibility(false);

    this.material = this.applyMaterial(win);

    win.webContents.on("before-input-event", (event, input) => {
      const guard = this.triggerGuard;
      if (!guard?.active) return;
      if (input.type === "keyDown" && sameKey(input.key, guard.key)) {
        event.preventDefault();
      } else if (input.type === "keyUp" && sameKey(input.key, guard.key)) {
        this.releaseTriggerGuard();
      }
    });

    win.webContents.on("preload-error", (_event, preloadPath, error) => {
      console.error(`[popup] preload-error | path=${preloadPath} error=${error.message}`);
    });
    win.webContents.on("render-process-gone", (_event, details) => {
      console.error(`[popup] renderer process gone | reason=${details.reason} exitCode=${details.exitCode}`);
    });
    win.webContents.on("console-message", (_event, _level, message) => {
      // Forward renderer logs to the main process console for unified tracing.
      if (message) console.log(`[popup-renderer] ${message}`);
    });
    win.webContents.on("did-finish-load", () => {
      this.ready = true;
      console.log("[popup] overlay renderer loaded — ready");
      const pending = this.pendingShow;
      if (pending) {
        this.pendingShow = null;
        this.snapshot = { ...this.snapshot, items: pending.items ?? [], title: pending.title };
        this.pendingTriggerKey = pending.triggerKey;
        this.machine = completePrepare(this.machine);
        this.setPhase("preparing");
        win.webContents.send("popup:data", this.dataPayload());
        this.armPreparingTimer();
      } else {
        win.webContents.send("popup:data", this.dataPayload());
      }
    });

    // NOTE: blur auto-close is intentionally NOT registered.
    // Popup closes only via: FF shortcut toggle, X button, Escape, action execution.

    win.on("moved", () => {
      if (this.window && !this.window.isDestroyed()) {
        const [x, y] = this.window.getPosition();
        this.lastPosition = { x, y };
        inputDebug(`[input-debug] popup dragged to ${x},${y}`);
      }
    });

    win.on("closed", () => {
      this.window = null;
      this.ready = false;
      this.pendingShow = null;
      this.machine = forceHide(this.machine);
      this.setPhase("hidden");
    });

    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    if (this.isDev) {
      win.loadURL(`${this.devUrl}/?window=popup`).catch((err) => {
        console.error(`[popup] loadURL failed: ${err.message}`);
      });
    } else {
      win.loadFile(join(this.appPath, "dist", "index.html"), { query: { window: "popup" } }).catch((err) => {
        console.error(`[popup] loadFile failed: ${err.message}`);
      });
    }
  }

  private applyMaterial(_win: BrowserWindow): "acrylic" | "fallback" {
    console.log("[popup] background material: fallback (native acrylic disabled; CSS rounded surface)");
    return "fallback";
  }
}
