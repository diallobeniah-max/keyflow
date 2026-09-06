import { FC, useEffect, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerSlash,
  MusicNotes,
  X,
} from "@phosphor-icons/react";

export const MediaPlayerOverlay: FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("media-player-window");
    return () => {
      document.documentElement.classList.remove("media-player-window");
    };
  }, []);

  const triggerFeedback = (text: string) => {
    setFeedback(text);
    const t = window.setTimeout(() => setFeedback(null), 1200);
    return () => window.clearTimeout(t);
  };

  const execute = (action: any, label: string) => {
    const api = (window as any).electronAPI;
    if (api?.actions?.run) {
      void api.actions.run(action);
    } else if (api?.executeAction) {
      void api.executeAction(action);
    }
    triggerFeedback(label);
  };

  const handlePrev = () => {
    execute({ type: "mediaControl", payload: { media: "prev" } }, "Previous");
  };

  const handlePlayPause = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    execute({ type: "mediaControl", payload: { media: "playpause" } }, nextState ? "Play" : "Pause");
  };

  const handleNext = () => {
    execute({ type: "mediaControl", payload: { media: "next" } }, "Next");
  };

  const handleVolumeDown = () => {
    execute({ type: "volumeControl", payload: { volume: "down" } }, "Vol -");
  };

  const handleVolumeUp = () => {
    execute({ type: "volumeControl", payload: { volume: "up" } }, "Vol +");
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    execute({ type: "toggleMute", payload: {} }, next ? "Muted" : "Unmuted");
  };

  const handleClose = () => {
    void (window as any).electronAPI?.mediaPlayer?.setEnabled?.(false);
  };

  return (
    <div className="media-player-root anim-fade-in">
      <div className="media-player-pill" role="region" aria-label="Media Player Pill">
        {/* Left Side: Dynamic Island Music Badge */}
        <div className="media-player-badge">
          <div className="media-player-icon-wrap" title="Media Playing">
            <MusicNotes size={16} weight="bold" className="media-player-music-icon" />
          </div>
          <div className="media-player-info">
            <span className="media-player-title">
              {feedback ? feedback : "Now Playing"}
            </span>
            <span className="media-player-bars" aria-hidden="true">
              <span className={`bar ${isPlaying ? "is-active" : ""}`} />
              <span className={`bar ${isPlaying ? "is-active" : ""}`} />
              <span className={`bar ${isPlaying ? "is-active" : ""}`} />
            </span>
          </div>
        </div>

        {/* Center: Playback Transport Controls */}
        <div className="media-player-transport">
          <button
            type="button"
            className="media-player-btn"
            onClick={handlePrev}
            title="Previous track"
            aria-label="Previous track"
          >
            <SkipBack size={16} weight="fill" />
          </button>

          <button
            type="button"
            className="media-player-btn media-player-play-btn"
            onClick={handlePlayPause}
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause size={17} weight="fill" />
            ) : (
              <Play size={17} weight="fill" />
            )}
          </button>

          <button
            type="button"
            className="media-player-btn"
            onClick={handleNext}
            title="Next track"
            aria-label="Next track"
          >
            <SkipForward size={16} weight="fill" />
          </button>
        </div>

        {/* Divider */}
        <div className="media-player-divider" aria-hidden="true" />

        {/* Right Side: Volume & Close */}
        <div className="media-player-volume-group">
          <button
            type="button"
            className="media-player-btn media-player-vol-btn"
            onClick={handleVolumeDown}
            title="Volume down"
            aria-label="Volume down"
          >
            <SpeakerLow size={15} weight="bold" />
          </button>

          <button
            type="button"
            className={`media-player-btn media-player-vol-btn ${isMuted ? "is-muted" : ""}`}
            onClick={handleToggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <SpeakerSlash size={15} weight="bold" />
            ) : (
              <SpeakerHigh size={15} weight="bold" />
            )}
          </button>

          <button
            type="button"
            className="media-player-btn media-player-vol-btn"
            onClick={handleVolumeUp}
            title="Volume up"
            aria-label="Volume up"
          >
            <SpeakerHigh size={15} weight="bold" />
          </button>

          <button
            type="button"
            className="media-player-btn media-player-close-btn"
            onClick={handleClose}
            title="Hide Media Player"
            aria-label="Hide Media Player"
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
};
