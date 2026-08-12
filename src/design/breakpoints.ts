/**
 * Responsive ranges used by renderer CSS and any layout logic.
 * Narrow mode is defensive below 760px; the supported experience is desktop.
 */
export const breakpoints = {
  narrow: { max: 759 },
  compact: { min: 760, max: 899 },
  standard: { min: 900, max: 1199 },
  large: { min: 1200, max: 1439 },
  wide: { min: 1440 },
} as const;

export type BreakpointName = keyof typeof breakpoints;

export function getCurrentBreakpoint(width: number): BreakpointName {
  if (width >= 1440) return "wide";
  if (width >= 1200) return "large";
  if (width >= 900) return "standard";
  if (width >= 760) return "compact";
  return "narrow";
}
