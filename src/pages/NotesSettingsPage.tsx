import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Button, Toggle, Select, Slider, PageIntro } from "../components/ui";
import { useStore } from "../store/useStore";
import { SLASH_COMMANDS, SlashCommand } from "../lib/notesSlashCommands";
import { EditShortcutModal } from "../components/EditShortcutModal";

export function NotesSettingsPage() {
  const settings = useStore((s) => s.data.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const setPage = useStore((s) => s.setPage);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [previewCommandId, setPreviewCommandId] = useState<string>("h1");

  const notesShortcut = useMemo(() => {
    return shortcuts.find((s) => s.actions?.some((a) => a.type === "notesPopup"));
  }, [shortcuts]);

  const commandsByCategory = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {};
    SLASH_COMMANDS.forEach((cmd) => {
      const cat = cmd.category || "Other";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(cmd);
    });
    return groups;
  }, []);

  const handleSelectSaveLocation = async () => {
    if (window.electronAPI?.notes?.selectSaveLocation) {
      const result = await window.electronAPI.notes.selectSaveLocation();
      if (result && result.path) {
        patchSettings("notes", { saveLocation: result.path });
      }
    }
  };

  const handleToggleCommand = (id: string, enabled: boolean) => {
    let current = settings.notes?.defaultSlashCommands;
    if (current === undefined) {
      current = SLASH_COMMANDS.map((c) => c.id).filter((cmdId) => cmdId !== id);
    } else {
      if (enabled) {
        current = [...current, id];
      } else {
        current = current.filter((cmdId) => cmdId !== id);
      }
    }
    patchSettings("notes", { defaultSlashCommands: current });
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow="PRODUCTIVITY"
        title="Notes Settings"
        description="Configure the floating notepad, slash commands, save location, and editor preferences."
      />

      {/* Save Location Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="folder" size={18} />
          <div>
            <div className="bold">Save Location</div>
            <div className="tiny muted">Where your notes are stored on disk</div>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Current Path</div>
            <div className="settings-row-desc">{settings.notes?.saveLocation || "Default AppData Storage"}</div>
          </div>
          <div className="settings-row-control">
            <Button variant="secondary" size="sm" icon="folder" onClick={handleSelectSaveLocation}>
              Change Folder
            </Button>
          </div>
        </div>
      </div>

      {/* Editor Preferences Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="settings" size={18} />
          <div>
            <div className="bold">Editor Preferences</div>
            <div className="tiny muted">Configure how the floating editor looks and behaves</div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Font Size</div>
            <div className="settings-row-desc">Text size in the notepad editor</div>
          </div>
          <div className="settings-row-control">
            <Select
              value={settings.notes?.fontSize ?? "default"}
              onChange={(v) => patchSettings("notes", { fontSize: v as any })}
              options={[
                { value: "small", label: "Small" },
                { value: "default", label: "Default" },
                { value: "large", label: "Large" },
              ]}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Spellcheck</div>
            <div className="settings-row-desc">Highlight misspelled words while typing</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Spellcheck"
              checked={settings.notes?.spellCheck ?? true}
              onChange={(v) => patchSettings("notes", { spellCheck: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Show Word Count</div>
            <div className="settings-row-desc">Display active word count in header meta</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Show word count"
              checked={settings.notes?.showWordCount ?? true}
              onChange={(v) => patchSettings("notes", { showWordCount: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Show Character Count</div>
            <div className="settings-row-desc">Display active character count in header meta</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Show character count"
              checked={settings.notes?.showCharCount ?? true}
              onChange={(v) => patchSettings("notes", { showCharCount: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Autosave Delay</div>
            <div className="settings-row-desc">{settings.notes?.autoSaveIntervalMs ?? 300}ms after last keystroke</div>
          </div>
          <div className="settings-row-control">
            <Slider
              min={100}
              max={2000}
              step={100}
              value={settings.notes?.autoSaveIntervalMs ?? 300}
              onChange={(v) => patchSettings("notes", { autoSaveIntervalMs: v })}
              showValue
              formatValue={(v) => `${v}ms`}
            />
          </div>
        </div>
      </div>

      {/* Slash Commands Card with Live Notion/Raycast Preview */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="code" size={18} />
          <div>
            <div className="bold">Slash Commands</div>
            <div className="tiny muted">Enable or disable specific / commands with instant live preview</div>
          </div>
        </div>

        <div className="slash-commands-layout">
          <div className="slash-commands-list">
            {Object.entries(commandsByCategory).map(([category, commands]) => (
              <div key={category} className="mb-sm">
                <div className="small bold muted mb-xs mt-sm uppercase tracking-wider">{category}</div>
                {commands.map((cmd) => {
                  const isEnabled =
                    settings.notes?.defaultSlashCommands === undefined
                      ? true
                      : settings.notes.defaultSlashCommands.includes(cmd.id);
                  const isPreviewing = previewCommandId === cmd.id;

                  return (
                    <div
                      key={cmd.id}
                      className={"settings-row slash-command-row" + (isPreviewing ? " is-previewing" : "")}
                      onMouseEnter={() => setPreviewCommandId(cmd.id)}
                      onClick={() => setPreviewCommandId(cmd.id)}
                    >
                      <div className="settings-row-info">
                        <div className="row gap-sm items-center">
                          <Icon name={cmd.icon} size={15} />
                          <div>
                            <div className="settings-row-title">{cmd.label}</div>
                            {cmd.hint && <div className="settings-row-desc">{cmd.hint}</div>}
                          </div>
                        </div>
                      </div>
                      <div className="settings-row-control" onClick={(e) => e.stopPropagation()}>
                        <Toggle
                          label={`Enable ${cmd.label}`}
                          checked={isEnabled}
                          onChange={(v) => handleToggleCommand(cmd.id, v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Live Preview Panel */}
          <div className="slash-commands-preview-sticky">
            <SlashCommandLivePreview commandId={previewCommandId} />
          </div>
        </div>
      </div>

      {/* Navigation & Shortcuts Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="shortcuts" size={18} />
          <div>
            <div className="bold">Navigation & Shortcuts</div>
            <div className="tiny muted">Configure quick access keys and search behaviors</div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Spotlight Search (Ctrl+K)</div>
            <div className="settings-row-desc">Quick search across all notes and recent files</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Enable Spotlight Search"
              checked={settings.notes?.enableSpotlight ?? true}
              onChange={(v) => patchSettings("notes", { enableSpotlight: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">All Notes Sidebar (Ctrl+B)</div>
            <div className="settings-row-desc">Open the All Notes sidebar by default when launching notes</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Default Sidebar Open"
              checked={settings.notes?.defaultSidebarOpen ?? false}
              onChange={(v) => patchSettings("notes", { defaultSidebarOpen: v })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Revision History</div>
            <div className="settings-row-desc">Track recent note edits with right-click Undo/Redo recovery</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Track Revisions"
              checked={settings.notes?.enableRevisionHistory ?? true}
              onChange={(v) => patchSettings("notes", { enableRevisionHistory: v })}
            />
          </div>
        </div>
      </div>

      {/* Notes Shortcut Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="keyboard" size={18} />
          <div>
            <div className="bold">Quick Access Shortcut</div>
            <div className="tiny muted">Global shortcut to toggle the floating notepad</div>
          </div>
        </div>

        {notesShortcut ? (
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title bold">{notesShortcut.name || "Notes Popup"}</div>
              <div className="settings-row-desc">
                Key: <span className="badge badge-accent tiny">{notesShortcut.key}</span> ({notesShortcut.trigger})
              </div>
            </div>
            <div className="settings-row-control">
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => setEditingShortcutId(notesShortcut.id)}
              >
                Edit Shortcut
              </Button>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title muted">No dedicated shortcut configured</div>
              <div className="settings-row-desc">You can create a new shortcut with the "Notes Popup" action</div>
            </div>
            <div className="settings-row-control">
              <Button variant="primary" size="sm" icon="create" onClick={() => setPage("create")}>
                Create Shortcut
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Shortcut Modal */}
      {editingShortcutId && (
        <EditShortcutModal
          shortcutId={editingShortcutId}
          open={!!editingShortcutId}
          onClose={() => setEditingShortcutId(null)}
        />
      )}
    </div>
  );
}

function SlashCommandLivePreview({ commandId }: { commandId: string }) {
  const cmd = SLASH_COMMANDS.find((c) => c.id === commandId) || SLASH_COMMANDS[0];

  return (
    <div className="slash-command-preview-card">
      <div className="slash-command-preview-header">
        <div className="row gap-xs items-center">
          <Icon name={cmd.icon} size={15} />
          <span className="bold small">{cmd.label}</span>
        </div>
        <span className="chip chip-subtle tiny">/{cmd.id}</span>
      </div>

      <div className="slash-command-preview-viewport">
        <div className="slash-command-preview-canvas">
          <div className="slash-command-preview-doc-title">Meeting Notes & Project Plan</div>
          <div className="slash-command-preview-output">
            {(() => {
              switch (cmd.id) {
                case "text":
                  return <p className="notes-preview-p">This is a standard body paragraph in KeyFlow Notes with crisp typography and natural reading flow.</p>;
                case "h1":
                  return <h1 className="notes-preview-h1"># 1. Executive Summary</h1>;
                case "h2":
                  return <h2 className="notes-preview-h2">## Key Objectives & Deliverables</h2>;
                case "h3":
                  return <h3 className="notes-preview-h3">### Design System Architecture</h3>;
                case "h4":
                  return <h4 className="notes-preview-h4">#### Component Token Specs</h4>;
                case "h5":
                  return <h5 className="notes-preview-h5">##### Low-level win32 hooks</h5>;
                case "divider":
                  return (
                    <div className="notes-preview-divider-wrap">
                      <p className="notes-preview-p muted tiny">Section content above</p>
                      <hr className="notes-preview-hr" />
                      <p className="notes-preview-p muted tiny">Section content below</p>
                    </div>
                  );
                case "bullet":
                  return (
                    <ul className="notes-preview-ul">
                      <li>Ultra-fast global shortcuts</li>
                      <li>Interactive hot display corners</li>
                      <li>Floating notes with markdown preview</li>
                    </ul>
                  );
                case "number":
                  return (
                    <ol className="notes-preview-ol">
                      <li>Configure your trigger gesture</li>
                      <li>Attach actions or workflows</li>
                      <li>Execute instantly from any app</li>
                    </ol>
                  );
                case "todo":
                  return (
                    <div className="notes-preview-todo-list">
                      <label className="notes-preview-todo is-done">
                        <input type="checkbox" defaultChecked readOnly />
                        <span>Review system architecture</span>
                      </label>
                      <label className="notes-preview-todo">
                        <input type="checkbox" readOnly />
                        <span>Deploy Raycast-style previews</span>
                      </label>
                    </div>
                  );
                case "quote":
                  return (
                    <blockquote className="notes-preview-quote">
                      "Simplicity is the prerequisite for reliability."
                      <span className="notes-preview-quote-author">— Edsger W. Dijkstra</span>
                    </blockquote>
                  );
                case "callout":
                  return (
                    <div className="notes-preview-callout">
                      <span className="notes-preview-callout-icon">💡</span>
                      <div>
                        <div className="bold small">Pro Tip</div>
                        <div className="tiny">You can type /{cmd.id} anywhere in your notes to insert this block instantly.</div>
                      </div>
                    </div>
                  );
                case "code":
                  return (
                    <pre className="notes-preview-code">
                      <code>{`function onShortcut(shortcut) {\n  console.log("Fired:", shortcut.name);\n  electronAPI.actions.run(shortcut.actions);\n}`}</code>
                    </pre>
                  );
                case "table":
                  return (
                    <table className="notes-preview-table">
                      <thead>
                        <tr><th>Feature</th><th>Status</th><th>Shortcut</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Notes Popup</td><td><span className="chip chip-accent tiny">Active</span></td><td><span className="key-badge">Shift × 2</span></td></tr>
                        <tr><td>Spotlight</td><td><span className="chip chip-subtle tiny">Ready</span></td><td><span className="key-badge">Ctrl+K</span></td></tr>
                      </tbody>
                    </table>
                  );
                case "emoji":
                  return (
                    <div className="row gap-sm items-center">
                      <span className="notes-preview-emojis">⭐ 🚀 ✨ ⚡ 🎯 💡</span>
                      <span className="tiny muted">Quick star & reaction emoji</span>
                    </div>
                  );
                default:
                  return <p className="notes-preview-p">{cmd.label}: {cmd.hint}</p>;
              }
            })()}
          </div>
        </div>
      </div>

      <div className="slash-command-preview-foot tiny muted">
        <span>Usage hint: Type <b className="text-primary">/{cmd.id}</b> in note editor</span>
      </div>
    </div>
  );
}

