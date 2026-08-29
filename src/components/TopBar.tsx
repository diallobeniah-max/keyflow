import { useRef } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";
import { IconButton } from "./ui";

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
  const setPage = useStore((s) => s.setPage);
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

  const tint = appearance.headerAccentTint ?? "subtle";
  const fit = appearance.headerAccentFit ?? "full";
  const tintClass = tint !== "none" ? ` topbar-tint-${tint} topbar-fit-${fit}` : "";

  return (
    <header className={`topbar${tintClass}`}>
      {tint !== "none" && <div className="topbar-accent-glow" aria-hidden="true" />}
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

        <div className="topbar-breadcrumbs">
          <h1 className="topbar-title">{TITLES[page] ?? "KeyFlow"}</h1>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-search-trigger hide-mobile"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("keyflow:toggle-command-palette"));
          }}
          title="Search commands and settings (Ctrl+K)"
        >
          <Icon name="search" size={13} />
          <span>Search…</span>
          <kbd className="topbar-search-kbd">Ctrl K</kbd>
        </button>

        {focusedApp && focusedApp !== "keyflow.exe" && (
          <span className="topbar-chip hide-mobile" title={`Active foreground application: ${focusedApp}`}>
            <Icon name="window" size={13} />
            <span className="topbar-chip-text">{focusedApp}</span>
          </span>
        )}

        <span
          className={"topbar-status-pill" + (safeMode ? " is-safe-mode" : paused ? " is-paused" : " is-active")}
          title={safeMode ? "Safe Mode active" : paused ? "KeyFlow is paused" : "KeyFlow is actively listening for gestures"}
        >
          <span className="status-dot" />
          <span>{safeMode ? "Safe Mode" : paused ? "Paused" : "Active"}</span>
        </span>

        {page !== "create" && (
          <button
            type="button"
            className="btn btn-primary btn-sm hide-mobile topbar-quick-create"
            onClick={() => {
              useStore.getState().setEditing(null);
              setPage("create");
            }}
          >
            <Icon name="create" size={14} />
            <span>New Shortcut</span>
          </button>
        )}

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
