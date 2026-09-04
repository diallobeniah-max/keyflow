import { type FC, useState, useRef, useCallback } from "react";
import { useStore } from "../../store/useStore";
import { SettingsGroup, SettingsRow } from "../../components/ui";
import { SettingsPageHeader } from "./SettingsPageHeader";

interface ShortcutBindingPageProps {
  onBack?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert an Electron accelerator string to human-readable display chips.
 *  "Ctrl+Shift+P" → ["Ctrl", "Shift", "P"]
 */
function acceleratorToChips(accelerator: string | undefined): string[] {
  if (!accelerator) return [];
  return accelerator.split("+").map((part) => {
    // Normalize common abbreviations
    switch (part.trim()) {
      case "CommandOrControl":
      case "CmdOrCtrl":
        return "Ctrl";
      case "Cmd":
        return "Cmd";
      case "Meta":
        return "Win";
      default:
        return part.trim();
    }
  });
}

/** Convert capture state (modifiers + key) back to Electron accelerator string. */
function buildAccelerator(modifiers: string[], key: string): string {
  return [...modifiers, key].join("+");
}

/** Extract a display-friendly key name from a KeyboardEvent.key value. */
function displayKey(key: string): string {
  switch (key) {
    case " ":           return "Space";
    case "Escape":      return "Esc";
    case "ArrowUp":     return "↑";
    case "ArrowDown":   return "↓";
    case "ArrowLeft":   return "←";
    case "ArrowRight":  return "→";
    case "Delete":      return "Del";
    case "Backspace":   return "⌫";
    default:
      // Single character keys: uppercase
      if (key.length === 1) return key.toUpperCase();
      return key;
  }
}

/** Extract modifier list from a keyboard event. */
function extractModifiers(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey)  mods.push("Ctrl");
  if (e.altKey)   mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey)  mods.push("Win");
  return mods;
}

/** Check if a keyboard key is a modifier-only keypress (don't record those). */
function isModifierOnly(key: string): boolean {
  return ["Control", "Alt", "Shift", "Meta", "OS", "Win"].includes(key);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface BindableShortcut {
  /** Key in settings.shortcuts that holds this binding string */
  settingsKey: "globalPause" | "emergencySafe" | "commandPaletteShortcut";
  label: string;
  description: string;
  icon: string;
}

const BINDABLE_SHORTCUTS: BindableShortcut[] = [
  {
    settingsKey: "globalPause",
    label: "Pause / Resume Engine",
    description: "Temporarily suspend all KeyFlow shortcut matching",
    icon: "pause",
  },
  {
    settingsKey: "emergencySafe",
    label: "Emergency Safe Mode",
    description: "Disconnect low-level hooks until Safe Mode is turned off",
    icon: "shield",
  },
  {
    settingsKey: "commandPaletteShortcut",
    label: "Command Palette",
    description: "Open the searchable command and settings palette",
    icon: "search",
  },
];

// ─── Key Chip ────────────────────────────────────────────────────────────────

function KeyChip({ label }: { label: string }) {
  return <span className="sc-key-chip">{label}</span>;
}

function KeyChipRow({ chips, empty }: { chips: string[]; empty?: string }) {
  if (chips.length === 0) {
    return <span className="sc-binding-empty">{empty ?? "Not assigned"}</span>;
  }
  return (
    <span className="sc-key-chip-row" aria-label={chips.join(" + ")}>
      {chips.map((chip, i) => (
        <span key={i}>
          {i > 0 && <span className="sc-key-plus" aria-hidden="true">+</span>}
          <KeyChip label={chip} />
        </span>
      ))}
    </span>
  );
}

// ─── Capture Panel ────────────────────────────────────────────────────────────

interface CapturePanelProps {
  shortcut: BindableShortcut;
  currentValue: string | undefined;
  allValues: Record<string, string | undefined>;
  onSave: (accelerator: string) => void;
  onCancel: () => void;
}

function CapturePanel({ shortcut, currentValue, allValues, onSave, onCancel }: CapturePanelProps) {
  const [captured, setCaptured] = useState<{ mods: string[]; key: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the hidden input so it receives key events
  const focus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      onCancel();
      return;
    }

    if (isModifierOnly(e.key)) return;

    const mods = extractModifiers(e.nativeEvent);
    const key = displayKey(e.key);
    setCaptured({ mods, key });
  }, [onCancel]);

  const candidateAccelerator = captured
    ? buildAccelerator(captured.mods, captured.key)
    : undefined;

  // Conflict detection
  const conflict = candidateAccelerator
    ? Object.entries(allValues).find(
        ([k, v]) => k !== shortcut.settingsKey && v === candidateAccelerator,
      )
    : null;

  const conflictLabel = conflict
    ? BINDABLE_SHORTCUTS.find((s) => s.settingsKey === conflict[0])?.label
    : null;

  const chips = captured ? [...captured.mods, captured.key] : [];

  return (
    <div className="sc-capture-panel">
      <div className="sc-capture-header">
        <span className="sc-capture-title">Assign shortcut — {shortcut.label}</span>
      </div>

      {/* Hidden input captures key events */}
      <input
        ref={inputRef}
        className="sc-capture-hidden-input"
        readOnly
        aria-label="Press a key combination"
        onKeyDown={handleKeyDown}
        onBlur={focus}
      />

      <button
        type="button"
        className={`sc-capture-display${captured ? " has-capture" : ""}`}
        onClick={focus}
        aria-label="Click here and press a key combination"
        onFocus={focus}
      >
        {chips.length > 0
          ? <KeyChipRow chips={chips} />
          : <span className="sc-capture-hint">Click here, then press a key combination…</span>
        }
      </button>

      {conflict && (
        <p className="sc-capture-conflict-warn">
          ⚠ <strong>{candidateAccelerator}</strong> is already used by <em>{conflictLabel}</em>.
          Saving will reassign it.
        </p>
      )}

      <div className="sc-capture-actions">
        <button
          type="button"
          className="sc-btn sc-btn-primary"
          disabled={!captured}
          onClick={() => {
            if (candidateAccelerator) onSave(candidateAccelerator);
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="sc-btn sc-btn-ghost"
          onClick={onCancel}
        >
          Cancel
        </button>
        {currentValue && (
          <button
            type="button"
            className="sc-btn sc-btn-danger"
            onClick={() => onSave("")}
          >
            Clear binding
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Binding Row ──────────────────────────────────────────────────────────────

interface BindingRowProps {
  shortcut: BindableShortcut;
  value: string | undefined;
  allValues: Record<string, string | undefined>;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (accelerator: string) => void;
  onCancel: () => void;
}

function BindingRow({ shortcut, value, allValues, isEditing, onEdit, onSave, onCancel }: BindingRowProps) {
  const chips = acceleratorToChips(value);

  return (
    <div id={`row-sc-bind-${shortcut.settingsKey}`} className="sc-binding-row">
      <div className="sc-binding-info">
        <span className="sc-binding-label">{shortcut.label}</span>
        <span className="sc-binding-desc">{shortcut.description}</span>
      </div>
      <div className="sc-binding-control">
        {!isEditing ? (
          <div className="sc-binding-display">
            <KeyChipRow chips={chips} empty="Not assigned" />
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              onClick={onEdit}
              aria-label={`Edit shortcut for ${shortcut.label}`}
            >
              Edit
            </button>
          </div>
        ) : (
          <CapturePanel
            shortcut={shortcut}
            currentValue={value}
            allValues={allValues}
            onSave={onSave}
            onCancel={onCancel}
          />
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ShortcutBindingPage: FC<ShortcutBindingPageProps> = ({ onBack }) => {
  const shortcuts = useStore((s) => s.data.settings.shortcuts);
  const patch = useStore((s) => s.patchSettings);

  const [editingKey, setEditingKey] = useState<string | null>(null);

  const allValues: Record<string, string | undefined> = {
    globalPause: shortcuts.globalPause,
    emergencySafe: shortcuts.emergencySafe,
    commandPaletteShortcut: shortcuts.commandPaletteShortcut,
  };

  const handleSave = (settingsKey: string, accelerator: string) => {
    patch("shortcuts", { [settingsKey]: accelerator || undefined });
    setEditingKey(null);
  };

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Shortcut Bindings"
        description="Reassign the keyboard shortcuts that control KeyFlow's core engine actions."
        onBack={onBack}
      />

      <SettingsGroup
        title="Engine Controls"
        icon="keyboard"
        desc="Remap the built-in keyboard shortcuts for KeyFlow's global actions"
        accentColor="blue"
      >
        {BINDABLE_SHORTCUTS.map((sc) => (
          <BindingRow
            key={sc.settingsKey}
            shortcut={sc}
            value={allValues[sc.settingsKey]}
            allValues={allValues}
            isEditing={editingKey === sc.settingsKey}
            onEdit={() => setEditingKey(sc.settingsKey)}
            onSave={(acc) => handleSave(sc.settingsKey, acc)}
            onCancel={() => setEditingKey(null)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="About Shortcut Bindings"
        icon="info"
        desc=""
        accentColor="slate"
      >
        <SettingsRow
          id="row-sc-bind-info"
          title="How bindings work"
          desc="These shortcuts activate even when KeyFlow is minimized to the system tray. Changes take effect immediately."
        >
          <span />
        </SettingsRow>
      </SettingsGroup>
    </div>
  );
};
