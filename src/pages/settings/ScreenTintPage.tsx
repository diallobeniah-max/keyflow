import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { SCREEN_TINT_PRESETS, SCREEN_TINT_DEFAULT_COLOR } from "../../lib/constants";
import { Select, SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { ScreenTintPreset } from "../../types";

interface ScreenTintPageProps {
  onBack?: () => void;
}

export const ScreenTintPage: FC<ScreenTintPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const st = settings.screenTint;
  const isEnabled = st?.enabled ?? false;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Screen Tint"
        description="Hardware-accelerated warmth overlay across all connected displays for late-night eye comfort."
        onBack={onBack}
        badge={isEnabled ? "Active" : undefined}
      />

      <SettingsGroup
        title="Status"
        icon="sun"
        desc="Master blue-light filter activation"
        accentColor="amber"
      >
        <SettingsRow
          id="row-tint-enable"
          title="Enable Screen Tint"
          desc="Display a fullscreen warm color wash over all monitors"
        >
          <Toggle
            label="Enable Screen Tint"
            checked={isEnabled}
            onChange={(v) => {
              const updated = { ...st, enabled: v };
              patch("screenTint" as any, updated as any);
              window.electronAPI?.screenTint?.update?.(updated as any);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        <SettingsGroup
          title="Color & Presets"
          icon="sparkles"
          desc="Warmth presets and custom color selection"
          accentColor="yellow"
        >
          <SettingsRow
            id="row-tint-presets"
            title="Tint preset"
            desc="Select a curated warmth palette"
          >
            <div className="row gap-xs wrap">
              {SCREEN_TINT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  disabled={!isEnabled}
                  className={
                    "chip clickable" +
                    (st?.preset === preset.value ? " chip-accent" : " chip-subtle")
                  }
                  onClick={() => {
                    const updated = {
                      ...st,
                      preset: preset.value as ScreenTintPreset,
                      color: preset.color,
                    };
                    patch("screenTint" as any, updated as any);
                    window.electronAPI?.screenTint?.update?.(updated as any);
                  }}
                >
                  <span className="tint-dot" data-preset={preset.value} />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-tint-color"
            title="Custom tint color"
            desc="Pick any custom hex tint color for your screen wash"
          >
            <div className="row gap-sm items-center">
              <input
                type="color"
                className="accent-swatch-custom"
                disabled={!isEnabled}
                value={st?.color || SCREEN_TINT_DEFAULT_COLOR}
                onChange={(e) => {
                  const updated = { ...st, color: e.target.value, preset: "custom" as any };
                  patch("screenTint" as any, updated as any);
                  window.electronAPI?.screenTint?.update?.(updated as any);
                }}
              />
              <span className="small muted font-mono">{st?.color || SCREEN_TINT_DEFAULT_COLOR}</span>
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Intensity"
          icon="sun"
          desc="Overlay opacity and filter strength"
          accentColor="rose"
        >
          <SettingsRow
            id="row-tint-strength"
            title="Filter strength"
            desc="Adjust the opacity and intensity of the screen tint overlay"
          >
            <div className="w-260">
              <Slider
                min={5}
                max={60}
                step={1}
                value={st?.strength ?? 18}
                disabled={!isEnabled}
                onChange={(v) => {
                  const updated = { ...st, strength: v };
                  patch("screenTint" as any, updated as any);
                  window.electronAPI?.screenTint?.update?.(updated as any);
                }}
                showValue
                formatValue={(v) => `${v}%`}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Schedule"
          icon="calendar"
          desc="Automatic day and evening activation schedule"
          accentColor="indigo"
        >
          <SettingsRow
            id="row-tint-schedule"
            title="Schedule mode"
            desc="Automate screen tint activation based on time of day"
          >
            <div className="w-220">
              <Select
                value={(st as any)?.schedule || "always"}
                disabled={!isEnabled}
                onChange={(v: string) => {
                  const updated = { ...st, schedule: v };
                  patch("screenTint" as any, updated as any);
                  window.electronAPI?.screenTint?.update?.(updated as any);
                }}
                options={[
                  { value: "always", label: "Always on (Manual)" },
                  { value: "sunset", label: "Sunset to sunrise" },
                  { value: "custom", label: "Custom hours" },
                ]}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Transitions"
          icon="sync"
          desc="Smoothness when activating and deactivating"
          accentColor="blue"
        >
          <SettingsRow
            id="row-tint-transition"
            title="Transition fade duration"
            desc="Duration of the smooth fade-in and fade-out animations"
          >
            <div className="w-260">
              <Slider
                min={200}
                max={2500}
                step={100}
                value={(st as any)?.transitionMs ?? 800}
                disabled={!isEnabled}
                onChange={(v) => {
                  const updated = { ...st, transitionMs: v };
                  patch("screenTint" as any, updated as any);
                  window.electronAPI?.screenTint?.update?.(updated as any);
                }}
                showValue
                formatValue={(v) => `${v}ms`}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
