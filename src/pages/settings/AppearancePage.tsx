import type { FC, CSSProperties } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ACCENT_PRESETS } from "../../lib/constants";
import { createDefaultSettings } from "../../lib/defaults";
import { SettingsPageHeader } from "./SettingsPageHeader";

const DEFAULT_ACCENT = createDefaultSettings().appearance.accent;

interface AppearancePageProps {
  onBack?: () => void;
}

export const AppearancePage: FC<AppearancePageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Appearance"
        description="Customize KeyFlow's theme, signature accent colors, layout architecture, window materials, and accessibility."
        onBack={onBack}
      />

      <SettingsGroup
        title="Appearance"
        icon="monitor"
        desc="Color theme, accent palettes, and top bar lighting"
        accentColor="pink"
      >
        <SettingsRow
          id="row-app-theme"
          title="Color theme"
          desc="Switch between dark and light desktop palettes"
        >
          <div className="w-180">
            <AppSelect
              value={settings.appearance.theme}
              onChange={(v) => patch("appearance", { theme: v as any })}
              options={[
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
                { value: "system", label: "System match" },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-app-accent"
          title="Accent color"
          desc="Signature highlight color used across buttons, focus rings, and key indicators"
        >
          <div className="accent-swatch-row">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={"accent-swatch" + (settings.appearance.accent === preset.value ? " is-selected" : "")}
                style={{ "--swatch-color": preset.value } as CSSProperties}
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={settings.appearance.accent === preset.value}
                onClick={() => patch("appearance", { accent: preset.value })}
              />
            ))}
            <input
              type="color"
              className="accent-swatch-custom"
              value={settings.appearance.accent ?? DEFAULT_ACCENT}
              title="Custom accent color"
              aria-label="Custom accent color"
              onChange={(e) => patch("appearance", { accent: e.target.value })}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-app-tint"
          title="Header accent tint"
          desc="Apply a fitted accent wash across the top bar header box"
        >
          <div className="w-180">
            <AppSelect
              value={settings.appearance.headerAccentTint ?? "subtle"}
              onChange={(v) => patch("appearance", { headerAccentTint: v as any })}
              options={[
                { value: "subtle", label: "Subtle (Soft wash)" },
                { value: "medium", label: "Medium (Gradient)" },
                { value: "glow", label: "Luminous Glow" },
                { value: "none", label: "None (Neutral)" },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-app-fit"
          title="Header tint fit"
          desc="Select the size and shape of the header accent box"
        >
          <div className="w-180">
            <AppSelect
              value={settings.appearance.headerAccentFit ?? "full"}
              onChange={(v) => patch("appearance", { headerAccentFit: v as any })}
              options={[
                { value: "full", label: "Full box (Expanded)" },
                { value: "compact", label: "Compact (Fitted pod)" },
                { value: "banner", label: "Top banner strip" },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Layout & Scaling"
        icon="layout"
        desc="Navigation structure, UI density, and text sizing"
        accentColor="indigo"
      >
        <div className="nav-layout-section p-sm">
          <div className="nav-layout-section-header mb-sm">
            <div className="settings-row-title">Navigation layout</div>
            <div className="settings-row-desc">
              Choose your preferred desktop navigation architecture. Live visual previews show how controls are arranged.
            </div>
          </div>

          <div className="nav-layout-grid" role="radiogroup" aria-label="Navigation layout style">
            {/* Vertical Sidebar Card */}
            <button
              type="button"
              className={`nav-layout-card${(settings.appearance.navigationLayout ?? "sidebar") === "sidebar" ? " is-selected" : ""}`}
              role="radio"
              aria-checked={(settings.appearance.navigationLayout ?? "sidebar") === "sidebar"}
              aria-label="Vertical Sidebar layout"
              onClick={() => patch("appearance", { navigationLayout: "sidebar" })}
            >
              {(settings.appearance.navigationLayout ?? "sidebar") === "sidebar" && (
                <div className="nav-layout-badge">
                  <Icon name="check" size={12} />
                </div>
              )}

              <div className="nav-wireframe-stage">
                <div className="nav-wireframe-window">
                  <div className="nav-wireframe-header">
                    <div className="nav-wireframe-dot" />
                    <div className="nav-wireframe-line w-40" />
                  </div>
                  <div className="nav-wireframe-body">
                    <div className="nav-wireframe-sidebar">
                      <div className="nav-wireframe-sidebar-item is-active" />
                      <div className="nav-wireframe-sidebar-item" />
                      <div className="nav-wireframe-sidebar-item" />
                      <div className="nav-wireframe-sidebar-item" />
                    </div>
                    <div className="nav-wireframe-main">
                      <div className="nav-wireframe-card" />
                      <div className="nav-wireframe-card" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="nav-layout-info">
                <div className="nav-layout-title">Vertical Sidebar</div>
                <div className="nav-layout-desc">
                  Classic left navigation rail with categorized sections, profile selector, and collapsible sidebar.
                </div>
              </div>
            </button>

            {/* Floating Bottom Dock Card */}
            <button
              type="button"
              className={`nav-layout-card${settings.appearance.navigationLayout === "horizontal" ? " is-selected" : ""}`}
              role="radio"
              aria-checked={settings.appearance.navigationLayout === "horizontal"}
              aria-label="Floating Bottom Dock layout"
              onClick={() => patch("appearance", { navigationLayout: "horizontal" })}
            >
              {settings.appearance.navigationLayout === "horizontal" && (
                <div className="nav-layout-badge">
                  <Icon name="check" size={12} />
                </div>
              )}

              <div className="nav-wireframe-stage">
                <div className="nav-wireframe-window">
                  <div className="nav-wireframe-header">
                    <div className="nav-wireframe-dot" />
                    <div className="nav-wireframe-line w-60" />
                  </div>
                  <div className="nav-wireframe-body">
                    <div className="nav-wireframe-main">
                      <div className="nav-wireframe-card" />
                      <div className="nav-wireframe-card" />
                    </div>
                  </div>
                  <div className="nav-wireframe-dock-row">
                    <div className="nav-wireframe-dock-circle" />
                    <div className="nav-wireframe-dock-pill">
                      <div className="nav-wireframe-dock-tab" />
                      <div className="nav-wireframe-dock-tab is-active" />
                      <div className="nav-wireframe-dock-tab" />
                      <div className="nav-wireframe-dock-tab" />
                    </div>
                    <div className="nav-wireframe-dock-circle" />
                  </div>
                </div>
              </div>

              <div className="nav-layout-info">
                <div className="nav-layout-title">Floating Bottom Dock</div>
                <div className="nav-layout-desc">
                  Floating segmented pill capsule anchored at bottom center with circular quick-action buttons.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Settings Layout Width: Small vs Large */}
        <div id="row-app-settings-width" className="nav-layout-section p-sm mt-md">
          <div className="nav-layout-section-header mb-sm">
            <div className="settings-row-title">Settings layout width</div>
            <div className="settings-row-desc">
              Choose your preferred layout width for the Settings window. Smoothly animates the sidebar rail and content boundaries.
            </div>
          </div>

          <div className="nav-layout-grid" role="radiogroup" aria-label="Settings layout width">
            {/* Small Width Card */}
            <button
              type="button"
              className={`nav-layout-card${(settings.appearance.settingsWidth ?? "large") === "small" ? " is-selected" : ""}`}
              role="radio"
              aria-checked={(settings.appearance.settingsWidth ?? "large") === "small"}
              aria-label="Small Settings width"
              onClick={() => patch("appearance", { settingsWidth: "small" })}
            >
              {(settings.appearance.settingsWidth ?? "large") === "small" && (
                <div className="nav-layout-badge">
                  <Icon name="check" size={12} />
                </div>
              )}

              <div className="nav-wireframe-stage">
                <div className="nav-wireframe-window is-compact-window">
                  <div className="nav-wireframe-header">
                    <div className="nav-wireframe-dot" />
                    <div className="nav-wireframe-line w-40" />
                  </div>
                  <div className="nav-wireframe-body">
                    <div className="nav-wireframe-sidebar is-compact">
                      <div className="nav-wireframe-sidebar-item is-active" />
                      <div className="nav-wireframe-sidebar-item" />
                      <div className="nav-wireframe-sidebar-item" />
                    </div>
                    <div className="nav-wireframe-main is-focused">
                      <div className="nav-wireframe-card" />
                      <div className="nav-wireframe-card" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="nav-layout-info">
                <div className="nav-layout-title">Small (Focused)</div>
                <div className="nav-layout-desc">
                  Compact 220px navigation rail with a focused content column, matching classic desktop preferences.
                </div>
              </div>
            </button>

            {/* Large Width Card */}
            <button
              type="button"
              className={`nav-layout-card${(settings.appearance.settingsWidth ?? "large") === "large" ? " is-selected" : ""}`}
              role="radio"
              aria-checked={(settings.appearance.settingsWidth ?? "large") === "large"}
              aria-label="Large Settings width"
              onClick={() => patch("appearance", { settingsWidth: "large" })}
            >
              {(settings.appearance.settingsWidth ?? "large") === "large" && (
                <div className="nav-layout-badge">
                  <Icon name="check" size={12} />
                </div>
              )}

              <div className="nav-wireframe-stage">
                <div className="nav-wireframe-window is-wide-window">
                  <div className="nav-wireframe-header">
                    <div className="nav-wireframe-dot" />
                    <div className="nav-wireframe-line w-60" />
                  </div>
                  <div className="nav-wireframe-body">
                    <div className="nav-wireframe-sidebar is-wide">
                      <div className="nav-wireframe-sidebar-item is-active" />
                      <div className="nav-wireframe-sidebar-item" />
                      <div className="nav-wireframe-sidebar-item" />
                      <div className="nav-wireframe-sidebar-item" />
                    </div>
                    <div className="nav-wireframe-main is-expanded">
                      <div className="nav-wireframe-card" />
                      <div className="nav-wireframe-card" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="nav-layout-info">
                <div className="nav-layout-title">Large (Spacious)</div>
                <div className="nav-layout-desc">
                  Spacious 284px navigation rail with live category status badges and expanded content view.
                </div>
              </div>
            </button>
          </div>
        </div>

        <SettingsRow
          id="row-app-ui-scale"
          title="UI scale"
          desc="Overall application zoom factor and interface scaling"
        >
          <div className="w-180">
            <AppSelect
              value={String(settings.appearance.uiScale ?? "100")}
              onChange={(v) => patch("appearance", { uiScale: v as any })}
              options={[
                { value: "90", label: "90% (Compact)" },
                { value: "100", label: "100% (Standard)" },
                { value: "110", label: "110% (Comfort)" },
                { value: "120", label: "120% (Large)" },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-app-fontsize"
          title="Font size scale"
          desc="Adjust application typography scaling across all pages and popups"
        >
          <div className="w-180">
            <AppSelect
              value={settings.appearance.fontSize ?? "default"}
              onChange={(v) => patch("appearance", { fontSize: v as any })}
              options={[
                { value: "small", label: "Small (92%)" },
                { value: "default", label: "Default (100%)" },
                { value: "large", label: "Large (110%)" },
                { value: "xlarge", label: "Extra Large (122%)" },
              ]}
            />
          </div>
        </SettingsRow>

        <SettingsRow
          id="row-app-compact"
          title="Compact workspace mode"
          desc="Reduce paddings and margins for ultra-dense operational view"
        >
          <Toggle
            label="Compact workspace mode"
            checked={settings.appearance.compactMode ?? false}
            onChange={(v) => patch("appearance", { compactMode: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Window Material"
        icon="monitor"
        desc="Windows 11 dynamic material effects"
        accentColor="slate"
      >
        <SettingsRow
          id="row-app-material"
          title="Backdrop material"
          desc="Windows 11 dynamic background material effects (inspired by modern Windows shells)"
        >
          <div className="w-180">
            <AppSelect
              value={settings.appearance.backdropMaterial ?? "mica"}
              onChange={(v) => patch("appearance", { backdropMaterial: v as any })}
              options={[
                { value: "mica", label: "Mica (Wallpaper tint)" },
                { value: "acrylic", label: "Acrylic (Frosted blur)" },
                { value: "solid", label: "Solid (Classic opaque)" },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Accessibility & Interaction"
        icon="sparkles"
        desc="Visual assistance, animation reduction, and color coding"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-app-motion"
          title="Reduce motion"
          desc="Minimize transitions and animations across the app"
        >
          <Toggle
            label="Reduce motion"
            checked={settings.appearance.reduceMotion}
            onChange={(v) => patch("appearance", { reduceMotion: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-app-hover-help"
          title="Hover help"
          desc="Show contextual explanations and keyboard hints when you hover controls"
        >
          <Toggle
            label="Show hover help"
            checked={settings.appearance.showHoverHelp !== false}
            onChange={(v) => patch("appearance", { showHoverHelp: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-app-color-coded-settings"
          title="Color-coded settings cards"
          desc="Tint Settings categories and card icon pods with distinct vibrant iOS-style category accents"
        >
          <Toggle
            label="Color-coded settings cards"
            checked={settings.appearance.colorCodedSettings !== false}
            onChange={(v) => patch("appearance", { colorCodedSettings: v })}
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
