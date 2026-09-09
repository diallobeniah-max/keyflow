import { useEffect, useState } from "react";

/**
 * KeyFlow's shared renderer motion contract.
 *
 * Use the exported preset and state class helper with the companion
 * `src/design/motion.css` file. Components that need an exit transition
 * should use `useMotionPresence` instead of unmounting immediately.
 */
export const MOTION_DURATION = {
  page: 320,
  popover: 160,
  dialog: 220,
  sheet: 220,
  toast: 160,
  tooltip: 100,
  clipboard: 160,
} as const;

export type MotionPreset = keyof typeof MOTION_DURATION;
export type MotionState = "enter" | "exit";

export function motionClassName(preset: MotionPreset, state: MotionState = "enter") {
  return `kf-motion kf-motion--${preset} is-${state}`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.classList.contains("reduce-motion")
    || document.body.classList.contains("reduce-motion");
}

/**
 * Keeps a transient surface mounted just long enough for its centralised exit
 * animation to finish. It never delays an action, focus change, or shortcut.
 */
export function useMotionPresence(present: boolean, preset: MotionPreset) {
  const [rendered, setRendered] = useState(present);
  const [state, setState] = useState<MotionState>(present ? "enter" : "exit");

  useEffect(() => {
    if (present) {
      setRendered(true);
      setState("enter");
      return;
    }

    if (!rendered) return;

    setState("exit");
    const exitDuration = prefersReducedMotion() ? 0 : MOTION_DURATION[preset];
    const timer = window.setTimeout(() => setRendered(false), exitDuration);
    return () => window.clearTimeout(timer);
  }, [present, preset, rendered]);

  return { rendered, state, className: motionClassName(preset, state) };
}
