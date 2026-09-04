import { useState, useRef, useEffect } from "react";
import {
  SquaresFour,
  Keyboard,
  Desktop,
  Plus,
  UsersThree,
  Books,
  NoteBlank,
  GearSix,
  MagnifyingGlass,
  ArrowRight,
  CheckCircle,
  Lightning,
  Sparkle,
  Pause,
  Play,
  type Icon,
} from "@phosphor-icons/react";
import { useStore } from "../store/useStore";
import type { AppPage } from "../types";

interface NavItem {
  page: AppPage;
  label: string;
  icon: Icon;
}

type HoveredTarget = AppPage | "pause" | "search" | null;

export function FloatingBottomDock() {
  const page = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const paused = useStore((s) => s.paused);
  const togglePaused = useStore((s) => s.togglePaused);
  const safeMode = useStore((s) => s.safeMode);
  const activeProfile = useStore((s) => s.data.profiles.find((p) => p.id === s.activeProfileId));
  const shortcuts = useStore((s) => s.data.shortcuts);
  const profiles = useStore((s) => s.data.profiles);
  const appearance = useStore((s) => s.data.settings.appearance);

  const activeShortcuts = shortcuts.filter((s) => s.enabled && s.profileId === (activeProfile?.id ?? "default"));
  const activeShortcutsCount = activeShortcuts.length;

  const [hovered, setHovered] = useState<HoveredTarget>(null);
  const [previewPos, setPreviewPos] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Center button: Create (+)
  const NAV_ITEMS: NavItem[] = [
    { page: "dashboard", label: "Overview", icon: SquaresFour },
    { page: "shortcuts", label: "Shortcuts", icon: Keyboard },
    { page: "visual", label: "Keyboard Map", icon: Desktop },
    { page: "create", label: "Create", icon: Plus },
    { page: "profiles", label: "Profiles", icon: UsersThree },
    { page: "library", label: "Library", icon: Books },
    { page: "notes", label: "Notes", icon: NoteBlank },
    { page: "settings", label: "Settings", icon: GearSix },
  ];

  const handleMouseEnter = (target: HoveredTarget, el: HTMLElement) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const centerRelative = elRect.left + elRect.width / 2 - containerRect.left;
      setPreviewPos(centerRelative);
    }
    setHovered(target);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHovered(null);
      setPreviewPos(null);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current !== null) {
        window.clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const renderPreviewContent = () => {
    if (hovered === "pause") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <span className={"status-dot" + (safeMode ? " is-safe-mode" : paused ? " is-paused" : " is-active")} />
              <span>{paused ? "Engine Paused" : "Engine Active"}</span>
            </div>
            <span className="dock-preview-pill-sub">{safeMode ? "Safe Mode" : paused ? "Interception off" : "Healthy"}</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              {paused
                ? "KeyFlow shortcut interception is paused. Normal OS keystrokes pass through cleanly."
                : "KeyFlow is actively matching shortcuts, gestures, and hot corner triggers."}
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">{paused ? "Resume Engine" : "Pause Engine"}</span>
            <span className="dock-preview-footer-kbd">Click</span>
          </div>
        </div>
      );
    }

    if (hovered === "search") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <MagnifyingGlass size={15} weight="bold" />
              </div>
              <span>Command Palette</span>
            </div>
            <span className="dock-preview-pill-sub">Registry</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Instant searchable registry of all shortcuts, actions, profiles, and settings.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Search Commands</span>
            <span className="dock-preview-footer-kbd">Ctrl+K</span>
          </div>
        </div>
      );
    }

    if (hovered === "dashboard") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <SquaresFour size={15} weight="bold" />
              </div>
              <span>Overview Deck</span>
            </div>
            <span className="dock-preview-pill-sub">{activeProfile?.name ?? "Default"}</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-stat-grid">
              <div className="dock-preview-stat-card">
                <span className="dock-preview-stat-num">{activeShortcutsCount}</span>
                <span className="dock-preview-stat-label">Active Shortcuts</span>
              </div>
              <div className="dock-preview-stat-card">
                <span className="dock-preview-stat-num">{profiles.length}</span>
                <span className="dock-preview-stat-label">Profiles</span>
              </div>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Open Overview Deck</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "shortcuts") {
      const sample = activeShortcuts.slice(0, 3);
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <Keyboard size={15} weight="bold" />
              </div>
              <span>Shortcuts</span>
            </div>
            <span className="dock-preview-pill-sub">{activeShortcutsCount} Active</span>
          </div>
          <div className="dock-preview-body">
            {sample.length > 0 ? (
              <div className="dock-preview-list">
                {sample.map((s) => (
                  <div key={s.id} className="dock-preview-list-item">
                    <span className="dock-preview-keycap">{s.key}</span>
                    <span className="dock-preview-item-text">{s.name || "Shortcut"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dock-preview-desc">No active shortcuts in this profile.</div>
            )}
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Manage Shortcuts</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "create") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box is-accent">
                <Plus size={15} weight="bold" />
              </div>
              <span>Create Shortcut</span>
            </div>
            <span className="dock-preview-pill-sub">Quick Builder</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-pipeline">
              <div className="dock-preview-pipeline-chip">
                <span className="dock-preview-pipeline-num">1</span>
                <span className="dock-preview-pipeline-text">Press Trigger</span>
              </div>
              <span className="dock-preview-pipeline-arrow">→</span>
              <div className="dock-preview-pipeline-chip">
                <span className="dock-preview-pipeline-num">2</span>
                <span className="dock-preview-pipeline-text">Assign Action</span>
              </div>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Open Shortcut Builder</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "visual") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <Desktop size={15} weight="bold" />
              </div>
              <span>Keyboard Map</span>
            </div>
            <span className="dock-preview-pill-sub">Interactive</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Full physical keyboard layout showing assigned keys, hyperkey triggers, and modifiers.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">View Keyboard Map</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "profiles") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <UsersThree size={15} weight="bold" />
              </div>
              <span>Profiles</span>
            </div>
            <span className="dock-preview-pill-sub">{activeProfile?.name || "Default"}</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Context-aware workspaces that activate automatically per foreground application.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Switch & Configure</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "library") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <Books size={15} weight="bold" />
              </div>
              <span>Action Library</span>
            </div>
            <span className="dock-preview-pill-sub">Presets</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-tags">
              <span className="dock-preview-tag">App Launch</span>
              <span className="dock-preview-tag">Web URL</span>
              <span className="dock-preview-tag">Audio</span>
              <span className="dock-preview-tag">Snippets</span>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Browse Preset Library</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "notes") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <NoteBlank size={15} weight="bold" />
              </div>
              <span>Floating Notes</span>
            </div>
            <span className="dock-preview-pill-sub">Markdown</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Fast floating notepad with slash commands, rich formatting, and automatic persistent saving.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Open Notes Window</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    if (hovered === "settings") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <div className="dock-preview-icon-box">
                <GearSix size={15} weight="bold" />
              </div>
              <span>Settings</span>
            </div>
            <span className="dock-preview-pill-sub">Preferences</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-tags">
              <span className="dock-preview-tag">Appearance</span>
              <span className="dock-preview-tag">WASD</span>
              <span className="dock-preview-tag">Hot Corners</span>
              <span className="dock-preview-tag">Backups</span>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span className="dock-preview-footer-action">Open Preferences</span>
            <span className="dock-preview-footer-kbd">↵</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const isHidden = appearance?.navigationLayout !== "horizontal";

  return (
    <>
      <div className={`floating-bottom-dock-scrim${isHidden ? " is-layout-hidden" : ""}`} aria-hidden="true" />
      <div
        ref={containerRef}
        className={`floating-bottom-dock-container${isHidden ? " is-layout-hidden" : ""}`}
        role="navigation"
        aria-label="Bottom Dock Navigation"
        aria-hidden={isHidden}
        onMouseLeave={handleMouseLeave}
      >
        {/* Hover Apple Preview Card with dynamic horizontal positioning */}
        {hovered && previewPos !== null && (
          <aside
            className="floating-dock-preview"
            style={{ "--preview-center": `${previewPos}px` } as React.CSSProperties}
            aria-live="polite"
          >
            {renderPreviewContent()}
            <div className="dock-preview-caret" aria-hidden="true" />
          </aside>
        )}

        {/* Left Circular Action: Global Engine Pause / Play */}
        <button
          type="button"
          className={"floating-dock-circle-btn dock-pause-play-btn" + (paused ? " is-paused" : " is-running")}
          onMouseEnter={(e) => handleMouseEnter("pause", e.currentTarget)}
          onClick={togglePaused}
          title={paused ? "Resume KeyFlow engine (Play)" : "Pause KeyFlow engine (Pause)"}
          aria-label={paused ? "Resume KeyFlow engine" : "Pause KeyFlow engine"}
        >
          {paused ? (
            <Play size={18} weight="fill" className="dock-play-icon" />
          ) : (
            <Pause size={18} weight="bold" className="dock-pause-icon" />
          )}
        </button>

        {/* Center Segmented Pill Capsule */}
        <div className="floating-dock-pill" role="tablist">
          {NAV_ITEMS.map((item) => {
            const IconComponent = item.icon;
            const isActive = page === item.page;
            const isCreate = item.page === "create";
            return (
              <button
                key={item.page}
                type="button"
                className={`floating-dock-tab${isActive ? " is-active" : ""}${isCreate ? " is-create" : ""}`}
                role="tab"
                aria-selected={isActive}
                onMouseEnter={(e) => handleMouseEnter(item.page, e.currentTarget)}
                onClick={() => {
                  if (item.page === "create") {
                    useStore.getState().setEditing(null);
                  }
                  setPage(item.page);
                }}
                title={item.label}
                aria-label={item.label}
              >
                <IconComponent size={17} weight={isActive ? "bold" : "regular"} />
                <span className="floating-dock-tab-label">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Circular Action: Search Command Palette */}
        <button
          type="button"
          className="floating-dock-circle-btn"
          onMouseEnter={(e) => handleMouseEnter("search", e.currentTarget)}
          onClick={() => {
            window.dispatchEvent(new CustomEvent("keyflow:open-command-palette"));
            window.dispatchEvent(new CustomEvent("keyflow:toggle-command-palette"));
          }}
          title="Open Command Palette (Ctrl+K)"
          aria-label="Open Command Palette (Ctrl+K)"
        >
          <MagnifyingGlass size={16} weight="bold" />
        </button>
      </div>
    </>
  );
}
