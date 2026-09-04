import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface NotificationsPageProps {
  onBack?: () => void;
}

export const NotificationsPage: FC<NotificationsPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Notifications"
        description="Configure desktop notification toasts and audible feedback when automations execute."
        onBack={onBack}
      />

      <SettingsGroup
        title="Alerts & Toasts"
        icon="bell"
        desc="Visual notifications on your Windows desktop"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-gen-notifications"
          title="Desktop notifications"
          desc="Show native Windows toast notifications when shortcuts and actions execute"
        >
          <Toggle
            label="Desktop notifications"
            checked={settings.general.showNotifications !== false}
            onChange={(v) => patch("general", { showNotifications: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-gen-sound"
          title="Notification sounds"
          desc="Play audio chimes when KeyFlow notifications and actions execute"
        >
          <Toggle
            label="Notification sounds"
            checked={settings.general.soundFeedback ?? true}
            onChange={(v) => patch("general", { soundFeedback: v })}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
