import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const profiles = useStore((s) => s.data.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const appearance = useStore((s) => s.data.settings.appearance);
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
      <div className="titlebar-brand">
        <span className="titlebar-logo"><Icon name="logo" size={16} /></span>
        <span className="titlebar-name">KeyFlow</span>
        <span className="titlebar-badge">DESKTOP</span>
        {activeProfile && <span className="titlebar-profile">{activeProfile.name}</span>}
      </div>

      <div className="titlebar-drag-space" aria-hidden="true" />

      <div className="titlebar-controls" style={noDrag}>
        <button type="button" className="tb-btn" onClick={() => void eapi.windowControls.minimize()} aria-label="Minimize" title="Minimize">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 12h10" /></svg>
        </button>
        <button type="button" className="tb-btn" onClick={toggleMaximize} aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"}>
          {maximized ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="4" y="6" width="10" height="9" /><path d="M4 6V3h9" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="2.5" y="2.5" width="11" height="11" /></svg>
          )}
        </button>
        <button type="button" className="tb-btn tb-close" onClick={() => void eapi.windowControls.close()} aria-label="Close" title="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
    </header>
  );
}
