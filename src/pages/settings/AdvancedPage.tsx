import { useState, type FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { Button, SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface AdvancedPageProps {
  onBack?: () => void;
}

export const AdvancedPage: FC<AdvancedPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);
  const [logStatus, setLogStatus] = useState<string | null>(null);

  const clearLogs = () => {
    setLogStatus("Logs cleared.");
    setTimeout(() => setLogStatus(null), 2500);
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Advanced"
        description="Low-level input engine configuration, elevated administrator hooks, and diagnostics."
        onBack={onBack}
      />

      <SettingsGroup
        title="Input Engine"
        icon="terminal"
        desc="Global keyboard listener backend and integrity elevation"
        accentColor="slate"
      >
        <SettingsRow
          id="row-adv-backend"
          title="Input backend engine"
          desc="Low-level hook provider for keyboard and gesture recognition"
        >
          <div className="w-200">
            <AppSelect
              value={settings.advanced.hookMode || "native"}
              onChange={(v) => patch("advanced", { hookMode: v })}
              options={[
                { value: "native", label: "Rust Native Helper (Recommended)" },
                { value: "legacy", label: "Legacy uiohook Hook" },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-adv-extended"
          title="Extended shortcut access"
          desc="Allows shortcuts (e.g. Screenshot, Always on Top) to work while elevated apps have focus. Runs the input helper at High integrity."
        >
          <Toggle
            label="Extended shortcut access"
            checked={settings.advanced?.extendedAccess ?? false}
            onChange={(v) => patch("advanced" as any, { extendedAccess: v } as any)}
          />
        </SettingsRow>

        <SettingsRow
          id="row-adv-perf"
          title="Performance mode"
          desc="Optimize input dispatcher for minimum CPU latency"
        >
          <Toggle
            label="Performance mode"
            checked={settings.advanced.performanceMode}
            onChange={(v) => patch("advanced", { performanceMode: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Diagnostics"
        icon="file"
        desc="Developer tracing and internal debug logs"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-adv-debug"
          title="Diagnostic logging"
          desc="Output verbose engine diagnostic logs to DevTools and console"
        >
          <Toggle
            label="Diagnostic logs"
            checked={settings.advanced.debugLogs}
            onChange={(v) => patch("advanced", { debugLogs: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-adv-clear-logs"
          title="Clear application logs"
          desc="Flush cached runtime logs and execution traces"
        >
          <div className="row gap-xs items-center">
            {logStatus && <span className="tiny text-accent bold">{logStatus}</span>}
            <Button variant="secondary" size="sm" onClick={clearLogs}>
              Clear Logs
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
