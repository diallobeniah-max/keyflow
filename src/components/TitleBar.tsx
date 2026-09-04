import { useEffect } from "react";
import { useStore } from "../store/useStore";
import { getAppIconAsset } from "../lib/app-icon";
import { useResolvedTheme } from "../lib/useResolvedTheme";

export function TitleBar() {
  const appearance = useStore((s) => s.data.settings.appearance);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);

  const theme = useResolvedTheme(appearance.theme);
  const appIconAsset = getAppIconAsset(appearance.appIcon);

  useEffect(() => {
    void window.electronAPI?.windowControls.setTitleBarTheme(theme).catch(() => undefined);
  }, [theme]);

  return (
    <header
      className="electron-titlebar"
      data-theme={theme}
      onDoubleClick={() => void window.electronAPI?.windowControls.toggleMaximize()}
    >
      <div className="titlebar-brand">
        <span className="titlebar-logo">
          <img src={appIconAsset} alt="" draggable={false} />
        </span>
        <span className="titlebar-name">KeyFlow</span>
        {(paused || safeMode) && (
          <span
            className="titlebar-status-dot"
            title={safeMode ? "Safe Mode active (all shortcuts disabled)" : "KeyFlow is paused"}
          />
        )}
      </div>

      <div className="titlebar-drag-space" aria-hidden="true" />
    </header>
  );
}
