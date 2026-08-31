import { useRef } from "react";
import {
  Books,
  Desktop,
  GearSix,
  Keyboard,
  NoteBlank,
  Plus,
  SquaresFour,
  UsersThree,
  Pause,
  Play,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useStore } from "../store/useStore";
import { AppPage } from "../types";
import { Icon } from "./Icon";
import { IconButton } from "./ui";
import { AppSelect } from "./ui/AppSelect";

const TITLES: Record<string, string> = {
  dashboard: "Overview",
  shortcuts: "Shortcuts",
  create: "Create Shortcut",
  visual: "Keyboard Map",
  library: "Action Library",
  profiles: "Profiles",
  notes: "Notes",
  settings: "Settings",
};

interface NavItem {
  page: AppPage;
  label: string;
  icon: PhosphorIcon;
  badge?: number;
}

export function TopBar() {
  const page = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const togglePaused = useStore((s) => s.togglePaused);
  const focusedApp = useStore((s) => s.focusedApp);
  const appearance = useStore((s) => s.data.settings.appearance);
  const patch = useStore((s) => s.patchSettings);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const profiles = useStore((s) => s.data.profiles);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const setActiveProfile = useStore((s) => s.setActiveProfile);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const isHorizontal = appearance?.navigationLayout === "horizontal";

  const nextTheme =
    appearance.theme === "dark"
      ? "light"
      : appearance.theme === "light"
      ? "system"
      : "dark";

  const tint = appearance.headerAccentTint ?? "subtle";
  const fit = appearance.headerAccentFit ?? "full";
  const tintClass = tint !== "none" ? ` topbar-tint-${tint} topbar-fit-${fit}` : "";

  const activeShortcutsCount = shortcuts.filter((s) => s.profileId === activeProfileId && s.enabled).length;

  const NAV_ITEMS: NavItem[] = [
    { page: "dashboard", label: "Overview", icon: SquaresFour },
    { page: "shortcuts", label: "Shortcuts", icon: Keyboard, badge: activeShortcutsCount },
    { page: "create", label: "Create", icon: Plus },
    { page: "visual", label: "Keyboard Map", icon: Desktop },
    { page: "profiles", label: "Profiles", icon: UsersThree, badge: profiles.length },
    { page: "library", label: "Action Library", icon: Books },
    { page: "notes", label: "Notes", icon: NoteBlank },
    { page: "settings", label: "Settings", icon: GearSix },
  ];

  if (isHorizontal) {
    return (
      <header className={`topbar is-horizontal-nav${tintClass}`}>
        {tint !== "none" && <div className="topbar-accent-glow" aria-hidden="true" />}

        {/* Left: Brand + Status + Page Title */}
        <div className="topbar-left">
          <div className="topbar-brand" onClick={() => setPage("dashboard")} title="KeyFlow Control Deck">
            <span className={"status-dot" + (safeMode ? " is-safe-mode" : paused ? " is-paused" : " is-active")} />
            <div className="topbar-brand-text">
              <span className="topbar-brand-title">KeyFlow</span>
              <span className="topbar-brand-subtitle">Deck v0.3</span>
            </div>
          </div>
          <div className="topbar-crumb-sep">/</div>
          <h1 className="topbar-title">{TITLES[page] ?? "KeyFlow"}</h1>
        </div>

        {/* Right: Profile Switcher, Status Pill, Quick Create, Theme Toggle */}
        <div className="topbar-actions">
          {focusedApp && focusedApp !== "keyflow.exe" && (
            <span className="topbar-chip hide-mobile" title={`Active foreground application: ${focusedApp}`}>
              <Icon name="window" size={13} />
              <span className="topbar-chip-text">{focusedApp}</span>
            </span>
          )}

          {/* Profile Switcher */}
          {profiles.length > 0 && (
            <div className="topbar-profile-select hide-mobile">
              <AppSelect
                value={activeProfileId}
                onChange={(val) => setActiveProfile(val)}
                options={profiles.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
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

  // Standard Vertical Sidebar TopBar
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
