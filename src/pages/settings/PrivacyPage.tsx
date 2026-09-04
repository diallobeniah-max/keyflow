import { useState, type FC } from "react";
import { useStore } from "../../store/useStore";
import { Button, Input, SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface PrivacyPageProps {
  onBack?: () => void;
}

export const PrivacyPage: FC<PrivacyPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);
  const safeMode = useStore((s) => s.safeMode);
  const setSafe = useStore((s) => s.setSafeMode);
  const clearRecent = useStore((s) => s.clearRecent);

  const [newAppInput, setNewAppInput] = useState("");

  const blacklistedApps = settings.privacy.blacklistedApps || [];

  const addBlacklistedApp = () => {
    const trimmed = newAppInput.trim();
    if (!trimmed) return;
    const clean = trimmed.replace(/\.exe$/i, "");
    if (!blacklistedApps.includes(clean)) {
      patch("privacy", { blacklistedApps: [...blacklistedApps, clean] });
    }
    setNewAppInput("");
  };

  const removeBlacklistedApp = (app: string) => {
    patch("privacy", {
      blacklistedApps: blacklistedApps.filter((a) => a !== app),
    });
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Privacy & Safety"
        description="Configure credential input privacy, emergency safety combinations, and excluded desktop applications."
        onBack={onBack}
        badge={safeMode ? "Safe Mode Active" : undefined}
      />

      <SettingsGroup
        title="Input Privacy"
        icon="shield"
        desc="Credential detection and executed action logging"
        accentColor="green"
      >
        <SettingsRow
          id="row-priv-password"
          title="Pause in password fields"
          desc="Attempt to suspend shortcut hooks when entering sensitive credentials"
        >
          <Toggle
            label="Pause in password"
            checked={settings.privacy.pauseInPassword}
            onChange={(v) => patch("privacy", { pauseInPassword: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-priv-history"
          title="Action history"
          desc="Clear recorded list of recently executed shortcut actions"
        >
          <Button variant="secondary" size="sm" onClick={clearRecent}>
            Clear History
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Emergency Controls"
        icon="shortcuts"
        desc="System-wide combinations to instantly disarm or restore keyboard hooks"
        accentColor="rose"
      >
        <SettingsRow
          id="row-sc-pause"
          title="Global pause shortcut"
          desc="System-wide shortcut to instantly pause and resume all shortcut matching"
        >
          <div className="w-180">
            <Input
              value={settings.shortcuts.globalPause}
              onChange={(e) => patch("shortcuts", { globalPause: e.target.value })}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-sc-emergency"
          title="Emergency Safe Mode shortcut"
          desc="System-wide combination to immediately disconnect low-level hooks"
        >
          <div className="w-180">
            <Input
              value={settings.shortcuts.emergencySafe}
              onChange={(e) => patch("shortcuts", { emergencySafe: e.target.value })}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-priv-safe"
          title="Emergency Safe Mode"
          desc={
            safeMode
              ? "Hooks disconnected: all KeyFlow automation is currently halted"
              : "Immediately disable all shortcut hooks system-wide without closing the app"
          }
        >
          <Toggle
            label="Emergency Safe Mode"
            checked={safeMode}
            onChange={setSafe}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Excluded Applications"
        icon="terminal"
        desc="Process names where KeyFlow shortcuts are completely ignored"
        accentColor="slate"
      >
        <div className="p-sm col gap-sm">
          <div className="row gap-sm items-center">
            <div className="w-260">
              <Input
                placeholder="e.g. Photoshop, Game, VirtualBox"
                value={newAppInput}
                onChange={(e) => setNewAppInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addBlacklistedApp();
                  }
                }}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!newAppInput.trim()}
              onClick={addBlacklistedApp}
            >
              Add App
            </Button>
          </div>

          <div className="row gap-xs wrap mt-xs">
            {blacklistedApps.length === 0 ? (
              <span className="tiny muted">No excluded applications configured.</span>
            ) : (
              blacklistedApps.map((app) => (
                <span key={app} className="chip chip-subtle">
                  <span>{app}</span>
                  <button
                    type="button"
                    className="wasd-cursor-chip-del"
                    title={`Remove ${app}`}
                    onClick={() => removeBlacklistedApp(app)}
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      </SettingsGroup>
    </div>
  );
};
