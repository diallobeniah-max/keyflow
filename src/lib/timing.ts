export type TimingMode = "auto" | "custom";

export interface TimingLike {
  tapInterval?: number;
  holdDuration?: number;
  delay?: number;
  cooldown?: number;
  timingMode?: TimingMode;
}

export const AUTO_TIMING: { tapInterval: number; holdDuration: number; delay: number; cooldown: number } = {
  tapInterval: 200,
  holdDuration: 360,
  delay: 0,
  cooldown: 120,
};

/** Resolve the effective timing: automatic mode uses the fast defaults. */
export function resolveTiming(timing: TimingLike | undefined, mode?: TimingMode): TimingLike {
  const src = timing ?? {};
  if (mode === "custom") return { ...src };
  return {
    ...src,
    tapInterval: AUTO_TIMING.tapInterval,
    holdDuration: AUTO_TIMING.holdDuration,
    delay: AUTO_TIMING.delay,
    cooldown: AUTO_TIMING.cooldown,
  };
}
