import type { FC, CSSProperties } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { HIGHLIGHT_PRESETS } from "../../lib/constants";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface AlwaysOnTopPageProps {
  onBack?: () => void;
}

export const AlwaysOnTopPage: FC<AlwaysOnTopPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const wc = settings.windowControl;
  const highlightEnabled = wc?.highlightPinned ?? true;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Always on Top"
        description="Pin any active desktop window above all others with custom DWM visual borders and audio feedback."
        onBack={onBack}
      />

      <SettingsGroup
        title="Shortcut & Pin Mode"
        icon="pinTop"
        desc="Action behavior when triggering topmost pinning"
        accentColor="purple"
      >
        <SettingsRow
          id="row-top-mode"
          title="Default pin mode"
          desc="Default action behavior when pinning window"
        >
          <div className="w-180">
            <AppSelect
              value={wc?.defaultTopmostMode ?? "toggle"}
              onChange={(v) => patch("windowControl" as any, { defaultTopmostMode: v } as any)}
              options={[
                { value: "toggle", label: "Toggle topmost" },
                { value: "pin", label: "Always pin" },
                { value: "unpin", label: "Always unpin" },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Appearance & Border"
        icon="monitor"
        desc="Visual DWM accent border around currently pinned windows"
        accentColor="blue"
      >
        <SettingsRow
          id="row-top-highlight"
          title="Highlight pinned window border"
          desc="Apply a colored DWM accent border around pinned windows"
        >
          <Toggle
            label="Highlight border"
            checked={highlightEnabled}
            onChange={(v) => patch("windowControl" as any, { highlightPinned: v } as any)}
          />
        </SettingsRow>

        <div className={highlightEnabled ? "" : "settings-progressive-disabled"}>
          <SettingsRow
            id="row-top-color"
            layout="stack"
            title="Pinned window highlight color"
            desc="Visual border highlight accent color"
          >
            <div className="row gap-xs wrap items-center">
              {HIGHLIGHT_PRESETS.map((preset) => {
                const isSelected = (wc?.highlightColor ?? "#4F7CFF") === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    disabled={!highlightEnabled}
                    className={"chip clickable" + (isSelected ? " chip-accent" : " chip-subtle")}
                    onClick={() => patch("windowControl" as any, { highlightColor: preset.value } as any)}
                  >
                    <span
                      className="color-dot-sm"
                      style={{ "--swatch-color": preset.value } as CSSProperties}
                    />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-top-border-width"
            title="Highlight border width"
            desc="Border outline thickness in pixels"
          >
            <div className="w-200">
              <Slider
                min={1}
                max={8}
                step={1}
                value={(wc as any)?.borderWidth ?? 3}
                disabled={!highlightEnabled}
                onChange={(v) => patch("windowControl" as any, { borderWidth: v } as any)}
                showValue
                formatValue={(v) => `${v}px`}
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Feedback"
        icon="bell"
        desc="Audible chime tones when pinning state changes"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-top-sound"
          title="Sound feedback"
          desc="Play KeyFlow custom audio tones when pinning or unpinning"
        >
          <Toggle
            label="Sound feedback"
            checked={wc?.soundFeedback ?? true}
            onChange={(v) => patch("windowControl" as any, { soundFeedback: v } as any)}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Restore Behavior"
        icon="sync"
        desc="State persistence across app or window sessions"
        accentColor="slate"
      >
        <SettingsRow
          id="row-top-restore"
          title="Restore pinned state on restart"
          desc="Remember previously pinned windows when KeyFlow launches"
        >
          <Toggle
            label="Restore pinned state"
            checked={(wc as any)?.restoreOnRestart ?? false}
            onChange={(v) => patch("windowControl" as any, { restoreOnRestart: v } as any)}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
