import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Action, UIScale } from "../types";
import { useStore } from "../store/useStore";
import { runActions } from "../lib/actions";
import { createCommandRegistry, searchCommands, type CommandDefinition, type CommandExecutionContext } from "../lib/command-registry";
import { formatShortcutLabel, formatTriggerLabel } from "../lib/conflict";
import { SETTINGS_INDEX } from "../lib/settingsIndex";
import { Icon } from "./Icon";
import { Button, Toggle } from "./ui";

const SETTING_BOOLEAN_MAP: Record<string, { section: string; key: string; label: string }> = {
  "gen-startup": { section: "general", key: "launchOnStartup", label: "Launch on startup" },
  "gen-minimized": { section: "general", key: "startMinimized", label: "Start minimized" },
  "gen-tray": { section: "general", key: "minimizeToTray", label: "Minimize to tray" },
  "gen-notifications": { section: "general", key: "showNotifications", label: "Desktop notifications" },
  "gen-sound": { section: "general", key: "soundFeedback", label: "Sound feedback" },
  "gen-recent": { section: "general", key: "showRecentOnDashboard", label: "Show recent triggers" },
  "app-hover-help": { section: "appearance", key: "showHoverHelp", label: "Contextual hover help" },
  "app-icon-accent": { section: "appearance", key: "syncAccentWithAppIcon", label: "Match accent to app icon" },
  "app-compact": { section: "appearance", key: "compactMode", label: "Compact workspace mode" },
  "app-color-coded-settings": { section: "appearance", key: "colorCodedSettings", label: "Color-coded settings cards" },
  "app-reduce-motion": { section: "appearance", key: "reduceMotion", label: "Reduce motion animations" },
  "app-blur": { section: "appearance", key: "popupBlur", label: "Popup frosted glass blur" },
  "sc-command-palette": { section: "shortcuts", key: "commandPaletteEnabled", label: "Command Palette" },
  "sc-alt-caps-bypass": { section: "shortcuts", key: "altCapsLockBypass", label: "Alt + CapsLock native bypass" },
  "sc-cp-categories": { section: "shortcuts", key: "commandPaletteShowCategories", label: "Show category tags" },
  "sc-cp-show-more": { section: "shortcuts", key: "commandPaletteDefaultShowMore", label: "Always show details panel" },
  "sc-repeat-prot": { section: "shortcuts", key: "keyRepeatProtection", label: "Key repeat protection" },
  "sc-prevent-accidental": { section: "shortcuts", key: "preventAccidental", label: "Prevent accidental triggers" },
  "sc-hyper-enable": { section: "shortcuts", key: "hyperKeyEnabled", label: "Hyper Key" },
  "wasd-enable": { section: "wasdNavigation", key: "enabled", label: "WASD Navigation Mode" },
  "wasd-state-card": { section: "wasdNavigation", key: "showStateCard", label: "WASD Status HUD card" },
  "hot-enable": { section: "hotCorners", key: "enabled", label: "Hot Corners" },
  "pop-search": { section: "popup", key: "search", label: "Popup search bar" },
  "pop-icons": { section: "popup", key: "showIcons", label: "Show popup icons" },
  "pop-numbers": { section: "popup", key: "showNumbers", label: "Show quick number badges" },
  "pop-blur-close": { section: "popup", key: "closeOnBlur", label: "Close popup on blur" },
  "pop-action-close": { section: "popup", key: "closeAfterAction", label: "Close popup after action" },
  "priv-pause-pwd": { section: "privacy", key: "pauseInPassword", label: "Pause in password fields" },
  "priv-safe": { section: "privacy", key: "safeMode", label: "Emergency Safe Mode" },
  "data-auto-backup": { section: "data", key: "autoBackupEnabled", label: "Automatic backups" },
};

// The palette is intentionally renderer-local: Ctrl+K is available while the KeyFlow window is focused.
function isCommandShortcut(event: KeyboardEvent, shortcutSetting?: string): boolean {
  const target = (shortcutSetting || "Ctrl+K").trim().toLowerCase();
  const isCtrl = event.ctrlKey || event.metaKey;
  const isAlt = event.altKey;
  const isShift = event.shiftKey;
  const key = (event.key || "").toLowerCase();
  const code = (event.code || "").toLowerCase();

  const isK = key === "k" || code === "keyk";
  const isP = key === "p" || code === "keyp";
  const isSpace = key === " " || key === "space" || code === "space";

  if (target === "ctrl+k") return isCtrl && !isAlt && !isShift && isK;
  if (target === "ctrl+p") return isCtrl && !isAlt && !isShift && isP;
  if (target === "ctrl+space") return isCtrl && !isAlt && !isShift && isSpace;
  if (target === "alt+space") return isAlt && !isCtrl && !isShift && isSpace;
  if (target === "ctrl+shift+p") return isCtrl && isShift && !isAlt && isP;
  if (target === "ctrl+shift+k") return isCtrl && isShift && !isAlt && isK;
  if (target === "f1") return key === "f1" || code === "f1";

  if (target.startsWith("ctrl+") && !isAlt && !isShift) {
    const desired = target.replace("ctrl+", "").toLowerCase();
    return isCtrl && (key === desired || code === `key${desired}`);
  }
  return isCtrl && !isAlt && !isShift && isK;
}

export function CommandPalette() {
  const data = useStore((s) => s.data);
  const setPage = useStore((s) => s.setPage);
  const setEditing = useStore((s) => s.setEditing);
  const togglePaused = useStore((s) => s.togglePaused);
  const setSafeMode = useStore((s) => s.setSafeMode);
  const patchSettings = useStore((s) => s.patchSettings);
  const updateShortcut = useStore((s) => s.updateShortcut);
  const setSettingsFocusTarget = useStore((s) => s.setSettingsFocusTarget);
  const addRecent = useStore((s) => s.addRecent);
  const toast = useStore((s) => s.toast);
  const enabled = data?.settings?.shortcuts?.commandPaletteEnabled !== false;
  const configuredShortcut = data?.settings?.shortcuts?.commandPaletteShortcut || "Ctrl+K";
  const showCategories = data?.settings?.shortcuts?.commandPaletteShowCategories !== false;
  const maxResults = data?.settings?.shortcuts?.commandPaletteMaxResults || 8;
  const windowMode = data?.settings?.shortcuts?.commandPaletteWindowMode ?? "expanded";
  const position = data?.settings?.shortcuts?.commandPalettePosition ?? "center";

  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const sideViewAllowed = data?.settings?.shortcuts?.commandPaletteSideViewEnabled !== false;
  const detailLevel = data?.settings?.shortcuts?.commandPaletteDetailLevel ?? "detailed";
  const defaultShowMore = sideViewAllowed && (data?.settings?.shortcuts?.commandPaletteDefaultShowMore ?? false);
  const [sideViewOpen, setSideViewOpen] = useState(defaultShowMore);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const openPalette = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setPreviewOpen(false);
    setSideViewOpen(
      (data?.settings?.shortcuts?.commandPaletteSideViewEnabled !== false) &&
      (data?.settings?.shortcuts?.commandPaletteDefaultShowMore ?? false)
    );
    setOpen(true);
  }, [data?.settings?.shortcuts?.commandPaletteSideViewEnabled, data?.settings?.shortcuts?.commandPaletteDefaultShowMore]);

  const closePalette = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      setPreviewOpen(false);
      setSideViewOpen(false);
      closeTimerRef.current = null;
    }, 140);
  }, [isClosing]);

  useEffect(() => {
    const handleOpenEvent = () => openPalette();
    const handleToggleEvent = () => {
      if (open) {
        closePalette();
      } else {
        openPalette();
      }
    };
    window.addEventListener("keyflow:open-command-palette", handleOpenEvent);
    window.addEventListener("keyflow:toggle-command-palette", handleToggleEvent);
    return () => {
      window.removeEventListener("keyflow:open-command-palette", handleOpenEvent);
      window.removeEventListener("keyflow:toggle-command-palette", handleToggleEvent);
    };
  }, [openPalette, closePalette, open]);

  const commands = useMemo(() => createCommandRegistry(data), [data]);

  const results = useMemo(() => {
    if (!query.trim()) return commands.slice(0, maxResults);
    return searchCommands(commands, query).slice(0, maxResults);
  }, [commands, query, maxResults]);

  const activeCommandId = results[active]?.id;
  const activeCommand = results[active];

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommandShortcut(event, configuredShortcut)) {
        event.preventDefault();
        event.stopPropagation();
        if (open) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && open) {
        if (!sideViewAllowed) return;
        event.preventDefault();
        event.stopPropagation();
        setSideViewOpen((prev: boolean) => !prev);
        return;
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        if (sideViewOpen) {
          setSideViewOpen(false);
        } else if (previewOpen) {
          setPreviewOpen(false);
          setQuery("");
          setActive(0);
        } else {
          closePalette();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, open, configuredShortcut, previewOpen, sideViewOpen, openPalette, closePalette]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open && !isClosing) return null;

  const context: CommandExecutionContext = {
    navigate: setPage,
    openSetting: (target) => {
      setSettingsFocusTarget(target);
      setPage("settings");
    },
    setEditing,
    togglePaused,
    setSafeMode,
    toggleTheme: () => {
      const current = data.settings.appearance.theme;
      const next = current === "dark" ? "light" : current === "light" ? "system" : "dark";
      patchSettings("appearance", { theme: next });
    },
    openLayoutPreview: () => {
      setQuery("");
      setActive(0);
      setPreviewOpen(true);
    },
    openPopup: () => {
      const action: Action = {
        id: "command-open-popup",
        type: "showPopup",
        payload: { popupItems: data.settings.popup.items ?? [], title: "KeyFlow Actions" },
      };
      void runActions([action]);
    },
    openNotes: () => {
      const notes = (window as any).electronAPI?.notes;
      if (typeof notes?.toggle === "function") {
        void notes.toggle();
      } else {
        toast("Scratchpad Notes is available in Electron mode", "warning");
      }
    },
    runShortcut: (shortcut) => {
      void runActions(shortcut.actions);
      addRecent({
        shortcutId: shortcut.id,
        shortcutName: shortcut.name || "Shortcut",
        actionLabel: shortcut.actions[0]?.type ?? "Action",
        profileId: shortcut.profileId,
      });
      toast(`Ran ${shortcut.name || "shortcut"}`, "success");
    },
    toast,
  };

  const execute = (command: CommandDefinition) => {
    if (command.id === "action.layout-preview") {
      command.execute(context);
      return;
    }
    closePalette();
    window.setTimeout(() => command.execute(context), 140);
  };

  const moveSelection = (delta: number) => {
    if (!results.length) return;
    setActive((current) => (current + delta + results.length) % results.length);
  };

  return createPortal(
    <div
      className={"command-palette-scrim " + (isClosing ? "anim-fade-out" : "anim-fade-in") + (position === "top" ? " is-top" : "")}
      role="presentation"
      onMouseDown={closePalette}
    >
      <section
        className={
          "command-palette " +
          (isClosing ? "anim-modal-exit" : "anim-modal-enter") +
          (windowMode === "compact" ? " is-compact" : "") +
          (query.trim() ? " has-query" : "") +
          (previewOpen ? " has-preview" : "") +
          (sideViewOpen && !previewOpen ? " has-sideview" : "")
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-header">
          <div className="command-palette-title-wrap">
            <span className="command-palette-mark"><Icon name="command" size={16} /></span>
            <div>
              <div className="command-palette-kicker">KEYFLOW COMMAND CENTER</div>
              <h2 id="command-palette-title">What do you want to do?</h2>
            </div>
          </div>
          <button type="button" className="command-palette-close" aria-label="Close command palette" title="Close" onClick={closePalette}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="command-palette-search-wrap">
          <Icon name="search" size={17} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            className="command-palette-search"
            role="combobox"
            aria-label="Search commands and settings"
            aria-expanded="true"
            aria-controls={previewOpen ? "command-palette-preview" : "command-palette-results"}
            aria-activedescendant={activeCommandId ? `command-${activeCommandId}` : undefined}
            placeholder="Search commands, shortcuts, or settings…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                setActive(0);
              } else if (event.key === "End") {
                event.preventDefault();
                setActive(Math.max(0, results.length - 1));
              } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                setSideViewOpen((prev: boolean) => !prev);
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                execute(results[active]);
              }
            }}
          />
          {query ? (
            <button type="button" className="command-palette-clear" aria-label="Clear command search" title="Clear" onClick={() => { setQuery(""); setActive(0); inputRef.current?.focus(); }}>
              <Icon name="close" size={13} />
            </button>
          ) : (
            <kbd className="command-palette-keycap">{configuredShortcut}</kbd>
          )}
        </div>

        <div className="command-palette-meta">
          <span className="command-palette-meta-status">
            {query ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Navigate KeyFlow without leaving the keyboard"}
          </span>
          <div className="command-palette-hint-items">
            {previewOpen ? (
              <span className="command-palette-hint-item">
                <kbd>Esc</kbd>
                <span>back to commands</span>
              </span>
            ) : (
              <>
                <span className="command-palette-hint-item">
                  <kbd>↑↓</kbd>
                  <span>move</span>
                </span>
                <span className="command-palette-hint-item">
                  <kbd>↵</kbd>
                  <span>run</span>
                </span>
                {sideViewAllowed && (
                  <span
                    className="command-palette-hint-item clickable"
                    title="Toggle Details & Settings Controls (Ctrl+Enter)"
                    onClick={() => setSideViewOpen((prev: boolean) => !prev)}
                  >
                    <kbd>Ctrl+↵</kbd>
                    <span>{sideViewOpen ? "hide details" : "show more"}</span>
                  </span>
                )}
                <span className="command-palette-hint-item">
                  <kbd>Esc</kbd>
                  <span>{sideViewOpen ? "close panel" : "close"}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {previewOpen ? (
          <div id="command-palette-preview" className="command-palette-preview" aria-label="Compact layout preview">
            <div className="command-palette-preview-head">
              <div>
                <div className="command-palette-preview-kicker">QUICK LAYOUT TUNING</div>
                <h3>Make a snapped window fit</h3>
                <p>Try a tighter workspace for left or right screen alignment, then keep the settings or open the full page.</p>
              </div>
              <span className="command-palette-preview-status">{(data.settings.appearance.compactMode ?? false) ? "Compact" : "Standard"}</span>
            </div>

            <div className="command-palette-preview-stage" aria-label="Responsive workspace preview">
              <div className="command-palette-preview-pane is-main">
                <span className="command-palette-preview-pane-bar" />
                <span className="command-palette-preview-pane-line is-long" />
                <span className="command-palette-preview-pane-line" />
                <span className="command-palette-preview-pane-line is-short" />
              </div>
              <div className="command-palette-preview-pane is-side">
                <span className="command-palette-preview-pane-bar" />
                <span className="command-palette-preview-pane-line" />
                <span className="command-palette-preview-pane-line is-short" />
              </div>
            </div>

            <div className="command-palette-preview-controls">
              <div className="command-palette-preview-control">
                <div>
                  <strong>Compact workspace</strong>
                  <span>Reduce panel padding and use the available width better.</span>
                </div>
                <Toggle
                  label="Compact workspace"
                  checked={data.settings.appearance.compactMode ?? false}
                  onChange={(value) => patchSettings("appearance", { compactMode: value })}
                />
              </div>

              <div className="command-palette-preview-control is-column">
                <div>
                  <strong>Workspace scale</strong>
                  <span>Preview standard desktop sizes before keeping them.</span>
                </div>
                <div className="command-palette-preview-options" role="radiogroup" aria-label="Workspace scale">
                  {([
                    ["90", "90%"],
                    ["100", "100%"],
                    ["110", "110%"],
                    ["125", "125%"],
                  ] as const).map(([scale, label]) => (
                    <button
                      key={scale}
                      type="button"
                      className={`command-palette-preview-option${(data.settings.appearance.uiScale ?? "100") === scale ? " is-selected" : ""}`}
                      aria-pressed={(data.settings.appearance.uiScale ?? "100") === scale}
                      onClick={() => patchSettings("appearance", { uiScale: scale as UIScale })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="command-palette-preview-control is-column">
                <div>
                  <strong>Typography size</strong>
                  <span>Fine-tune legibility across compact laptop screens and large monitors.</span>
                </div>
                <div className="command-palette-preview-options" role="radiogroup" aria-label="Typography size">
                  {([
                    ["small", "Compact"],
                    ["default", "Default"],
                    ["large", "Large"],
                    ["xlarge", "Extra large"],
                  ] as const).map(([size, label]) => (
                    <button
                      key={size}
                      type="button"
                      className={`command-palette-preview-option${(data.settings.appearance.fontSize ?? "default") === size ? " is-selected" : ""}`}
                      aria-pressed={(data.settings.appearance.fontSize ?? "default") === size}
                      onClick={() => patchSettings("appearance", { fontSize: size })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="command-palette-preview-actions">
              <Button variant="secondary" size="sm" icon="settings" onClick={() => { closePalette(); setSettingsFocusTarget({ category: "appearance", anchorId: "row-app-compact" }); setPage("settings"); }}>
                Open Appearance Settings
              </Button>
              <Button variant="primary" size="sm" onClick={() => setPreviewOpen(false)}>
                Back to Commands
              </Button>
            </div>
          </div>
        ) : (
          <div className="command-palette-body">
            <div className="command-palette-main-col">
              <div id="command-palette-results" className="command-palette-results" role="listbox" aria-label="Command results">
                {results.length === 0 ? (
                  <div className="command-palette-empty">
                    <Icon name="search" size={22} />
                    <strong>No command matches that search</strong>
                    <span>Try a page name, shortcut, setting, or action.</span>
                  </div>
                ) : (
                  results.map((command, index) => (
                    <button
                      key={command.id}
                      id={`command-${command.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      className={`command-palette-result${index === active ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => execute(command)}
                    >
                      <span className="command-palette-result-icon"><Icon name={command.icon} size={16} /></span>
                      <span className="command-palette-result-copy">
                        <span className="command-palette-result-title">{command.title}</span>
                        <span className="command-palette-result-description">{command.description}</span>
                      </span>
                      <span className="command-palette-result-side">
                        {showCategories && <span className="command-palette-category">{command.category}</span>}
                        {command.shortcut && <kbd>{command.shortcut}</kbd>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {sideViewOpen && activeCommand && (
              <aside className="command-palette-sideview" aria-label="Quick Inspector">
                <div className="command-palette-sideview-header">
                  <span className="command-palette-sideview-icon">
                    <Icon name={activeCommand.icon} size={20} />
                  </span>
                  <div className="command-palette-sideview-title-wrap">
                    <div className="command-palette-sideview-kicker">{activeCommand.category.toUpperCase()}</div>
                    <h3 className="command-palette-sideview-title">{activeCommand.title}</h3>
                  </div>
                </div>
                <p className="command-palette-sideview-desc">{activeCommand.description}</p>

                <div className="command-palette-sideview-body">
                  {(() => {
                    if (activeCommand.id.startsWith("shortcut.")) {
                      const scId = activeCommand.id.replace("shortcut.", "");
                      const sc = data.shortcuts.find((s) => s.id === scId);
                      if (!sc) return null;
                      const profile = data.profiles.find((p) => p.id === sc.profileId);
                      return (
                        <div className="command-palette-sideview-section">
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Trigger</span>
                            <span className="bold">{formatTriggerLabel(sc)}</span>
                          </div>
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Assigned Key</span>
                            <span className="bold">{formatShortcutLabel(sc.modifiers, sc.key)}</span>
                          </div>
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Workspace Profile</span>
                            <span className="tiny bold">{profile?.name ?? "Global"}</span>
                          </div>
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Status</span>
                            <span className="tiny bold">
                              {sc.enabled ? "Active" : "Disabled"}
                            </span>
                          </div>
                          <div className="col gap-xs mt-sm">
                            <Button
                              size="sm"
                              variant="primary"
                              icon="play"
                              onClick={() => context.runShortcut(sc)}
                            >
                              Test Shortcut
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon="edit"
                              onClick={() => {
                                closePalette();
                                setEditing(sc.id);
                                setPage("shortcuts");
                              }}
                            >
                              Edit Full Shortcut
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                updateShortcut({ ...sc, enabled: !sc.enabled });
                                toast(sc.enabled ? "Shortcut disabled" : "Shortcut enabled", "info");
                              }}
                            >
                              {sc.enabled ? "Disable Shortcut" : "Enable Shortcut"}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    if (activeCommand.id === "action.pause-engine") {
                      return (
                        <div className="command-palette-sideview-section">
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Engine State</span>
                            <span className="bold">
                              {data.settings.shortcuts ? "Running" : "Paused"}
                            </span>
                          </div>
                          <div className="mt-sm">
                            <Button
                              size="sm"
                              variant={data.settings.shortcuts ? "danger" : "primary"}
                              icon="pause"
                              onClick={() => togglePaused()}
                            >
                              {data.settings.shortcuts ? "Pause Shortcut Engine" : "Resume Shortcut Engine"}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    if (activeCommand.id === "action.safe-mode") {
                      const isSafe = data.settings.privacy.safeMode;
                      return (
                        <div className="command-palette-sideview-section">
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Safe Mode State</span>
                            <span className="bold">
                              {isSafe ? "Enabled (Hooks Detached)" : "Disabled (Normal)"}
                            </span>
                          </div>
                          <div className="mt-sm">
                            <Button
                              size="sm"
                              variant={isSafe ? "primary" : "secondary"}
                              icon="shield"
                              onClick={() => {
                                const next = !isSafe;
                                setSafeMode(next);
                                toast(next ? "Safe Mode enabled" : "Safe Mode disabled", next ? "warning" : "success");
                              }}
                            >
                              {isSafe ? "Disable Safe Mode" : "Engage Emergency Safe Mode"}
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    if (activeCommand.id === "action.toggle-theme") {
                      const curTheme = data.settings.appearance.theme ?? "system";
                      return (
                        <div className="command-palette-sideview-section">
                          <span className="tiny muted mb-xs">Select Theme</span>
                          <div className="row gap-xs wrap">
                            {(["system", "dark", "light"] as const).map((th) => (
                              <button
                                key={th}
                                type="button"
                                className={"clickable " + (curTheme === th ? "bold" : "muted")}
                                onClick={() => patchSettings("appearance", { theme: th })}
                              >
                                {th.charAt(0).toUpperCase() + th.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    if (activeCommand.id.startsWith("setting.")) {
                      const settingId = activeCommand.id.replace("setting.", "");
                      const settingItem = SETTINGS_INDEX.find((s) => s.id === settingId);
                      const boolMapping = SETTING_BOOLEAN_MAP[settingId];

                      if (detailLevel === "compact") {
                        return (
                          <div className="command-palette-sideview-section">
                            <div className="command-palette-sideview-prop">
                              <span className="tiny muted">Category</span>
                              <span className="tiny bold">{settingItem?.categoryLabel || "Settings"}</span>
                            </div>
                            <div className="command-palette-sideview-control-title mt-xs">
                              {settingItem?.title || activeCommand.title}
                            </div>
                            <div className="command-palette-sideview-desc mb-xs">
                              {settingItem?.description || activeCommand.description}
                            </div>
                            <div className="mt-xs">
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="settings"
                                onClick={() => execute(activeCommand)}
                              >
                                Open in Settings
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      if (boolMapping) {
                        const currentVal = Boolean(
                          (data.settings as any)?.[boolMapping.section]?.[boolMapping.key]
                        );
                        return (
                          <div className="command-palette-sideview-section">
                            <div className="command-palette-sideview-prop">
                              <span className="tiny muted">Setting Category</span>
                              <span className="tiny bold">{settingItem?.categoryLabel || "Settings"}</span>
                            </div>
                            <div className="command-palette-sideview-control-row">
                              <div className="command-palette-sideview-control-label">
                                <span className="command-palette-sideview-control-title">{settingItem?.title || boolMapping.label}</span>
                                <span className="command-palette-sideview-control-desc">
                                  {currentVal ? "Enabled" : "Disabled"}
                                </span>
                              </div>
                              <Toggle
                                label={boolMapping.label}
                                checked={currentVal}
                                onChange={(newVal) => {
                                  patchSettings(boolMapping.section as any, { [boolMapping.key]: newVal });
                                  toast(`${boolMapping.label}: ${newVal ? "Enabled" : "Disabled"}`, "info");
                                }}
                              />
                            </div>
                            <div className="command-palette-sideview-desc mb-xs">
                              {settingItem?.description || activeCommand.description}
                            </div>
                            <div className="mt-xs">
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="settings"
                                onClick={() => execute(activeCommand)}
                              >
                                Open in Settings
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      if (settingId === "app-theme") {
                        const curTheme = data.settings.appearance.theme ?? "system";
                        return (
                          <div className="command-palette-sideview-section">
                            <div className="command-palette-sideview-prop">
                              <span className="tiny muted">Setting Category</span>
                              <span className="tiny bold">Appearance</span>
                            </div>
                            <span className="tiny muted mb-xs">Select Theme</span>
                            <div className="row gap-xs wrap">
                              {(["system", "dark", "light"] as const).map((th) => (
                                <button
                                  key={th}
                                  type="button"
                                  className={"clickable " + (curTheme === th ? "bold" : "muted")}
                                  onClick={() => patchSettings("appearance", { theme: th })}
                                >
                                  {th.charAt(0).toUpperCase() + th.slice(1)}
                                </button>
                              ))}
                            </div>
                            <div className="mt-xs">
                              <Button
                                size="sm"
                                variant="secondary"
                                icon="settings"
                                onClick={() => execute(activeCommand)}
                              >
                                Open in Settings
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="command-palette-sideview-section">
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Setting Category</span>
                            <span className="tiny bold">{settingItem?.categoryLabel || "Settings"}</span>
                          </div>
                          <div className="command-palette-sideview-desc mb-xs">
                            {settingItem?.description || activeCommand.description}
                          </div>
                          <div className="mt-xs">
                            <Button
                              size="sm"
                              variant="primary"
                              icon="settings"
                              onClick={() => execute(activeCommand)}
                            >
                              Open in Settings
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="command-palette-sideview-section">
                        <div className="command-palette-sideview-prop">
                          <span className="tiny muted">Action Type</span>
                          <span className="bold">{activeCommand.category}</span>
                        </div>
                        {activeCommand.shortcut && (
                          <div className="command-palette-sideview-prop">
                            <span className="tiny muted">Global Shortcut</span>
                            <kbd>{activeCommand.shortcut}</kbd>
                          </div>
                        )}
                        <div className="mt-sm">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => execute(activeCommand)}
                          >
                            Run Command
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </aside>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}
