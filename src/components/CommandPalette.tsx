import { useEffect, useMemo, useRef, useState } from "react";
import type { Action } from "../types";
import { useStore } from "../store/useStore";
import { runActions } from "../lib/actions";
import { createCommandRegistry, searchCommands, type CommandDefinition, type CommandExecutionContext } from "../lib/command-registry";
import { Icon } from "./Icon";
import { Button, Toggle } from "./ui";

// The palette is intentionally renderer-local: Ctrl+K is available while the KeyFlow window is focused.
function isCommandShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k";
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
  const enabled = data.settings.shortcuts.commandPaletteEnabled !== false;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(() => createCommandRegistry(data), [data]);
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);
  const activeCommandId = results[active]?.id;

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isCommandShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        setOpen((previous) => !previous);
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
          setOpen(false);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, open]);

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

  if (!open) return null;

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
    setOpen(false);
    setPreviewOpen(false);
    window.setTimeout(() => command.execute(context), 0);
  };

  const closePalette = () => {
    setOpen(false);
    setPreviewOpen(false);
  };

  const moveSelection = (delta: number) => {
    if (!results.length) return;
    setActive((current) => (current + delta + results.length) % results.length);
  };

  return (
    <div className="command-palette-scrim anim-fade-in" role="presentation" onMouseDown={closePalette}>
      <section
        className="command-palette anim-modal-enter"
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
            <kbd className="command-palette-keycap">Ctrl K</kbd>
          )}
        </div>

        <div className="command-palette-meta">
          <span>{query ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Navigate KeyFlow without leaving the keyboard"}</span>
          <span className="command-palette-meta-hint">{previewOpen ? <><kbd>Esc</kbd> back to commands</> : <><kbd>↑↓</kbd> move <kbd>↵</kbd> run <kbd>Esc</kbd> close</>}</span>
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
                    <span className="command-palette-category">{command.category}</span>
                    {command.shortcut && <kbd>{command.shortcut}</kbd>}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
