import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { APP_ICON_ASSETS } from "../../lib/app-icon";
import { ACCENT_PRESETS } from "../../lib/constants";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { AppIconId } from "../../types";

const accentPreset = (label: (typeof ACCENT_PRESETS)[number]["label"]) =>
  ACCENT_PRESETS.find((preset) => preset.label === label)?.value ?? ACCENT_PRESETS[0].value;

const APP_ICON_ACCENTS: Record<AppIconId, string> = {
  monochrome: accentPreset("Slate"),
  blue: accentPreset("KeyFlow Blue"),
  green: accentPreset("Emerald"),
  red: accentPreset("Rose"),
};

const APP_ICON_OPTIONS: Array<{
  id: AppIconId;
  title: string;
  subtitle: string;
  tag: string;
  description: string;
  themeClass: string;
  src: string;
}> = [
  {
    id: "monochrome",
    title: "Obsidian Noir",
    subtitle: "Monochrome Stealth",
    tag: "Stealth Classic",
    description: "Matte black titanium keycap with crisp silver velocity streak",
    themeClass: "theme-noir",
    src: APP_ICON_ASSETS.monochrome,
  },
  {
    id: "blue",
    title: "Cobalt Surge",
    subtitle: "Electric Sapphire",
    tag: "Signature Blue",
    description: "Electric cerulean keycap with hyper-speed neon luminescence",
    themeClass: "theme-cobalt",
    src: APP_ICON_ASSETS.blue,
  },
  {
    id: "green",
    title: "Emerald Matrix",
    subtitle: "Cyber Aurora",
    tag: "Cyber Aurora",
    description: "Vibrant glowing emerald keycap with high-velocity radiance",
    themeClass: "theme-emerald",
    src: APP_ICON_ASSETS.green,
  },
  {
    id: "red",
    title: "Crimson Velocity",
    subtitle: "Ignition Flare",
    tag: "Ignition Flare",
    description: "High-octane scarlet keycap with supercharged dynamic trail",
    themeClass: "theme-crimson",
    src: APP_ICON_ASSETS.red,
  },
];

interface AppIconPageProps {
  onBack?: () => void;
}

export const AppIconPage: FC<AppIconPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const activeIcon = settings.appearance.appIcon ?? "monochrome";

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="App Icon"
        description="Choose the official icon aesthetic for the KeyFlow window, taskbar, and notification-area tray icon."
        onBack={onBack}
      />

      <SettingsGroup
        title="Icon Gallery"
        icon="sparkles"
        desc="Visual 3D icon editions crafted for modern Windows environments"
        accentColor="blue"
      >
        <div className="app-icon-showcase-grid p-sm" role="radiogroup" aria-label="KeyFlow app icon theme">
          {APP_ICON_OPTIONS.map((option) => {
            const selected = activeIcon === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`app-icon-showcase-card ${option.themeClass}${selected ? " is-selected" : ""}`}
                role="radio"
                aria-checked={selected}
                aria-label={`${option.title} app icon (${option.subtitle})${selected ? ", selected" : ""}`}
                onClick={() =>
                  patch("appearance", {
                    appIcon: option.id,
                    ...(settings.appearance.syncAccentWithAppIcon ? { accent: APP_ICON_ACCENTS[option.id] } : {}),
                  })
                }
              >
                {selected && (
                  <div className="app-icon-badge">
                    <Icon name="check" size={12} />
                  </div>
                )}

                <div className="app-icon-hero-wrap">
                  <div className="app-icon-pedestal-glow" />
                  <img src={option.src} alt={option.title} className="app-icon-hero-img" />
                </div>

                <div className="app-icon-content">
                  <div className="app-icon-hero-title">{option.title}</div>
                  <div className="app-icon-hero-subtitle">{option.subtitle}</div>
                  <div className="app-icon-hero-desc">{option.description}</div>
                </div>

                <div className="app-icon-card-footer">
                  <div className={`app-icon-status-btn${selected ? " is-active" : ""}`}>
                    {selected ? (
                      <>
                        <Icon name="check" size={12} />
                        <span>Active Theme</span>
                      </>
                    ) : (
                      <span>Set as Active</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Accent Sync"
        icon="monitor"
        desc="Automatic alignment between UI accent color and desktop icon"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-app-icon-accent"
          title="Match accent color to app icon"
          desc="Automatically sync KeyFlow's UI accent hue with your active icon theme (Slate, Blue, Emerald, or Rose)"
        >
          <Toggle
            label="Match accent to icon"
            checked={settings.appearance.syncAccentWithAppIcon ?? false}
            onChange={(v) =>
              patch("appearance", {
                syncAccentWithAppIcon: v,
                ...(v ? { accent: APP_ICON_ACCENTS[settings.appearance.appIcon ?? "monochrome"] } : {}),
              })
            }
          />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
