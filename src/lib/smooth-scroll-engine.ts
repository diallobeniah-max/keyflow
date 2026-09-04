/**
 * KeyFlow Smooth Scroll Engine
 *
 * Queue-based impulse animation inspired by the open-source SmoothScroll
 * algorithm by Balazs Galambosi (galambalazs/smoothscroll-for-websites, MIT).
 *
 * Scroll behaviour:
 * - Each wheel notch pushes an impulse onto a queue.
 * - A single rAF loop processes all queued impulses per frame and sums their
 *   partial pixel amounts for a single scrollBy call — prevents jitter.
 * - The pulse easing function produces a natural deceleration curve.
 * - Rapid consecutive events in the same direction multiply speed up to a cap.
 * - A direction reversal clears the queue for immediate response.
 * - Trackpad detection: if the last 3 deltaY values all contain fractional
 *   parts, the device is a precision trackpad → pass-through to native scroll.
 */

export interface SmoothScrollOptions {
  /** Pixels per mouse wheel notch. Default 100. */
  stepSize: number;
  /** Duration in ms for each impulse to complete. Default 400. */
  animationTime: number;
  /** Acceleration enabled. Default true. */
  accelerationEnabled: boolean;
  /** If next wheel arrives within this ms, accelerate. Default 50. */
  accelerationDelta: number;
  /** Max velocity multiplier from repeated scrolling. Default 3. */
  accelerationMax: number;
  /** Handle horizontal wheel events. Default true. */
  horizontalScrolling: boolean;
  /** Pass-through precision trackpad events. Default true. */
  trackpadPassThrough: boolean;
}

export const SMOOTH_SCROLL_PRESETS: Record<string, Partial<SmoothScrollOptions>> = {
  native: { stepSize: 100, animationTime: 0,   accelerationEnabled: false, accelerationMax: 1 },
  smooth: { stepSize: 100, animationTime: 400,  accelerationEnabled: true,  accelerationMax: 3 },
  silky:  { stepSize: 80,  animationTime: 600,  accelerationEnabled: true,  accelerationMax: 2 },
  fast:   { stepSize: 150, animationTime: 200,  accelerationEnabled: true,  accelerationMax: 4 },
};

const DEFAULT_OPTIONS: SmoothScrollOptions = {
  stepSize: 100,
  animationTime: 400,
  accelerationEnabled: true,
  accelerationDelta: 50,
  accelerationMax: 3,
  horizontalScrolling: true,
  trackpadPassThrough: true,
};

interface QueueItem {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  startTime: number;
}

/**
 * Instant-response ease-out cubic decay — delivers peak velocity immediately at t=0
 * to eliminate initial delay/hesitation, settling smoothly into an organic coast.
 */
function pulse(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

export class SmoothScrollEngine {
  private options: SmoothScrollOptions;
  private queue: QueueItem[] = [];
  private rafId: number | null = null;
  private lastScrollTime = 0;
  private lastDirX = 0;
  private lastDirY = 0;

  // Trackpad detection: store last 3 raw deltaY values
  private deltaBuffer: number[] = [];

  // Attached element and its wheel listener
  private element: HTMLElement | null = null;
  private wheelListener: ((e: WheelEvent) => void) | null = null;

  constructor(options: Partial<SmoothScrollOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Update options live (e.g., when user changes preset in settings). */
  updateOptions(options: Partial<SmoothScrollOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Attach to a scrollable DOM element. Returns a detach function.
   */
  attach(element: HTMLElement): () => void {
    this.detach();
    this.element = element;

    this.wheelListener = (e: WheelEvent) => this.handleWheel(e);
    element.addEventListener("wheel", this.wheelListener, { passive: false });

    return () => this.detach();
  }

  detach(): void {
    if (this.element && this.wheelListener) {
      this.element.removeEventListener("wheel", this.wheelListener);
    }
    this.element = null;
    this.wheelListener = null;
    this.queue = [];
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.element) return;

    // If attached element itself is not scrollable, allow native event propagation
    const canScrollY = this.element.scrollHeight > this.element.clientHeight;
    const canScrollX = this.element.scrollWidth > this.element.clientWidth;
    if (!canScrollY && !canScrollX) return;

    // Pass-through check: native scroll (animationTime === 0 means "native" preset)
    if (this.options.animationTime === 0) return;

    // Trackpad detection
    if (this.options.trackpadPassThrough && this.isTrackpad(e)) return;

    // If delta is very small in PIXEL mode (e.g. injected sub-wheel micro-step), let browser handle directly
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 10 && Math.abs(e.deltaX) < 10) return;

    // Ignore horizontal if disabled
    if (!this.options.horizontalScrolling && e.deltaX !== 0 && e.deltaY === 0) return;

    e.preventDefault();

    // Normalize delta to pixels
    let dx = 0;
    let dy = 0;
    const factor = e.deltaMode === 1 ? this.options.stepSize : // LINE mode
                   e.deltaMode === 2 ? window.innerHeight :      // PAGE mode
                   1;                                            // PIXEL mode

    dx = e.deltaX * factor;
    dy = e.deltaY * factor;

    // For PIXEL mode, many mice report 3–5 per notch. Normalize to stepSize.
    if (e.deltaMode === 0) {
      // Use stepSize when delta is large (mouse wheel), but small deltas (trackpad precision) get through
      const absY = Math.abs(dy);
      const absX = Math.abs(dx);
      if (absY >= 10 || absX >= 10) {
        // Mouse wheel: normalize
        dy = Math.sign(dy) * this.options.stepSize;
        dx = Math.sign(dx) * this.options.stepSize;
      }
      // else: small precise trackpad events fall through (already filtered by isTrackpad)
    }

    this.enqueue(dx, dy);
  }

  private isTrackpad(e: WheelEvent): boolean {
    // Keep a rolling buffer of the last 3 raw deltaY values
    const raw = e.deltaY;
    this.deltaBuffer.push(raw);
    if (this.deltaBuffer.length > 3) this.deltaBuffer.shift();

    if (this.deltaBuffer.length < 3) return false;

    // Precision trackpad events are non-integer or very small
    const allFractional = this.deltaBuffer.every((v) => v !== 0 && (v % 1 !== 0 || Math.abs(v) < 10));
    return allFractional;
  }

  private enqueue(dx: number, dy: number): void {
    const now = performance.now();

    // Direction reversal: clear queue for instant response
    const dirX = Math.sign(dx);
    const dirY = Math.sign(dy);
    if ((dirX !== 0 && dirX !== this.lastDirX) || (dirY !== 0 && dirY !== this.lastDirY)) {
      if (this.lastDirX !== 0 || this.lastDirY !== 0) {
        this.queue = [];
      }
    }
    this.lastDirX = dirX || this.lastDirX;
    this.lastDirY = dirY || this.lastDirY;

    // Acceleration
    let finalDx = dx;
    let finalDy = dy;
    if (this.options.accelerationEnabled && this.options.accelerationMax > 1) {
      const elapsed = now - this.lastScrollTime;
      if (elapsed < this.options.accelerationDelta && elapsed > 0) {
        const factor = Math.min(
          (1 + 50 / elapsed) / 2,
          this.options.accelerationMax,
        );
        if (factor > 1) {
          finalDx *= factor;
          finalDy *= factor;
        }
      }
    }
    this.lastScrollTime = now;

    this.queue.push({
      x: finalDx,
      y: finalDy,
      lastX: finalDx < 0 ? 0.99 : -0.99,
      lastY: finalDy < 0 ? 0.99 : -0.99,
      startTime: now,
    });

    // Start the rAF loop if not already running
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame((ts) => this.step(ts));
    }
  }

  private step(_timestamp: number): void {
    if (!this.element) {
      this.rafId = null;
      return;
    }

    const now = performance.now();
    let scrollX = 0;
    let scrollY = 0;

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      const elapsed = now - item.startTime;
      const finished = elapsed >= this.options.animationTime;

      const rawPos = finished ? 1 : elapsed / this.options.animationTime;
      const position = pulse(rawPos);

      // Delta since last frame for this impulse
      const x = Math.trunc(item.x * position - item.lastX);
      const y = Math.trunc(item.y * position - item.lastY);

      scrollX += x;
      scrollY += y;

      item.lastX += x;
      item.lastY += y;

      if (finished) {
        this.queue.splice(i, 1);
        i--;
      }
    }

    if (scrollX !== 0 || scrollY !== 0) {
      this.element.scrollBy(scrollX, scrollY);
    }

    if (this.queue.length > 0) {
      this.rafId = requestAnimationFrame((ts) => this.step(ts));
    } else {
      this.rafId = null;
      // Reset direction memory after queue empties
      this.lastDirX = 0;
      this.lastDirY = 0;
    }
  }
}
