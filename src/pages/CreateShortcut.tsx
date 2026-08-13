import { useEffect, useMemo, useState } from "react";
import { Action, ModifierKey, Shortcut, TriggerType } from "../types";
import { useStore } from "../store/useStore";
import { uid } from "../store/sampleData";
import { ACTION_META, MOUSE_BUTTONS, TRIGGER_META } from "../lib/constants";
import { analyzeShortcutConflicts, formatShortcutLabel } from "../lib/conflict";
import { getEngine } from "../lib/engine";
import { resolveShortcutBehavior } from "../lib/defaults";
import { ActionListEditor } from "../components/ActionEditor";
import { SimpleActionPicker } from "../components/SimpleActionPicker";
import { KeyCapture } from "../components/KeyCapture";
import { Button, Card, Field, Input, PageIntro, Select, Slider, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";

interface RecommendedPreset {
  id: string;
  title: string;
  desc: string;
  icon: string;
  defaultKey: string;
  defaultModifiers: ModifierKey[];
  defaultTrigger: TriggerType;
  action: Action;
}

const RECOMMENDED_PRESETS: RecommendedPreset[] = [
  {
    id: "rec-popup",
    title: "Popup Menu",
    desc: "Open your KeyFlow action menu anywhere.",
    icon: "popup",
    defaultKey: "F",
    defaultModifiers: [],
    defaultTrigger: "double",
    action: { id: "act-pop", type: "showPopup", payload: {} },
  },
  {
    id: "rec-screenshot",
    title: "Screenshot",
    desc: "Capture any part of your screen.",
    icon: "camera",
    defaultKey: "CapsLock",
    defaultModifiers: [],
    defaultTrigger: "single",
    action: { id: "act-snip", type: "screenshot", payload: { screenshotMode: "snipOverlay" } },
  },
  {
    id: "rec-topmost",
    title: "Always on Top",
    desc: "Keep the current window floating above others.",
    icon: "pinTop",
    defaultKey: "T",
    defaultModifiers: ["Ctrl", "Shift"],
    defaultTrigger: "single",
    action: { id: "act-top", type: "alwaysOnTop", payload: { topmostMode: "toggle", highlight: true, sound: true } },
  },
  {
    id: "rec-open-app",
    title: "Open App",
    desc: "Launch an application instantly.",
    icon: "app",
    defaultKey: "O",
    defaultModifiers: ["Ctrl", "Shift"],
    defaultTrigger: "single",
    action: { id: "act-app", type: "openApp", payload: { path: "notepad.exe" } },
  },
];

function defaultBlankShortcut(profileId: string, pending?: { key: string; mouse?: boolean } | null): Shortcut {
  return {
    id: uid("sc"),
    name: "",
    profileId,
    key: pending?.key ?? "T",
    mouse: !!pending?.mouse,
    modifiers: ["Ctrl", "Shift"],
    trigger: "single",
    timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350, timingMode: "auto" },
    actions: [{ id: uid("act"), type: "alwaysOnTop", payload: { topmostMode: "toggle", highlight: true, sound: true } }],
    enabled: true,
    createdAt: Date.now(),
  };
}

function simulateShortcut(s: Shortcut) {
  const e = getEngine();
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
    e.simulateHold(s.key, s.modifiers, s.timing.holdDuration + 150);
    return;
  }
  e.simulateTap(s.key, s.modifiers);
}

function deriveFriendlyName(shortcut: Shortcut): string {
  if (shortcut.name?.trim()) return shortcut.name;
  const mods = (shortcut.modifiers ?? []).join(" + ");
  const keyPart = mods ? `${mods} + ${shortcut.key}` : shortcut.key;
  const triggerLabel = TRIGGER_META[shortcut.trigger]?.label ?? shortcut.trigger;
  const firstAction = shortcut.actions?.[0];
  const actionLabel = firstAction ? (ACTION_META[firstAction.type]?.label ?? firstAction.type) : "Action";
  return `${keyPart} (${triggerLabel}) → ${actionLabel}`;
}

export function CreateShortcut() {
  const data = useStore((s) => s.data);
  const active = useStore((s) => s.activeProfileId);
  const editingId = useStore((s) => s.editingId);
  const pending = useStore((s) => s.pendingKey);
  const clearPending = useStore((s) => s.clearPendingKey);
  const add = useStore((s) => s.addShortcut);
  const update = useStore((s) => s.updateShortcut);
  const setPage = useStore((s) => s.setPage);

  // Hyper key awareness — used for Popup preset card context
  const hyperEnabled = !!(data.settings.shortcuts.hyperKeyConfig?.enabled);

  const existing = editingId ? data.shortcuts.find((s) => s.id === editingId) : undefined;
  const [draft, setDraft] = useState<Shortcut>(() =>
    existing ? JSON.parse(JSON.stringify(existing)) : defaultBlankShortcut(active, pending)
  );

  const [activeRecommendation, setActiveRecommendation] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    clearPending();
  }, []);

  const behavior: string = resolveShortcutBehavior(draft);
  const timingMode: string = draft.timing?.timingMode ?? "auto";

  const setTimingMode = (m: string) =>
    setDraft((d) => ({
      ...d,
      timing: { ...d.timing, timingMode: m === "custom" ? "custom" : "auto" },
    }));

  const conflictReport = useMemo(
    () =>
      analyzeShortcutConflicts(draft, data.shortcuts, data.settings, {
        currentShortcutId: editingId ?? undefined,
        activeProfileId: active,
      }),
    [draft, data.shortcuts, data.settings, editingId, active]
  );
  const hasError = conflictReport.hasBlockingConflict;

  const set = (p: Partial<Shortcut>) => setDraft((d) => ({ ...d, ...p }));
  const setTiming = (k: keyof Shortcut["timing"], v: number) =>
    setDraft((d) => ({ ...d, timing: { ...d.timing, [k]: v } }));

  const updatePrimaryAction = (action: Action) => {
    setDraft((d) => {
      const rest = (d.actions ?? []).slice(1);
      return { ...d, actions: [action, ...rest] };
    });
  };

  const applyRecommendation = (preset: RecommendedPreset) => {
    setActiveRecommendation(preset.id);
    let key = preset.defaultKey;
    let modifiers = preset.defaultModifiers ?? [];
    let trigger = preset.defaultTrigger;

    // Pre-check conflicts so preset does not collide with existing shortcuts
    const candidateTest: Partial<Shortcut> = {
      id: editingId ?? "preset-test",
      key,
      modifiers,
      trigger,
      profileId: active,
    };
    const rep = analyzeShortcutConflicts(candidateTest, data.shortcuts, data.settings, {
      currentShortcutId: editingId ?? undefined,
      activeProfileId: active,
    });

    if (rep.hasBlockingConflict && rep.suggestions.length > 0) {
      const sug = rep.suggestions[0];
      key = sug.key;
      modifiers = sug.modifiers;
      trigger = sug.trigger;
    }

    setDraft((d) => ({
      ...d,
      key,
      modifiers,
      trigger,
      actions: [{ ...preset.action, id: uid("act") }],
    }));
  };

  const save = () => {
    // Re-verify conflicts immediately before saving
    const rep = analyzeShortcutConflicts(draft, data.shortcuts, data.settings, {
      currentShortcutId: editingId ?? undefined,
      activeProfileId: active,
    });
    if (rep.hasBlockingConflict) return;

    const finalShortcut: Shortcut = {
      ...draft,
      name: draft.name?.trim() ? draft.name.trim() : deriveFriendlyName(draft),
      keyBehavior: draft.keyBehavior ?? (draft.suppressKey ? "suppress" : resolveShortcutBehavior(draft)),
      suppressKey: draft.suppressKey ?? (resolveShortcutBehavior(draft) === "suppress"),
    };
    if (existing) {
      update(finalShortcut);
    } else {
      add(finalShortcut);
    }
    useStore.getState().setEditing(null);
    setPage("shortcuts");
  };

  const primaryAction = draft.actions?.[0] ?? {
    id: uid("act"),
    type: "screenshot",
    payload: { screenshotMode: "snipOverlay" },
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow={existing ? "EDITOR" : "BUILDER"}
        title={existing ? "Edit Shortcut" : "Create Shortcut"}
        description="Pick a recommended shortcut or assign any custom key and trigger in seconds."
      >
        <Button variant="secondary" icon="play" onClick={() => simulateShortcut(draft)}>
          Test
        </Button>
        <Button variant="primary" icon="check" disabled={hasError} onClick={save}>
          {existing ? "Save changes" : "Create shortcut"}
        </Button>
      </PageIntro>

      <div className="col gap-md max-readable">
        {/* Recommended Presets */}
        {!existing && (
          <Card>
            <div className="spread mb-sm">
              <div>
                <h3 className="section-title no-margin">
                  <Icon name="sparkles" size={17} />
                  <span>Recommended Presets</span>
                </h3>
                <p className="muted tiny no-margin">
                  One-click shortcuts ready to use immediately.
                </p>
              </div>
            </div>

            <div className="preset-grid">
              {RECOMMENDED_PRESETS.map((preset) => {
                const isSelected =
                  activeRecommendation === preset.id || primaryAction.type === preset.action.type;

                // Popup preset: show hyper badge if Hyper is enabled, else FF double-tap label
                const isPopupPreset = preset.id === "rec-popup";
                const chordLabel = isPopupPreset && hyperEnabled
                  ? "Hyper Tap"
                  : formatShortcutLabel(preset.defaultModifiers, preset.defaultKey);
                const triggerLabel = isPopupPreset && hyperEnabled
                  ? "Hyper active"
                  : (TRIGGER_META[preset.defaultTrigger]?.label ?? "Tap");

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={"preset-tile" + (isSelected ? " is-selected" : "")}
                    onClick={() => applyRecommendation(preset)}
                  >
                    <div className="preset-tile-header">
                      <div className="preset-tile-title">
                        <Icon name={preset.icon} size={18} />
                        <span>{preset.title}</span>
                      </div>
                      <span className={"chip" + (isPopupPreset && hyperEnabled ? " chip-accent" : " chip-subtle")}>
                        {chordLabel}{isPopupPreset && hyperEnabled ? "" : ` (${triggerLabel})`}
                      </span>
                    </div>
                    <p className="preset-tile-desc">
                      {preset.desc}
                      {isPopupPreset && !hyperEnabled && (
                        <span className="preset-tile-hint">
                          {" "}· <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setPage("settings"); }}>Set up Hyper Key</button> for tap-to-open
                        </span>
                      )}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Step 1: Shortcut & Trigger */}
        <Card>
          <h3 className="section-title">
            <span className="chip chip-accent">1</span>
            <span>Shortcut & Trigger</span>
          </h3>

          <div className="grid cols-2 gap-md">
            {/* Explicit keyboard / mouse source switcher */}
            <Field label="Trigger source">
              <div className="segmented-control" role="group" aria-label="Trigger source">
                <button
                  type="button"
                  className={"seg-btn" + (!draft.mouse ? " is-active" : "")}
                  aria-pressed={!draft.mouse}
                  onClick={() => set({ mouse: false, key: "T", modifiers: ["Ctrl", "Shift"] })}
                >
                  <Icon name="shortcuts" size={14} />
                  Keyboard
                </button>
                <button
                  type="button"
                  className={"seg-btn" + (draft.mouse ? " is-active" : "")}
                  aria-pressed={draft.mouse}
                  onClick={() => set({ mouse: true, key: "MB1", modifiers: [] })}
                >
                  <Icon name="mouse" size={14} />
                  Mouse
                </button>
              </div>
            </Field>

            <Field label="Key or combination" group>
              {draft.mouse ? (
                <Select
                  value={draft.key}
                  onChange={(v) => set({ key: v, mouse: true, modifiers: [] })}
                  options={MOUSE_BUTTONS}
                />
              ) : (
                <KeyCapture
                  value={draft.key}
                  modifiers={draft.modifiers}
                  onChangeKey={(key) => set({ key, mouse: key.startsWith("MB") })}
                  onChangeMods={(mods: ModifierKey[]) => set({ modifiers: mods })}
                />
              )}
            </Field>

            <Field label="Trigger mode" hint="Gesture used to activate">
              <Select
                value={draft.trigger}
                onChange={(v) => set({ trigger: v as TriggerType })}
                options={[
                  { value: "single", label: "Tap (single press)" },
                  { value: "double", label: "Double tap (two quick presses)" },
                  { value: "hold", label: "Hold (press and hold)" },
                ]}
              />
            </Field>
          </div>

          {/* Inline Conflict / Warning Banner */}
          {conflictReport.hasBlockingConflict && (
            <div className="alert-banner alert-danger mt-sm">
              <div className="alert-header">
                <Icon name="close" size={16} />
                <b>{conflictReport.conflicts.find((c) => c.level === "error")?.message}</b>
              </div>
              {conflictReport.suggestions.length > 0 && (
                <div className="alert-actions mt-xs">
                  <span className="muted tiny">Suggested alternatives:</span>
                  <div className="row gap-xs wrap mt-xs">
                    {conflictReport.suggestions.map((sug) => (
                      <Button
                        key={sug.label}
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          set({ key: sug.key, modifiers: sug.modifiers, trigger: sug.trigger })
                        }
                      >
                        Use {sug.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!conflictReport.hasBlockingConflict && conflictReport.hasWarning && (
            <div className="alert-banner alert-warning mt-sm">
              <div className="alert-header">
                <Icon name="shield" size={16} />
                <span>{conflictReport.conflicts.find((c) => c.level === "warning")?.message}</span>
              </div>
              {conflictReport.suggestions.length > 0 && (
                <div className="alert-actions mt-xs">
                  <div className="row gap-xs wrap mt-xs">
                    {conflictReport.suggestions.slice(0, 2).map((sug) => (
                      <Button
                        key={sug.label}
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          set({ key: sug.key, modifiers: sug.modifiers, trigger: sug.trigger })
                        }
                      >
                        Switch to {sug.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Step 2: Action */}
        <Card>
          <h3 className="section-title">
            <span className="chip chip-accent">2</span>
            <span>Action</span>
          </h3>
          <SimpleActionPicker action={primaryAction} onChange={updatePrimaryAction} />
        </Card>

        {/* Step 3: Collapsed Advanced Section */}
        <Card>
          <div className="spread">
            <h3 className="section-title no-margin">
              <span className="chip chip-accent">3</span>
              <span>Advanced & Options</span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              icon={advancedOpen ? "chevronUp" : "chevronDown"}
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              {advancedOpen ? "Hide advanced" : "Advanced settings ▾"}
            </Button>
          </div>

          {advancedOpen && (
            <div className="col gap-md advanced-drawer mt-sm">
              <div className="grid cols-2 gap-md">
                <Field label="Shortcut name" hint="Leave blank to auto-generate from action">
                  <Input
                    value={draft.name}
                    placeholder={deriveFriendlyName(draft)}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </Field>

                <Field label="Profile assignment">
                  <Select
                    value={draft.profileId}
                    onChange={(v) => set({ profileId: v })}
                    options={data.profiles.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
              </div>

              <Field label="All gesture trigger types (expert)">
                <Select
                  value={draft.trigger}
                  onChange={(v) => set({ trigger: v as TriggerType })}
                  options={Object.keys(TRIGGER_META).map((t) => ({
                    value: t,
                    label: `${TRIGGER_META[t as TriggerType]?.label ?? t} — ${TRIGGER_META[t as TriggerType]?.desc ?? ""}`,
                  }))}
                />
              </Field>

              <div className="grid cols-2 gap-md">
                <Field label="Timing mode">
                  <Select
                    value={timingMode}
                    onChange={setTimingMode}
                    options={[
                      { value: "auto", label: "Automatic (recommended)" },
                      { value: "custom", label: "Custom timing sliders" },
                    ]}
                  />
                </Field>

                <Field label="Original key behavior">
                  <Select
                    value={behavior}
                    onChange={(v) =>
                      set({ keyBehavior: v as any, suppressKey: v === "suppress" })
                    }
                    options={[
                      { value: "passThrough", label: "Pass through (for letters/typing)" },
                      { value: "suppress", label: "Suppress original (for CapsLock)" },
                      { value: "disable", label: "Disable key completely" },
                      { value: "remap", label: "Remap to replacement key…" },
                    ]}
                  />
                </Field>
              </div>

              {timingMode === "custom" && (
                <div className="grid cols-2 gap-md">
                  <Field label={`Tap interval: ${draft.timing.tapInterval}ms`}>
                    <Slider
                      value={draft.timing.tapInterval}
                      min={120}
                      max={900}
                      step={10}
                      onChange={(v) => setTiming("tapInterval", v)}
                    />
                  </Field>
                  <Field label={`Hold duration: ${draft.timing.holdDuration}ms`}>
                    <Slider
                      value={draft.timing.holdDuration}
                      min={250}
                      max={1800}
                      step={25}
                      onChange={(v) => setTiming("holdDuration", v)}
                    />
                  </Field>
                </div>
              )}

              {behavior === "remap" && (
                <Field label="Replacement key name">
                  <Input
                    value={draft.remapTo ?? ""}
                    placeholder="e.g. F13, Enter, Right"
                    onChange={(e) => set({ remapTo: e.target.value })}
                  />
                </Field>
              )}

              <div className="spread pt-sm">
                <div>
                  <div className="bold small">Shortcut enabled</div>
                  <div className="muted tiny">Turn this shortcut on or off.</div>
                </div>
                <Toggle
                  label="Enabled"
                  checked={draft.enabled}
                  onChange={(v) => set({ enabled: v })}
                />
              </div>

              <div className="col gap-xs">
                <div className="bold small">Action sequence ({draft.actions.length})</div>
                <div className="muted tiny">Execute multiple actions in sequential order.</div>
                <ActionListEditor
                  actions={draft.actions}
                  onChange={(actions: Action[]) => set({ actions })}
                />
              </div>
            </div>
          )}

          <div className="spread mt-md pt-sm border-top-subtle">
            <Button variant="ghost" onClick={() => setPage("shortcuts")}>
              Cancel
            </Button>
            <Button variant="primary" icon="check" disabled={hasError} onClick={save}>
              {existing ? "Save changes" : "Create shortcut"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
