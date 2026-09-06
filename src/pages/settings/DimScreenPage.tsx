import { useEffect, useState, type FC } from "react";
import { useStore } from "../../store/useStore";
import { Select, SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { DimScreenApplyTo, DimScreenSettings } from "../../types";

interface DimScreenPageProps {
  onBack?: () => void;
}

interface DisplayItem {
  id: number;
  label: string;
  isPrimary: boolean;
  hasHardwareBrightness: boolean;
}

export const DimScreenPage: FC<DimScreenPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const ds = settings.dimScreen;
  const isEnabled = ds?.enabled ?? false;

  const [displays, setDisplays] = useState<DisplayItem[]>([]);

  // Load connected display information from Electron
  useEffect(() => {
    let mounted = true;
    if (window.electronAPI?.dimScreen?.listDisplays) {
      window.electronAPI.dimScreen.listDisplays().then((list) => {
        if (mounted) {
          setDisplays(list);
        }
      }).catch(() => {});
    }

    // Subscribe to state updates from actions/hotkeys
    const unsubscribe = window.electronAPI?.dimScreen?.onStateChanged?.((state) => {
      if (mounted) {
        patch("dimScreen" as any, state as any);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [patch]);

  const updateSetting = (partial: Partial<DimScreenSettings>) => {
    const updated: DimScreenSettings = {
      enabled: ds?.enabled ?? false,
      level: ds?.level ?? 30,
      extraDimEnabled: ds?.extraDimEnabled ?? false,
      extraDimStrength: ds?.extraDimStrength ?? 40,
      applyTo: ds?.applyTo ?? "all",
      selectedDisplayIds: ds?.selectedDisplayIds ?? [],
      startEnabled: ds?.startEnabled ?? false,
      rememberLevel: ds?.rememberLevel ?? true,
      ...partial,
    };
    patch("dimScreen" as any, updated as any);
    window.electronAPI?.dimScreen?.update?.(updated).catch(() => {});
  };

  const handleToggleDisplay = (id: number) => {
    const current = ds?.selectedDisplayIds ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    updateSetting({ selectedDisplayIds: next });
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Dim Screen"
        description="Universal display dimming that works across all apps, laptops in dedicated GPU mode, and multi-monitor setups with zero Alt+Tab flashing."
        onBack={onBack}
        badge={isEnabled ? "Active" : undefined}
      />

      {/* MASTER STATUS GROUP */}
      <SettingsGroup
        title="Status & Dimming Engine"
        icon="moon"
        desc="Master activation and system-wide display dimming status"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-dim-enable"
          title="Enable Dim Screen"
          desc="Dim displays continuously with zero flashing during app switching or Alt+Tab"
        >
          <Toggle
            label="Enable Dim Screen"
            checked={isEnabled}
            onChange={(v) => updateSetting({ enabled: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-dim-hardware-status"
          title="Dimming engine"
          desc="Hardware-accelerated overlay + physical backlight sync (fully compatible with dedicated GPU mode, laptop screens, and external monitors)"
        >
          <div className="row items-center gap-xs">
            <span className="chip chip-accent">
              Universal GPU Overlay Active
            </span>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* PROGRESSIVE CONTROLS */}
      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        {/* BRIGHTNESS / DIM LEVEL */}
        <SettingsGroup
          title="Dim Level"
          icon="sun"
          desc="Adjust target screen darkness"
          accentColor="amber"
        >
          <SettingsRow
            id="row-dim-level"
            title="Screen dim level"
            desc="System-wide darkness level (0% is clear / full bright, 100% is deepest dark; works in both integrated and dedicated GPU modes)"
          >
            <div
              className="w-260"
              onWheel={(e) => {
                if (!isEnabled) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 5 : -5;
                const next = Math.max(0, Math.min(100, (ds?.level ?? 30) + delta));
                updateSetting({ level: next });
              }}
              title="Drag slider or scroll mouse wheel to adjust"
            >
              <Slider
                min={0}
                max={100}
                step={1}
                value={ds?.level ?? 30}
                disabled={!isEnabled}
                onChange={(v) => updateSetting({ level: v })}
                showValue
                formatValue={(v) => (v === 0 ? "0% (Clear)" : `${v}% dim`)}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* EXTRA DIM */}
        <SettingsGroup
          title="Extra Dim (Below Hardware Minimum)"
          icon="sparkles"
          desc="Deep night mode using persistent transparent dark overlays"
          accentColor="purple"
        >
          <SettingsRow
            id="row-dim-extra-enable"
            title="Enable Extra Dim"
            desc="Dim beyond normal minimum brightness using an additional soft dark layer"
          >
            <Toggle
              label="Enable Extra Dim"
              checked={ds?.extraDimEnabled ?? false}
              disabled={!isEnabled}
              onChange={(v) => updateSetting({ extraDimEnabled: v })}
            />
          </SettingsRow>

          <SettingsRow
            id="row-dim-extra-strength"
            title="Extra Dim intensity"
            desc="Additional darkness density applied on top of the main dim level"
          >
            <div
              className="w-260"
              onWheel={(e) => {
                if (!isEnabled || !ds?.extraDimEnabled) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 5 : -5;
                const next = Math.max(5, Math.min(90, (ds?.extraDimStrength ?? 40) + delta));
                updateSetting({ extraDimStrength: next });
              }}
              title="Drag slider or scroll mouse wheel to adjust"
            >
              <Slider
                min={5}
                max={90}
                step={5}
                value={ds?.extraDimStrength ?? 40}
                disabled={!isEnabled || !ds?.extraDimEnabled}
                onChange={(v) => updateSetting({ extraDimStrength: v })}
                showValue
                formatValue={(v) => `+${v}% extra`}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* TARGET DISPLAYS */}
        <SettingsGroup
          title="Monitors & Target Displays"
          icon="monitor"
          desc="Configure which screens to dim in multi-monitor setups"
          accentColor="blue"
        >
          <SettingsRow
            id="row-dim-apply-to"
            title="Target displays"
            desc="Choose which connected displays receive dimming"
          >
            <div className="w-220">
              <Select
                value={ds?.applyTo ?? "all"}
                disabled={!isEnabled}
                onChange={(v: string) => updateSetting({ applyTo: v as DimScreenApplyTo })}
                options={[
                  { value: "all", label: "All connected displays" },
                  { value: "primary", label: "Primary display only" },
                  { value: "selected", label: "Selected displays…" },
                ]}
              />
            </div>
          </SettingsRow>

          {ds?.applyTo === "selected" && displays.length > 0 && (
            <SettingsRow
              id="row-dim-selected-monitors"
              title="Select displays"
              desc="Toggle dimming for each detected monitor individually"
            >
              <div className="col gap-xs">
                {displays.map((d) => {
                  const isChecked = (ds.selectedDisplayIds ?? []).includes(d.id);
                  return (
                    <label
                      key={d.id}
                      className="row items-center gap-xs clickable small"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!isEnabled}
                        onChange={() => handleToggleDisplay(d.id)}
                      />
                      <span>{d.label}</span>
                    </label>
                  );
                })}
              </div>
            </SettingsRow>
          )}
        </SettingsGroup>

        {/* STARTUP & RESTORATION */}
        <SettingsGroup
          title="Startup & Restoration"
          icon="sync"
          desc="Baseline brightness recovery and launch options"
          accentColor="teal"
        >
          <SettingsRow
            id="row-dim-startup"
            title="Start dimmed on launch"
            desc="Automatically re-engage Dim Screen whenever KeyFlow starts"
          >
            <Toggle
              label="Start dimmed on launch"
              checked={ds?.startEnabled ?? false}
              disabled={!isEnabled}
              onChange={(v) => updateSetting({ startEnabled: v })}
            />
          </SettingsRow>

          <SettingsRow
            id="row-dim-remember-level"
            title="Remember brightness level"
            desc="Save your preferred dim percentage across application restarts"
          >
            <Toggle
              label="Remember brightness level"
              checked={ds?.rememberLevel ?? true}
              disabled={!isEnabled}
              onChange={(v) => updateSetting({ rememberLevel: v })}
            />
          </SettingsRow>
        </SettingsGroup>

        {/* SAFETY ESCAPE & ACTIONS */}
        <SettingsGroup
          title="Safety & Shortcut Control"
          icon="shield"
          desc="Instant toggle actions and emergency recovery"
          accentColor="rose"
        >
          <SettingsRow
            id="row-dim-safety-info"
            title="Emergency restore"
            desc="Disabling Dim Screen immediately removes the dark overlay and restores physical screen brightness"
          >
            <div className="small muted">
              Create a custom shortcut in <strong>Shortcuts</strong> with action <strong>Toggle Dim Screen</strong> or <strong>Dim Screen Control</strong> for instantaneous hotkey control anywhere in Windows.
            </div>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
