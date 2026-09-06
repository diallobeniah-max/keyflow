import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { getSafeHyperKeySuggestions } from "../../lib/conflict";
import { SettingsPageHeader } from "./SettingsPageHeader";

const BUILTIN_HYPER_TAP_OPTIONS = [
  { value: "showPopup", label: "Quick Menu / Popup Menu" },
  { value: "notesPopup", label: "Floating Notes Scratchpad" },
  { value: "screenshot", label: "Screenshot Snip Overlay" },
  { value: "alwaysOnTop", label: "Toggle Always on Top" },
  { value: "openSettings", label: "Open Settings" },
  { value: "", label: "None (chord modifier only)" },
];

interface KeyboardPageProps {
  onBack?: () => void;
}

export const KeyboardPage: FC<KeyboardPageProps> = ({ onBack }) => {
  const data = useStore((s) => s.data);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const settings = data.settings;
  const patch = useStore((s) => s.patchSettings);

  const hyperEnabled = settings.shortcuts.hyperKeyConfig?.enabled ?? false;
  const hyperKey = settings.shortcuts.hyperKeyConfig?.key ?? "AltRight";
  const hyperSuggestions = getSafeHyperKeySuggestions(data.shortcuts, activeProfileId, hyperKey);
  const currentWarning = hyperSuggestions.find((s) => s.value === hyperKey)?.warning;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Keyboard & Gestures"
        description="Control KeyFlow's custom key behavior, gesture timings, Hyper Key modifier, and typing protection."
        onBack={onBack}
      />

      <SettingsGroup
        title="Special Key Behavior"
        icon="keyboard"
        desc="Configure native bypass chords for system keys with assigned shortcuts"
        accentColor="amber"
      >
        <SettingsRow
          id="row-sc-alt-caps-bypass"
          title="Alt + CapsLock native bypass"
          desc="Hold Left or Right Alt (including when bound to Hyper Key) and tap CapsLock to toggle Windows CapsLock natively, preserving your CapsLock shortcut for normal presses"
        >
          <Toggle
            label="Alt + CapsLock native bypass"
            checked={settings.shortcuts.altCapsLockBypass !== false}
            onChange={(v) => patch("shortcuts", { altCapsLockBypass: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Gesture Timing"
        icon="shortcuts"
        desc="Default threshold intervals for automatic multi-tap and hold gestures"
        accentColor="purple"
      >
        <SettingsRow
          id="row-sc-double-tap"
          title="Double tap threshold"
          desc="Maximum time between two key presses in milliseconds"
        >
          <Slider
            min={150}
            max={600}
            step={25}
            value={settings.shortcuts.defaultDoubleTap}
            onChange={(v) => patch("shortcuts", { defaultDoubleTap: v })}
            showValue
            formatValue={(v) => `${v}ms`}
          />
        </SettingsRow>

        <SettingsRow
          id="row-sc-hold-thresh"
          title="Hold press threshold"
          desc="Duration to hold a key before long-press triggers fire"
        >
          <Slider
            min={200}
            max={1200}
            step={50}
            value={settings.shortcuts.defaultHold}
            onChange={(v) => patch("shortcuts", { defaultHold: v })}
            showValue
            formatValue={(v) => `${v}ms`}
          />
        </SettingsRow>

        <SettingsRow
          id="row-sc-repeat-prot"
          title="Key repeat protection"
          desc="Ignore repeated OS keydown events while holding a physical key"
        >
          <Toggle
            label="Key repeat protection"
            checked={settings.shortcuts.keyRepeatProtection}
            onChange={(v) => patch("shortcuts", { keyRepeatProtection: v })}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Hyper Key Modifier"
        icon="shortcuts"
        desc="Turn one physical key into your dedicated KeyFlow modifier for chords like Hyper + T"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-sc-hyper-enable"
          title="Enable Hyper Key"
          desc="Hold your chosen physical key and press another key to run a Hyper shortcut. Tap it alone to run the tap action."
        >
          <Toggle
            label="Enable Hyper Key"
            checked={hyperEnabled}
            onChange={(v) =>
              patch("shortcuts", {
                hyperKeyConfig: {
                  ...settings.shortcuts.hyperKeyConfig,
                  enabled: v,
                  key: hyperKey,
                  tapActionId: settings.shortcuts.hyperKeyConfig?.tapActionId ?? "showPopup",
                  suppressOriginal: true,
                },
              })
            }
          />
        </SettingsRow>

        <div className={hyperEnabled ? "" : "settings-progressive-disabled"}>
          <SettingsRow
            id="row-sc-hyper-key"
            title="Physical Hyper Key"
            desc={hyperKey === "None" ? "No physical Hyper key is assigned. Choose a key to enable taps and chords." : `Use the ${hyperSuggestions.find((s) => s.value === hyperKey)?.label.replace(" (Current)", "") ?? hyperKey} key on your keyboard. A laptop may require Fn to send this key.`}
          >
            <div className="col gap-xs w-220">
              <AppSelect
                value={hyperKey}
                disabled={!hyperEnabled}
                onChange={(key) =>
                  patch("shortcuts", {
                    hyperKeyConfig: {
                      ...settings.shortcuts.hyperKeyConfig,
                      enabled: hyperEnabled,
                      key,
                      tapActionId: settings.shortcuts.hyperKeyConfig?.tapActionId ?? "showPopup",
                      suppressOriginal: true,
                    },
                  })
                }
                options={hyperSuggestions.map((s) => ({
                  value: s.value,
                  label: s.label + (s.safe ? "" : " ⚠️"),
                }))}
              />
              {currentWarning && (
                <p className="tiny text-warning no-margin">{currentWarning}</p>
              )}
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-sc-hyper-tap"
            title="Tap Hyper Key Action"
            desc="Action triggered when the Hyper key is tapped alone without holding another key. Holding it chords with other keys."
          >
            <div className="w-220">
              <AppSelect
                value={settings.shortcuts.hyperKeyConfig?.tapActionId === "none" ? "" : settings.shortcuts.hyperKeyConfig?.tapActionId ?? "showPopup"}
                disabled={!hyperEnabled || hyperKey === "None"}
                onChange={(tapActionId) =>
                  patch("shortcuts", {
                    hyperKeyConfig: {
                      ...settings.shortcuts.hyperKeyConfig,
                      enabled: hyperEnabled,
                      key: hyperKey,
                      tapActionId,
                      suppressOriginal: true,
                    },
                  })
                }
                options={[
                  ...BUILTIN_HYPER_TAP_OPTIONS,
                  ...data.shortcuts
                    .filter((s) => s.profileId === activeProfileId && !s.id.startsWith("__system_"))
                    .map((s) => ({ value: s.id, label: s.name || `${s.key} (${s.trigger})` })),
                ]}
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Typing Burst Protection"
        icon="shortcuts"
        desc="Prevents rapid typing from accidentally activating single-key shortcuts"
        accentColor="blue"
      >
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
    </div>
  );
};
