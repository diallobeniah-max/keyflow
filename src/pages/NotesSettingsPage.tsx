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

      {/* Slash Commands Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="code" size={18} />
          <div>
            <div className="bold">Slash Commands</div>
            <div className="tiny muted">Enable or disable specific / commands in the editor</div>
          </div>
        </div>

        {Object.entries(commandsByCategory).map(([category, commands]) => (
          <div key={category} className="mb-sm">
            <div className="small bold muted mb-xs mt-sm uppercase tracking-wider">{category}</div>
            {commands.map((cmd) => {
              const isEnabled =
                settings.notes?.defaultSlashCommands === undefined
                  ? true
                  : settings.notes.defaultSlashCommands.includes(cmd.id);

              return (
                <div key={cmd.id} className="settings-row">
                  <div className="settings-row-info">
                    <div className="row gap-sm items-center">
                      <Icon name={cmd.icon} size={15} />
                      <div>
                        <div className="settings-row-title">{cmd.label}</div>
                        {cmd.hint && <div className="settings-row-desc">{cmd.hint}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="settings-row-control">
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

