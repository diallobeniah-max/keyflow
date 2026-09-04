import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { SmoothScrollEngine, SMOOTH_SCROLL_PRESETS } from "../lib/smooth-scroll-engine";
import type { SmoothScrollSettings } from "../types/index";

/**
 * Attaches the KeyFlow smooth scroll engine to a scrollable DOM element.
 *
 * The engine is re-configured live when settings change — no remount required.
 * Detaches cleanly on unmount and when the ref target changes.
 *
 * Respects prefers-reduced-motion: disables smooth scrolling when the user
 * has requested reduced motion in their OS accessibility settings.
 */
export function useSmoothScroll(
  ref: RefObject<HTMLElement | null>,
  settings: SmoothScrollSettings | undefined,
): void {
  const engineRef = useRef<SmoothScrollEngine | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect OS-level reduced motion preference
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // If disabled or native preset or reduced motion, use native scrolling
    if (!settings || !settings.enabled || settings.preset === "native" || prefersReduced) {
      engineRef.current?.detach();
      engineRef.current = null;
      return;
    }

    // Build options from preset + any custom overrides
    const presetBase = SMOOTH_SCROLL_PRESETS[settings.preset] ?? SMOOTH_SCROLL_PRESETS["smooth"];
    const options = {
      stepSize: settings.stepSize ?? presetBase.stepSize ?? 100,
      animationTime: settings.animationTime ?? presetBase.animationTime ?? 400,
      accelerationEnabled: settings.accelerationEnabled ?? presetBase.accelerationEnabled ?? true,
      accelerationDelta: settings.accelerationDelta ?? 50,
      accelerationMax: settings.accelerationMax ?? presetBase.accelerationMax ?? 3,
      horizontalScrolling: settings.horizontalScrolling ?? true,
      trackpadPassThrough: settings.trackpadPassThrough ?? true,
    };

    // For non-custom presets, use preset values directly
    if (settings.preset !== "custom") {
      options.stepSize = presetBase.stepSize ?? 100;
      options.animationTime = presetBase.animationTime ?? 400;
      options.accelerationEnabled = presetBase.accelerationEnabled ?? true;
      options.accelerationMax = presetBase.accelerationMax ?? 3;
    }

    if (engineRef.current) {
      // Update existing engine options live (no need to re-attach)
      engineRef.current.updateOptions(options);
    } else {
      // Create new engine and attach
      const engine = new SmoothScrollEngine(options);
      engine.attach(el);
      engineRef.current = engine;
    }

    return () => {
      engineRef.current?.detach();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, settings?.enabled, settings?.preset, settings?.stepSize, settings?.animationTime,
      settings?.accelerationEnabled, settings?.accelerationDelta, settings?.accelerationMax,
      settings?.horizontalScrolling, settings?.trackpadPassThrough]);
}
