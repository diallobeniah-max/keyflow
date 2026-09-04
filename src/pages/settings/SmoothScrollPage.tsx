import { type FC, useRef } from "react";
import { useStore } from "../../store/useStore";
import { SettingsGroup, SettingsRow, Toggle, Slider } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { useSmoothScroll } from "../../hooks/useSmoothScroll";
import type { SmoothScrollPreset, SmoothScrollSettings } from "../../types/index";

interface SmoothScrollPageProps {
  onBack?: () => void;
}

// Preset card metadata
const PRESETS: {
  id: SmoothScrollPreset;
  label: string;
  description: string;
  badge?: string;
}[] = [
  {
    id: "native",
    label: "Native",
    description: "OS default stepped scrolling, no animation",
    badge: "Off",
  },
  {
    id: "smooth",
    label: "Smooth",
    description: "Natural fluid animation, moderate acceleration",
    badge: "Default",
  },
  {
    id: "silky",
    label: "Silky",
    description: "Longer, softer glide with gentle deceleration",
  },
  {
    id: "fast",
    label: "Fast",
    description: "Short snappy animation with high acceleration",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Manual control over every parameter",
  },
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
    animationTime: 400,
    accelerationEnabled: true,
    accelerationDelta: 50,
    accelerationMax: 3,
    keyboardScrolling: false,
    horizontalScrolling: true,
    trackpadPassThrough: true,
    ...ss,
  };

  const patchSS = (partial: Partial<SmoothScrollSettings>) => {
    patch("smoothScroll" as any, partial);
  };

  const isEnabled = settings.enabled && settings.preset !== "native";
  const isCustom = settings.preset === "custom";

  // Live preview: attach the scroll engine to the preview box
  const previewRef = useRef<HTMLDivElement>(null);
  // Only pass settings if enabled and not native, so the preview reflects real behaviour
  const previewSettings: SmoothScrollSettings | undefined = isEnabled ? settings : undefined;
  useSmoothScroll(previewRef as any, previewSettings);

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Smooth Scrolling"
        description="Add fluid animation to mouse wheel scrolling inside KeyFlow panels and lists."
        onBack={onBack}
      />

      {/* Master toggle */}
      <SettingsGroup
        title="Scrolling Engine"
        icon="settings"
        desc="Enable animated wheel scrolling for all KeyFlow panels"
        accentColor="blue"
      >
        <SettingsRow
          id="row-ss-enabled"
          title="Enable smooth scrolling"
          desc="Replaces stepped mouse wheel scrolling with fluid animation inside KeyFlow"
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
        desc="Choose a scrolling feel, or use Custom for full control"
        accentColor="purple"
      >
        <div className="ss-preset-grid">
          {PRESETS.map((p) => {
            const isActive = settings.preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`ss-preset-card${isActive ? " is-selected" : ""}${!settings.enabled && p.id !== "native" ? " is-muted" : ""}`}
                onClick={() => patchSS({ preset: p.id })}
                aria-pressed={isActive}
              >
                <div className="ss-preset-card-header">
                  <span className="ss-preset-card-label">{p.label}</span>
                  {p.badge && (
                    <span className={`ss-preset-card-badge${isActive ? " is-active" : ""}`}>
                      {p.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="ss-preset-card-check" aria-hidden="true">✓</span>
                  )}
                </div>
                <p className="ss-preset-card-desc">{p.description}</p>
              </button>
            );
          })}
        </div>
      </SettingsGroup>

      {/* Advanced — only when Custom preset */}
      {isCustom && (
        <SettingsGroup
          title="Advanced"
          icon="terminal"
          desc="Fine-tune the animation parameters manually"
          accentColor="amber"
        >
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
              onChange={(v) => patchSS({ stepSize: v })}
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
              onChange={(v) => patchSS({ animationTime: v })}
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
              onChange={(v) => patchSS({ accelerationEnabled: v })}
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
                  onChange={(v) => patchSS({ accelerationDelta: v })}
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
                  onChange={(v) => patchSS({ accelerationMax: v })}
                  showValue
                  formatValue={(v) => `${v}×`}
                />
              </SettingsRow>
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
