import { ChangeEvent, CSSProperties, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { ACCENT_PRESETS, HIGHLIGHT_PRESETS } from "../lib/constants";
import { Button, Field, Input, PageIntro, SettingsGroup, SettingsRow, Toggle } from "../components/ui";
import { AppSelect } from "../components/ui/AppSelect";
import { Icon } from "../components/Icon";
import { getSafeHyperKeySuggestions } from "../lib/conflict";
import { createDefaultSettings } from "../lib/defaults";
import { searchSettings } from "../lib/fuzzySearch";
import type { SettingSearchItem } from "../lib/settingsIndex";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => searchSettings(searchQuery, 8), [searchQuery]);

  const handleSelectResult = (item: SettingSearchItem) => {
    setActiveSection(item.category);
    setSearchQuery("");
    setSelectedIndex(0);
    setTimeout(() => {
      const el = document.getElementById(item.anchorId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("setting-row-highlight");
        setTimeout(() => {
          el.classList.remove("setting-row-highlight");
        }, 1800);
      }
    }, 60);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = searchResults[selectedIndex] ?? searchResults[0];
      if (target) handleSelectResult(target.item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setSearchQuery("");
      setSelectedIndex(0);
    }
  };

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

      {/* Settings Search Bar */}
      <div className="settings-search-wrapper mb-md">
        <div className="settings-search-box">
          <Icon name="search" size={16} className="settings-search-icon" />
          <input
            ref={searchInputRef}
            type="text"
            className="settings-search-input"
            placeholder="Search settings (e.g. 'hyper', 'color', 'typing')…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {searchQuery && (
            <button
              type="button"
              className="settings-search-clear"
              title="Clear search"
              onClick={() => {
                setSearchQuery("");
                setSelectedIndex(0);
                searchInputRef.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {searchQuery.trim().length > 0 && (
          <div className="settings-search-dropdown animate-fade-in" role="listbox">
            {searchResults.length > 0 ? (
              searchResults.map((res, i) => (
                <button
                  key={res.item.id}
                  type="button"
                  className={"settings-search-result-item" + (i === selectedIndex ? " is-selected" : "")}
                  onClick={() => handleSelectResult(res.item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className="settings-search-result-header">
                    <span className="font-medium text-main">{res.item.title}</span>
                    <span className="chip chip-accent tiny">{res.item.categoryLabel}</span>
                  </div>
                  <div className="tiny muted">{res.item.description}</div>
                </button>
              ))
            ) : (
              <div className="p-sm text-center muted tiny">No matching settings found for "{searchQuery}"</div>
            )}
          </div>
        )}
      </div>

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
              <SettingsRow id="row-gen-startup" title="Launch on Windows startup" desc="Start KeyFlow automatically when you log in to Windows">
                <Toggle
                  label="Launch on startup"
                  checked={settings.general.launchOnStartup}
                  onChange={(v) => patch("general", { launchOnStartup: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-gen-minimized" title="Start minimized" desc="Open KeyFlow hidden in the background on launch">
                <Toggle
                  label="Start minimized"
                  checked={settings.general.startMinimized}
                  onChange={(v) => patch("general", { startMinimized: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-gen-tray" title="Minimize to system tray" desc="Keep running in the notification area when the window is closed">
                <Toggle
                  label="Minimize to tray"
                  checked={settings.general.minimizeToTray}
                  onChange={(v) => patch("general", { minimizeToTray: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-gen-notifications" title="Desktop notifications" desc="Show Windows toast alerts when shortcuts execute">
                <Toggle
                  label="Show notifications"
                  checked={settings.general.showNotifications}
                  onChange={(v) => patch("general", { showNotifications: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-gen-profile" title="Default workspace profile" desc="Profile activated when no specific application rule matches">
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
                <SettingsRow id="row-sc-pause" title="Global pause shortcut" desc="Instantly pause all shortcut matching">
                  <div className="w-160">
                    <Input
                      value={settings.shortcuts.globalPause}
                      onChange={(e) => patch("shortcuts", { globalPause: e.target.value })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow id="row-sc-emergency" title="Emergency Safe Mode shortcut" desc="Instantly disconnect low-level hooks">
                  <div className="w-160">
                    <Input
                      value={settings.shortcuts.emergencySafe}
                      onChange={(e) => patch("shortcuts", { emergencySafe: e.target.value })}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>

              <SettingsGroup title="Default Gesture Timings" icon="shortcuts" desc="Default thresholds for automatic timing mode">
                <SettingsRow id="row-sc-double-tap" title="Double tap threshold" desc="Maximum time between two presses in milliseconds">
                  <div className="w-100">
                    <Input
                      type="number"
                      value={settings.shortcuts.defaultDoubleTap}
                      onChange={(e) => patch("shortcuts", { defaultDoubleTap: Number(e.target.value) })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow id="row-sc-hold-thresh" title="Hold press threshold" desc="Duration to hold a key before hold trigger fires">
                  <div className="w-100">
                    <Input
                      type="number"
                      value={settings.shortcuts.defaultHold}
                      onChange={(e) => patch("shortcuts", { defaultHold: Number(e.target.value) })}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow id="row-sc-repeat-prot" title="Key repeat protection" desc="Ignore repeated OS key-down events while holding a physical key">
                  <Toggle
                    label="Key repeat protection"
                    checked={settings.shortcuts.keyRepeatProtection}
                    onChange={(v) => patch("shortcuts", { keyRepeatProtection: v })}
                  />
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="Hyper Key Modifier" icon="shortcuts" desc="Turn one physical key into your dedicated KeyFlow modifier for chords like Hyper + T">
                <SettingsRow
                  id="row-sc-hyper-enable"
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
                  id="row-sc-hyper-key"
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
                  id="row-sc-hyper-tap"
                  title="Tap Hyper Key Action"
                  desc="Action triggered when the Hyper key is pressed and released alone without holding another key"
                >
                  <div className="w-220">
                    <AppSelect
                      value={settings.shortcuts.hyperKeyConfig?.tapActionId || ""}
                      onChange={(tapActionId) =>
                        patch("shortcuts", {
                          hyperKeyConfig: {
                            enabled: settings.shortcuts.hyperKeyConfig?.enabled ?? true,
                            key: settings.shortcuts.hyperKeyConfig?.key || "AltRight",
                            tapActionId: tapActionId || undefined,
                            suppressOriginal: true,
                          },
                        })
                      }
                      options={[
                        { value: "", label: "None (chord modifier only)" },
                        ...data.shortcuts
                          .filter((s) => s.profileId === activeProfileId)
                          .map((s) => ({ value: s.id, label: s.name || `${s.key} (${s.trigger})` })),
                      ]}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>
              <SettingsGroup title="Typing Burst Protection" icon="shortcuts" desc="Prevents rapid typing from accidentally activating single-key shortcuts">
                <SettingsRow
                  id="row-sc-typing-prot"
                  title="Typing protection mode"
                  desc="Throttles standalone letter/number single-taps during active typing streams. Function keys and modifier chords remain instant."
                >
                  <div className="w-200">
                    <AppSelect
                      value={settings.shortcuts.typingProtection ?? "balanced"}
                      onChange={(v) => patch("shortcuts", { typingProtection: v as any })}
                      options={[
                        { value: "balanced", label: "Balanced (400ms burst gap)" },
                        { value: "strict", label: "Strict (650ms burst gap)" },
                        { value: "off", label: "Off (Raw key events)" },
                      ]}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>
            </>
          )}

          {activeSection === "alwaysOnTop" && (
            <SettingsGroup title="Always on Top Window Control" icon="pinTop" desc="Configure DWM border highlights and behavior">
              <SettingsRow id="row-top-mode" title="Default pin mode" desc="Default action behavior when pinning window">
                <div className="w-160">
                  <AppSelect
                    value={settings.windowControl?.defaultTopmostMode ?? "toggle"}
                    onChange={(v) => patch("windowControl" as any, { defaultTopmostMode: v } as any)}
                    options={[
                      { value: "toggle", label: "Toggle topmost" },
                      { value: "pin", label: "Always pin" },
                      { value: "unpin", label: "Always unpin" },
                    ]}
                  />
                </div>
              </SettingsRow>
              <SettingsRow id="row-top-highlight" title="Highlight pinned window border" desc="Apply a colored DWM accent border around pinned windows">
                <Toggle
                  label="Highlight border"
                  checked={settings.windowControl?.highlightPinned ?? true}
                  onChange={(v) => patch("windowControl" as any, { highlightPinned: v } as any)}
                />
              </SettingsRow>
              <SettingsRow id="row-top-color" title="Pinned window highlight color" desc="Visual border highlight accent color">
                <div className="row gap-xs">
                  {HIGHLIGHT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={"chip clickable" + (settings.windowControl?.highlightColor === preset.value ? " chip-accent" : " chip-subtle")}
                      onClick={() => patch("windowControl" as any, { highlightColor: preset.value } as any)}
                    >
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </SettingsRow>
              <SettingsRow id="row-top-sound" title="Sound feedback" desc="Play KeyFlow custom audio tones when pinning or unpinning">
                <Toggle
                  label="Sound feedback"
                  checked={settings.windowControl?.soundFeedback ?? true}
                  onChange={(v) => patch("windowControl" as any, { soundFeedback: v } as any)}
                />
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "popup" && (
            <SettingsGroup title="Popup Menu" icon="popup" desc="Quick command palette menu options">
              <SettingsRow id="row-pop-pos" title="Popup position" desc="Default spawn location for the floating action menu">
                <div className="w-180">
                  <AppSelect
                    value={settings.popup.position}
                    onChange={(v) => patch("popup", { position: v as any })}
                    options={[
                      { value: "cursor", label: "Near mouse cursor" },
                      { value: "center", label: "Center of active screen" },
                      { value: "last", label: "Remember last position" },
                    ]}
                  />
                </div>
              </SettingsRow>
              <SettingsRow id="row-pop-icons" title="Show icons" desc="Display action type icons in the menu list">
                <Toggle
                  label="Show icons"
                  checked={settings.popup.showIcons}
                  onChange={(v) => patch("popup", { showIcons: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-pop-search" title="Enable search" desc="Include instant search filter in the popup header">
                <Toggle
                  label="Enable search"
                  checked={settings.popup.search}
                  onChange={(v) => patch("popup", { search: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-pop-close" title="Close after action" desc="Automatically dismiss the popup menu once an item is triggered">
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
              <SettingsRow id="row-app-theme" title="Theme mode" desc="Switch between dark and light desktop palettes">
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
              <SettingsRow id="row-app-fontsize" title="Text size" desc="Adjust application typography scaling across all pages and popups">
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
              <SettingsRow id="row-app-accent" title="Accent color" desc="Signature highlight color used across buttons, focus rings, and key indicators">
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
              <SettingsRow id="row-app-motion" title="Reduce motion" desc="Minimize transitions and animations across the app">
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
              <SettingsRow id="row-priv-safe" title="Safe mode" desc="Immediately disable all shortcut hooks system-wide">
                <Toggle
                  label="Safe mode"
                  checked={settings.privacy.safeMode}
                  onChange={setSafe}
                />
              </SettingsRow>
              <SettingsRow id="row-priv-password" title="Pause in password fields" desc="Attempt to suspend hooks when entering sensitive credentials">
                <Toggle
                  label="Pause in password"
                  checked={settings.privacy.pauseInPassword}
                  onChange={(v) => patch("privacy", { pauseInPassword: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-priv-history" title="Action history" desc="Clear recorded list of executed actions">
                <Button variant="secondary" size="sm" onClick={clearRecent}>
                  Clear history
                </Button>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "data" && (
            <SettingsGroup title="Data & Backup" icon="folder" desc="Local JSON storage and configuration export">
              <SettingsRow id="row-data-export" title="Export backup" desc="Save all shortcuts and settings to a JSON file">
                <Button variant="secondary" size="sm" icon="file" onClick={exportJson}>
                  Export JSON
                </Button>
              </SettingsRow>
              <SettingsRow id="row-data-import" title="Import backup" desc="Restore shortcuts and profiles from a previous backup file">
                <label className="btn btn-secondary btn-sm">
                  <Icon name="folder" size={15} />
                  <span>Import JSON</span>
                  <input type="file" accept="application/json" hidden onChange={importJson} />
                </label>
              </SettingsRow>
              <SettingsRow id="row-data-reset" title="Reset application data" desc="Delete all shortcuts, profiles, and reset settings to default">
                <Button variant="danger" size="sm" icon="trash" onClick={reset}>
                  Reset all data
                </Button>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "advanced" && (
            <SettingsGroup title="Advanced System Settings" icon="terminal" desc="Elevated hooks, logging, and engine configuration">
              <SettingsRow
                id="row-adv-extended"
                title="Extended shortcut access"
                desc="Allows shortcuts (e.g. Screenshot, Always on Top) to work while elevated apps (Task Manager / elevated Terminal) have focus. Runs the input helper at High integrity via a single Windows UAC prompt. Secure desktop screens remain protected."
              >
                <Toggle
                  label="Extended shortcut access"
                  checked={settings.advanced?.extendedAccess ?? false}
                  onChange={(v) => patch("advanced" as any, { extendedAccess: v } as any)}
                />
              </SettingsRow>
              <SettingsRow id="row-adv-debug" title="Enable debug logs" desc="Output verbose diagnostic logs to console and DevTools">
                <Toggle
                  label="Debug logs"
                  checked={settings.advanced.debugLogs}
                  onChange={(v) => patch("advanced", { debugLogs: v })}
                />
              </SettingsRow>
              <SettingsRow id="row-adv-perf" title="Performance mode" desc="Optimize input dispatcher for minimum CPU latency">
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
              <SettingsRow id="row-about-version" title="Version" desc="Current installed build">
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
