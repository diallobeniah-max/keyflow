import { useEffect } from "react";
import { useStore } from "../store/useStore";

/**
 * Keep the store's `focusedApp` (current-context indicator in the TopBar)
 * in sync with the native helper's cached foreground application.
 *
 * Polling cadence is lazy (~1500ms) — this is a status chip, not a hot path,
 * and each call is a cheap native cache read (no per-key enumeration). The
 * native helper also updates on foreground changes; a renderer poll is enough
 * because the chip only needs "which app is current", not sub-second accuracy.
 */
export function useActiveApp(intervalMs = 1500): void {
  const setFocusedApp = useStore((s) => s.setFocusedApp);

  useEffect(() => {
    let cancelled = false;
    const eapi = (window as any).electronAPI;
    if (!eapi?.input?.getActiveApp) return;

    const poll = async () => {
      try {
        const app = await eapi.input.getActiveApp();
        if (!cancelled && app?.executablePath) {
          const name = app.displayName ?? app.processName ?? app.executablePath.replace(/\\/g, "/").split("/").pop() ?? "";
          setFocusedApp(name);
        }
      } catch {
        // transient helper/transport failure: keep the last known chip
      }
    };

    const refresh = () => void poll();
    void refresh();
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [setFocusedApp, intervalMs]);
}