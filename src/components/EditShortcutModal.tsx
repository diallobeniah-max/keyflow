import { useEffect, useMemo, useState } from "react";
import { Action, ModifierKey, Shortcut, TriggerType } from "../types";
import { useStore } from "../store/useStore";
import { ACTION_META, REMAP_TARGETS, TRIGGER_META } from "../lib/constants";
import { analyzeShortcutConflicts, allTapGesturesTaken, getGestureAvailability } from "../lib/conflict";
import { getEngine } from "../lib/engine";
import { resolveShortcutBehavior } from "../lib/defaults";
import { SimpleActionPicker } from "./SimpleActionPicker";
import { ActionListEditor } from "./ActionEditor";
import { AppPicker } from "./AppPicker";
import { KeyCapture } from "./KeyCapture";
import { Button, Card, Field, Input, Select, Slider, Toggle } from "./ui";
import { Icon } from "./Icon";
import { uid } from "../store/sampleData";

function deriveFriendlyName(shortcut: Shortcut): string {
  if (shortcut.name?.trim()) return shortcut.name;
  const mods = (shortcut.modifiers ?? []).join(" + ");
  const keyPart = mods ? `${mods} + ${shortcut.key}` : shortcut.key;
  const triggerLabel = TRIGGER_META[shortcut.trigger]?.label ?? shortcut.trigger;
  const firstAction = shortcut.actions?.[0];
  const actionLabel = firstAction ? (ACTION_META[firstAction.type]?.label ?? firstAction.type) : "Action";
  return `${keyPart} (${triggerLabel}) → ${actionLabel}`;
}

function simulateShortcut(s: Shortcut) {
  const e = getEngine();
  if (s.trigger === "remap") return;
  if (s.trigger === "double") {
    e.simulateTap(s.key, s.modifiers);
    setTimeout(() => e.simulateTap(s.key, s.modifiers), 70);
    return;
  }
  if (s.trigger === "triple") {
    e.simulateTap(s.key, s.modifiers);
    setTimeout(() => e.simulateTap(s.key, s.modifiers), 70);
    setTimeout(() => e.simulateTap(s.key, s.modifiers), 140);
    return;
  }
  if (s.trigger === "longPress" || s.trigger === "hold") {
    e.simulateHold(s.key, s.modifiers, (s.timing?.holdDuration ?? 500) + 150);
    return;
  }
  e.simulateTap(s.key, s.modifiers);
}

interface EditShortcutModalProps {
  shortcutId: string | null;
  open: boolean;
  onClose: () => void;
}

export function EditShortcutModal({ shortcutId, open, onClose }: EditShortcutModalProps) {
  const data = useStore((s) => s.data);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const updateShortcut = useStore((s) => s.updateShortcut);
  const deleteShortcut = useStore((s) => s.deleteShortcut);
  const duplicateShortcut = useStore((s) => s.duplicateShortcut);

  const existing = useMemo(() => {
    return shortcutId ? data.shortcuts.find((s) => s.id === shortcutId) : undefined;
  }, [shortcutId, data.shortcuts]);

  const [draft, setDraft] = useState<Shortcut | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 130);
  };

  // Sync draft when modal opens or shortcut changes
  useEffect(() => {
    if (existing && open) {
      setDraft(JSON.parse(JSON.stringify(existing)));
      setConfirmDelete(false);
      setIsClosing(false);
    } else {
      setDraft(null);
    }
  }, [existing, open]);

  const profileName = useMemo(() => {
    return data.profiles.find((p) => p.id === draft?.profileId)?.name ?? "Default";
  }, [data.profiles, draft?.profileId]);

  const conflictReport = useMemo(() => {
    if (!draft) return { hasBlockingConflict: false, conflicts: [], suggestions: [] };
    return analyzeShortcutConflicts(draft, data.shortcuts, data.settings, {
      currentShortcutId: draft.id,
      activeProfileId,
    });
  }, [draft, data.shortcuts, data.settings, activeProfileId]);

  const gestureAvailability = useMemo(() => {
    if (!draft) return null;
    return getGestureAvailability(
      { key: draft.key, modifiers: draft.modifiers, appScope: draft.appScope, profileId: draft.profileId },
      data.shortcuts,
      { currentShortcutId: draft.id, activeProfileId }
    );
  }, [draft, data.shortcuts, activeProfileId]);

  const allTapGesturesUsed = useMemo(() => {
    if (!draft) return false;
    return allTapGesturesTaken(
      { key: draft.key, modifiers: draft.modifiers, appScope: draft.appScope, profileId: draft.profileId },
      data.shortcuts,
      { currentShortcutId: draft.id, activeProfileId }
    );
  }, [draft, data.shortcuts, activeProfileId]);

  if (!open || !draft) return null;

  const hasError = conflictReport.hasBlockingConflict || !draft.key;
  const isTapTrigger = draft.trigger === "single" || draft.trigger === "double" || draft.trigger === "triple";

  const set = (p: Partial<Shortcut>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const setTiming = (k: keyof Shortcut["timing"], v: number) =>
    setDraft((d) => (d ? { ...d, timing: { ...d.timing, [k]: v } } : d));

  const updatePrimaryAction = (action: Action) => {
    setDraft((d) => {
      if (!d) return d;
      const rest = (d.actions ?? []).slice(1);
      return { ...d, actions: [action, ...rest] };
    });
  };

  const handleSave = () => {
    if (hasError || !draft) return;
    const finalShortcut: Shortcut = {
      ...draft,
      name: draft.name?.trim() ? draft.name.trim() : deriveFriendlyName(draft),
      keyBehavior:
        draft.trigger === "remap"
          ? "remap"
          : (draft.keyBehavior ?? (draft.suppressKey ? "suppress" : resolveShortcutBehavior(draft))),
      suppressKey: draft.trigger === "remap" ? false : draft.suppressKey ?? (resolveShortcutBehavior(draft) === "suppress"),
    };
    updateShortcut(finalShortcut);
    handleClose();
  };

  const handleDelete = () => {
    if (!draft) return;
    deleteShortcut(draft.id);
    handleClose();
  };

  const handleDuplicate = () => {
    if (!draft) return;
    duplicateShortcut(draft.id);
    handleClose();
  };

  const primaryAction = draft.actions?.[0] ?? {
    id: uid("act"),
    type: "screenshot",
    payload: { screenshotMode: "snipOverlay" },
  };

  return (
    <div className={"ios-modal-backdrop " + (isClosing ? "anim-fade-out" : "anim-fade-in")} onClick={handleClose}>
      <div
        className={"ios-modal-sheet " + (isClosing ? "anim-modal-exit" : "anim-modal-enter")}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-shortcut-title"
      >
        {/* iOS Drag Handle Pill */}
        <div className="ios-modal-drag-handle" />

        {/* Modal Header */}
        <div className="ios-modal-header">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleClose}
            aria-label="Cancel"
          >
            Cancel
          </button>

          <div className="ios-modal-title-wrap">
            <h2 id="edit-shortcut-title" className="ios-modal-title">Edit Shortcut</h2>
            <span className="ios-modal-subtitle">{profileName} Profile</span>
          </div>

          <Button
            variant="primary"
            size="sm"
            disabled={hasError}
            onClick={handleSave}
          >
            Done
          </Button>
        </div>

        {/* Modal Content Scroll Body */}
        <div className="ios-modal-body">
          {/* Shortcut Name & Profile */}
          <div className="card p-sm mb-xs">
            <div className="grid cols-2 gap-sm">
              <Field label="Shortcut Name">
                <Input
                  placeholder={deriveFriendlyName(draft)}
                  value={draft.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>

              <Field label="Target Profile">
                <Select
                  value={draft.profileId}
                  onChange={(v) => set({ profileId: v })}
                  options={data.profiles.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            </div>
          </div>

          {/* Key & Modifiers Section */}
          <div className="card p-sm mb-xs">
            <div className="row justify-between items-center mb-xs">
              <span className="bold small">Trigger Key & Modifiers</span>
              {draft.key && (
                <span className="chip chip-subtle tiny">
                  Active: <kbd className="keycap-sm">{[...draft.modifiers, draft.key].join("+")}</kbd>
                </span>
              )}
            </div>

            <KeyCapture
              value={draft.key}
              modifiers={draft.modifiers}
              onChangeKey={(k) => set({ key: k })}
              onChangeMods={(m) => set({ modifiers: m })}
              mode="edit"
            />
          </div>

          {/* Trigger Gesture Selector */}
          <div className="card p-sm mb-xs">
            <div className="row justify-between items-center mb-xs">
              <span className="bold small">Activation Gesture</span>
              <span className="muted tiny">{TRIGGER_META[draft.trigger]?.desc}</span>
            </div>

            <div className="row gap-xs wrap">
              {(Object.keys(TRIGGER_META) as TriggerType[]).map((t) => {
                const meta = TRIGGER_META[t];
                const active = draft.trigger === t;
                return (
                  <button
                    key={t}
                    type="button"
                    className={"chip clickable" + (active ? " chip-accent" : " chip-subtle")}
                    onClick={() => set({ trigger: t })}
                    aria-pressed={active}
                  >
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tap Gestures Coexistence Helper */}
            {isTapTrigger && (
              <div className="mt-xs pt-xs border-top-subtle row items-center justify-between tiny">
                <span className="muted">
                  Tap availability: {gestureAvailability ? Object.entries(gestureAvailability).filter(([, used]) => !used).length : 0} left
                </span>
                {allTapGesturesUsed && (
                  <span className="warning-text">All 3 tap slots are currently mapped</span>
                )}
              </div>
            )}

            {/* Remap Target selector if Remap is chosen */}
            {draft.trigger === "remap" && (
              <div className="mt-sm pt-sm border-top-subtle">
                <Field label="Remap Destination Key" hint="The replacement key Windows receives">
                  <Select
                    value={draft.remapTo ?? ""}
                    onChange={(k) => {
                      set({ remapTo: k });
                      updatePrimaryAction({
                        id: draft.actions[0]?.id ?? uid("act"),
                        type: "remapKey",
                        payload: { remapTarget: k },
                      });
                    }}
                    options={REMAP_TARGETS}
                  />
                </Field>
              </div>
            )}
          </div>

          {/* Action Configuration */}
          {draft.trigger !== "remap" && (
            <div className="card p-sm mb-xs">
              <div className="row justify-between items-center mb-xs">
                <span className="bold small">Assigned Action</span>
                <span className="chip chip-subtle tiny">{ACTION_META[primaryAction.type]?.label}</span>
              </div>

              <SimpleActionPicker
                action={primaryAction}
                onChange={updatePrimaryAction}
              />
            </div>
          )}

          {/* App Scope Filter */}
          <div className="card p-sm mb-xs">
            <AppPicker
              value={draft.appScope}
              onChange={(scope) => set({ appScope: scope })}
            />
          </div>

          {/* Conflict Warnings */}
          {conflictReport.conflicts.length > 0 && (
            <div className={"card mb-sm " + (hasError ? "border-danger-soft" : "border-warning-soft")}>
              <div className="row gap-xs items-center mb-xs">
                <Icon name="notify" size={16} className={hasError ? "danger-text" : "warning-text"} />
                <span className={"bold small " + (hasError ? "danger-text" : "warning-text")}>
                  {hasError ? "Conflicting Shortcut Detected" : "Shortcut Warning"}
                </span>
              </div>
              {conflictReport.conflicts.map((c, i) => (
                <div key={i} className="tiny muted mb-xs">{c.message}</div>
              ))}
            </div>
          )}

          {/* Advanced Accordion */}
          <div className="card mb-sm">
            <button
              type="button"
              className="row justify-between items-center w-full btn-ghost p-0"
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              <div className="row gap-xs items-center">
                <Icon name="settings" size={14} />
                <span className="bold small">Timing & Advanced Settings</span>
              </div>
              <Icon name={advancedOpen ? "chevronUp" : "chevronDown"} size={14} />
            </button>

            {advancedOpen && (
              <div className="col gap-sm mt-sm pt-sm border-top-subtle">
                <Field label="Key Behavior" hint="How Windows handles the physical key press">
                  <Select
                    value={draft.keyBehavior ?? "passThrough"}
                    onChange={(v) => set({ keyBehavior: v as any })}
                    options={[
                      { value: "passThrough", label: "Pass-through (Standard)" },
                      { value: "suppress", label: "Suppress physical key event" },
                      { value: "disable", label: "Disable key entirely" },
                    ]}
                  />
                </Field>

                <div className="grid cols-2 gap-sm">
                  <Field label={`Tap Interval: ${draft.timing?.tapInterval ?? 300}ms`}>
                    <Slider
                      min={100}
                      max={600}
                      step={25}
                      value={draft.timing?.tapInterval ?? 300}
                      onChange={(v) => setTiming("tapInterval", v)}
                    />
                  </Field>

                  <Field label={`Hold Duration: ${draft.timing?.holdDuration ?? 500}ms`}>
                    <Slider
                      min={200}
                      max={1200}
                      step={50}
                      value={draft.timing?.holdDuration ?? 500}
                      onChange={(v) => setTiming("holdDuration", v)}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="ios-modal-footer">
          <div className="row gap-xs">
            {confirmDelete ? (
              <div className="row gap-xs items-center">
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  Confirm Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon="trash"
                className="danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              icon="copy"
              onClick={handleDuplicate}
            >
              Duplicate
            </Button>
          </div>

          <div className="row gap-xs">
            <Button
              variant="secondary"
              size="sm"
              icon="play"
              onClick={() => simulateShortcut(draft)}
            >
              Test
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={hasError}
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
