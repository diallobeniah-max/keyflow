import { useEffect, useState } from "react";
import type { ThemeMode } from "../types";

export type ResolvedTheme = "dark" | "light";

export function resolveTheme(theme?: ThemeMode): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Keeps renderer surfaces in sync when Windows changes its system colour mode. */
export function useResolvedTheme(theme?: ThemeMode): ResolvedTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(theme));

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: light)");
    const sync = () => setResolvedTheme(resolveTheme(theme));

    sync();
    if (theme !== "system" || !mediaQuery) return undefined;

    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, [theme]);

  return resolvedTheme;
}
