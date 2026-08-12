import { useEffect, useMemo, useState } from "react";
import { Action, ModifierKey, Shortcut, TriggerType } from "../types";
import { useStore } from "../store/useStore";
import { uid } from "../store/sampleData";
import { ACTION_META, MOUSE_BUTTONS, TRIGGER_META } from "../lib/constants";
import { detectConflicts } from "../lib/conflict";
import { getEngine } from "../lib/engine";
import { resolveShortcutBehavior } from "../lib/defaults";
import { ActionListEditor } from "../components/ActionEditor";
import { SimpleActionPicker } from "../components/SimpleActionPicker";
import { KeyCapture } from "../components/KeyCapture";
import { Button, Card, Field, Input, PageIntro, Select, Slider, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";

function defaultBlankShortcut(profileId: string, pending?: { key: string; mouse?: boolean } | null): Shortcut {
  return {
    id: uid("sc"),
    name: "",
    profileId,
    key: pending?.key ?? "F",
    mouse: !!pending?.mouse,
    modifiers: [],
    trigger: pending?.mouse ? "single" : "single",
    timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350, timingMode: "auto" },
    actions: [{ id: uid("act"), type: "screenshot", payload: { screenshotMode: "snipOverlay" } }],
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

  const existing = editingId ? data.shortcuts.find((s) => s.id === editingId) : undefined;
  const [draft, setDraft] = useState<Shortcut>(() =>
    existing ? JSON.parse(JSON.stringify(existing)) : defaultBlankShortcut(active, pending)
  );

  const [showMoreTriggers, setShowMoreTriggers] = useState(() => {
    return existing ? !["single", "double", "hold"].includes(existing.trigger) : false;
  });
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

  const conflicts = useMemo(
    () => detectConflicts(draft, data.shortcuts, data.settings),
    [draft, data.shortcuts, data.settings]
  );
  const hasError = conflicts.some((c) => c.level === "error");

  const set = (p: Partial<Shortcut>) => setDraft((d) => ({ ...d, ...p }));
  const setTiming = (k: keyof Shortcut["timing"], v: number) =>
    setDraft((d) => ({ ...d, timing: { ...d.timing, [k]: v } }));

  // Update primary action
  const updatePrimaryAction = (action: Action) => {
    setDraft((d) => {
      const rest = (d.actions ?? []).slice(1);
      return { ...d, actions: [action, ...rest] };
    });
  };

  const save = () => {
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
        eyebrow="builder"
        title={existing ? "Edit shortcut" : "Create shortcut"}
        description="Choose a trigger key, select what it should do, and create your shortcut in seconds."
      >
        <Button variant="secondary" icon="play" onClick={() => simulateShortcut(draft)}>
          Test
        </Button>
        <Button variant="primary" icon="check" disabled={hasError} onClick={save}>
          {existing ? "Save changes" : "Create shortcut"}
        </Button>
      </PageIntro>

      <div className="col gap-md max-readable">
        {/* Step 1: Trigger */}
        <Card>
          <h3 className="section-title">
            <span className="badge badge-accent">1</span> Trigger
          </h3>
          <p className="muted tiny">
            Press a key or combination on your physical keyboard.
          </p>

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

          <Field label="Trigger type" group>
            <div className="row wrap gap-sm" role="radiogroup" aria-label="Trigger choices">
              {/* 3 simple primary choices */}
              {[
                { type: "single", label: "Tap", desc: "Single press" },
                { type: "double", label: "Double tap", desc: "Two quick presses" },
                { type: "hold", label: "Hold", desc: "Press and hold" },
              ].map((item) => (
                <button
                  type="button"
                  key={item.type}
                  role="radio"
                  aria-checked={draft.trigger === item.type}
                  className={"trigger-card trigger-option-card" + (draft.trigger === item.type ? " active" : "")}
                  onClick={() => set({ trigger: item.type as TriggerType })}
                >
                  <b>{item.label}</b>
                  <small>{item.desc}</small>
                </button>
              ))}
            </div>

            {/* More trigger types button/toggle */}
            <div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowMoreTriggers(!showMoreTriggers)}
              >
                <Icon name={showMoreTriggers ? "chevronUp" : "chevronDown"} size={14} />
                {showMoreTriggers ? "Hide extra trigger types" : "More trigger types…"}
              </button>
            </div>

            {showMoreTriggers && (
              <div className="trigger-grid">
                {Object.keys(TRIGGER_META)
                  .filter((t) => !["single", "double", "hold"].includes(t))
                  .map((t) => (
                    <button
                      type="button"
                      key={t}
                      className={"trigger-card" + (draft.trigger === t ? " active" : "")}
                      onClick={() => set({ trigger: t as TriggerType })}
                    >
                      <Icon name={TRIGGER_META[t as TriggerType].icon} size={18} />
                      <b>{TRIGGER_META[t as TriggerType].label}</b>
                      <small>{TRIGGER_META[t as TriggerType].desc}</small>
                    </button>
                  ))}
              </div>
            )}
          </Field>
        </Card>

        {/* Step 2: Action */}
        <Card>
          <h3 className="section-title">
            <span className="badge badge-accent">2</span> What should it do?
          </h3>
          <SimpleActionPicker action={primaryAction} onChange={updatePrimaryAction} />
        </Card>

        {/* Step 3: Create & Advanced */}
        <Card>
          <div className="spread">
            <h3 className="section-title">
              <span className="badge badge-accent">3</span> Create shortcut
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAdvancedOpen(!advancedOpen)}
            >
              <Icon name={advancedOpen ? "chevronUp" : "chevronDown"} size={16} />
              {advancedOpen ? "Hide advanced" : "Advanced settings"}
            </button>
          </div>

          {advancedOpen && (
            <div className="col gap-sm advanced-section">
              <div className="grid cols-2">
                <Field label="Shortcut name (optional)" hint="Leave blank to use auto-generated name">
                  <Input
                    value={draft.name}
                    placeholder={deriveFriendlyName(draft)}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </Field>
                <Field label="Profile">
                  <Select
                    value={draft.profileId}
                    onChange={(v) => set({ profileId: v })}
                    options={data.profiles.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
              </div>

              <Field label="Input source">
                <Select
                  value={draft.mouse ? "mouse" : "keyboard"}
                  onChange={(v) =>
                    set({
                      mouse: v === "mouse",
                      key: v === "mouse" ? "MB4" : "F",
                      modifiers: [],
                    })
                  }
                  options={[
                    { value: "keyboard", label: "Keyboard key" },
                    { value: "mouse", label: "Mouse button" },
                  ]}
                />
              </Field>

              <Field label="Timing configuration">
                <Select
                  value={timingMode}
                  onChange={setTimingMode}
                  options={[
                    { value: "auto", label: "Automatic (recommended)" },
                    { value: "custom", label: "Custom timing sliders" },
                  ]}
                />
              </Field>

              {timingMode === "custom" && (
                <div className="grid cols-2">
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
                  <Field label="Delay before action (ms)">
                    <Input
                      type="number"
                      value={draft.timing.delay}
                      onChange={(e) => setTiming("delay", Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Cooldown window (ms)">
                    <Input
                      type="number"
                      value={draft.timing.cooldown}
                      onChange={(e) => setTiming("cooldown", Number(e.target.value))}
                    />
                  </Field>
                </div>
              )}

              <Field label="Original key behavior">
                <Select
                  value={behavior}
                  onChange={(v) =>
                    set({ keyBehavior: v as any, suppressKey: v === "suppress" })
                  }
                  options={[
                    { value: "passThrough", label: "Pass through (recommended for normal letters)" },
                    { value: "suppress", label: "Suppress original (recommended for CapsLock)" },
                    { value: "disable", label: "Disable key completely" },
                    { value: "remap", label: "Remap to replacement key…" },
                  ]}
                />
              </Field>

              {behavior === "remap" && (
                <Field label="Replacement key">
                  <Input
                    value={draft.remapTo ?? ""}
                    placeholder="e.g. F13, Enter, Right"
                    onChange={(e) => set({ remapTo: e.target.value })}
                  />
                </Field>
              )}

              <div className="settings-row">
                <div>
                  <b>Shortcut enabled</b>
                  <p className="muted tiny">Turn this shortcut on or off.</p>
                </div>
                <Toggle label="Enabled" checked={draft.enabled} onChange={(v) => set({ enabled: v })} />
              </div>

              <div className="col gap-xs">
                <b>Action sequence ({draft.actions.length})</b>
                <p className="muted tiny">
                  Advanced: add multiple actions to run in sequence.
                </p>
                <ActionListEditor
                  actions={draft.actions}
                  onChange={(actions: Action[]) => set({ actions })}
                />
              </div>

              {/* Conflict notice */}
              {conflicts.length > 0 && (
                <div className="col gap-xs">
                  {conflicts.map((c, i) => (
                    <div key={i} className={"notice " + c.level}>
                      {c.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card-actions-right">
            <Button variant="primary" icon="check" disabled={hasError} onClick={save}>
              {existing ? "Save changes" : "Create shortcut"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
