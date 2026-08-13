import { useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";
import { IconButton, Input } from "./ui";

const TITLES: Record<string, string> = {
  dashboard: "Overview",
  shortcuts: "Shortcuts",
  create: "Create Shortcut",
  visual: "Keyboard Map",
  library: "Action Library",
  profiles: "Profiles",
  settings: "Settings",
};

export function TopBar() {
  const page = useStore((s) => s.currentPage);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const focusedApp = useStore((s) => s.focusedApp);
  const appearance = useStore((s) => s.data.settings.appearance);
  const patch = useStore((s) => s.patchSettings);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const nextTheme =
    appearance.theme === "dark"
      ? "light"
      : appearance.theme === "light"
      ? "system"
      : "dark";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          ref={hamburgerRef}
          type="button"
          className="hamburger hide-desktop"
          aria-label="Open navigation menu"
          onClick={() => setDrawerOpen(!drawerOpen)}
        >
          <Icon name={drawerOpen ? "close" : "shortcuts"} size={18} />
        </button>
        <h1 className="topbar-title">{TITLES[page] ?? "KeyFlow"}</h1>
      </div>

      <div className="topbar-actions">
        {focusedApp && focusedApp !== "keyflow.exe" && (
          <span className="topbar-chip hide-mobile" title={`Active foreground application: ${focusedApp}`}>
            <Icon name="window" size={13} />
            <span>{focusedApp}</span>
          </span>
        )}

        <span
          className={"topbar-status-pill" + (paused || safeMode ? " is-paused" : " is-active")}
          title={safeMode ? "Safe Mode active" : paused ? "KeyFlow is paused" : "KeyFlow is actively listening for gestures"}
        >
          <span className="status-dot" />
          <span>{safeMode ? "Safe Mode" : paused ? "Paused" : "Active"}</span>
        </span>

        <IconButton
          name={appearance.theme === "light" ? "sun" : appearance.theme === "dark" ? "moon" : "monitor"}
          title={`Theme: ${appearance.theme} (click to cycle)`}
          size={16}
          onClick={() => patch("appearance", { theme: nextTheme as any })}
        />
      </div>
    </header>
  );
}
