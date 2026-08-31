import { useState, useRef, useEffect } from "react";
import {
  Books,
  Desktop,
  GearSix,
  Keyboard,
  MagnifyingGlass,
  NoteBlank,
  Pause,
  Play,
  Plus,
  SquaresFour,
  UsersThree,
  CheckCircle,
  Lightning,
  Sparkle,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { useStore } from "../store/useStore";
import { AppPage } from "../types";

interface NavItem {
  page: AppPage;
  label: string;
  icon: PhosphorIcon;
  badge?: number;
}

type HoveredTarget = AppPage | "pause" | "search" | null;

export function FloatingBottomDock() {
  const page = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const togglePaused = useStore((s) => s.togglePaused);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const profiles = useStore((s) => s.data.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  const appearance = useStore((s) => s.data.settings.appearance);

  const [hovered, setHovered] = useState<HoveredTarget>(null);
  const [previewPos, setPreviewPos] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const activeShortcuts = shortcuts.filter((s) => s.profileId === activeProfileId && s.enabled);
  const activeShortcutsCount = activeShortcuts.length;

  const NAV_ITEMS: NavItem[] = [
    { page: "dashboard", label: "Overview", icon: SquaresFour },
    { page: "shortcuts", label: "Shortcuts", icon: Keyboard, badge: activeShortcutsCount },
    { page: "create", label: "Create", icon: Plus },
    { page: "visual", label: "Keyboard Map", icon: Desktop },
    { page: "profiles", label: "Profiles", icon: UsersThree, badge: profiles.length },
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
    if (!hovered) return null;

    if (hovered === "pause") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <span className={"status-dot" + (safeMode ? " is-safe-mode" : paused ? " is-paused" : " is-active")} />
              <span>{paused ? "Engine Paused" : "Engine Active"}</span>
            </div>
            <span className="dock-preview-badge">{paused ? "Inactive" : "Live"}</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              {paused
                ? "KeyFlow shortcut interception is paused. Normal OS keystrokes pass through."
                : "KeyFlow is actively listening for shortcuts, gestures, and hot corner triggers."}
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to {paused ? "resume engine" : "pause engine"}</span>
          </div>
        </div>
      );
    }

    if (hovered === "search") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <MagnifyingGlass size={15} weight="bold" className="dock-preview-icon" />
              <span>Command Palette</span>
            </div>
            <kbd className="topbar-search-kbd">Ctrl K</kbd>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Instant searchable registry of all shortcuts, actions, profiles, and settings.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to search commands</span>
          </div>
        </div>
      );
    }

    if (hovered === "dashboard") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <SquaresFour size={15} weight="bold" className="dock-preview-icon" />
              <span>Overview Deck</span>
            </div>
            <span className="dock-preview-badge">{activeShortcutsCount} Active</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-stat-row">
              <span className="dock-preview-stat-label">Profile:</span>
              <span className="dock-preview-stat-value">{activeProfile?.name ?? "Default"}</span>
            </div>
            <div className="dock-preview-stat-row">
              <span className="dock-preview-stat-label">Status:</span>
              <span className="dock-preview-stat-value">{safeMode ? "Safe Mode" : paused ? "Paused" : "Healthy"}</span>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to open main dashboard</span>
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
              <Keyboard size={15} weight="bold" className="dock-preview-icon" />
              <span>Shortcuts</span>
            </div>
            <span className="dock-preview-badge">{activeShortcutsCount} Total</span>
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
            <span>Click to manage all shortcuts</span>
          </div>
        </div>
      );
    }

    if (hovered === "create") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <Plus size={15} weight="bold" className="dock-preview-icon" />
              <span>Create Shortcut</span>
            </div>
            <span className="dock-preview-badge">New</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-flow">
              <div className="dock-preview-step">
                <span className="dock-preview-step-num">1</span>
                <span>Press Key / Gesture</span>
              </div>
              <div className="dock-preview-arrow">→</div>
              <div className="dock-preview-step">
                <span className="dock-preview-step-num">2</span>
                <span>Assign Action</span>
              </div>
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to open shortcut builder</span>
          </div>
        </div>
      );
    }

    if (hovered === "visual") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <Desktop size={15} weight="bold" className="dock-preview-icon" />
              <span>Keyboard Map</span>
            </div>
            <span className="dock-preview-badge">Visual</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Full physical keyboard layout showing assigned keys, hyperkey triggers, and modifiers.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to explore keyboard map</span>
          </div>
        </div>
      );
    }

    if (hovered === "profiles") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <UsersThree size={15} weight="bold" className="dock-preview-icon" />
              <span>Profiles</span>
            </div>
            <span className="dock-preview-badge">{profiles.length} Profiles</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-stat-row">
              <span className="dock-preview-stat-label">Active:</span>
              <span className="dock-preview-stat-value">{activeProfile?.name}</span>
            </div>
            <div className="dock-preview-desc">
              Context-aware workspaces that activate automatically per foreground application.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to switch & configure profiles</span>
          </div>
        </div>
      );
    }

    if (hovered === "library") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <Books size={15} weight="bold" className="dock-preview-icon" />
              <span>Action Library</span>
            </div>
            <span className="dock-preview-badge">Templates</span>
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
            <span>Click to browse action presets</span>
          </div>
        </div>
      );
    }

    if (hovered === "notes") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <NoteBlank size={15} weight="bold" className="dock-preview-icon" />
              <span>Floating Notes</span>
            </div>
            <span className="dock-preview-badge">Markdown</span>
          </div>
          <div className="dock-preview-body">
            <div className="dock-preview-desc">
              Fast floating notepad with slash commands, rich formatting, and automatic persistent saving.
            </div>
          </div>
          <div className="dock-preview-footer">
            <span>Click to configure notes preferences</span>
          </div>
        </div>
      );
    }

    if (hovered === "settings") {
      return (
        <div className="dock-preview-content">
          <div className="dock-preview-header">
            <div className="dock-preview-title">
              <GearSix size={15} weight="bold" className="dock-preview-icon" />
              <span>Settings</span>
            </div>
            <span className="dock-preview-badge">System</span>
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
            <span>Click to open preferences</span>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={containerRef}
      className="floating-bottom-dock-container"
      role="navigation"
      aria-label="Bottom Dock Navigation"
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating Apple-style Hover Preview Card */}
      {hovered && previewPos !== null && (
        <div
          className="floating-dock-preview"
          style={{ "--preview-center": `${previewPos}px` } as React.CSSProperties}
          role="tooltip"
          aria-hidden="true"
        >
          {renderPreviewContent()}
          <div className="dock-preview-caret" />
        </div>
      )}

      {/* Left Circular Action: Engine Pause/Play */}
      <button
        type="button"
        className={`floating-dock-circle-btn${paused ? " is-paused" : ""}`}
        onClick={togglePaused}
        onMouseEnter={(e) => handleMouseEnter("pause", e.currentTarget)}
        title={paused ? "KeyFlow is paused. Click to resume engine." : "KeyFlow is actively listening. Click to pause engine."}
        aria-label={paused ? "Resume engine" : "Pause engine"}
      >
        {paused ? (
          <Play size={18} weight="fill" />
        ) : (
          <Pause size={18} weight="fill" />
        )}
      </button>

      {/* Center Segmented Pill Capsule (Apple Photos / Dynamic Island Style) */}
      <div className="floating-dock-pill" role="tablist">
        {NAV_ITEMS.map((item) => {
          const IconComponent = item.icon;
          const isActive = page === item.page;
          return (
            <button
              key={item.page}
              type="button"
              className={`floating-dock-tab${isActive ? " is-active" : ""}`}
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
              {typeof item.badge === "number" && item.badge > 0 && (
                <span className="floating-dock-badge">{item.badge}</span>
              )}
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
        title="Search commands and settings (Ctrl+K)"
        aria-label="Search commands"
      >
        <MagnifyingGlass size={18} weight="bold" />
      </button>
    </div>
  );
}
