import type { FC } from "react";
import { Icon } from "../../components/Icon";

interface SettingsPageHeaderProps {
  title: string;
  description?: string;
  onBack?: () => void;
  badge?: string;
}

export const SettingsPageHeader: FC<SettingsPageHeaderProps> = ({
  title,
  description,
  onBack,
  badge,
}) => {
  return (
    <div className="settings-page-header">
      {onBack && (
        <button
          type="button"
          className="settings-back-btn"
          onClick={onBack}
          aria-label="Back to Settings overview"
        >
          <Icon name="arrowLeft" size={14} />
          <span>Settings</span>
        </button>
      )}
      <div className="settings-page-title-row">
        <h2 className="settings-page-title">{title}</h2>
        {badge && <span className="chip chip-accent">{badge}</span>}
      </div>
      {description && <p className="settings-page-desc">{description}</p>}
    </div>
  );
};
