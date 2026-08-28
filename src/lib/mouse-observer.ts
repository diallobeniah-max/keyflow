/**
 * Pure mouse-observation model mirroring the native observer
 * (`native/keyflow-input/src/raw_mouse.rs`) so its selection and parsing
 * rules are testable without the OS.
 *
 * The native observer prefers Win32 Raw Input and falls back to a WH_MOUSE_LL
 * observation hook when raw registration or verification fails. Both backends
 * feed ONE shared state machine (the drag switcher). This module encodes that
 * contract: backend selection, RIM_TYPEMOUSE button-flag parsing, and the
 * hot-corner enter/leave tracking used for runtime verification.
 */

export type MouseBackend = "raw-input" | "low-level-hook" | "none";

export interface RawRegistrationCheck {
  registered: boolean;
  deviceCount: number;
  mouseTargetMatchesHwnd: boolean;
}

export const RI_MOUSE_LEFT_BUTTON_DOWN = 0x0001;
export const RI_MOUSE_LEFT_BUTTON_UP = 0x0002;

/** Select the observer backend: raw-input when registration verified, else
 *  low-level-hook (the fallback is observation-only and shares the state
 *  machine). Mirrors native: register ok + verification pass -> raw. */
export function selectMouseBackend(check: RawRegistrationCheck): { backend: MouseBackend; reason?: string } {
  if (check.registered && check.deviceCount > 0 && check.mouseTargetMatchesHwnd) {
    return { backend: "raw-input" };
  }
  return { backend: "low-level-hook", reason: rawFailureReason(check) };
}

function rawFailureReason(check: RawRegistrationCheck): string {
  if (!check.registered) return "registerRawInputFailed";
  if (check.deviceCount === 0) return "registeredDevicesZero";
  return "mouseTargetMismatch";
}

export interface RawMouseButtons {
  leftDown: boolean;
  leftUp: boolean;
}

/** Parse RAWMOUSE usButtonFlags for left-button transitions. */
export function parseRawMouseButtons(usButtonFlags: number): RawMouseButtons {
  return {
    leftDown: (usButtonFlags & RI_MOUSE_LEFT_BUTTON_DOWN) !== 0,
    leftUp: (usButtonFlags & RI_MOUSE_LEFT_BUTTON_UP) !== 0,
  };
}

export const RIM_TYPEMOUSE = 0;
export const RIM_TYPEHID = 2;

/** Hot-corner zone tracker used for the runtime-verification corner test that
 *  runs BEFORE any drag. Tracks enter/leave transitions on plain movement. */
export class HotCornerTracker {
  private lastZone: string | null = null;
  private readonly zoneAtFn: (x: number, y: number) => string | null;

  constructor(zoneAt: (x: number, y: number) => string | null) {
    this.zoneAtFn = zoneAt;
  }

  /** Feed a cursor position; returns [leaveZone, enterZone] transitions. */
  track(x: number, y: number): [string | null, string | null] {
    const zone = this.zoneAtFn(x, y);
    if (zone === this.lastZone) return [null, null];
    const leave = this.lastZone;
    const enter = zone;
    this.lastZone = zone;
    return [leave, enter];
  }

  reset(): void {
    this.lastZone = null;
  }

  get currentZone(): string | null {
    return this.lastZone;
  }
}

export interface MouseObservationEvent {
  type: "move" | "leftDown" | "leftUp";
  x?: number;
  y?: number;
  backend: MouseBackend;
}

/**
 * Shared mouse state machine. Both backends feed this single instance so the
 * drag switcher never sees two competing mouse sources. Consumed by the
 * native observer; kept pure here so backend behaviour is testable.
 */
export class MouseObserver {
  readonly tracker: HotCornerTracker;
  backend: MouseBackend = "none";
  last = { x: 0, y: 0 };

  constructor(zoneAt: (x: number, y: number) => string | null) {
    this.tracker = new HotCornerTracker(zoneAt);
  }

  setBackend(backend: MouseBackend): void {
    this.backend = backend;
  }

  /** Feed a raw mouse report (usButtonFlags). Returns parsed transitions. */
  feedRawButtonFlags(usButtonFlags: number, x: number, y: number): MouseObservationEvent[] {
    const b = parseRawMouseButtons(usButtonFlags);
    const out: MouseObservationEvent[] = [];
    this.last = { x, y };
    if (b.leftDown) out.push({ type: "leftDown", x, y, backend: this.backend });
    if (b.leftUp) out.push({ type: "leftUp", x, y, backend: this.backend });
    return out;
  }

  /** Feed a move (position from GetCursorPos). Returns enter/leave events. */
  feedMove(x: number, y: number): MouseObservationEvent[] {
    const [leave, enter] = this.tracker.track(x, y);
    this.last = { x, y };
    const out: MouseObservationEvent[] = [];
    if (leave) out.push({ type: "move", x, y, backend: this.backend });
    if (enter) out.push({ type: "move", x, y, backend: this.backend });
    return out;
  }

  get currentHotZone(): string | null {
    return this.tracker.currentZone;
  }
}