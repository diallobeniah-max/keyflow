import { ChangeEvent, CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store/useStore";
import { ACCENT_PRESETS, HIGHLIGHT_PRESETS, HOT_CORNER_ACTIONS, SCREEN_TINT_PRESETS } from "../lib/constants";
import { Button, Field, Input, PageIntro, Select, SettingsGroup, SettingsRow, Slider, Toggle } from "../components/ui";
import { AppSelect } from "../components/ui/AppSelect";
import { Icon } from "../components/Icon";
import { IconPickerModal } from "../components/ui/IconPickerModal";
import { getSafeHyperKeySuggestions } from "../lib/conflict";
import { createDefaultSettings } from "../lib/defaults";
import { searchSettings } from "../lib/fuzzySearch";
import type { SettingSearchItem } from "../lib/settingsIndex";
import type { HotCornerAction, HotCornerPosition, HotCornerBuiltinAction, HotCornersCustomPreset, ScreenTintPreset, CustomCursorItem } from "../types";

const DEFAULT_ACCENT = createDefaultSettings().appearance.accent;

type SettingsSection = SettingSearchItem["category"];

interface SectionTab {
  id: SettingsSection;
  label: string;
  icon: string;
}

const SECTIONS: SectionTab[] = [
  { id: "general", label: "General", icon: "settings" },
  { id: "shortcuts", label: "Shortcuts & Gestures", icon: "shortcuts" },
  { id: "commandPalette", label: "Command Palette", icon: "search" },
  { id: "hotCorners", label: "Hot Corners", icon: "window" },
  { id: "alwaysOnTop", label: "Always on Top", icon: "pinTop" },
  { id: "wasd", label: "WASD Navigation", icon: "keyboard" },
  { id: "screenTint", label: "Screen Tint", icon: "sun" },
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
  const wasdNavigationActive = useStore((s) => s.wasdNavigationActive);
  const setWasdNavigationActive = useStore((s) => s.setWasdNavigationActive);
  const focusTarget = useStore((s) => s.settingsFocusTarget);
  const setFocusTarget = useStore((s) => s.setSettingsFocusTarget);

  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAdjustingCornerArea, setIsAdjustingCornerArea] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [deletedPresetIds, setDeletedPresetIds] = useState<string[]>([]);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetIcon, setPresetIcon] = useState("star");
  const [presetColor, setPresetColor] = useState("#4F7CFF");
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isDraggingCursor, setIsDraggingCursor] = useState(false);
  const cursorInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTarget) {
      setActiveSection(focusTarget.category as SettingsSection);
      setTimeout(() => {
        const el = document.getElementById(focusTarget.anchorId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("setting-row-highlight");
          setTimeout(() => el.classList.remove("setting-row-highlight"), 1800);
        }
      }, 100);
      setFocusTarget(null);
    }
  }, [focusTarget, setFocusTarget]);

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

  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  const handleSelectBackupFolder = async () => {
    if (window.electronAPI?.backup?.selectFolder) {
      const folder = await window.electronAPI.backup.selectFolder();
      if (folder) {
        patch("data", { autoBackupPath: folder });
        setBackupStatus(`Folder set: ${folder}`);
        setTimeout(() => setBackupStatus(null), 3000);
      }
    }
  };

  const handleRunBackupNow = async () => {
    if (window.electronAPI?.backup?.runNow) {
      setBackupStatus("Backing up…");
      const res = await window.electronAPI.backup.runNow();
      if (res.success) {
        setBackupStatus("Backup saved successfully!");
      } else {
        setBackupStatus(`Backup failed: ${res.error || "Unknown error"}`);
      }
      setTimeout(() => setBackupStatus(null), 4000);
    }
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
          {searchQuery ? (
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
          ) : (
            <button
              type="button"
              className="settings-search-palette-badge"
              title="Open full Command Palette (Ctrl+K)"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("keyflow:open-command-palette"));
              }}
            >
              <Icon name="command" size={12} />
              <span>Ctrl+K</span>
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
        <div key={activeSection} className="settings-content anim-tab-enter">
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

          {activeSection === "commandPalette" && (
            <SettingsGroup title="Command Palette Settings" icon="search" desc="Configure the fast search overlay (Ctrl+K) for navigation and shortcuts">
              <SettingsRow id="row-cp-enable" title="Enable Command Palette" desc="Global in-app searchable registry accessible anywhere in KeyFlow">
                <Toggle
                  label="Enable Command Palette"
                  checked={settings.shortcuts.commandPaletteEnabled !== false}
                  onChange={(v) => patch("shortcuts", { commandPaletteEnabled: v })}
                />
              </SettingsRow>

              <SettingsRow id="row-cp-window-mode" title="Window Mode" desc="Choose your preferred layout mode when opening KeyFlow Command Palette">
                <div className="window-mode-cards" role="radiogroup" aria-label="Command palette window mode">
                  <div
                    className={"window-mode-card" + ((settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "compact" ? " is-active" : "")}
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
                    className={"window-mode-card" + ((settings.shortcuts.commandPaletteWindowMode ?? "expanded") === "expanded" ? " is-active" : "")}
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

              <SettingsRow id="row-cp-position" title="Screen Position" desc="Choose where the command palette opens (Center by default)">
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

              <SettingsRow id="row-cp-shortcut" title="Activation shortcut" desc="Keyboard shortcut used to open and toggle the command palette">
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

              <SettingsRow id="row-cp-max-results" title="Maximum search results" desc={`Display up to ${settings.shortcuts.commandPaletteMaxResults ?? 8} matching commands in the list`}>
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

              <SettingsRow id="row-cp-categories" title="Show category tags" desc="Display category badges (Navigation, Shortcuts, Settings, etc.) next to results">
                <Toggle
                  label="Show categories"
                  checked={settings.shortcuts.commandPaletteShowCategories !== false}
                  onChange={(v) => patch("shortcuts", { commandPaletteShowCategories: v })}
                />
              </SettingsRow>

              <SettingsRow id="row-cp-test" title="Test Command Palette" desc="Open the command palette now to test your configured shortcut and results">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="search"
                  onClick={() => {
                    const evt = new KeyboardEvent("keydown", {
                      key: (settings.shortcuts.commandPaletteShortcut || "Ctrl+K").toLowerCase().includes("k") ? "k" : "p",
                      ctrlKey: true,
                      bubbles: true,
                    });
                    window.dispatchEvent(evt);
                  }}
                >
                  Open Palette ({settings.shortcuts.commandPaletteShortcut || "Ctrl+K"})
                </Button>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "hotCorners" && (
            <>
              <SettingsGroup title="Hot Corners & Trigger Zones" icon="window" desc="Execute actions by nudging your cursor into monitor corners">
                <SettingsRow id="row-hot-enable" title="Enable Hot Corners" desc="Detect corner gestures across your primary display">
                  <Toggle
                    label="Enable Hot Corners"
                    checked={settings.hotCorners?.enabled ?? false}
                    onChange={(v) => {
                      const updated = { ...settings.hotCorners, enabled: v };
                      patch("hotCorners" as any, updated as any);
                      window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                    }}
                  />
                </SettingsRow>
                <SettingsRow id="row-hot-sound" title="Play sound on trigger" desc="Play custom audio chime when a corner action is activated">
                  <Toggle
                    label="Play sound on trigger"
                    checked={settings.hotCorners?.soundEnabled ?? true}
                    onChange={(v) => {
                      const updated = { ...settings.hotCorners, soundEnabled: v };
                      patch("hotCorners" as any, updated as any);
                      window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                    }}
                  />
                </SettingsRow>
                <SettingsRow id="row-hot-size" title="Corner activation area" desc="Hit-target size in pixels for each display corner">
                  <div className="w-260">
                    <Slider
                      min={16}
                      max={48}
                      step={4}
                      value={settings.hotCorners?.cornerSize ?? 24}
                      onChange={(v) => {
                        const updated = { ...settings.hotCorners, cornerSize: v };
                        patch("hotCorners" as any, updated as any);
                        window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                      }}
                      showValue
                      formatValue={(v) => `${v}px`}
                    />
                  </div>
                </SettingsRow>
                <SettingsRow id="row-hot-delay" title="Activation delay" desc="How long the mouse must rest in the corner before firing">
                  <div className="w-260">
                    <Slider
                      min={100}
                      max={1000}
                      step={50}
                      value={settings.hotCorners?.activationMs ?? 400}
                      onChange={(v) => {
                        const updated = { ...settings.hotCorners, activationMs: v };
                        patch("hotCorners" as any, updated as any);
                        window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                      }}
                      showValue
                      formatValue={(v) => `${v}ms`}
                    />
                  </div>
                </SettingsRow>
              </SettingsGroup>

              {/* Interactive Corner Stage */}
              <div className="hot-corners-stage-container" id="row-hot-stage">
                <div className="hot-corners-stage-header">
                  <div className="hot-corners-stage-title">
                    <span className="hot-corners-display-icon">🖥️</span>
                    <div>
                      <div className="hot-corners-stage-name">Interactive Display Monitor</div>
                      <div className="hot-corners-stage-desc">Configure actions for all 4 display corners</div>
                    </div>
                  </div>
                  <div className="hot-corners-presets">
                    <span className="hot-corners-preset-label">Quick Layouts:</span>
                    {(([
                      {
                        id: "default",
                        name: "Default",
                        icon: "window",
                        color: "#4F7CFF",
                        corners: {
                          topLeft: { type: "builtin" as const, action: "taskView" as HotCornerBuiltinAction },
                          topRight: { type: "builtin" as const, action: "desktop" as HotCornerBuiltinAction },
                          bottomLeft: { type: "builtin" as const, action: "start" as HotCornerBuiltinAction },
                          bottomRight: { type: "builtin" as const, action: "quickSettings" as HotCornerBuiltinAction },
                        },
                      },
                      {
                        id: "multitasking",
                        name: "Multitasking",
                        icon: "shortcuts",
                        color: "#6A91FF",
                        corners: {
                          topLeft: { type: "builtin" as const, action: "taskView" as HotCornerBuiltinAction },
                          topRight: { type: "builtin" as const, action: "search" as HotCornerBuiltinAction },
                          bottomLeft: { type: "builtin" as const, action: "previousDesktop" as HotCornerBuiltinAction },
                          bottomRight: { type: "builtin" as const, action: "nextDesktop" as HotCornerBuiltinAction },
                        },
                      },
                    ] as HotCornersCustomPreset[])
                      .filter((dp) => !deletedPresetIds.includes(dp.id))
                      .concat((settings.hotCorners?.customPresets ?? []).filter((cp) => !deletedPresetIds.includes(cp.id)))
                    ).map((cp) => (
                      <div key={cp.id} className="hot-corner-custom-chip">
                        <button
                          type="button"
                          className="btn btn-sm hot-corner-chip-btn"
                          onClick={() => {
                            const updated = { ...settings.hotCorners, corners: cp.corners };
                            patch("hotCorners" as any, updated as any);
                            window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                          }}
                        >
                          <Icon name={cp.icon || "star"} size={13} className="hot-corner-chip-icon" />
                          <span>{cp.name}</span>
                        </button>
                        <div className="hot-corner-chip-actions">
                          <button
                            type="button"
                            className="hot-corner-preset-action-btn"
                            title={`Edit ${cp.name} layout`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPresetId(cp.id);
                              setPresetNameInput(cp.name);
                              setPresetIcon(cp.icon || "star");
                              setPresetColor(cp.color || "#4F7CFF");
                              setShowSavePresetModal(true);
                            }}
                          >
                            <Icon name="edit" size={11} />
                          </button>
                          <button
                            type="button"
                            className="hot-corner-preset-del"
                            title={`Delete ${cp.name} layout`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cp.id === "default" || cp.id === "multitasking") {
                                setDeletedPresetIds((prev) => [...prev, cp.id]);
                              } else {
                                const customPresets = (settings.hotCorners?.customPresets ?? []).filter((p) => p.id !== cp.id);
                                patch("hotCorners" as any, { ...settings.hotCorners, customPresets } as any);
                              }
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const corners = {
                          topLeft: { type: "builtin" as const, action: "none" as HotCornerBuiltinAction },
                          topRight: { type: "builtin" as const, action: "none" as HotCornerBuiltinAction },
                          bottomLeft: { type: "builtin" as const, action: "none" as HotCornerBuiltinAction },
                          bottomRight: { type: "builtin" as const, action: "none" as HotCornerBuiltinAction },
                        };
                        const updated = { ...settings.hotCorners, corners };
                        patch("hotCorners" as any, updated as any);
                        window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                      }}
                    >
                      Clear All
                    </button>
                    {deletedPresetIds.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeletedPresetIds([])}
                      >
                        Reset Defaults
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditingPresetId(null);
                        setPresetNameInput("");
                        setPresetIcon("star");
                        setPresetColor("#4F7CFF");
                        setShowSavePresetModal(true);
                      }}
                    >
                      + Save Layout
                    </button>
                  </div>
                </div>

                <div className="hot-corners-canvas" style={{ "--zone-size": `${settings.hotCorners?.cornerSize ?? 24}px` } as CSSProperties}>
                  {isAdjustingCornerArea && (
                    <>
                      <div className="hot-corners-active-zone-preview hot-corners-active-zone-preview--tl is-active" />
                      <div className="hot-corners-active-zone-preview hot-corners-active-zone-preview--tr is-active" />
                      <div className="hot-corners-active-zone-preview hot-corners-active-zone-preview--bl is-active" />
                      <div className="hot-corners-active-zone-preview hot-corners-active-zone-preview--br is-active" />
                    </>
                  )}
                  <div className="hot-corners-grid-layout">
                    {(["topLeft", "topRight", "bottomLeft", "bottomRight"] as HotCornerPosition[]).map((pos) => {
                      const currentAction = settings.hotCorners?.corners?.[pos] ?? { type: "builtin", action: "none" };
                      const isBuiltin = currentAction.type === "builtin";
                      const selectValue = isBuiltin ? currentAction.action : `sc:${(currentAction as any).shortcutId}`;
                      const arrow = pos === "topLeft" ? "↖" : pos === "topRight" ? "↗" : pos === "bottomLeft" ? "↙" : "↘";
                      const label = pos === "topLeft" ? "Top Left" : pos === "topRight" ? "Top Right" : pos === "bottomLeft" ? "Bottom Left" : "Bottom Right";
                      const isActive = isBuiltin ? currentAction.action !== "none" : !!(currentAction as any).shortcutId;

                      const options = [
                        ...HOT_CORNER_ACTIONS.map((a) => ({ value: a.value, label: a.label })),
                        ...data.shortcuts.map((sc) => ({ value: `sc:${sc.id}`, label: `Shortcut: ${sc.name}` })),
                      ];

                      return (
                        <div key={pos} className={"hot-corner-pod" + (isActive ? " is-active" : "")}>
                          <div className="hot-corner-pod__top">
                            <span className="hot-corner-pod__arrow">{arrow}</span>
                            <span className="hot-corner-pod__title">{label}</span>
                            {isActive && <span className="hot-corner-pod__indicator" />}
                          </div>
                          <div className="hot-corner-pod__selector">
                            <AppSelect
                              value={selectValue}
                              onChange={(val) => {
                                let newAct: HotCornerAction;
                                if (val.startsWith("sc:")) {
                                  newAct = { type: "shortcut", shortcutId: val.slice(3) };
                                } else {
                                  newAct = { type: "builtin", action: val as HotCornerBuiltinAction };
                                }
                                const corners = { ...(settings.hotCorners?.corners ?? {}), [pos]: newAct };
                                const updated = { ...settings.hotCorners, corners };
                                patch("hotCorners" as any, updated as any);
                                window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                              }}
                              options={options}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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

          {activeSection === "wasd" && (
            <SettingsGroup title="WASD Keyboard Cursor Navigation" icon="keyboard" desc="Control the mouse cursor directly from your keyboard">
              <SettingsRow id="row-wasd-enable" title="Enable WASD Navigation" desc="Use W, A, S, D keys to move cursor with acceleration">
                <Toggle
                  label="WASD Navigation"
                  checked={wasdNavigationActive}
                  onChange={(v) => setWasdNavigationActive(v)}
                />
              </SettingsRow>
              <SettingsRow id="row-wasd-size" title="Navigation cursor size" desc="Size of the active cursor indicator">
                <div className="w-160">
                  <AppSelect
                    value={String(settings.wasdNavigation?.cursorSize ?? 32)}
                    onChange={(v) => patch("wasdNavigation" as any, { cursorSize: Number(v) } as any)}
                    options={[
                      { value: "24", label: "Small (24px)" },
                      { value: "32", label: "Default (32px)" },
                      { value: "48", label: "Large (48px)" },
                      { value: "64", label: "Extra Large (64px)" },
                    ]}
                  />
                </div>
              </SettingsRow>

              {/* Cursor Selection & Gallery */}
              <SettingsRow id="row-wasd-gallery" title="Cursor Indicator Style" desc="Pick default indicator or upload custom cursors (.cur, .ani, .png, .svg, .ico, .webp)">
                <div className="col gap-sm w-full">
                  <div className="row gap-xs wrap items-center">
                    <button
                      type="button"
                      className={"chip clickable" + ((settings.wasdNavigation?.activeCursorId ?? "default") === "default" ? " chip-accent" : " chip-subtle")}
                      onClick={() => {
                        const updated = { ...settings.wasdNavigation, activeCursorId: "default" };
                        patch("wasdNavigation" as any, updated as any);
                      }}
                    >
                      <img src="/cursors/blue-cursor.png" alt="" width={14} height={14} className="wasd-cursor-img" />
                      <span>Default Blue Pointer</span>
                    </button>

                    {(settings.wasdNavigation?.customCursors ?? []).map((c) => {
                      const isActive = settings.wasdNavigation?.activeCursorId === c.id;
                      return (
                        <div key={c.id} className="wasd-custom-cursor-chip">
                          <button
                            type="button"
                            className={"chip clickable" + (isActive ? " chip-accent" : " chip-subtle")}
                            onClick={() => {
                              const updated = { ...settings.wasdNavigation, activeCursorId: c.id };
                              patch("wasdNavigation" as any, updated as any);
                            }}
                          >
                            <img src={c.dataUrl} alt="" width={14} height={14} className="wasd-cursor-img" />
                            <span>{c.name}</span>
                          </button>
                          <button
                            type="button"
                            className="wasd-cursor-chip-del"
                            title="Delete custom cursor"
                            onClick={(e) => {
                              e.stopPropagation();
                              const customCursors = (settings.wasdNavigation?.customCursors ?? []).filter((item) => item.id !== c.id);
                              const activeCursorId = settings.wasdNavigation?.activeCursorId === c.id ? "default" : settings.wasdNavigation?.activeCursorId;
                              patch("wasdNavigation" as any, { ...settings.wasdNavigation, customCursors, activeCursorId } as any);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions: Choose Default & Remove All */}
                  <div className="row gap-sm items-center mt-xs">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const updated = { ...settings.wasdNavigation, activeCursorId: "default" };
                        patch("wasdNavigation" as any, updated as any);
                      }}
                    >
                      Choose Default
                    </Button>
                    {(settings.wasdNavigation?.customCursors ?? []).length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const updated = { ...settings.wasdNavigation, customCursors: [], activeCursorId: "default" };
                          patch("wasdNavigation" as any, updated as any);
                        }}
                      >
                        Remove All Custom
                      </Button>
                    )}
                  </div>
                </div>
              </SettingsRow>

              {/* Drag & Drop Cursor Upload Zone */}
              <SettingsRow id="row-wasd-upload" title="Upload Custom Cursor" desc="Drag and drop any mouse format (.cur, .ani, .png, .svg, .ico, .webp, .jpg, .bmp)">
                <div
                  className={"wasd-cursor-dropzone" + (isDraggingCursor ? " is-dragging" : "")}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingCursor(true);
                  }}
                  onDragLeave={() => setIsDraggingCursor(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingCursor(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                      const file = e.dataTransfer.files[0];
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const dataUrl = event.target?.result as string;
                        if (!dataUrl) return;
                        const newCursor: CustomCursorItem = {
                          id: `cursor-${Date.now()}`,
                          name: file.name.replace(/\.[^/.]+$/, ""),
                          dataUrl,
                          format: file.name.split(".").pop()?.toLowerCase(),
                        };
                        const existing = settings.wasdNavigation?.customCursors ?? [];
                        const updated = {
                          ...settings.wasdNavigation,
                          customCursors: [...existing, newCursor],
                          activeCursorId: newCursor.id,
                        };
                        patch("wasdNavigation" as any, updated as any);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  onClick={() => cursorInputRef.current?.click()}
                >
                  <input
                    ref={cursorInputRef}
                    type="file"
                    className="visually-hidden"
                    accept=".cur,.ani,.png,.svg,.ico,.webp,.jpg,.jpeg,.bmp"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const dataUrl = event.target?.result as string;
                          if (!dataUrl) return;
                          const newCursor: CustomCursorItem = {
                            id: `cursor-${Date.now()}`,
                            name: file.name.replace(/\.[^/.]+$/, ""),
                            dataUrl,
                            format: file.name.split(".").pop()?.toLowerCase(),
                          };
                          const existing = settings.wasdNavigation?.customCursors ?? [];
                          const updated = {
                            ...settings.wasdNavigation,
                            customCursors: [...existing, newCursor],
                            activeCursorId: newCursor.id,
                          };
                          patch("wasdNavigation" as any, updated as any);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <Icon name="upload" size={18} />
                  <div>
                    <div className="small bold">Drag & Drop cursor file here or click to browse</div>
                    <div className="tiny muted">Supports .cur, .ani, .png, .svg, .ico, .webp, .jpg, .bmp</div>
                  </div>
                </div>
              </SettingsRow>

              {/* Cursor Preview */}
              <SettingsRow id="row-wasd-preview" title="Cursor indicator preview" desc="Visual indicator displayed while navigation mode is engaged">
                <div className="row gap-sm items-center">
                  <div
                    className="wasd-cursor-preview-stage"
                    data-cursor-size={settings.wasdNavigation?.cursorSize ?? 32}
                  >
                    <img
                      src={
                        (settings.wasdNavigation?.customCursors ?? []).find(
                          (c) => c.id === settings.wasdNavigation?.activeCursorId
                        )?.dataUrl || "/cursors/blue-cursor.png"
                      }
                      alt="Active Cursor"
                      className="wasd-cursor-preview-img"
                    />
                  </div>
                  <span className="chip chip-accent">
                    {((settings.wasdNavigation?.activeCursorId ?? "default") === "default")
                      ? "Default Blue Pointer"
                      : (settings.wasdNavigation?.customCursors ?? []).find(
                          (c) => c.id === settings.wasdNavigation?.activeCursorId
                        )?.name ?? "Active Custom Cursor"}
                  </span>
                </div>
              </SettingsRow>
            </SettingsGroup>
          )}

          {activeSection === "screenTint" && (
            <SettingsGroup title="Screen Tint Blue-Light Filter" icon="sun" desc="Hardware-accelerated screen warmth overlay for late-night eye comfort">
              <SettingsRow id="row-tint-enable" title="Enable Screen Tint" desc="Display a fullscreen warm color wash over all monitors">
                <Toggle
                  label="Enable Screen Tint"
                  checked={settings.screenTint?.enabled ?? false}
                  onChange={(v) => {
                    const updated = { ...settings.screenTint, enabled: v };
                    patch("screenTint" as any, updated as any);
                    window.electronAPI?.screenTint?.update?.(updated as any);
                  }}
                />
              </SettingsRow>
              <SettingsRow id="row-tint-presets" title="Tint preset" desc="Select a curated warmth palette">
                <div className="row gap-xs wrap">
                  {SCREEN_TINT_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={"chip clickable" + (settings.screenTint?.preset === preset.value ? " chip-accent" : " chip-subtle")}
                      onClick={() => {
                        const updated = { ...settings.screenTint, preset: preset.value as ScreenTintPreset, color: preset.color };
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
              <SettingsRow id="row-tint-strength" title="Filter strength" desc="Adjust the opacity and intensity of the screen tint overlay">
                <div className="w-260">
                  <Slider
                    min={5}
                    max={60}
                    step={1}
                    value={settings.screenTint?.strength ?? 18}
                    onChange={(v) => {
                      const updated = { ...settings.screenTint, strength: v };
                      patch("screenTint" as any, updated as any);
                      window.electronAPI?.screenTint?.update?.(updated as any);
                    }}
                    showValue
                    formatValue={(v) => `${v}%`}
                  />
                </div>
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
              <SettingsRow id="row-app-material" title="Backdrop material" desc="Windows 11 dynamic material effects (inspired by Files App)">
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
              <SettingsRow id="row-app-tint" title="Header accent tint" desc="Apply a fitted accent wash across the top bar header box">
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
              <SettingsRow id="row-app-fit" title="Header tint fit" desc="Select the size and shape of the header accent box">
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
            <SettingsGroup title="Data & Backup" icon="folder" desc="Local JSON storage, auto-backup schedule, and configuration export">
              <SettingsRow id="row-data-auto-backup" title="Automatic periodic backup" desc="Periodically export a full backup of all shortcuts and preferences to a selected folder (Raycast-style)">
                <Toggle
                  label="Automatic backup"
                  checked={settings.data.autoBackupEnabled ?? false}
                  onChange={(v) => patch("data", { autoBackupEnabled: v })}
                />
              </SettingsRow>

              {settings.data.autoBackupEnabled && (
                <>
                  <SettingsRow id="row-data-backup-path" title="Auto-backup location" desc={settings.data.autoBackupPath || "No folder selected"}>
                    <Button variant="secondary" size="sm" icon="folder" onClick={handleSelectBackupFolder}>
                      {settings.data.autoBackupPath ? "Change Folder" : "Select Folder…"}
                    </Button>
                  </SettingsRow>

                  <SettingsRow id="row-data-backup-interval" title="Backup frequency" desc="How often KeyFlow automatically creates a new timestamped backup">
                    <Select
                      value={String(settings.data.autoBackupIntervalMinutes ?? 360)}
                      onChange={(v: string) => patch("data", { autoBackupIntervalMinutes: Number(v) })}
                      options={[
                        { value: "5", label: "Every 5 minutes" },
                        { value: "15", label: "Every 15 minutes" },
                        { value: "30", label: "Every 30 minutes" },
                        { value: "60", label: "Every 1 hour" },
                        { value: "360", label: "Every 6 hours (Recommended)" },
                        { value: "720", label: "Every 12 hours" },
                        { value: "1440", label: "Every 24 hours" },
                      ]}
                    />
                  </SettingsRow>

                  <SettingsRow id="row-data-backup-now" title="Manual backup trigger" desc="Immediately save a new backup to the auto-backup folder">
                    <div className="row gap-xs items-center">
                      {backupStatus && <span className="tiny text-accent bold">{backupStatus}</span>}
                      <Button variant="secondary" size="sm" icon="sync" onClick={handleRunBackupNow}>
                        Backup Now
                      </Button>
                    </div>
                  </SettingsRow>
                </>
              )}

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

      {showSavePresetModal && createPortal(
        <div className="modal-backdrop anim-fade-in" onClick={() => { setShowSavePresetModal(false); setEditingPresetId(null); }}>
          <div className="hot-corners-save-modal anim-modal-enter" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingPresetId ? "Edit Corner Layout" : "Save Corner Layout"}</h3>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => { setShowSavePresetModal(false); setEditingPresetId(null); }}>✕</button>
            </div>
            <div className="col gap-md mt-sm">
              <Field label="Layout Name">
                <Input
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="e.g. Coding Focus, Gaming, Desktop"
                  autoFocus
                />
              </Field>
              <div className="row gap-sm items-center">
                <Button variant="secondary" size="sm" onClick={() => setShowIconPicker(true)}>
                  <Icon name={presetIcon} size={15} />
                  <span>Choose Icon & Color</span>
                </Button>
                <div className="preset-color-badge" />
              </div>
              <div className="row gap-sm justify-end mt-sm">
                <Button variant="secondary" size="sm" onClick={() => { setShowSavePresetModal(false); setEditingPresetId(null); }}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!presetNameInput.trim()}
                  onClick={() => {
                    const existing = settings.hotCorners?.customPresets ?? [];
                    if (editingPresetId) {
                      const isBuiltin = editingPresetId === "default" || editingPresetId === "multitasking";
                      if (isBuiltin) {
                        const updatedPreset: HotCornersCustomPreset = {
                          id: `cp-${Date.now()}`,
                          name: presetNameInput.trim(),
                          icon: presetIcon,
                          color: presetColor,
                          corners: settings.hotCorners?.corners ?? {
                            topLeft: { type: "builtin", action: "none" },
                            topRight: { type: "builtin", action: "none" },
                            bottomLeft: { type: "builtin", action: "none" },
                            bottomRight: { type: "builtin", action: "none" },
                          },
                        };
                        setDeletedPresetIds((prev) => [...prev, editingPresetId]);
                        const customPresets = [...existing, updatedPreset];
                        patch("hotCorners" as any, { ...settings.hotCorners, customPresets } as any);
                      } else {
                        const customPresets = existing.map((p) =>
                          p.id === editingPresetId
                            ? { ...p, name: presetNameInput.trim(), icon: presetIcon, color: presetColor }
                            : p
                        );
                        patch("hotCorners" as any, { ...settings.hotCorners, customPresets } as any);
                      }
                    } else {
                      const newPreset: HotCornersCustomPreset = {
                        id: `cp-${Date.now()}`,
                        name: presetNameInput.trim(),
                        icon: presetIcon,
                        color: presetColor,
                        corners: settings.hotCorners?.corners ?? {
                          topLeft: { type: "builtin", action: "none" },
                          topRight: { type: "builtin", action: "none" },
                          bottomLeft: { type: "builtin", action: "none" },
                          bottomRight: { type: "builtin", action: "none" },
                        },
                      };
                      const customPresets = [...existing, newPreset];
                      patch("hotCorners" as any, { ...settings.hotCorners, customPresets } as any);
                    }
                    setShowSavePresetModal(false);
                    setEditingPresetId(null);
                  }}
                >
                  {editingPresetId ? "Update Layout" : "Save Layout"}
                </Button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showIconPicker && (
        <IconPickerModal
          isOpen={showIconPicker}
          onClose={() => setShowIconPicker(false)}
          selectedIcon={presetIcon}
          selectedColor={presetColor}
          onSelect={(icon, color) => {
            setPresetIcon(icon);
            if (color) setPresetColor(color);
            setShowIconPicker(false);
          }}
        />
      )}
    </div>
  );
}
