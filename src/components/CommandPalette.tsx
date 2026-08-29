import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Action } from "../types";
import { useStore } from "../store/useStore";
import { runActions } from "../lib/actions";
import { createCommandRegistry, searchCommands, type CommandDefinition, type CommandExecutionContext } from "../lib/command-registry";
import { Icon } from "./Icon";
import { Button, Toggle } from "./ui";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const openPalette = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setPreviewOpen(false);
    setOpen(true);
  }, []);

  const commands = useMemo(() => {
    try {
      return createCommandRegistry(data);
    } catch (err) {
      console.error("[CommandPalette] Failed to build commands:", err);
      return [];
    }
  }, [data]);
  const allResults = useMemo(() => {
    try {
      return searchCommands(commands, query);
    } catch (err) {
      console.error("[CommandPalette] Failed to search commands:", err);
      return [];
    }
  }, [commands, query]);
  const results = useMemo(() => allResults.slice(0, maxResults), [allResults, maxResults]);
  const activeCommandId = results[active]?.id;

  const closePalette = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      setPreviewOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }, [isClosing]);

  useEffect(() => {
    const handleOpen = () => openPalette();
    const handleToggle = () => {
      if (open) {
        closePalette();
      } else {
        openPalette();
      }
    };
    window.addEventListener("keyflow:open-command-palette", handleOpen);
    window.addEventListener("keyflow:toggle-command-palette", handleToggle);
    return () => {
      window.removeEventListener("keyflow:open-command-palette", handleOpen);
      window.removeEventListener("keyflow:toggle-command-palette", handleToggle);
    };
  }, [open, openPalette, closePalette]);

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
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        if (previewOpen) {
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
  }, [enabled, open, configuredShortcut, previewOpen, openPalette, closePalette]);

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
          (previewOpen ? " has-preview" : "")
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
                <span className="command-palette-hint-item">
                  <kbd>Esc</kbd>
                  <span>close</span>
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
                  <strong>Interface scale</strong>
                  <span>Use a smaller scale when the app is snapped beside another window.</span>
                </div>
                <div className="command-palette-preview-options" role="group" aria-label="Interface scale">
                  {(["90", "100", "110", "125"] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      className={`command-palette-preview-option${(data.settings.appearance.uiScale ?? "100") === scale ? " is-selected" : ""}`}
                      aria-pressed={(data.settings.appearance.uiScale ?? "100") === scale}
                      onClick={() => patchSettings("appearance", { uiScale: scale })}
                    >
                      {scale}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="command-palette-preview-control is-column">
                <div>
                  <strong>Text size</strong>
                  <span>Adjust readable type without changing the layout proportions.</span>
                </div>
                <div className="command-palette-preview-options" role="group" aria-label="Text size">
                  {([
                    ["small", "Small"],
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
        )}
      </section>
    </div>,
    document.body
  );
}
