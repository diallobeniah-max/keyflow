import { ChangeEvent, CSSProperties, useState } from "react";
import { useStore } from "../store/useStore";
import { ACCENT_PRESETS, HIGHLIGHT_PRESETS } from "../lib/constants";
import { Button, Field, Input, PageIntro, SettingsGroup, SettingsRow, Toggle } from "../components/ui";
import { AppSelect } from "../components/ui/AppSelect";
import { Icon } from "../components/Icon";
import { getSafeHyperKeySuggestions } from "../lib/conflict";
import { createDefaultSettings } from "../lib/defaults";

const DEFAULT_ACCENT = createDefaultSettings().appearance.accent;

type SettingsSection =
  | "general"
  | "shortcuts"
  | "alwaysOnTop"
  | "popup"
  | "appearance"
  | "privacy"
  | "data"
  | "advanced"
  | "about";

interface SectionTab {
  id: SettingsSection;
  label: string;
  icon: string;
}

const SECTIONS: SectionTab[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "shortcuts", label: "Shortcuts & Gestures", icon: "shortcuts" },
  { id: "alwaysOnTop", label: "Always on Top", icon: "pinTop" },
  { id: "popup", label: "Popup Menu", icon: "popup" },
  { id: "appearance", label: "Appearance", icon: "monitor" },
  { id: "privacy", label: "Privacy & Safety", icon: "shield" },
  { id: "data", label: "Data & Backup", icon: "folder" },
  { id: "advanced", label: "Advanced", icon: "terminal" },
  { id: "about", label: "About", icon: "logo" },
];

export function Settings() {
  const data = useStore((s) => s.data);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const settings = data.settings;
  const patch = useStore((s) => s.patchSettings);
  const setSafe = useStore((s) => s.setSafeMode);
  const reset = useStore((s) => s.resetAll);
  const clearRecent = useStore((s) => s.clearRecent);
  const importState = useStore((s) => s.importState);

  const [activeSection, setActiveSection] = useState<SettingsSection>("general");

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyflow-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => importState(JSON.parse(txt)));
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow="PREFERENCES"
        title="Settings"
        description="Configure desktop behaviors, visual appearance, gesture timings, and privacy settings."
      />

      <div className="settings-layout">
        {/* Left Category Navigation */}
        <nav className="settings-nav">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={"settings-nav-btn" + (activeSection === sec.id ? " active" : "")}
              onClick={() => setActiveSection(sec.id)}
            >
              <Icon name={sec.icon} size={16} />
              <span>{sec.label}</span>
            </button>
          ))}
        </nav>

        {/* Right Settings Content */}
        <div className="settings-content">
          {activeSection === "general" && (
            <SettingsGroup title="General Settings" icon="settings" desc="Core startup and background options">
              <SettingsRow title="Launch on Windows startup" desc="Start KeyFlow automatically when you log in to Windows">
                <Toggle
                  label="Launch on startup"
                  checked={settings.general.launchOnStartup}
                  onChange={(v) => patch("general", { launchOnStartup: v })}
                />
              </SettingsRow>
              <SettingsRow title="Start minimized" desc="Open KeyFlow hidden in the background on launch">
                <Toggle
                  label="Start minimized"
                  checked={settings.general.startMinimized}
                  onChange={(v) => patch("general", { startMinimized: v })}
                />
              </SettingsRow>
              <SettingsRow title="Minimize to system tray" desc="Keep running in the notification area when the window is closed">
                <Toggle
                  label="Minimize to tray"
                  checked={settings.general.minimizeToTray}
                  onChange={(v) => patch("general", { minimizeToTray: v })}
                />
              </SettingsRow>
              <SettingsRow title="Desktop notifications" desc="Show Windows toast alerts when shortcuts execute">
                <Toggle
                  label="Show notifications"
                  checked={settings.general.showNotifications}
                  onChange={(v) => patch("general", { showNotifications: v })}
                />
              </SettingsRow>
              <SettingsRow title="Default workspace profile" desc="Profile activated when no specific application rule matches">
                <div className="w-180">
                  <AppSelect
                    value={settings.general.defaultProfileId}
                    onChange={(v) => patch("general", { defaultProfileId: v })}
                    options={data.profiles.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "shortcuts" && (
            <>
              <SettingsGroup title="Global Emergency Shortcuts" icon="shortcuts" desc="System-wide safety combinations">
                <SettingsRow title="Global pause shortcut" desc="Instantly pause all shortcut matching">
                  <div className="w-160">
                    <Input
                      value={settings.shortcuts.globalPause}
                      onChange={(e) => patch("shortcuts", { globalPause: e.target.value })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow title="Emergency Safe Mode shortcut" desc="Instantly disconnect low-level hooks">
                  <div className="w-160">
                    <Input
                      value={settings.shortcuts.emergencySafe}
                      onChange={(e) => patch("shortcuts", { emergencySafe: e.target.value })}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>

              <SettingsGroup title="Default Gesture Timings" icon="shortcuts" desc="Default thresholds for automatic timing mode">
                <SettingsRow title="Double tap threshold" desc="Maximum time between two presses in milliseconds">
                  <div className="w-100">
                    <Input
                      type="number"
                      value={settings.shortcuts.defaultDoubleTap}
                      onChange={(e) => patch("shortcuts", { defaultDoubleTap: Number(e.target.value) })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow title="Hold press threshold" desc="Duration to hold a key before hold trigger fires">
                  <div className="w-100">
                    <Input
                      type="number"
                      value={settings.shortcuts.defaultHold}
                      onChange={(e) => patch("shortcuts", { defaultHold: Number(e.target.value) })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow title="Key repeat protection" desc="Ignore repeated OS key-down events while holding a physical key">
                  <Toggle
                    label="Key repeat protection"
                    checked={settings.shortcuts.keyRepeatProtection}
                    onChange={(v) => patch("shortcuts", { keyRepeatProtection: v })}
                  />
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="Hyper Key Modifier" icon="shortcuts" desc="Turn one physical key into your dedicated KeyFlow modifier for chords like Hyper + T">
                <SettingsRow
                  title="Enable Hyper Key"
                  desc="Acts as a dedicated KeyFlow modifier key (bit 4) for all Hyper chords"
                >
                  <Toggle
                    label="Enable Hyper Key"
                    checked={settings.shortcuts.hyperKeyConfig?.enabled ?? false}
                    onChange={(v) =>
                      patch("shortcuts", {
                        hyperKeyConfig: {
                          enabled: v,
                          key: settings.shortcuts.hyperKeyConfig?.key || "AltRight",
                          tapActionId: settings.shortcuts.hyperKeyConfig?.tapActionId || "sc-f-popup",
                          suppressOriginal: true,
                        },
                      })
                    }
                  />
                </SettingsRow>
                <SettingsRow
                  title="Physical Hyper Key"
                  desc="Select an unused physical key. CapsLock is preserved for Screenshot."
                >
                  <div className="col gap-xs w-220">
                    <AppSelect
                      value={settings.shortcuts.hyperKeyConfig?.key || "AltRight"}
                      onChange={(key) =>
                        patch("shortcuts", {
                          hyperKeyConfig: {
                            enabled: settings.shortcuts.hyperKeyConfig?.enabled ?? true,
                            key,
                            tapActionId: settings.shortcuts.hyperKeyConfig?.tapActionId || "sc-f-popup",
                            suppressOriginal: true,
                          },
                        })
                      }
                      options={getSafeHyperKeySuggestions(
                        data.shortcuts,
                        activeProfileId,
                        settings.shortcuts.hyperKeyConfig?.key,
                      ).map((s) => ({
                        value: s.value,
                        label: s.label + (s.safe ? "" : " ⚠️"),
                      }))}
                    />
                    {getSafeHyperKeySuggestions(
                      data.shortcuts,
                      activeProfileId,
                      settings.shortcuts.hyperKeyConfig?.key,
                    ).find((s) => s.value === (settings.shortcuts.hyperKeyConfig?.key || "AltRight"))?.warning && (
                      <p className="tiny text-warning no-margin">
                        {
                          getSafeHyperKeySuggestions(
                            data.shortcuts,
                            activeProfileId,
                            settings.shortcuts.hyperKeyConfig?.key,
                          ).find((s) => s.value === (settings.shortcuts.hyperKeyConfig?.key || "AltRight"))?.warning
                        }
                      </p>
                    )}
                  </div>
                </SettingsRow>
                <SettingsRow
                  title="Tap Hyper Key Action"
                  desc="Action triggered when the Hyper key is pressed and released alone without holding another key"
                >
                  <div className="w-220">
                    <AppSelect
                      value={settings.shortcuts.hyperKeyConfig?.tapActionId || "none"}
                      onChange={(act) =>
                        patch("shortcuts", {
                          hyperKeyConfig: {
                            enabled: settings.shortcuts.hyperKeyConfig?.enabled ?? true,
                            key: settings.shortcuts.hyperKeyConfig?.key || "AltRight",
                            tapActionId: act === "none" ? undefined : act,
                            suppressOriginal: true,
                          },
                        })
                      }
                      options={[
                        { value: "none", label: "Do Nothing (Pass through)" },
                        { value: "sc-f-popup", label: "Open Popup Menu" },
                        { value: "sc-caps-screenshot", label: "Screenshot Overlay" },
                        { value: "sc-aot-ctrl-shift-t", label: "Toggle Always on Top" },
                      ]}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>
            </>
          )}

          {activeSection === "alwaysOnTop" && (
            <SettingsGroup title="Always on Top & Windows" icon="pinTop" desc="Keep active windows floating above all others">
              <SettingsRow title="Sound feedback" desc="Play subtle Win32 confirmation chime when pinning or unpinning windows">
                <Toggle
                  label="Sound feedback"
                  checked={settings.windowControl?.soundFeedback ?? true}
                  onChange={(v) => patch("windowControl" as any, { soundFeedback: v } as any)}
                />
              </SettingsRow>
              <SettingsRow title="Highlight pinned windows" desc="Display a colored border on windows pinned as Always on Top">
                <Toggle
                  label="Highlight pinned windows"
                  checked={settings.windowControl?.highlightPinned ?? true}
                  onChange={(v) => patch("windowControl" as any, { highlightPinned: v } as any)}
                />
              </SettingsRow>
              <SettingsRow title="Highlight border color" desc="DWM border highlight accent color">
                <div className="row wrap gap-xs">
                  {HIGHLIGHT_PRESETS.map((p) => {
                    const currentHighlight = settings.windowControl?.highlightColor ?? HIGHLIGHT_PRESETS[0].value;
                    const isSelected = currentHighlight === p.value;
                    return (
                      <button
                        key={p.value}
                        type="button"
                        className={"chip clickable" + (isSelected ? " chip-accent" : " chip-subtle")}
                        onClick={() => patch("windowControl" as any, { highlightColor: p.value } as any)}
                      >
                        <span className="brand-logo-dot" />
                        <span>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </SettingsRow>
              <SettingsRow title="Border thickness" desc="Visual border width scale (note: DWM 1px limitation on Windows 11)">
                <div className="w-160">
                  <AppSelect
                    value={settings.windowControl?.borderThickness ?? "medium"}
                    onChange={(v) => patch("windowControl" as any, { borderThickness: v } as any)}
                    options={[
                      { value: "thin", label: "Thin (2px)" },
                      { value: "medium", label: "Medium (4px)" },
                      { value: "thick", label: "Thick (6px)" },
                    ]}
                  />
                </div>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "popup" && (
            <SettingsGroup title="Global Popup Menu" icon="popup" desc="Quick action command palette opened via double-tap FF">
              <SettingsRow title="Position" desc="Where the popup menu appears on screen">
                <div className="w-160">
                  <AppSelect
                    value={settings.popup.position}
                    onChange={(v) => patch("popup", { position: v as any })}
                    options={[
                      { value: "cursor", label: "Near cursor" },
                      { value: "center", label: "Screen center" },
                      { value: "last", label: "Last dragged position" },
                    ]}
                  />
                </div>
              </SettingsRow>
              <SettingsRow title="Show icons" desc="Display action type icons in the menu list">
                <Toggle
                  label="Show icons"
                  checked={settings.popup.showIcons}
                  onChange={(v) => patch("popup", { showIcons: v })}
                />
              </SettingsRow>
              <SettingsRow title="Enable search" desc="Include instant search filter in the popup header">
                <Toggle
                  label="Enable search"
                  checked={settings.popup.search}
                  onChange={(v) => patch("popup", { search: v })}
                />
              </SettingsRow>
              <SettingsRow title="Close after action" desc="Automatically dismiss the popup menu once an item is triggered">
                <Toggle
                  label="Close after action"
                  checked={settings.popup.closeAfterAction}
                  onChange={(v) => patch("popup", { closeAfterAction: v })}
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "appearance" && (
            <SettingsGroup title="Appearance & Themes" icon="monitor" desc="Visual styling, themes, and scaling">
              <SettingsRow title="Theme mode" desc="Switch between dark and light desktop palettes">
                <div className="w-160">
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
              <SettingsRow title="Text size" desc="Adjust application typography scaling across all pages and popups">
                <div className="w-160">
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
              <SettingsRow title="Accent color" desc="Signature highlight color used across buttons, focus rings, and key indicators">
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
              <SettingsRow title="Reduce motion" desc="Minimize transitions and animations across the app">
                <Toggle
                  label="Reduce motion"
                  checked={settings.appearance.reduceMotion}
                  onChange={(v) => patch("appearance", { reduceMotion: v })}
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "privacy" && (
            <SettingsGroup title="Privacy & Safety" icon="shield" desc="Safety modes and app restrictions">
              <SettingsRow title="Safe mode" desc="Immediately disable all shortcut hooks system-wide">
                <Toggle
                  label="Safe mode"
                  checked={settings.privacy.safeMode}
                  onChange={setSafe}
                />
              </SettingsRow>
              <SettingsRow title="Pause in password fields" desc="Attempt to suspend hooks when entering sensitive credentials">
                <Toggle
                  label="Pause in password"
                  checked={settings.privacy.pauseInPassword}
                  onChange={(v) => patch("privacy", { pauseInPassword: v })}
                />
              </SettingsRow>
              <SettingsRow title="Action history" desc="Clear recorded list of executed actions">
                <Button variant="secondary" size="sm" onClick={clearRecent}>
                  Clear history
                </Button>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "data" && (
            <SettingsGroup title="Data & Backup" icon="folder" desc="Local JSON storage and configuration export">
              <SettingsRow title="Export backup" desc="Save all shortcuts and settings to a JSON file">
                <Button variant="secondary" size="sm" icon="file" onClick={exportJson}>
                  Export JSON
                </Button>
              </SettingsRow>
              <SettingsRow title="Import backup" desc="Restore shortcuts and profiles from a previous backup file">
                <label className="btn btn-secondary btn-sm">
                  <Icon name="folder" size={15} />
                  <span>Import JSON</span>
                  <input type="file" accept="application/json" hidden onChange={importJson} />
                </label>
              </SettingsRow>
              <SettingsRow title="Reset application data" desc="Delete all shortcuts, profiles, and reset settings to default">
                <Button variant="danger" size="sm" icon="trash" onClick={reset}>
                  Reset all data
                </Button>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "advanced" && (
            <SettingsGroup title="Advanced System Settings" icon="terminal" desc="Elevated hooks, logging, and engine configuration">
              <SettingsRow
                title="Extended shortcut access"
                desc="Allows shortcuts (e.g. Screenshot, Always on Top) to work while elevated apps (Task Manager / elevated Terminal) have focus. Runs the input helper at High integrity via a single Windows UAC prompt. Secure desktop screens remain protected."
              >
                <Toggle
                  label="Extended shortcut access"
                  checked={settings.advanced?.extendedAccess ?? false}
                  onChange={(v) => patch("advanced" as any, { extendedAccess: v } as any)}
                />
              </SettingsRow>
              <SettingsRow title="Enable debug logs" desc="Output verbose diagnostic logs to console and DevTools">
                <Toggle
                  label="Debug logs"
                  checked={settings.advanced.debugLogs}
                  onChange={(v) => patch("advanced", { debugLogs: v })}
                />
              </SettingsRow>
              <SettingsRow title="Performance mode" desc="Optimize input dispatcher for minimum CPU latency">
                <Toggle
                  label="Performance mode"
                  checked={settings.advanced.performanceMode}
                  onChange={(v) => patch("advanced", { performanceMode: v })}
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "about" && (
            <SettingsGroup title="About KeyFlow" icon="logo" desc="Version and platform information">
              <SettingsRow title="Version" desc="Current installed build">
                <span className="chip chip-subtle">v0.3.0 Desktop</span>
              </SettingsRow>
              <SettingsRow title="Native input engine" desc="Low-level Windows keyboard hook">
                <span className="chip chip-accent">Rust WH_KEYBOARD_LL</span>
              </SettingsRow>
              <SettingsRow title="Architecture" desc="Process separation model">
                <span className="muted tiny">Electron + Rust IPC named pipe</span>
              </SettingsRow>
            </SettingsGroup>
          )}
        </div>
      </div>
    </div>
  );
}
