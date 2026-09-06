import { type FC, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import { SettingsGroup, SettingsRow, Toggle, Slider } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { Icon } from "../../components/Icon";
import { useSmoothScroll } from "../../hooks/useSmoothScroll";
import { DEFAULT_SMOOTH_SCROLL_PRESETS } from "../../lib/defaults";
import type {
  SmoothScrollCustomPreset,
  SmoothScrollPreset,
  SmoothScrollSettings,
} from "../../types/index";

interface SmoothScrollPageProps {
  onBack?: () => void;
}

// Built-in Preset card metadata
const BUILTIN_PRESETS: {
  id: SmoothScrollPreset;
  label: string;
  description: string;
  badge?: string;
  icon: string;
  specs: string[];
}[] = [
  {
    id: "native",
    label: "Native",
    description: "OS default stepped scrolling with raw hardware steps",
    badge: "Off",
    icon: "mouse",
    specs: ["OS Stepped", "0ms delay"],
  },
  {
    id: "smooth",
    label: "Smooth",
    description: "Natural fluid animation with balanced deceleration",
    badge: "Default",
    icon: "sparkles",
    specs: ["280ms", "100px", "3× max"],
  },
  {
    id: "silky",
    label: "Silky",
    description: "Longer, softer glide with gentle progressive easing",
    badge: "Fluid",
    icon: "droplet",
    specs: ["450ms", "100px", "2× max"],
  },
  {
    id: "fast",
    label: "Fast",
    description: "Snappy low-latency impulse for coding and rapid navigation",
    badge: "Snappy",
    icon: "lightning",
    specs: ["160ms", "100px", "4× max"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manual fine-tuned control over all motion parameters",
    badge: "Manual",
    icon: "sliders",
    specs: ["User tuned"],
  },
];

const COLOR_OPTIONS = [
  { id: "purple", label: "Purple" },
  { id: "blue", label: "Blue" },
  { id: "cyan", label: "Cyan" },
  { id: "amber", label: "Amber" },
  { id: "rose", label: "Rose" },
  { id: "green", label: "Green" },
  { id: "indigo", label: "Indigo" },
];

// Preview rows
const PREVIEW_ITEMS = Array.from({ length: 24 }, (_, i) => `Preview row ${i + 1}`);

export const SmoothScrollPage: FC<SmoothScrollPageProps> = ({ onBack }) => {
  const patch = useStore((s) => s.patchSettings);
  const ss = useStore((s) => s.data.settings.smoothScroll);

  // Merge with sensible fallbacks
  const settings: SmoothScrollSettings = {
    enabled: true,
    preset: "smooth",
    stepSize: 100,
    animationTime: 280,
    accelerationEnabled: true,
    accelerationDelta: 50,
    accelerationMax: 3,
    keyboardScrolling: false,
    horizontalScrolling: true,
    trackpadPassThrough: true,
    customPresets: [],
    ...ss,
  };

  const [showAdvanced, setShowAdvanced] = useState<boolean>(settings.preset === "custom");
  const [creatingNew, setCreatingNew] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>("");
  const [newPresetColor, setNewPresetColor] = useState<string>("purple");

  const patchSS = (partial: Partial<SmoothScrollSettings>) => {
    patch("smoothScroll" as any, partial);
  };

  const isEnabled = settings.enabled && settings.preset !== "native";
  const isNative = settings.preset === "native";

  // Check if current preset is a user custom preset
  const customPresets = settings.customPresets || [];
  const currentCustomPreset = customPresets.find((p) => p.id === settings.preset);
  const activePresetLabel =
    BUILTIN_PRESETS.find((p) => p.id === settings.preset)?.label ||
    currentCustomPreset?.name ||
    settings.preset.toUpperCase();

  // Live preview: attach the scroll engine to the preview box
  const previewRef = useRef<HTMLDivElement>(null);
  const previewSettings: SmoothScrollSettings | undefined = isEnabled ? settings : undefined;
  useSmoothScroll(previewRef as any, previewSettings);

  const handleSelectPreset = (id: string) => {
    if (id === "native") {
      patchSS({ preset: "native" });
      return;
    }

    if (id === "custom") {
      patchSS({ preset: "custom" });
      setShowAdvanced(true);
      return;
    }

    // Check custom presets first
    const customMatch = customPresets.find((p) => p.id === id);
    if (customMatch) {
      patchSS({
        preset: customMatch.id,
        stepSize: customMatch.stepSize,
        animationTime: customMatch.animationTime,
        accelerationEnabled: customMatch.accelerationEnabled,
        accelerationDelta: customMatch.accelerationDelta,
        accelerationMax: customMatch.accelerationMax,
      });
      return;
    }

    // Built-in presets (smooth, silky, fast)
    const defaults = DEFAULT_SMOOTH_SCROLL_PRESETS[id];
    if (defaults) {
      patchSS({
        preset: id,
        stepSize: defaults.stepSize,
        animationTime: defaults.animationTime,
        accelerationEnabled: defaults.accelerationEnabled,
        accelerationDelta: defaults.accelerationDelta,
        accelerationMax: defaults.accelerationMax,
      });
    } else {
      patchSS({ preset: id });
    }
  };

  const handleResetPreset = () => {
    if (settings.preset in DEFAULT_SMOOTH_SCROLL_PRESETS) {
      const defs = DEFAULT_SMOOTH_SCROLL_PRESETS[settings.preset];
      patchSS({
        stepSize: defs.stepSize,
        animationTime: defs.animationTime,
        accelerationEnabled: defs.accelerationEnabled,
        accelerationDelta: defs.accelerationDelta,
        accelerationMax: defs.accelerationMax,
      });
    } else {
      // If on native or custom, restore to smooth
      const defs = DEFAULT_SMOOTH_SCROLL_PRESETS.smooth;
      patchSS({
        preset: "smooth",
        stepSize: defs.stepSize,
        animationTime: defs.animationTime,
        accelerationEnabled: defs.accelerationEnabled,
        accelerationDelta: defs.accelerationDelta,
        accelerationMax: defs.accelerationMax,
      });
    }
  };

  const handleSaveNewPreset = () => {
    const trimmed = newPresetName.trim();
    const name = trimmed || `Custom ${customPresets.length + 1}`;
    const id = `preset-user-${Date.now()}`;
    const newPreset: SmoothScrollCustomPreset = {
      id,
      name,
      color: newPresetColor,
      stepSize: settings.stepSize,
      animationTime: settings.animationTime,
      accelerationEnabled: settings.accelerationEnabled,
      accelerationDelta: settings.accelerationDelta,
      accelerationMax: settings.accelerationMax,
    };

    patchSS({
      preset: id,
      customPresets: [...customPresets, newPreset],
    });
    setCreatingNew(false);
    setNewPresetName("");
  };

  const handleDeleteCustomPreset = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const remaining = customPresets.filter((p) => p.id !== id);
    const nextPreset = settings.preset === id ? "smooth" : settings.preset;
    patchSS({
      preset: nextPreset,
      customPresets: remaining,
    });
  };

  // Helper when changing a parameter slider
  const handleParamChange = (partial: Partial<SmoothScrollSettings>) => {
    if (currentCustomPreset) {
      // Keep active custom preset in sync
      const updatedCustoms = customPresets.map((p) =>
        p.id === currentCustomPreset.id ? { ...p, ...partial } : p
      );
      patchSS({ ...partial, customPresets: updatedCustoms });
    } else {
      patchSS(partial);
    }
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Smooth Scrolling"
        description="Buttery smooth animated scrolling across all your Windows applications (Chrome, Word, VS Code, File Explorer, etc.) and KeyFlow."
        onBack={onBack}
      />

      {/* Master toggle */}
      <SettingsGroup
        title="System-Wide Scrolling Engine"
        icon="settings"
        desc="Enable fluid animated mouse wheel scrolling across all Windows applications"
        accentColor="blue"
      >
        <SettingsRow
          id="row-ss-enabled"
          title="Enable smooth scrolling"
          desc="Replaces coarse mouse wheel jumps with fluid momentum across all Windows desktop apps"
        >
          <Toggle
            label="Enable smooth scrolling"
            checked={settings.enabled}
            onChange={(v) => patchSS({ enabled: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      {/* Preset selector */}
      <SettingsGroup
        title="Preset"
        icon="sparkles"
        desc="Choose a scrolling feel, fine-tune parameters, or create custom presets"
        accentColor="purple"
      >
        <div className="ss-preset-toolbar">
          <div className="ss-active-feel-badge">
            <span className="tiny text-muted uppercase bold tracking-wider">Active Feel:</span>
            <span className="ss-active-feel-tag">
              {currentCustomPreset && (
                <span className={`ss-preset-color-dot ${currentCustomPreset.color || "purple"}`} />
              )}
              <span>{activePresetLabel}</span>
            </span>
          </div>
          <div className="ss-preset-actions">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleResetPreset}
              title="Reset current preset parameters to factory defaults"
            >
              <Icon name="history" size={12} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              className={`btn btn-xs ${showAdvanced ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
              title="Toggle advanced tuning parameters for this preset"
            >
              <Icon name="sliders" size={12} />
              <span>{showAdvanced ? "Hide Advanced" : "Advanced Options"}</span>
            </button>
          </div>
        </div>

        <div className="ss-preset-grid">
          {/* Built-in Presets */}
          {BUILTIN_PRESETS.map((p) => {
            const isActive = settings.preset === p.id;
            const currentSpecs =
              p.id === "custom"
                ? [`${settings.animationTime}ms`, `${settings.stepSize}px`, `${settings.accelerationMax}× max`]
                : p.specs;

            return (
              <button
                key={p.id}
                type="button"
                className={`ss-preset-card${isActive ? " is-selected" : ""}${!settings.enabled && p.id !== "native" ? " is-muted" : ""}`}
                onClick={() => handleSelectPreset(p.id)}
                aria-pressed={isActive}
              >
                <div className="ss-preset-card-header">
                  <div className="row gap-xs items-center">
                    <div className="ss-preset-icon-box">
                      <Icon name={p.icon as any} size={15} />
                    </div>
                    <span className="ss-preset-card-label">{p.label}</span>
                  </div>
                  <div className="row gap-xs items-center">
                    {p.badge && (
                      <span className={`ss-preset-card-badge${isActive ? " is-active" : ""}`}>
                        {p.badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="ss-preset-card-check" aria-hidden="true">
                        <Icon name="check" size={11} />
                      </span>
                    )}
                  </div>
                </div>

                <p className="ss-preset-card-desc">{p.description}</p>

                <div className="ss-spec-chips">
                  {currentSpecs.map((spec, i) => (
                    <span key={i} className="ss-spec-chip">
                      {spec}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}

          {/* User Custom Presets */}
          {customPresets.map((cp) => {
            const isActive = settings.preset === cp.id;
            return (
              <button
                key={cp.id}
                type="button"
                className={`ss-preset-card${isActive ? " is-selected" : ""}`}
                onClick={() => handleSelectPreset(cp.id)}
                aria-pressed={isActive}
              >
                <div className="ss-preset-card-header">
                  <div className="row gap-xs items-center">
                    <div className="ss-preset-icon-box">
                      <span className={`ss-preset-color-dot ${cp.color || "purple"}`} />
                    </div>
                    <span className="ss-preset-card-label text-ellipsis">{cp.name}</span>
                  </div>
                  <div className="row gap-xs items-center">
                    {isActive && (
                      <span className="ss-preset-card-check" aria-hidden="true">
                        <Icon name="check" size={11} />
                      </span>
                    )}
                    <button
                      type="button"
                      className="ss-preset-card-delete"
                      onClick={(e) => handleDeleteCustomPreset(e, cp.id)}
                      title={`Delete preset ${cp.name}`}
                      aria-label={`Delete preset ${cp.name}`}
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </div>
                </div>

                <p className="ss-preset-card-desc">Custom curve profile</p>

                <div className="ss-spec-chips">
                  <span className="ss-spec-chip">{cp.animationTime}ms</span>
                  <span className="ss-spec-chip">{cp.stepSize}px</span>
                  <span className="ss-spec-chip">{cp.accelerationMax}× max</span>
                </div>
              </button>
            );
          })}

          {/* Quick Create Preset Card in the deck */}
          {!creatingNew && (
            <button
              type="button"
              className="ss-preset-add-card"
              onClick={() => {
                setCreatingNew(true);
                setShowAdvanced(true);
              }}
              title="Save current scrolling settings as a custom preset"
            >
              <div className="ss-preset-icon-box">
                <Icon name="plus" size={14} />
              </div>
              <span className="ss-preset-add-label">+ New Custom Preset</span>
              <span className="ss-preset-add-desc">Save current parameters</span>
            </button>
          )}
        </div>

        {/* Create New Preset Panel */}
        {creatingNew && (
          <div className="ss-create-preset-panel">
            <div className="ss-create-preset-header">
              <div className="row gap-xs items-center">
                <Icon name="sparkles" size={14} className="text-accent" />
                <span className="ss-create-preset-title">Save as New Custom Preset</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setCreatingNew(false)}
              >
                Cancel
              </button>
            </div>

            <p className="ss-create-preset-desc">
              Save your current duration ({settings.animationTime}ms), step size ({settings.stepSize}px), and acceleration settings as a reusable custom preset.
            </p>

            <div className="ss-create-preset-form">
              <div className="ss-form-row">
                <label className="tiny bold uppercase tracking-wider text-muted">Preset Name</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Preset name (e.g. Ultra Responsive)"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveNewPreset();
                    if (e.key === "Escape") setCreatingNew(false);
                  }}
                  autoFocus
                />
              </div>

              <div className="ss-form-row">
                <label className="tiny bold uppercase tracking-wider text-muted">Color Accent</label>
                <div className="ss-color-picker-row">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`ss-color-chip ${c.id}${newPresetColor === c.id ? " is-selected" : ""}`}
                      onClick={() => setNewPresetColor(c.id)}
                      title={c.label}
                      aria-label={c.label}
                    />
                  ))}
                </div>
              </div>

              <div className="ss-create-preset-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCreatingNew(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveNewPreset}
                >
                  <Icon name="check" size={13} />
                  <span>Save Preset</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </SettingsGroup>

      {/* Advanced Parameters — accessible for any preset */}
      {(showAdvanced || settings.preset === "custom") && (
        <SettingsGroup
          title="Advanced Parameters"
          icon="terminal"
          desc={`Tuning parameters for preset: ${settings.preset.toUpperCase()}`}
          accentColor="amber"
        >
          {isNative ? (
            <div className="p-sm text-secondary small">
              The Native preset uses un-accelerated OS hardware stepping without animation curves. Select Smooth, Silky, Fast, or Custom above to adjust animation values.
            </div>
          ) : (
            <>
              <SettingsRow
                id="row-ss-step"
                title="Step size"
                desc="Pixels scrolled per mouse wheel notch"
              >
                <Slider
                  min={40}
                  max={200}
                  step={10}
                  value={settings.stepSize}
                  onChange={(v) => handleParamChange({ stepSize: v })}
                  showValue
                  formatValue={(v) => `${v}px`}
                />
              </SettingsRow>

              <SettingsRow
                id="row-ss-duration"
                title="Animation duration"
                desc="How long each scroll impulse takes to complete"
              >
                <Slider
                  min={80}
                  max={800}
                  step={20}
                  value={settings.animationTime}
                  onChange={(v) => handleParamChange({ animationTime: v })}
                  showValue
                  formatValue={(v) => `${v}ms`}
                />
              </SettingsRow>

              <SettingsRow
                id="row-ss-accel-enabled"
                title="Scroll acceleration"
                desc="Multiply speed when wheel events arrive in rapid succession"
              >
                <Toggle
                  label="Scroll acceleration"
                  checked={settings.accelerationEnabled}
                  onChange={(v) => handleParamChange({ accelerationEnabled: v })}
                />
              </SettingsRow>

              {settings.accelerationEnabled && (
                <>
                  <SettingsRow
                    id="row-ss-accel-delta"
                    title="Acceleration window"
                    desc="If next wheel event arrives within this window, accelerate"
                  >
                    <Slider
                      min={20}
                      max={120}
                      step={5}
                      value={settings.accelerationDelta}
                      onChange={(v) => handleParamChange({ accelerationDelta: v })}
                      showValue
                      formatValue={(v) => `${v}ms`}
                    />
                  </SettingsRow>

                  <SettingsRow
                    id="row-ss-accel-max"
                    title="Max acceleration"
                    desc="Maximum speed multiplier from rapid repeated scrolling"
                  >
                    <Slider
                      min={1}
                      max={6}
                      step={0.5}
                      value={settings.accelerationMax}
                      onChange={(v) => handleParamChange({ accelerationMax: v })}
                      showValue
                      formatValue={(v) => `${v}×`}
                    />
                  </SettingsRow>
                </>
              )}
            </>
          )}
        </SettingsGroup>
      )}

      {/* Feature toggles */}
      <SettingsGroup
        title="Features"
        icon="keyboard"
        desc="Additional scrolling behaviours"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-ss-trackpad"
          title="Trackpad pass-through"
          desc="Detect precision trackpads and let their events pass through natively without animation"
        >
          <Toggle
            label="Trackpad pass-through"
            checked={settings.trackpadPassThrough}
            onChange={(v) => patchSS({ trackpadPassThrough: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-ss-horizontal"
          title="Horizontal scrolling"
          desc="Apply smooth animation to horizontal wheel and Shift+Wheel events"
        >
          <Toggle
            label="Horizontal scrolling"
            checked={settings.horizontalScrolling}
            onChange={(v) => patchSS({ horizontalScrolling: v })}
          />
        </SettingsRow>

        <SettingsRow
          id="row-ss-keyboard"
          title="Keyboard scrolling"
          desc="Apply smooth animation to Arrow and Page key scrolling (does not intercept KeyFlow shortcuts)"
        >
          <Toggle
            label="Keyboard scrolling"
            checked={settings.keyboardScrolling}
            onChange={(v) => patchSS({ keyboardScrolling: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      {/* Live preview */}
      <SettingsGroup
        title="Live Preview"
        icon="visual"
        desc="Scroll inside this box to test your current settings"
        accentColor="green"
      >
        <div className="ss-preview-container">
          <div className="ss-preview-header">
            <div className="row gap-xs items-center">
              <Icon name="mouse" size={13} className="text-secondary" />
              <span className="tiny bold uppercase tracking-wider text-secondary">Interactive Test Area</span>
            </div>
            <span className="tiny text-muted">Scroll mouse wheel here to test animation response</span>
          </div>
          <div ref={previewRef} className="ss-preview-scroll">
            {PREVIEW_ITEMS.map((item, i) => (
              <div key={i} className="ss-preview-row">
                <span className="ss-preview-index">{i + 1}</span>
                <span className="ss-preview-label">{item}</span>
              </div>
            ))}
          </div>
          {!isEnabled && (
            <div className="ss-preview-native-notice">
              Native scrolling active — enable smooth scrolling above to preview
            </div>
          )}
        </div>
      </SettingsGroup>
    </div>
  );
};
