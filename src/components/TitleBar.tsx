import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const profiles = useStore((s) => s.data.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const appearance = useStore((s) => s.data.settings.appearance);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const activeProfile = profiles.find((p) => p.id === activeId);

  useEffect(() => {
    const eapi = (window as any).electronAPI;
    if (typeof eapi?.windowControls?.minimize !== "function") return;

    void eapi.windowControls.isMaximized().then((value: boolean) => setMaximized(value)).catch(() => undefined);
    const cleanup = eapi.windowControls.onMaximizedChange((value: boolean) => setMaximized(value));
    return () => cleanup();
  }, []);

  const eapi = (window as any).electronAPI;
  if (typeof eapi?.windowControls?.minimize !== "function") return null;

  const theme = appearance.theme === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : appearance.theme;

  const toggleMaximize = () => void eapi.windowControls.toggleMaximize();
  const handleTitlebarDoubleClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    toggleMaximize();
  };

  const dragRegion = {
    WebkitAppRegion: "drag",
  } as CSSProperties;
  const noDrag = {
    WebkitAppRegion: "no-drag",
  } as CSSProperties;

  return (
    <header
      className="electron-titlebar"
      data-theme={theme}
      style={dragRegion}
      onDoubleClick={handleTitlebarDoubleClick}
    >
      <div className="titlebar-brand" style={noDrag}>
        <span className="titlebar-logo">
          <Icon name="logo" size={15} />
        </span>
        <span className="titlebar-name">KeyFlow</span>
        {activeProfile && (
          <span className="titlebar-profile" title={`Active profile: ${activeProfile.name}`}>
            {activeProfile.name}
          </span>
        )}
        {(paused || safeMode) && (
          <span
            className="titlebar-status-dot"
            title={safeMode ? "Safe Mode active (all shortcuts disabled)" : "KeyFlow is paused"}
          />
        )}
      </div>

      <div className="titlebar-drag-space" aria-hidden="true" />

      <div className="titlebar-controls" style={noDrag}>
        <button
          type="button"
          className="tb-btn"
          onClick={() => void eapi.windowControls.minimize()}
          aria-label="Minimize"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M2 6h8" />
          </svg>
        </button>
        <button
          type="button"
          className="tb-btn"
          onClick={toggleMaximize}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
              <rect x="3" y="4.5" width="7" height="6.5" rx="1" />
              <path d="M4.5 4.5V2.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H8.5" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="tb-btn tb-close"
          onClick={() => void eapi.windowControls.close()}
          aria-label="Close"
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      </div>
    </header>
  );
}
