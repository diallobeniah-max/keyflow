import { useEffect, useState, useRef } from "react";
import { useStore } from "../store/useStore";
import { getAppIconAsset } from "../lib/app-icon";
import { useResolvedTheme } from "../lib/useResolvedTheme";
import { Icon } from "./Icon";

export function TitleBar() {
  const appearance = useStore((s) => s.data.settings.appearance);
  const patch = useStore((s) => s.patchSettings);
  const toast = useStore((s) => s.toast);
  const navigate = useStore((s) => s.navigate);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);

  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const theme = useResolvedTheme(appearance.theme);
  const appIconAsset = getAppIconAsset(appearance.appIcon);

  useEffect(() => {
    void window.electronAPI?.windowControls.setTitleBarTheme(theme).catch(() => undefined);
  }, [theme]);

  // Click outside to dismiss context menu
  useEffect(() => {
    if (!contextMenuPos) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenuPos(null);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [contextMenuPos]);

  const showLockedNotification = () => {
    toast("Window size is locked. Unlock it in Appearance settings to allow resizing or maximizing.", "warning", {
      label: "Unlock Size",
      onClick: () => patch("appearance", { lockWindowSize: false }),
    });
  };

  const handleDoubleClick = async () => {
    if (appearance.lockWindowSize) {
      showLockedNotification();
      return;
    }
    await window.electronAPI?.windowControls.toggleMaximize?.();
  };

  // Enforce window lock: if maximized while lock is enabled, unmaximize and toast
  useEffect(() => {
    const unsubscribe = window.electronAPI?.windowControls.onMaximizedChange?.((maximized) => {
      if (maximized && appearance.lockWindowSize) {
        void window.electronAPI?.windowControls.toggleMaximize?.();
        showLockedNotification();
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [appearance.lockWindowSize]);

  const restoreDefaultSize = async () => {
    try {
      const isMax = await window.electronAPI?.windowControls.isMaximized?.();
      if (isMax) {
        await window.electronAPI?.windowControls.toggleMaximize?.();
      }
      window.resizeTo?.(1020, 700);
      toast("Restored default window size (1020 × 700)", "info");
    } catch {
      window.resizeTo?.(1020, 700);
    }
    setContextMenuPos(null);
  };

  const toggleLock = () => {
    const next = !appearance.lockWindowSize;
    patch("appearance", { lockWindowSize: next });
    toast(next ? "Window size locked (maximization prevented)" : "Window size unlocked", "info");
    setContextMenuPos(null);
  };

  return (
    <header
      className="electron-titlebar"
      data-theme={theme}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="titlebar-brand no-drag-region"
        title="Right-click for Window Size & Lock options"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenuPos({ x: e.clientX, y: e.clientY });
        }}
      >
        <span className="titlebar-logo">
          <img src={appIconAsset} alt="KeyFlow Logo" draggable={false} />
        </span>
        <span className="titlebar-name">KeyFlow</span>
        {appearance.lockWindowSize && (
          <span className="titlebar-lock-badge" title="Window size locked">
            <Icon name="lock" size={11} />
          </span>
        )}
        {(paused || safeMode) && (
          <span
            className="titlebar-status-dot"
            title={safeMode ? "Safe Mode active (all shortcuts disabled)" : "KeyFlow is paused"}
          />
        )}
      </div>

      {contextMenuPos && (
        <div
          ref={menuRef}
          className="window-size-context-menu anim-dropdown-enter"
          style={{ top: contextMenuPos.y + 4, left: contextMenuPos.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span className="bold">KeyFlow Window</span>
          </div>
          <button
            type="button"
            className="context-menu-item"
            onClick={restoreDefaultSize}
          >
            <Icon name="arrows" size={14} />
            <span>Restore Default Size (1020 × 700)</span>
          </button>
          <button
            type="button"
            className={"context-menu-item" + (appearance.lockWindowSize ? " is-active" : "")}
            onClick={toggleLock}
          >
            <Icon name="lock" size={14} />
            <span>{appearance.lockWindowSize ? "✓ Lock Window Size (Locked)" : "Lock Window Size"}</span>
          </button>
          <div className="context-menu-divider" />
          <button
            type="button"
            className="context-menu-item"
            onClick={() => {
              navigate("settings", "appearance");
              setContextMenuPos(null);
            }}
          >
            <Icon name="gear" size={14} />
            <span>Appearance Settings…</span>
          </button>
        </div>
      )}

      <div className="titlebar-drag-space" aria-hidden="true" />
    </header>
  );
}
