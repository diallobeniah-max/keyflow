import { useState, useRef, useEffect } from "react";
import {
  Books,
  Desktop,
  GearSix,
  Keyboard,
  NotePencil,
  Plus,
  SquaresFour,
  UsersThree,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useStore } from "../store/useStore";
import { AppPage } from "../types";
import { Icon } from "./Icon";
import { getAppIconAsset } from "../lib/app-icon";

const TITLES: Record<string, string> = {
  dashboard: "Overview",
  shortcuts: "Shortcuts",
  create: "Create Shortcut",
  visual: "Keyboard Map",
  library: "Action Library",
  profiles: "Profiles",
  notes: "Notes",
  settings: "Settings",
  clipboard: "Clipboard",
};

const SETTINGS_SECTIONS: Record<string, string> = {
  appBehavior: "App Behavior",
  keyboard: "Shortcuts",
  appearance: "Appearance",
  appIcon: "App Icon",
  commandPalette: "Command Palette",
  clipboard: "Clipboard Hub",
  notes: "Notes & Scratchpad",
  dimScreen: "Dim Screen",
  mediaPlayer: "Media Player",
  hotCorners: "Hot Corners",
  wasdNavigation: "WASD Navigation",
  touchpad: "Touchpad Gestures",
  smoothScroll: "Smooth Scrolling",
  privacy: "Privacy & Safe Mode",
  about: "About KeyFlow",
};

interface NavItem {
  page: AppPage;
  label: string;
  icon: PhosphorIcon;
}

export function TopBar() {
  const page = useStore((s) => s.currentPage);
  const activeSettingsSection = useStore((s) => s.activeSettingsSection);
  const navigate = useStore((s) => s.navigate);
  const goBack = useStore((s) => s.goBack);
  const goForward = useStore((s) => s.goForward);
  const navHistory = useStore((s) => s.navHistory);
  const navHistoryIndex = useStore((s) => s.navHistoryIndex);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const appearance = useStore((s) => s.data.settings.appearance);
  const patch = useStore((s) => s.patchSettings);
  const toast = useStore((s) => s.toast);

  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isHorizontal = appearance?.navigationLayout === "horizontal";
  const canGoBack = navHistoryIndex > 0;
  const canGoForward = navHistoryIndex < navHistory.length - 1;

  const tint = appearance.headerAccentTint ?? "subtle";
  const fit = appearance.headerAccentFit ?? "full";
  const tintClass = tint !== "none" ? ` topbar-tint-${tint} topbar-fit-${fit}` : "";

  const appIconAsset = getAppIconAsset(appearance.appIcon);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuPos(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  // Alt+Left / Alt+Right navigation hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goForward]);

  const restoreDefaultSize = async () => {
    try {
      const isMax = await window.electronAPI?.windowControls.isMaximized?.();
      if (isMax) {
        await window.electronAPI?.windowControls.toggleMaximize?.();
      }
      window.resizeTo?.(1020, 700);
      toast("Restored default window size (1020 × 700)", "info");
    } catch {
      window.resizeTo?.(1020, 700);
    }
    setContextMenuPos(null);
  };

  const toggleLock = () => {
    const next = !appearance.lockWindowSize;
    patch("appearance", { lockWindowSize: next });
    toast(next ? "Window size locked (maximization prevented)" : "Window size unlocked", "info");
    setContextMenuPos(null);
  };

  const NAV_ITEMS: NavItem[] = [
    { page: "dashboard", label: "Overview", icon: SquaresFour },
    { page: "shortcuts", label: "Shortcuts", icon: Keyboard },
    { page: "create", label: "Create", icon: Plus },
    { page: "visual", label: "Keyboard Map", icon: Desktop },
    { page: "profiles", label: "Profiles", icon: UsersThree },
    { page: "library", label: "Action Library", icon: Books },
    { page: "notes", label: "Notes", icon: NotePencil },
    { page: "settings", label: "Settings", icon: GearSix },
  ];

  const pageTitle = TITLES[page] || page;
  const sectionTitle = page === "settings" ? (SETTINGS_SECTIONS[activeSettingsSection] || activeSettingsSection) : null;

  return (
    <header className={`topbar${tintClass}${isHorizontal ? " is-horizontal-topbar" : ""}`}>
      {tint !== "none" && <div className="topbar-accent-glow" aria-hidden="true" />}

      {/* Left Navigation: Back, Forward, Breadcrumb (all in modern pill containers) */}
      <div className="topbar-left">
        <div className="topbar-history-pills">
          <button
            type="button"
            className="topbar-pill-btn"
            disabled={!canGoBack}
            onClick={goBack}
            title={canGoBack ? "Back (Alt+Left)" : "No previous page"}
            aria-label="Navigate back"
          >
            <Icon name="chevronLeft" size={13} />
          </button>
          <button
            type="button"
            className="topbar-pill-btn"
            disabled={!canGoForward}
            onClick={goForward}
            title={canGoForward ? "Forward (Alt+Right)" : "No forward page"}
            aria-label="Navigate forward"
          >
            <Icon name="chevronRight" size={13} />
          </button>
        </div>

        {/* Breadcrumb Path Pill */}
        <div className="topbar-breadcrumb-pill">
          <button
            type="button"
            className="topbar-crumb-segment is-root"
            onClick={() => navigate("dashboard")}
            title="Go to Overview"
          >
            keyflow
          </button>
          <span className="topbar-crumb-sep">/</span>
          <button
            type="button"
            className={`topbar-crumb-segment${!sectionTitle ? " is-active" : ""}`}
            onClick={() => navigate(page)}
          >
            {pageTitle}
          </button>
          {sectionTitle && (
            <>
              <span className="topbar-crumb-sep">/</span>
              <span className="topbar-crumb-segment is-active">{sectionTitle}</span>
            </>
          )}
        </div>
      </div>

      {/* Right Navigation & Actions */}
      <div className="topbar-actions">
        {/* Command Palette Trigger */}
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

        {/* Quick Navigation Hamburger Pill (especially handy when vertical sidebar is off) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className={`topbar-pill-btn topbar-menu-pill${menuOpen ? " is-active" : ""}`}
            onClick={() => setMenuOpen(!menuOpen)}
            title="Navigation Menu"
            aria-label="Navigation Menu"
            aria-expanded={menuOpen}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={14} />
          </button>

          {menuOpen && (
            <div className="topbar-nav-dropdown anim-dropdown-enter" role="menu">
              <div className="topbar-dropdown-header">Navigation</div>
              {NAV_ITEMS.map((item) => {
                const isCurrent = page === item.page;
                const IconComp = item.icon;
                return (
                  <button
                    key={item.page}
                    type="button"
                    className={`topbar-dropdown-item${isCurrent ? " is-active" : ""}`}
                    onClick={() => {
                      navigate(item.page);
                      setMenuOpen(false);
                    }}
                  >
                    <IconComp size={15} />
                    <span>{item.label}</span>
                    {isCurrent && <Icon name="check" size={12} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Safe Mode / Paused Status Pill */}
        {(safeMode || paused) && (
          <span
            className={"topbar-status-pill" + (safeMode ? " is-safe-mode" : " is-paused")}
            title={safeMode ? "Safe Mode active" : "KeyFlow is paused"}
          >
            <span className="status-dot" />
            <span>{safeMode ? "Safe Mode" : "Paused"}</span>
          </span>
        )}

        {/* Brand / Logo Pill with Right-Click Window Context Menu */}
        <div
          className="topbar-logo-pill no-drag-region"
          title="Right-click for Window Size & Lock options"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenuPos({ x: e.clientX, y: e.clientY });
          }}
        >
          <img src={appIconAsset} alt="KeyFlow" className="topbar-logo-img" draggable={false} />
          <span className="topbar-logo-text">KeyFlow</span>
          {appearance.lockWindowSize && (
            <span className="topbar-logo-lock" title="Window size is locked">
              <Icon name="lock" size={10} />
            </span>
          )}
        </div>

        {/* Right-Click Context Menu for Logo Pill */}
        {contextMenuPos && (
          <div
            ref={contextMenuRef}
            className="window-size-context-menu anim-dropdown-enter"
            style={{ top: contextMenuPos.y + 6, left: Math.min(contextMenuPos.x, window.innerWidth - 250) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="context-menu-header">
              <span className="bold">KeyFlow Window</span>
            </div>
            <button
              type="button"
              className="context-menu-item"
              onClick={restoreDefaultSize}
            >
              <Icon name="arrows" size={14} />
              <span>Restore Default Size (1020 × 700)</span>
            </button>
            <button
              type="button"
              className={"context-menu-item" + (appearance.lockWindowSize ? " is-active" : "")}
              onClick={toggleLock}
            >
              <Icon name="lock" size={14} />
              <span>{appearance.lockWindowSize ? "✓ Lock Window Size (Locked)" : "Lock Window Size"}</span>
            </button>
            <div className="context-menu-divider" />
            <button
              type="button"
              className="context-menu-item"
              onClick={() => {
                navigate("settings", "appearance");
                setContextMenuPos(null);
              }}
            >
              <Icon name="gear" size={14} />
              <span>Appearance Settings…</span>
            </button>
          </div>
        )}

        {page !== "create" && (
          <button
            type="button"
            className="btn btn-primary btn-sm hide-mobile topbar-quick-create"
            onClick={() => {
              useStore.getState().setEditing(null);
              navigate("create");
            }}
          >
            <Icon name="create" size={14} />
            <span>New Shortcut</span>
          </button>
        )}
      </div>
    </header>
  );
}
