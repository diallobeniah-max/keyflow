import type { FC } from "react";
import { useStore } from "../../store/useStore";
import { AppSelect } from "../../components/ui/AppSelect";
import { SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { MediaPlayerPosition, MediaPlayerSettings } from "../../types";

interface MediaPlayerPageProps {
  onBack?: () => void;
}

const POSITION_OPTIONS: Array<{ value: MediaPlayerPosition; label: string }> = [
  { value: "top-center", label: "Top Center (Apple Dynamic Island)" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-center", label: "Bottom Center" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "custom", label: "Custom (Draggable anywhere)" },
];

export const MediaPlayerPage: FC<MediaPlayerPageProps> = ({ onBack }) => {
  const settings = useStore((s) => s.data.settings);
  const patch = useStore((s) => s.patchSettings);

  const mp: MediaPlayerSettings = settings.mediaPlayer ?? {
    enabled: false,
    position: "top-center",
    autoHide: false,
  };
  const isEnabled = mp.enabled;

  const updateConfig = (partial: Partial<MediaPlayerSettings>) => {
    const updated = { ...mp, ...partial };
    patch("mediaPlayer" as any, updated as any);
    void (window as any).electronAPI?.mediaPlayer?.updateConfig?.(updated);
  };

  const handleToggle = (checked: boolean) => {
    updateConfig({ enabled: checked });
    void (window as any).electronAPI?.mediaPlayer?.setEnabled?.(checked);
  };

  const handlePositionChange = (pos: string) => {
    updateConfig({ position: pos as MediaPlayerPosition });
  };

  const handleResetPosition = () => {
    updateConfig({ position: "top-center", customX: undefined, customY: undefined });
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Media Player Pill"
        description="Floating Apple-style capsule overlay providing instant play, pause, track skipping, and volume control anywhere on your display."
        onBack={onBack}
        badge={isEnabled ? "Active" : undefined}
      />

      <SettingsGroup
        title="Status"
        icon="play"
        desc="Floating media player widget activation"
        accentColor="purple"
      >
        <SettingsRow
          id="row-media-player-enable"
          title="Enable Media Player Pill"
          desc="Show the sleek Apple-style floating pill media overlay with playback and volume controls"
        >
          <Toggle
            label="Enable Media Player Pill"
            checked={isEnabled}
            onChange={handleToggle}
          />
        </SettingsRow>
      </SettingsGroup>

      <div className={isEnabled ? "" : "settings-progressive-disabled"}>
        <SettingsGroup
          title="Placement & Position"
          icon="desktop"
          desc="Choose where the media capsule is positioned on your primary monitor"
          accentColor="blue"
        >
          <SettingsRow
            id="row-media-player-position"
            title="Screen placement"
            desc="Select a preset placement or drag the pill freely across your screen"
          >
            <div className="w-260">
              <AppSelect
                value={mp.position}
                disabled={!isEnabled}
                onChange={handlePositionChange}
                options={POSITION_OPTIONS}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            id="row-media-player-reset"
            title="Reset position"
            desc="Reset the media player to the default Top Center Dynamic Island position"
          >
            <button
              type="button"
              disabled={!isEnabled}
              className="btn btn-secondary btn-sm"
              onClick={handleResetPosition}
            >
              Reset to Top Center
            </button>
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup
          title="Quick Media Controls Test"
          icon="speaker"
          desc="Test Windows media transport and volume keys"
          accentColor="green"
        >
          <SettingsRow
            id="row-media-player-test"
            title="Test media commands"
            desc="Verify system playback commands for Spotify, YouTube, Apple Music, and media players"
          >
            <div className="row gap-xs wrap">
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "mediaControl", payload: { media: "prev" } })}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "mediaControl", payload: { media: "playpause" } })}
              >
                Play / Pause
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "mediaControl", payload: { media: "next" } })}
              >
                Next
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "volumeControl", payload: { volume: "down" } })}
              >
                Vol -
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "volumeControl", payload: { volume: "up" } })}
              >
                Vol +
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => (window as any).electronAPI?.executeAction?.({ type: "toggleMute", payload: {} })}
              >
                Mute
              </button>
            </div>
          </SettingsRow>
        </SettingsGroup>
      </div>
    </div>
  );
};
