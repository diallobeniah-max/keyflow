import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface AppBehaviorPageProps {
  onBack?: () => void;
}

export const AppBehaviorPage: FC<AppBehaviorPageProps> = ({ onBack }) => {
  const data = useStore((s) => s.data);
  const settings = data.settings;
  const patch = useStore((s) => s.patchSettings);
  const profiles = data.profiles;

  const gen = settings.general as any;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="App Behavior"
        description="Configure desktop startup behaviors, window minimization, and system tray integration."
        onBack={onBack}
      />

      <SettingsGroup
        title="Startup & Window Behavior"
        icon="settings"
        desc="Control how KeyFlow starts and responds when minimized or closed"
        accentColor="blue"
      >
        <SettingsRow
          id="row-gen-startup"
          title="Launch on Windows startup"
          desc="Start KeyFlow automatically when you log in to Windows"
        >
          <Toggle
            label="Launch on Windows startup"
            checked={settings.general.launchOnStartup}
            onChange={(v) => patch("general", { launchOnStartup: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-gen-minimized"
          title="Start minimized"
          desc="Open KeyFlow hidden in the background on launch"
        >
          <Toggle
            label="Start minimized"
            checked={settings.general.startMinimized}
            onChange={(v) => patch("general", { startMinimized: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-gen-tray"
          title="Minimize to system tray"
          desc="Keep running in the notification area when the window is minimized"
        >
          <Toggle
            label="Minimize to system tray"
            checked={settings.general.minimizeToTray}
            onChange={(v) => patch("general", { minimizeToTray: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-gen-close-tray"
          title="Close to system tray"
          desc="Keep running in the background when the main window is closed"
        >
          <Toggle
            label="Close to system tray"
            checked={gen.closeToTray ?? true}
            onChange={(v) => patch("general" as any, { closeToTray: v } as any)}
          />
        </SettingsRow>

        <SettingsRow
          id="row-gen-show-tray"
          title="Show system tray icon"
          desc="Display the KeyFlow icon and quick menu in the Windows notification area"
        >
          <Toggle
            label="Show system tray icon"
            checked={gen.showTrayIcon ?? true}
            onChange={(v) => patch("general" as any, { showTrayIcon: v } as any)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Workspace Profile"
        icon="folder"
        desc="Fallback profile used across applications"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-gen-profile"
          title="Default workspace profile"
          desc="Profile activated when no specific application rule matches"
        >
          <div className="w-200">
            <AppSelect
              value={settings.general.defaultProfileId}
              onChange={(v) => patch("general", { defaultProfileId: v })}
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
