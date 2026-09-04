import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { Button, Select, SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface CommandPalettePageProps {
  onBack?: () => void;
}

export const CommandPalettePage: FC<CommandPalettePageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent("keyflow:open-command-palette"));
  };

  const isEnabled = settings.shortcuts.commandPaletteEnabled !== false;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Command Palette"
        description="Configure the fast search overlay (Ctrl+K) for navigation, commands, and settings toggles."
        onBack={onBack}
      />

      <SettingsGroup
        title="General"
        icon="search"
        desc="Master activation switch and shortcut"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-cp-enable"
          title="Enable Command Palette"
          desc="Global in-app searchable registry accessible anywhere in KeyFlow"
        >
          <Toggle
            label="Enable Command Palette"
            checked={isEnabled}
            onChange={(v) => patch("shortcuts", { commandPaletteEnabled: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-cp-shortcut"
          title="Activation shortcut"
          desc="Keyboard shortcut used to open and toggle the command palette"
        >
          <div className="w-220">
            <Select
              value={settings.shortcuts.commandPaletteShortcut || "Ctrl+K"}
              onChange={(v: string) => patch("shortcuts", { commandPaletteShortcut: v })}
              options={[
                { value: "Ctrl+K", label: "Ctrl + K (Default)" },
                { value: "Ctrl+P", label: "Ctrl + P (Quick Open)" },
                { value: "Ctrl+Space", label: "Ctrl + Space" },
                { value: "Alt+Space", label: "Alt + Space (Spotlight style)" },
                { value: "Ctrl+Shift+P", label: "Ctrl + Shift + P (VS Code style)" },
                { value: "F1", label: "F1" },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        <SettingsGroup
          title="Presentation"
          icon="monitor"
          desc="Window presentation mode and screen layout"
          accentColor="blue"
        >
          <SettingsRow
            id="row-cp-window-mode"
            title="Window presentation mode"
            desc="Choose your preferred layout mode when opening KeyFlow Command Palette"
            layout="stack"
          >
            <div className="window-mode-cards" role="radiogroup" aria-label="Command palette window mode">
              <div
                className={
                  "window-mode-card" +
                  ((settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "compact" ? " is-active" : "")
                }
                onClick={() => patch("shortcuts", { commandPaletteWindowMode: "compact" })}
                role="radio"
                aria-checked={(settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "compact"}
                tabIndex={0}
              >
                <div className="window-mode-preview">
                  <div className="window-mode-preview-bar">
                    <div className="window-mode-preview-dot" />
                  </div>
                </div>
                <span className="window-mode-card-label">Compact</span>
              </div>

              <div
                className={
                  "window-mode-card" +
                  ((settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "expanded" ? " is-active" : "")
                }
                onClick={() => patch("shortcuts", { commandPaletteWindowMode: "expanded" })}
                role="radio"
                aria-checked={(settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "expanded"}
                tabIndex={0}
              >
                <div className="window-mode-preview">
                  <div className="window-mode-preview-win">
                    <div className="window-mode-preview-win-head">
                      <div className="window-mode-preview-dot" />
                    </div>
                    <div className="window-mode-preview-win-row accent" />
                    <div className="window-mode-preview-win-row" />
                  </div>
                </div>
                <span className="window-mode-card-label">Expanded</span>
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-cp-position"
            title="Screen position"
            desc="Choose where the command palette opens on your display"
          >
            <div className="w-220">
              <Select
                value={settings.shortcuts.commandPalettePosition ?? "center"}
                onChange={(v: string) => patch("shortcuts", { commandPalettePosition: v as any })}
                options={[
                  { value: "center", label: "Center (Default)" },
                  { value: "top", label: "Top (Classic)" },
                ]}
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Results"
          icon="search"
          desc="Search listing density and metadata tags"
          accentColor="indigo"
        >
          <SettingsRow
            id="row-cp-max-results"
            title="Maximum search results"
            desc={`Display up to ${settings.shortcuts.commandPaletteMaxResults ?? 8} matching commands in the list`}
          >
            <div className="w-240">
              <Slider
                min={4}
                max={20}
                step={1}
                value={settings.shortcuts.commandPaletteMaxResults ?? 8}
                onChange={(v: number) => patch("shortcuts", { commandPaletteMaxResults: v })}
                showValue
                formatValue={(v) => `${v} items`}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-cp-categories"
            title="Show category tags"
            desc="Display category badges (Navigation, Shortcuts, Settings, etc.) next to results"
          >
            <Toggle
              label="Show category tags"
              checked={settings.shortcuts.commandPaletteShowCategories !== false}
              onChange={(v) => patch("shortcuts", { commandPaletteShowCategories: v })}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Details"
          icon="eye"
          desc="Side inspector panel with quick setting controls"
          accentColor="purple"
        >
          <SettingsRow
            id="row-cp-side-view"
            title="Enable details panel (Ctrl+Enter)"
            desc="Allow opening the side inspector panel with keyboard shortcut Ctrl+Enter"
          >
            <Toggle
              label="Enable details panel"
              checked={settings.shortcuts.commandPaletteSideViewEnabled !== false}
              onChange={(v) => patch("shortcuts", { commandPaletteSideViewEnabled: v })}
            />
          </SettingsRow>

          <SettingsRow
            id="row-cp-detail-level"
            title="Details panel depth"
            desc="Choose between full interactive setting controls or compact overview metadata"
          >
            <div className="w-220">
              <Select
                value={settings.shortcuts.commandPaletteDetailLevel || "detailed"}
                onChange={(v: string) => patch("shortcuts", { commandPaletteDetailLevel: v as any })}
                options={[
                  { value: "detailed", label: "Detailed (With controls)" },
                  { value: "compact", label: "Compact (Simple overview)" },
                ]}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-cp-default-show-more"
            title="Always show details panel"
            desc="Automatically open the side inspector view whenever the palette opens"
          >
            <Toggle
              label="Always show details"
              checked={settings.shortcuts.commandPaletteDefaultShowMore ?? false}
              onChange={(v) => patch("shortcuts", { commandPaletteDefaultShowMore: v })}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Test"
          icon="zap"
          desc="Verify activation shortcut and search indexing"
          accentColor="amber"
        >
          <SettingsRow
            id="row-cp-test"
            title="Test Command Palette"
            desc="Open the command palette now to test your configured shortcut and results"
          >
            <Button variant="secondary" size="sm" icon="search" onClick={openPalette}>
              Open Palette ({settings.shortcuts.commandPaletteShortcut || "Ctrl+K"})
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
