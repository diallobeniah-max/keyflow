/**
 * KeyFlow Smooth Scroll Engine
 *
 * High-performance frame-rate-independent smooth scrolling engine.
 *
 * Core principles:
 * - Unified target-momentum physics: instead of stacking unbounded independent
 *   easing timelines that compound into exponential runaway speed, incoming wheel
 *   impulses smoothly integrate into a damped target displacement vector.
 * - Cadence-aware acceleration: rapid consecutive wheel events accelerate scrolling
 *   with an organic curve capped by accelerationMax and a strict lead buffer ceiling,
 *   preventing uncontrollable hyper-speed.
 * - Subpixel accumulator: fractional displacements are tracked continuously across
 *   rAF frames and applied as integer pixels, eliminating micro-stutter and frame jitter
 *   on standard (60Hz) and high-refresh-rate (120Hz/144Hz/240Hz) displays.
 * - Frame-rate independent exponential decay: physical decay uses delta time (dt)
 *   so motion duration and easing feel identical across varying frame rates.
 * - Instant direction reversal: flicking in the opposing direction cancels previous
 *   momentum immediately for crisp, zero-lag turnaround.
 * - Precision trackpad detection: instant pass-through for trackpad touch gestures
 *   with zero-frame lag, detecting non-integer deltas and touch signatures.
 * - Boundary safety: detects element scroll limits and clears residual deltas to prevent
 *   "sticky" edges.
 */

export interface SmoothScrollOptions {
  /** Pixels per mouse wheel notch. Default 100. */
  stepSize: number;
  /** Duration in ms for each impulse to complete. Default 280. */
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
  smooth: { stepSize: 100, animationTime: 280, accelerationEnabled: true,  accelerationMax: 3 },
  silky:  { stepSize: 80,  animationTime: 450, accelerationEnabled: true,  accelerationMax: 2 },
  fast:   { stepSize: 100, animationTime: 160, accelerationEnabled: true,  accelerationMax: 4 },
};

const DEFAULT_OPTIONS: SmoothScrollOptions = {
  stepSize: 100,
  animationTime: 280,
  accelerationEnabled: true,
  accelerationDelta: 50,
  accelerationMax: 3,
  horizontalScrolling: true,
  trackpadPassThrough: true,
};

export class SmoothScrollEngine {
  private options: SmoothScrollOptions;
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private lastScrollTime = 0;

  // Unified target delta accumulator (remaining distance to smoothly animate)
  private targetDeltaX = 0;
  private targetDeltaY = 0;

  // Subpixel accumulators to prevent rounding loss and micro-stutter
  private subpixelX = 0;
  private subpixelY = 0;

  // Rolling buffer of recent wheel deltas for precision trackpad detection
  private deltaBuffer: number[] = [];

  // Attached element and its wheel listener
  private element: HTMLElement | null = null;
  private wheelListener: ((e: WheelEvent) => void) | null = null;

  constructor(options: Partial<SmoothScrollOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Update options live (e.g. when user changes preset or tweaks sliders in settings). */
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
    this.targetDeltaX = 0;
    this.targetDeltaY = 0;
    this.subpixelX = 0;
    this.subpixelY = 0;
    this.lastFrameTime = 0;
    this.lastScrollTime = 0;
    this.deltaBuffer = [];
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleWheel(e: WheelEvent): void {
    if (!this.element) return;

    // Respect already-handled events from nested scroll containers
    if (e.defaultPrevented) return;

    // Pass-through check: native scroll (animationTime === 0 means "native" preset)
    if (this.options.animationTime === 0) return;

    // Trackpad detection: pass-through to native hardware gesture handling
    if (this.options.trackpadPassThrough && this.isTrackpad(e)) return;

    // If attached element itself cannot scroll in either axis, check propagation
    const canScrollY = this.element.scrollHeight > this.element.clientHeight;
    const canScrollX = this.element.scrollWidth > this.element.clientWidth;
    if (!canScrollY && !canScrollX) return;

    // Check if event occurred inside an inner scrollable element that can scroll in this direction
    if (this.isNestedScrollable(e)) return;

    // Ignore horizontal if disabled
    if (!this.options.horizontalScrolling && e.deltaX !== 0 && e.deltaY === 0) return;

    e.preventDefault();

    // Normalize incoming wheel delta to pixels based on deltaMode
    let dx = 0;
    let dy = 0;

    if (e.deltaMode === 1) {
      // LINE mode (typical Windows mouse: default 3 lines per notch)
      const notchesY = e.deltaY !== 0 ? Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 3)) : 0;
      const notchesX = e.deltaX !== 0 ? Math.sign(e.deltaX) * Math.max(1, Math.round(Math.abs(e.deltaX) / 3)) : 0;
      dy = notchesY * this.options.stepSize;
      dx = notchesX * this.options.stepSize;
    } else if (e.deltaMode === 2) {
      // PAGE mode
      dy = Math.sign(e.deltaY) * window.innerHeight;
      dx = Math.sign(e.deltaX) * window.innerWidth;
    } else {
      // PIXEL mode (DOM_DELTA_PIXEL)
      const absY = Math.abs(e.deltaY);
      const absX = Math.abs(e.deltaX);

      // Notched mouse wheel typically reports >= 50px (e.g. 100 or 120 per notch)
      if (absY >= 50) {
        const notchesY = Math.max(1, Math.round(absY / 100));
        dy = Math.sign(e.deltaY) * notchesY * this.options.stepSize;
      } else if (absY > 0) {
        // High-resolution wheel micro-step
        dy = e.deltaY * (this.options.stepSize / 100);
      }

      if (absX >= 50) {
        const notchesX = Math.max(1, Math.round(absX / 100));
        dx = Math.sign(e.deltaX) * notchesX * this.options.stepSize;
      } else if (absX > 0) {
        dx = e.deltaX * (this.options.stepSize / 100);
      }
    }

    if (dx === 0 && dy === 0) return;

    this.enqueue(dx, dy);
  }

  private isTrackpad(e: WheelEvent): boolean {
    // A. Precision trackpad sends non-integer pixel deltas (never true for notched wheels)
    if (e.deltaY % 1 !== 0 || e.deltaX % 1 !== 0) {
      return true;
    }

    // B. wheelDelta check: on Windows, physical mouse wheels send multiples of 120
    const wheelDelta = (e as any).wheelDelta;
    if (typeof wheelDelta === "number" && wheelDelta !== 0 && wheelDelta % 120 !== 0) {
      return true;
    }

    // C. Very small pixel deltas in PIXEL mode indicate smooth touch/trackpad gestures
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 15 && Math.abs(e.deltaX) < 15 && (e.deltaY !== 0 || e.deltaX !== 0)) {
      this.deltaBuffer.push(e.deltaY);
      if (this.deltaBuffer.length > 4) this.deltaBuffer.shift();
      if (this.deltaBuffer.length >= 2) return true;
    }

    return false;
  }

  private isNestedScrollable(e: WheelEvent): boolean {
    let current = e.target as HTMLElement | null;
    while (current && current !== this.element) {
      if (current.scrollHeight > current.clientHeight) {
        const style = window.getComputedStyle(current);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          const canDown = e.deltaY > 0 && current.scrollTop + current.clientHeight < current.scrollHeight - 1;
          const canUp = e.deltaY < 0 && current.scrollTop > 1;
          if (canDown || canUp) return true;
        }
      }
      if (current.scrollWidth > current.clientWidth) {
        const style = window.getComputedStyle(current);
        if (style.overflowX === "auto" || style.overflowX === "scroll") {
          const canRight = e.deltaX > 0 && current.scrollLeft + current.clientWidth < current.scrollWidth - 1;
          const canLeft = e.deltaX < 0 && current.scrollLeft > 1;
          if (canRight || canLeft) return true;
        }
      }
      current = current.parentElement;
    }
    return false;
  }

  private enqueue(dx: number, dy: number): void {
    const now = performance.now();

    // 1. Cadence-aware acceleration
    let finalDx = dx;
    let finalDy = dy;

    if (this.options.accelerationEnabled && this.options.accelerationMax > 1) {
      const elapsed = now - this.lastScrollTime;
      if (elapsed < this.options.accelerationDelta && elapsed > 0) {
        // Cadence from 0 (at accelerationDelta) to 1 (at 0ms)
        const cadence = Math.max(0, 1 - elapsed / this.options.accelerationDelta);
        const factor = 1 + (this.options.accelerationMax - 1) * Math.pow(cadence, 1.2);
        finalDx *= factor;
        finalDy *= factor;
      }
    }
    this.lastScrollTime = now;

    // 2. Vertical target integration with runaway prevention & direction reversal
    if (finalDy !== 0) {
      // Instant direction reversal: immediately wipe opposing momentum
      if (Math.sign(finalDy) !== Math.sign(this.targetDeltaY) && Math.abs(this.targetDeltaY) > 1) {
        this.targetDeltaY = 0;
        this.subpixelY = 0;
      }

      // Hard ceiling on lead distance to prevent hyper-speed runaway when scrolling rapidly
      const maxLeadY = this.options.stepSize * Math.max(2, this.options.accelerationMax * 1.5);
      const currentAbsY = Math.abs(this.targetDeltaY);

      // Smooth progressive damping as target approaches maximum cruising ceiling
      let addY = finalDy;
      if (currentAbsY > 0 && maxLeadY > 0) {
        const headroom = Math.max(0, (maxLeadY - currentAbsY) / maxLeadY);
        addY *= (0.35 + 0.65 * headroom);
      }

      this.targetDeltaY += addY;

      // Clamp to ceiling
      if (Math.abs(this.targetDeltaY) > maxLeadY) {
        this.targetDeltaY = Math.sign(this.targetDeltaY) * maxLeadY;
      }
    }

    // 3. Horizontal target integration
    if (finalDx !== 0 && this.options.horizontalScrolling) {
      if (Math.sign(finalDx) !== Math.sign(this.targetDeltaX) && Math.abs(this.targetDeltaX) > 1) {
        this.targetDeltaX = 0;
        this.subpixelX = 0;
      }

      const maxLeadX = this.options.stepSize * Math.max(2, this.options.accelerationMax * 1.5);
      const currentAbsX = Math.abs(this.targetDeltaX);

      let addX = finalDx;
      if (currentAbsX > 0 && maxLeadX > 0) {
        const headroom = Math.max(0, (maxLeadX - currentAbsX) / maxLeadX);
        addX *= (0.35 + 0.65 * headroom);
      }

      this.targetDeltaX += addX;

      if (Math.abs(this.targetDeltaX) > maxLeadX) {
        this.targetDeltaX = Math.sign(this.targetDeltaX) * maxLeadX;
      }
    }

    // Start rAF loop if not currently active
    if (this.rafId === null) {
      this.lastFrameTime = performance.now();
      this.rafId = requestAnimationFrame((ts) => this.step(ts));
    }
  }

  private step(now: number): void {
    if (!this.element) {
      this.rafId = null;
      return;
    }

    if (this.lastFrameTime === 0) {
      this.lastFrameTime = now;
    }

    // Delta time in seconds, clamped between 1ms and 50ms to prevent jumps on frame drops
    const dt = Math.min(Math.max((now - this.lastFrameTime) / 1000, 0.001), 0.05);
    this.lastFrameTime = now;

    // Decay rate lambda: reaches ~99% completion within animationTime
    const animTimeSec = Math.max(this.options.animationTime, 50) / 1000;
    const lambda = 4.6 / animTimeSec;
    const factor = 1 - Math.exp(-lambda * dt);

    let moveX = 0;
    let moveY = 0;

    // Calculate frame slice for horizontal
    if (Math.abs(this.targetDeltaX) > 0.01) {
      if (Math.abs(this.targetDeltaX) < 0.5) {
        moveX = this.targetDeltaX;
        this.targetDeltaX = 0;
      } else {
        moveX = this.targetDeltaX * factor;
        this.targetDeltaX -= moveX;
      }
    } else {
      this.targetDeltaX = 0;
    }

    // Calculate frame slice for vertical
    if (Math.abs(this.targetDeltaY) > 0.01) {
      if (Math.abs(this.targetDeltaY) < 0.5) {
        moveY = this.targetDeltaY;
        this.targetDeltaY = 0;
      } else {
        moveY = this.targetDeltaY * factor;
        this.targetDeltaY -= moveY;
      }
    } else {
      this.targetDeltaY = 0;
    }

    // Subpixel accumulation
    this.subpixelX += moveX;
    this.subpixelY += moveY;

    const scrollX = Math.round(this.subpixelX);
    const scrollY = Math.round(this.subpixelY);

    if (scrollX !== 0 || scrollY !== 0) {
      const prevTop = this.element.scrollTop;
      const prevLeft = this.element.scrollLeft;

      this.element.scrollBy(scrollX, scrollY);

      this.subpixelX -= scrollX;
      this.subpixelY -= scrollY;

      // Boundary detection: if the element reached the edge and did not move, clear residual delta
      const movedY = this.element.scrollTop - prevTop;
      const movedX = this.element.scrollLeft - prevLeft;

      if (scrollY !== 0 && movedY === 0) {
        this.targetDeltaY = 0;
        this.subpixelY = 0;
      }
      if (scrollX !== 0 && movedX === 0) {
        this.targetDeltaX = 0;
        this.subpixelX = 0;
      }
    }

    const hasPending =
      Math.abs(this.targetDeltaX) > 0.01 ||
      Math.abs(this.targetDeltaY) > 0.01 ||
      Math.abs(this.subpixelX) >= 0.5 ||
      Math.abs(this.subpixelY) >= 0.5;

    if (hasPending) {
      this.rafId = requestAnimationFrame((ts) => this.step(ts));
    } else {
      this.rafId = null;
      this.lastFrameTime = 0;
      this.targetDeltaX = 0;
      this.targetDeltaY = 0;
      this.subpixelX = 0;
      this.subpixelY = 0;
    }
  }
}
