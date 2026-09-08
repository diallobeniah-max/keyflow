import { useState, useRef, useEffect, type FC } from "react";
import { Icon } from "../../components/Icon";
import { useStore } from "../../store/useStore";
import { SETTINGS_NAV_GROUPS, type SettingsSectionId } from "./types";

interface SettingsSidebarProps {
  activeSection: SettingsSectionId;
  onSelectSection: (id: SettingsSectionId) => void;
  isColorCoded?: boolean;
  settingsWidth?: "small" | "large";
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSearch?: () => void;
}

export const SettingsSidebar: FC<SettingsSidebarProps> = ({
  activeSection,
  onSelectSection,
  isColorCoded = true,
  settingsWidth = "large",
  isCollapsed = false,
  onToggleCollapse,
  onOpenSearch,
}) => {
  const data = useStore((s) => s.data);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<number | null>(null);

  const handleScroll = () => {
    setIsScrolling(true);
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current);
    }
    scrollTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false);
      scrollTimerRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  return (
    <nav
      className={`settings-nav is-width-${settingsWidth} ${isColorCoded ? "is-color-coded" : ""} ${
        isCollapsed ? "is-collapsed" : ""
      } ${isScrolling ? "is-scrolling" : ""}`}
      aria-label="Settings categories"
      onScroll={handleScroll}
    >
      <div className="settings-nav-header">
        <button
          type="button"
          className="settings-nav-toggle-btn"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Open Navigation" : "Close Navigation"}
          aria-label={isCollapsed ? "Open Navigation" : "Close Navigation"}
          aria-expanded={!isCollapsed}
        >
          <Icon name="menu" size={16} />
          {!isCollapsed && <span className="settings-nav-toggle-text">Navigation</span>}
        </button>
      </div>

      {onOpenSearch && (
        <div className="settings-nav-search-wrap">
          <button
            type="button"
            className="settings-nav-search-btn"
            onClick={onOpenSearch}
            title="Search commands and settings (Ctrl+K)"
            aria-label="Search commands and settings"
          >
            <Icon name="search" size={14} className="settings-nav-search-icon" />
            {!isCollapsed && (
              <>
                <span className="settings-nav-search-text">Search settings…</span>
                <kbd className="settings-nav-search-kbd">Ctrl+K</kbd>
              </>
            )}
          </button>
        </div>
      )}

      {SETTINGS_NAV_GROUPS.map((group) => (
        <div key={group.id} className="settings-nav-group">
          <div className="settings-nav-group-title">{group.title}</div>
          {group.items.map((item) => {
            const isActive = activeSection === item.id;
            const summaryText = item.summary ? item.summary(data) : undefined;
            const fullTitle = item.label + (summaryText ? ` • ${summaryText}` : "");
            return (
              <button
                key={item.id}
                type="button"
                className={`settings-nav-btn ${isActive ? "active" : ""}`}
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={fullTitle}
                data-section={item.id}
              >
                <div className={`settings-nav-icon-pod is-${item.accentColor}`}>
                  <Icon name={item.icon} size={isCollapsed ? 15 : 13} />
                </div>
                <span className="settings-nav-btn-label">{item.label}</span>
                {summaryText && (
                  <span className="settings-nav-summary">{summaryText}</span>
                )}
                <span className="settings-nav-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
};
