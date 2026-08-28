/**
 * Pure hover-dwell state machine for the Drag Corner Switcher overlay.
 * Separated from the React page so the activation timing logic is unit-testable
 * in Node without a browser or Electron.
 */
export class HoverDwellDetector {
  private current: string | null = null;
  private since = 0;
  private fired = false;
  private dwellMs: number;

  constructor(dwellMs: number) {
    this.dwellMs = dwellMs;
  }

  setDwellMs(ms: number): void {
    this.dwellMs = ms;
  }

  reset(): void {
    this.current = null;
    this.since = 0;
    this.fired = false;
  }

  /**
   * Feed the currently hovered tile (or null when over no tile) plus a
   * monotonic-ish timestamp. Returns the hwnd to activate once the cursor has
   * dwelled on the same tile for `dwellMs`, and null otherwise. A single tile
   * fires at most once until the cursor leaves it.
   */
  update(hwnd: string | null, now: number): string | null {
    if (hwnd !== this.current) {
      this.current = hwnd;
      this.since = hwnd ? now : 0;
      this.fired = false;
      return null;
    }
    if (hwnd && !this.fired && now - this.since >= this.dwellMs) {
      this.fired = true;
      return hwnd;
    }
    return null;
  }
}