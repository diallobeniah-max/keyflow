import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Button, IconButton, Input, Toggle, Select, Slider, PageIntro } from "../components/ui";
import { useStore } from "../store/useStore";
import { SLASH_COMMANDS, SlashCommand } from "../lib/notesSlashCommands";
import { EditShortcutModal } from "../components/EditShortcutModal";
import { uid } from "../store/sampleData";

interface CustomPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

function NotesMiniWindowPreview({
  width,
  height,
  isActive,
}: {
  width: number;
  height: number;
  isActive: boolean;
}) {
  const isCompact = width < 800;
  return (
    <div
      className={`notes-mini-preview-wrap ${isActive ? "is-active" : ""}`}
      style={{ aspectRatio: `${Math.max(560, width)} / ${Math.max(520, height)}` }}
    >
      <div className="notes-mini-window">
        <div className="notes-mini-window-inner">
          {/* Top bar header */}
          <div className="notes-mini-topbar">
            <div className="notes-mini-topbar-left">
              <span className="notes-mini-icon-pill">⌨</span>
              <span className="notes-mini-icon-pill">📁</span>
            </div>
            <div className="notes-mini-topbar-center">
              <span className="notes-mini-title-text">Welcome to KeyFlow Notes 📝</span>
              <span className="notes-mini-status-dot" />
              <span className="notes-mini-add-btn">+</span>
            </div>
            <div className="notes-mini-topbar-right">
              <span className="notes-mini-close-btn">×</span>
            </div>
          </div>

          {/* Subheader timestamp and stats */}
          <div className="notes-mini-subheader">
            <span>August 30, 2026 at 4:26 PM</span>
            <span>115 words · 738 chars</span>
          </div>

          {/* Main Document Title */}
          <div className="notes-mini-doc-title">
            Welcome to KeyFlow Notes 📝
          </div>

          {/* Formatting Toolbar */}
          <div className="notes-mini-toolbar">
            <span className="notes-mini-tool">Aa</span>
            <span className="notes-mini-tool bold">B</span>
            <span className="notes-mini-tool italic">I</span>
            <span className="notes-mini-tool underline">U</span>
            <span className="notes-mini-tool">✍</span>
            <span className="notes-mini-tool">⏱</span>
            <span className="notes-mini-tool">• List</span>
            <span className="notes-mini-tool">⊞</span>
            <span className="notes-mini-tool">"</span>
            <span className="notes-mini-pinned-badge">📌 Pinned</span>
          </div>

          {/* Note Body Content */}
          <div className="notes-mini-body">
            <div className="notes-mini-h2">KeyFlow Floating Notepad</div>
            <p className="notes-mini-p">
              A fast, distraction-free markdown notepad that floats seamlessly above your desktop and apps.
            </p>
            <div className="notes-mini-feature-header">⚡ Key Features</div>
            <ul className="notes-mini-list">
              <li><strong>Raycast Slash Commands:</strong> Type / at start of line...</li>
              <li><strong>Custom Save Location:</strong> Click folder pill in header...</li>
              {!isCompact && (
                <li><strong>Instant Autosave:</strong> Never lose thoughts with autosave.</li>
              )}
              {!isCompact && (
                <li><strong>Quick Access:</strong> Trigger instantly with shortcut.</li>
              )}
            </ul>
          </div>

          {/* Floating Copy Action Pill */}
          <div className="notes-mini-copy-pill" title="Quick Copy">
            <Icon name="copy" size={10} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotesSettingsPage() {
  const settings = useStore((s) => s.data.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const setPage = useStore((s) => s.setPage);
  const toast = useStore((s) => s.toast);

  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [previewCommandId, setPreviewCommandId] = useState<string>("h1");

  const [windowPreferences, setWindowPreferences] = useState<{
    windowSizePreset: string;
    followMouseOnOpen: boolean;
    windowPresetSizes: Record<"comfortable" | "compact", { width: number; height: number }>;
    customPresets?: CustomPreset[];
  }>({
    windowSizePreset: settings.notes?.windowSizePreset ?? "comfortable",
    followMouseOnOpen: settings.notes?.followMouseOnOpen ?? true,
    windowPresetSizes: {
      comfortable: { width: 960, height: 800 },
      compact: { width: 700, height: 640 },
    },
    customPresets: (settings.notes as any)?.customWindowPresets ?? [],
  });

  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [sizeDraft, setSizeDraft] = useState({ name: "", width: "", height: "" });
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newCustomDraft, setNewCustomDraft] = useState({ name: "My Custom Size", width: "860", height: "720" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Top bar live editing state
  const [topWidthDraft, setTopWidthDraft] = useState<string>("960");
  const [topHeightDraft, setTopHeightDraft] = useState<string>("800");

  useEffect(() => {
    window.electronAPI?.notes?.getPreferences?.().then((preferences: any) => {
      if (preferences) {
        setWindowPreferences((prev) => ({
          ...prev,
          ...preferences,
          customPresets: preferences.customPresets ?? (settings.notes as any)?.customWindowPresets ?? prev.customPresets ?? [],
        }));
      }
    });

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "keyflow:notes-preset-updated") {
        window.electronAPI?.notes?.getPreferences?.().then((preferences: any) => {
          if (preferences) {
            setWindowPreferences((prev) => ({
              ...prev,
              ...preferences,
              customPresets: preferences.customPresets ?? (settings.notes as any)?.customWindowPresets ?? prev.customPresets ?? [],
            }));
          }
        });
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [settings.notes]);

  const allPresets = useMemo(() => {
    const list: Array<{ id: string; name: string; width: number; height: number; isBuiltin: boolean }> = [
      {
        id: "comfortable",
        name: "Comfortable",
        width: windowPreferences.windowPresetSizes.comfortable.width,
        height: windowPreferences.windowPresetSizes.comfortable.height,
        isBuiltin: true,
      },
      {
        id: "compact",
        name: "Compact",
        width: windowPreferences.windowPresetSizes.compact.width,
        height: windowPreferences.windowPresetSizes.compact.height,
        isBuiltin: true,
      },
    ];

    const customs = windowPreferences.customPresets || [];
    for (const cp of customs) {
      list.push({
        id: cp.id,
        name: cp.name,
        width: cp.width,
        height: cp.height,
        isBuiltin: false,
      });
    }
    return list;
  }, [windowPreferences]);

  const activePreset = useMemo(() => {
    return allPresets.find((p) => p.id === windowPreferences.windowSizePreset) || allPresets[0];
  }, [allPresets, windowPreferences.windowSizePreset]);

  // Keep top drafts in sync when active preset changes
  useEffect(() => {
    if (activePreset) {
      setTopWidthDraft(String(activePreset.width));
      setTopHeightDraft(String(activePreset.height));
    }
  }, [activePreset?.id, activePreset?.width, activePreset?.height]);

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

  const patchWindowPreferences = async (patch: any) => {
    const next = await window.electronAPI?.notes?.updatePreferences?.(patch);
    if (next) {
      setWindowPreferences((prev) => ({
        ...prev,
        ...next,
        customPresets: (next as any).customPresets ?? patch.customPresets ?? prev.customPresets,
      }));
    } else {
      setWindowPreferences((prev) => ({ ...prev, ...patch }));
    }
    patchSettings("notes", {
      ...patch,
      ...(patch.customPresets ? { customWindowPresets: patch.customPresets } : {}),
    });
  };

  const handleResetWindowSize = async () => {
    const next = await window.electronAPI?.notes?.resetWindowSize?.();
    if (next) setWindowPreferences((prev) => ({ ...prev, ...next }));
    toast("Notes window size reset to active preset", "info");
  };

  const beginEditPreset = (preset: { id: string; name: string; width: number; height: number; isBuiltin: boolean }) => {
    setEditingPresetId(preset.id);
    setIsCreatingCustom(false);
    setSizeDraft({
      name: preset.name,
      width: String(preset.width),
      height: String(preset.height),
    });
  };

  const cancelEditPreset = () => {
    setEditingPresetId(null);
  };

  const savePresetSize = async () => {
    if (!editingPresetId) return;
    const width = Math.max(560, Math.min(Number(sizeDraft.width) || 800, 1600));
    const height = Math.max(520, Math.min(Number(sizeDraft.height) || 640, 1200));

    if (editingPresetId === "comfortable" || editingPresetId === "compact") {
      await patchWindowPreferences({
        windowPresetSizes: {
          ...windowPreferences.windowPresetSizes,
          [editingPresetId]: { width, height },
        },
      });
    } else {
      const updatedCustoms = (windowPreferences.customPresets || []).map((cp) =>
        cp.id === editingPresetId ? { ...cp, name: sizeDraft.name.trim() || cp.name, width, height } : cp
      );
      await patchWindowPreferences({
        customPresets: updatedCustoms,
      });
    }
    setEditingPresetId(null);
    toast("Preset dimensions saved", "success");
  };

  const handleCreateCustomPreset = async () => {
    const name = newCustomDraft.name.trim() || "Custom Preset";
    const width = Math.max(560, Math.min(Number(newCustomDraft.width) || 860, 1600));
    const height = Math.max(520, Math.min(Number(newCustomDraft.height) || 720, 1200));
    const id = uid("note-size");

    const newPreset: CustomPreset = { id, name, width, height };
    const updatedCustoms = [...(windowPreferences.customPresets || []), newPreset];

    await patchWindowPreferences({
      windowSizePreset: id,
      customPresets: updatedCustoms,
    });
    setIsCreatingCustom(false);
    toast(`Created preset "${name}"`, "success");
  };

  const handleDeleteCustomPreset = async (presetId: string) => {
    const updatedCustoms = (windowPreferences.customPresets || []).filter((cp) => cp.id !== presetId);
    const nextActive = windowPreferences.windowSizePreset === presetId ? "comfortable" : windowPreferences.windowSizePreset;

    await patchWindowPreferences({
      windowSizePreset: nextActive,
      customPresets: updatedCustoms,
    });
    setDeleteConfirmId(null);
    toast("Custom preset deleted", "info");
  };

  const saveCurrentWindowSize = async (presetId: string) => {
    const next = await window.electronAPI?.notes?.saveCurrentWindowSize?.(presetId as any);
    if (next) {
      setWindowPreferences((prev) => ({ ...prev, ...next }));
      patchSettings("notes", next as any);
    }
    const target = allPresets.find((p) => p.id === presetId);
    toast(`Captured current floating window bounds into "${target?.name || presetId}"`, "success");
  };

  const handleTestNotesWindow = async (presetId?: string) => {
    const targetPreset = presetId ? allPresets.find((p) => p.id === presetId) : activePreset;
    if (targetPreset && targetPreset.id !== windowPreferences.windowSizePreset) {
      await patchWindowPreferences({ windowSizePreset: targetPreset.id });
    }
    localStorage.setItem(
      "keyflow:notes-test-mode",
      JSON.stringify({
        active: true,
        presetId: targetPreset?.id || "comfortable",
        presetName: targetPreset?.name || "Comfortable",
        timestamp: Date.now(),
      })
    );
    await window.electronAPI?.notes?.toggle?.();
    toast(`Opened Notes in Test Mode (${targetPreset?.name || "active"} size)`, "info");
  };

  const handleTopSizeLiveChange = async (wStr: string, hStr: string, liveApply = false) => {
    setTopWidthDraft(wStr);
    setTopHeightDraft(hStr);
    const w = Number(wStr);
    const h = Number(hStr);
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 560 && h >= 520 && liveApply) {
      if (activePreset.id === "comfortable" || activePreset.id === "compact") {
        await patchWindowPreferences({
          windowPresetSizes: {
            ...windowPreferences.windowPresetSizes,
            [activePreset.id]: { width: w, height: h },
          },
        });
      } else {
        const updatedCustoms = (windowPreferences.customPresets || []).map((cp) =>
          cp.id === activePreset.id ? { ...cp, width: w, height: h } : cp
        );
        await patchWindowPreferences({ customPresets: updatedCustoms });
      }
    }
  };

  const handleSaveTopSize = async () => {
    const w = Math.max(560, Math.min(Number(topWidthDraft) || activePreset.width, 1600));
    const h = Math.max(520, Math.min(Number(topHeightDraft) || activePreset.height, 1200));

    if (activePreset.id === "comfortable" || activePreset.id === "compact") {
      await patchWindowPreferences({
        windowPresetSizes: {
          ...windowPreferences.windowPresetSizes,
          [activePreset.id]: { width: w, height: h },
        },
      });
    } else {
      const updatedCustoms = (windowPreferences.customPresets || []).map((cp) =>
        cp.id === activePreset.id ? { ...cp, width: w, height: h } : cp
      );
      await patchWindowPreferences({ customPresets: updatedCustoms });
    }
    toast(`Saved ${activePreset.name} dimensions (${w} × ${h} px)`, "success");
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

        {/* Top Control Bar for Notes Window Sizes */}
        <div className="settings-row notes-size-top-toolbar">
          <div className="settings-row-info">
            <div className="settings-row-title">Notes Window Sizes</div>
            <div className="settings-row-desc">
              Edit dimensions in real time, test the live floating pad, or capture from the open window.
            </div>
          </div>
          <div className="settings-row-control notes-size-top-controls">
            <div className="notes-size-top-action-group">
              <div className="notes-size-dim-inputs">
                <Input
                  aria-label="Active preset width"
                  type="number"
                  min="560"
                  max="1600"
                  value={topWidthDraft}
                  onChange={(e) => void handleTopSizeLiveChange(e.target.value, topHeightDraft, true)}
                  title="Width (px) - live updates open window"
                />
                <span className="tiny muted">×</span>
                <Input
                  aria-label="Active preset height"
                  type="number"
                  min="520"
                  max="1200"
                  value={topHeightDraft}
                  onChange={(e) => void handleTopSizeLiveChange(topWidthDraft, e.target.value, true)}
                  title="Height (px) - live updates open window"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                icon="check"
                onClick={() => void handleSaveTopSize()}
                title="Save & update preset dimensions"
              >
                Save Size
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="play"
                onClick={() => void handleTestNotesWindow()}
                title="Test the real floating Notepad in action"
              >
                Test Notes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="arrows"
                onClick={() => void saveCurrentWindowSize(activePreset.id)}
                title="Capture dimensions from the manually resized floating window"
              >
                Capture
              </Button>
              <div className="notes-size-select-wrap">
                <Select
                  value={windowPreferences.windowSizePreset}
                  onChange={(value) => void patchWindowPreferences({ windowSizePreset: value })}
                  options={allPresets.map((p) => ({
                    value: p.id,
                    label: `Use ${p.name} (${p.width} × ${p.height})`,
                  }))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="notes-size-preview-grid" aria-label="Notes window size previews">
          {allPresets.map((preset) => {
            const isActive = windowPreferences.windowSizePreset === preset.id;
            const isEditing = editingPresetId === preset.id;
            const liveWidth = isEditing ? (Number(sizeDraft.width) || preset.width) : preset.width;
            const liveHeight = isEditing ? (Number(sizeDraft.height) || preset.height) : preset.height;

            return (
              <section key={preset.id} className={"notes-size-preview-card" + (isActive ? " is-active" : "")}>
                <div className="notes-size-preview-topline">
                  <div className="min-w-0">
                    <div className="notes-size-preview-title-row">
                      <div className="notes-size-preview-title">{isEditing && !preset.isBuiltin ? sizeDraft.name || preset.name : preset.name}</div>
                      {preset.isBuiltin ? (
                        <span className="chip chip-subtle tiny">Default</span>
                      ) : (
                        <span className="chip chip-accent tiny">Custom</span>
                      )}
                    </div>
                    <div className="notes-size-preview-dimensions">
                      {liveWidth} × {liveHeight} px
                    </div>
                  </div>

                  <div className="row gap-xxs items-center">
                    {!isEditing && (
                      <IconButton
                        name="edit"
                        size={14}
                        title={`Edit ${preset.name} size`}
                        onClick={() => beginEditPreset(preset)}
                      />
                    )}
                    {!preset.isBuiltin && !isEditing && (
                      deleteConfirmId === preset.id ? (
                        <div className="row gap-xxs items-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-danger btn-xs py-0 px-xs"
                            onClick={() => handleDeleteCustomPreset(preset.id)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs py-0 px-xs"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <IconButton
                          name="trash"
                          size={14}
                          title={`Delete ${preset.name}`}
                          onClick={() => setDeleteConfirmId(preset.id)}
                        />
                      )
                    )}
                  </div>
                </div>

                {/* Realistic Live Notes Window Preview */}
                <NotesMiniWindowPreview
                  width={liveWidth}
                  height={liveHeight}
                  isActive={isActive}
                />

                {isEditing ? (
                  <div
                    className="notes-size-editor"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelEditPreset();
                      } else if (e.key === "Enter") {
                        e.stopPropagation();
                        void savePresetSize();
                      }
                    }}
                  >
                    {!preset.isBuiltin && (
                      <div className="mb-xs">
                        <label className="tiny muted mb-xxs block">Preset Name</label>
                        <Input
                          aria-label="Preset name"
                          value={sizeDraft.name}
                          onChange={(e) => setSizeDraft((d) => ({ ...d, name: e.target.value }))}
                          placeholder="Preset name"
                        />
                      </div>
                    )}
                    <label className="tiny muted mb-xxs block">Dimensions (px)</label>
                    <div className="notes-size-editor-row">
                      <Input
                        aria-label={`${preset.name} width`}
                        type="number"
                        min="560"
                        max="1600"
                        value={sizeDraft.width}
                        onChange={(event) => setSizeDraft((draft) => ({ ...draft, width: event.target.value }))}
                      />
                      <span>×</span>
                      <Input
                        aria-label={`${preset.name} height`}
                        type="number"
                        min="520"
                        max="1200"
                        value={sizeDraft.height}
                        onChange={(event) => setSizeDraft((draft) => ({ ...draft, height: event.target.value }))}
                      />
                      <Button variant="primary" size="sm" onClick={() => void savePresetSize()}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEditPreset}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="notes-size-preview-actions">
                    <Button
                      variant={isActive ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => void patchWindowPreferences({ windowSizePreset: preset.id })}
                    >
                      {isActive ? "Selected" : "Use this size"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="play"
                      onClick={() => void handleTestNotesWindow(preset.id)}
                      title={`Test ${preset.name} in real floating Notepad`}
                    >
                      Test Size
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void saveCurrentWindowSize(preset.id)}
                      title="Save current window size to this preset"
                    >
                      Save current
                    </Button>
                  </div>
                )}
              </section>
            );
          })}

          {/* Add Custom Size Preset Card */}
          {isCreatingCustom ? (
            <section
              className="notes-size-preview-card"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setIsCreatingCustom(false);
                } else if (e.key === "Enter") {
                  e.stopPropagation();
                  void handleCreateCustomPreset();
                }
              }}
            >
              <div className="notes-size-preview-topline">
                <div>
                  <div className="notes-size-preview-title">{newCustomDraft.name || "New Custom Size"}</div>
                  <div className="notes-size-preview-dimensions">
                    {newCustomDraft.width || 860} × {newCustomDraft.height || 720} px
                  </div>
                </div>
                <IconButton name="close" size={14} title="Cancel" onClick={() => setIsCreatingCustom(false)} />
              </div>

              <NotesMiniWindowPreview
                width={Number(newCustomDraft.width) || 860}
                height={Number(newCustomDraft.height) || 720}
                isActive={true}
              />

              <div className="notes-size-editor">
                <div className="mb-xs">
                  <label className="tiny muted mb-xxs block">Preset Name</label>
                  <Input
                    aria-label="New preset name"
                    value={newCustomDraft.name}
                    onChange={(e) => setNewCustomDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Ultrawide Desk, Focus Pad"
                  />
                </div>
                <label className="tiny muted mb-xxs block">Dimensions (px)</label>
                <div className="notes-size-editor-row">
                  <Input
                    aria-label="New preset width"
                    type="number"
                    min="560"
                    max="1600"
                    value={newCustomDraft.width}
                    onChange={(e) => setNewCustomDraft((d) => ({ ...d, width: e.target.value }))}
                  />
                  <span>×</span>
                  <Input
                    aria-label="New preset height"
                    type="number"
                    min="520"
                    max="1200"
                    value={newCustomDraft.height}
                    onChange={(e) => setNewCustomDraft((d) => ({ ...d, height: e.target.value }))}
                  />
                </div>
                <div className="row gap-xs mt-xs">
                  <Button variant="primary" size="sm" onClick={() => void handleCreateCustomPreset()}>
                    Create Preset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setIsCreatingCustom(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <button
              type="button"
              className="notes-size-add-card"
              onClick={() => {
                setIsCreatingCustom(true);
                setEditingPresetId(null);
              }}
            >
              <span className="notes-size-add-icon">
                <Icon name="plus" size={20} />
              </span>
              <div>
                <div className="bold font-md">Add Custom Size</div>
                <div className="tiny muted mt-xxs">Configure custom dimensions for Notes</div>
              </div>
            </button>
          )}
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Follow Mouse When Opening</div>
            <div className="settings-row-desc">Open the Notes pad near the pointer when you use its shortcut.</div>
          </div>
          <div className="settings-row-control">
            <Toggle
              label="Follow mouse when opening Notes"
              checked={windowPreferences.followMouseOnOpen}
              onChange={(value) => void patchWindowPreferences({ followMouseOnOpen: value })}
            />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Reset Notes Window Size</div>
            <div className="settings-row-desc">Return a manually resized window to the selected size.</div>
          </div>
          <div className="settings-row-control">
            <Button variant="secondary" size="sm" icon="arrows" onClick={() => void handleResetWindowSize()}>
              Reset Size
            </Button>
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
            <div className="w-160">
              <Slider
                min={100}
                max={2000}
                step={100}
                value={settings.notes?.autoSaveIntervalMs ?? 300}
                onChange={(v) => patchSettings("notes", { autoSaveIntervalMs: v })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Slash Commands Card */}
      <div className="card mb-md">
        <div className="row gap-sm items-center mb-md">
          <Icon name="command" size={18} />
          <div>
            <div className="bold">Slash Commands</div>
            <div className="tiny muted">Enable or disable commands in the floating editor</div>
          </div>
        </div>

        {Object.entries(commandsByCategory).map(([category, cmds]) => (
          <div key={category} className="mb-md">
            <div className="small bold muted uppercase mb-xs">{category}</div>
            {cmds.map((cmd) => {
              const isEnabled =
                settings.notes?.defaultSlashCommands === undefined
                  ? true
                  : settings.notes.defaultSlashCommands.includes(cmd.id);
              const isPreviewing = previewCommandId === cmd.id;

              return (
                <div
                  key={cmd.id}
                  className={"settings-row" + (isPreviewing ? " setting-row-highlight" : "")}
                  onMouseEnter={() => setPreviewCommandId(cmd.id)}
                >
                  <div className="settings-row-info">
                    <div className="row gap-xs items-center">
                      <Icon name={cmd.icon as any} size={14} />
                      <div className="settings-row-title">{cmd.label}</div>
                      <span className="chip chip-subtle tiny font-mono">{cmd.id}</span>
                    </div>
                    <div className="settings-row-desc">{cmd.hint}</div>
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
          <Icon name="shortcuts" size={18} />
          <div>
            <div className="bold">Notes Shortcut</div>
            <div className="tiny muted">Global key trigger to open the floating notepad</div>
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-title">Global Trigger</div>
            <div className="settings-row-desc">
              {notesShortcut
                ? `Active trigger: ${notesShortcut.key} (${notesShortcut.trigger})`
                : "No shortcut configured for Notes"}
            </div>
          </div>
          <div className="settings-row-control">
            {notesShortcut ? (
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => setEditingShortcutId(notesShortcut.id)}
              >
                Edit Shortcut
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                icon="plus"
                onClick={() => setPage("create")}
              >
                Create Shortcut
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Edit Shortcut Modal */}
      {editingShortcutId && (
        <EditShortcutModal
          open={Boolean(editingShortcutId)}
          shortcutId={editingShortcutId}
          onClose={() => setEditingShortcutId(null)}
        />
      )}
    </div>
  );
}
