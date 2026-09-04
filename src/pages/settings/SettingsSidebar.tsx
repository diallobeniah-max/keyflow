import type { FC } from "react";
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
}

export const SettingsSidebar: FC<SettingsSidebarProps> = ({
  activeSection,
  onSelectSection,
  isColorCoded = true,
  settingsWidth = "large",
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const data = useStore((s) => s.data);

  return (
    <nav
      className={`settings-nav is-width-${settingsWidth} ${isColorCoded ? "is-color-coded" : ""} ${
        isCollapsed ? "is-collapsed" : ""
      }`}
      aria-label="Settings categories"
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
