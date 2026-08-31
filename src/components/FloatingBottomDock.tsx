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

export function FloatingBottomDock() {
  const page = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const paused = useStore((s) => s.paused);
  const togglePaused = useStore((s) => s.togglePaused);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const profiles = useStore((s) => s.data.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);

  const activeShortcutsCount = shortcuts.filter((s) => s.profileId === activeProfileId && s.enabled).length;

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

  return (
    <div className="floating-bottom-dock-container" role="navigation" aria-label="Bottom Dock Navigation">
      {/* Left Circular Action: Engine Pause/Play */}
      <button
        type="button"
        className={`floating-dock-circle-btn${paused ? " is-paused" : ""}`}
        onClick={togglePaused}
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
        onClick={() => {
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
