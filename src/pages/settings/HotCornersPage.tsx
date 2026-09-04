import { useState, type FC } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { Button, Field, Input, SettingsGroup, SettingsRow, Slider, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { IconPickerModal } from "../../components/ui/IconPickerModal";
import { HOT_CORNER_ACTIONS } from "../../lib/constants";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { HotCornerPosition, HotCornersCustomPreset } from "../../types";

interface HotCornersPageProps {
  onBack?: () => void;
}

export const HotCornersPage: FC<HotCornersPageProps> = ({ onBack }) => {
  const data = useStore((s) => s.data);
  const settings = data.settings;
  const patch = useStore((s) => s.patchSettings);

  const [isAdjustingCornerArea, setIsAdjustingCornerArea] = useState(false);
  const [showSavePresetModal, setShowSavePresetModal] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [deletedPresetIds, setDeletedPresetIds] = useState<string[]>([]);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetIcon, setPresetIcon] = useState("star");
  const [presetColor, setPresetColor] = useState("#4F7CFF");
  const [showIconPicker, setShowIconPicker] = useState(false);

  const hotCorners = settings.hotCorners;
  const isEnabled = hotCorners?.enabled ?? false;

  const positions: Array<{ pos: HotCornerPosition; label: string }> = [
    { pos: "topLeft", label: "Top Left" },
    { pos: "topRight", label: "Top Right" },
    { pos: "bottomLeft", label: "Bottom Left" },
    { pos: "bottomRight", label: "Bottom Right" },
  ];

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Hot Corners"
        description="Trigger instant system actions and workflow shortcuts by nudging the mouse cursor into display corners."
        onBack={onBack}
        badge={isEnabled ? "Active" : undefined}
      />

      <SettingsGroup
        title="General"
        icon="window"
        desc="Master activation switch and trigger audio feedback"
        accentColor="yellow"
      >
        <SettingsRow
          id="row-hot-enable"
          title="Enable Hot Corners"
          desc="Detect corner dwell gestures across your desktop"
        >
          <Toggle
            label="Enable Hot Corners"
            checked={isEnabled}
            onChange={(v) => {
              const updated = { ...hotCorners, enabled: v };
              patch("hotCorners" as any, updated as any);
              window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
            }}
          />
        </SettingsRow>

        <SettingsRow
          id="row-hot-sound"
          title="Play sound on trigger"
          desc="Play custom audio chime when a corner action is activated"
        >
          <Toggle
            label="Play sound on trigger"
            checked={hotCorners?.soundEnabled ?? true}
            onChange={(v) => {
              const updated = { ...hotCorners, soundEnabled: v };
              patch("hotCorners" as any, updated as any);
              window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        <SettingsGroup
          title="Trigger Behavior & Timing"
          icon="shortcuts"
          desc="Detection zone radius and delay thresholds"
          accentColor="amber"
        >
          <SettingsRow
            id="row-hot-size"
            title="Corner activation area"
            desc="Hit-target size in pixels for each display corner"
          >
            <div
              className="w-260"
              onMouseEnter={() => setIsAdjustingCornerArea(true)}
              onMouseLeave={() => setIsAdjustingCornerArea(false)}
            >
              <Slider
                min={16}
                max={64}
                step={4}
                value={hotCorners?.cornerSize ?? 24}
                onChange={(v) => {
                  setIsAdjustingCornerArea(true);
                  const updated = { ...hotCorners, cornerSize: v };
                  patch("hotCorners" as any, updated as any);
                  window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                }}
                showValue
                formatValue={(v) => `${v}px`}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-hot-delay"
            title="Activation dwell time"
            desc="How long cursor must rest inside a corner before triggering"
          >
            <Slider
              min={150}
              max={1500}
              step={50}
              value={hotCorners?.activationMs ?? 400}
              onChange={(v) => {
                const updated = { ...hotCorners, activationMs: v };
                patch("hotCorners" as any, updated as any);
                window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
              }}
              showValue
              formatValue={(v) => `${v}ms`}
            />
          </SettingsRow>

          <SettingsRow
            id="row-hot-cooldown"
            title="Corner trigger cooldown"
            desc="Minimum delay before the same corner can trigger again"
          >
            <Slider
              min={200}
              max={3000}
              step={100}
              value={hotCorners?.cooldownMs ?? 800}
              onChange={(v) => {
                const updated = { ...hotCorners, cooldownMs: v };
                patch("hotCorners" as any, updated as any);
                window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
              }}
              showValue
              formatValue={(v) => `${v}ms`}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Corner Actions"
          icon="window"
          desc="Actions executed for each corner of your display"
          accentColor="green"
        >
          <div className="hot-corners-config-grid p-sm">
            {positions.map(({ pos, label }) => {
              const cornerObj = hotCorners?.corners?.[pos];
              const currentAction = cornerObj
                ? cornerObj.type === "shortcut"
                  ? `sc:${cornerObj.shortcutId}`
                  : cornerObj.action
                : "none";
              return (
                <div key={pos} className="hot-corner-quadrant-card">
                  <div className="hot-corner-quadrant-head">
                    <span className="bold small">{label}</span>
                    <span className="chip chip-subtle">{currentAction}</span>
                  </div>
                  <div className="mt-xs">
                    <AppSelect
                      value={currentAction}
                      onChange={(action) => {
                        const newActionObj = action.startsWith("sc:")
                          ? { type: "shortcut" as const, shortcutId: action.replace(/^sc:/, "") }
                          : { type: "builtin" as const, action: action as any };
                        const existingCorners = {
                          topLeft: { type: "builtin" as const, action: "none" as const },
                          topRight: { type: "builtin" as const, action: "none" as const },
                          bottomLeft: { type: "builtin" as const, action: "none" as const },
                          bottomRight: { type: "builtin" as const, action: "none" as const },
                          ...(hotCorners?.corners || {}),
                        };
                        const updated = {
                          ...hotCorners,
                          corners: {
                            ...existingCorners,
                            [pos]: newActionObj,
                          },
                        };
                        patch("hotCorners" as any, updated as any);
                        window.electronAPI?.hotCorners?.configure?.(updated as any, data.shortcuts);
                      }}
                      options={[
                        { value: "none", label: "None (Inactive)" },
                        ...HOT_CORNER_ACTIONS.map((a) => ({ value: a.value, label: a.label })),
                        ...data.shortcuts.map((s) => ({
                          value: `sc:${s.id}`,
                          label: `Shortcut: ${s.name || s.key}`,
                        })),
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="Displays & Multi-Monitor"
          icon="monitor"
          desc="Apply hot corners across single or multiple connected screens"
          accentColor="blue"
        >
          <SettingsRow
            id="row-hot-multi-monitor"
            title="Multi-monitor support"
            desc="Enable corner trigger zones on all connected external displays"
          >
            <Toggle
              label="Multi-monitor support"
              checked={(hotCorners as any)?.multiMonitor ?? false}
              onChange={(v) => {
                const updated = { ...hotCorners, multiMonitor: v };
                patch("hotCorners" as any, updated as any);
                window.electronAPI?.hotCorners?.configure?.(updated as any, data.shortcuts);
              }}
            />
          </SettingsRow>
        </SettingsGroup>
      </div>

      {showSavePresetModal &&
        createPortal(
          <div
            className="modal-backdrop anim-fade-in"
            onClick={() => {
              setShowSavePresetModal(false);
              setEditingPresetId(null);
            }}
          >
            <div className="hot-corners-save-modal anim-modal-enter" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingPresetId ? "Edit Corner Layout" : "Save Corner Layout"}
                </h3>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => {
                    setShowSavePresetModal(false);
                    setEditingPresetId(null);
                  }}
                >
                  ✕
                </button>
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
                  <div
                    className="preset-color-badge"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: presetColor,
                      boxShadow: `0 0 8px ${presetColor}88`,
                    }}
                  />
                </div>
                <div className="row gap-sm justify-end mt-sm">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowSavePresetModal(false);
                      setEditingPresetId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!presetNameInput.trim()}
                    onClick={() => {
                      const id = editingPresetId || `custom-${Date.now()}`;
                      const newPreset: HotCornersCustomPreset = {
                        id,
                        name: presetNameInput.trim(),
                        icon: presetIcon,
                        corners: {
                          topLeft: { type: "builtin" as const, action: "none" as const },
                          topRight: { type: "builtin" as const, action: "none" as const },
                          bottomLeft: { type: "builtin" as const, action: "none" as const },
                          bottomRight: { type: "builtin" as const, action: "none" as const },
                          ...(hotCorners?.corners || {}),
                        },
                        color: presetColor,
                      };
                      const existing = hotCorners?.customPresets || [];
                      const updatedPresets = editingPresetId
                        ? existing.map((p) => (p.id === id ? newPreset : p))
                        : [...existing, newPreset];
                      const updated = {
                        ...hotCorners,
                        customPresets: updatedPresets,
                        activePresetId: id,
                      };
                      patch("hotCorners" as any, updated as any);
                      window.electronAPI?.hotCorners?.configure?.(updated, data.shortcuts);
                      setShowSavePresetModal(false);
                      setEditingPresetId(null);
                      setPresetNameInput("");
                    }}
                  >
                    {editingPresetId ? "Save Changes" : "Save Preset"}
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      <IconPickerModal
        isOpen={showIconPicker}
        selectedIcon={presetIcon}
        selectedColor={presetColor}
        onSelect={(icon, color) => {
          setPresetIcon(icon);
          if (color) setPresetColor(color);
          setShowIconPicker(false);
        }}
        onClose={() => setShowIconPicker(false)}
      />
    </div>
  );
};
