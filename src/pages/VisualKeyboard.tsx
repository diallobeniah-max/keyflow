import { useState, useMemo } from "react";
import { useStore } from "../store/useStore";
import { KEYBOARD_ROWS, MOUSE_BUTTONS } from "../lib/constants";
import { Button, Card, PageIntro } from "../components/ui";
import { Icon } from "../components/Icon";
import type { Shortcut } from "../types";

function keyClass(k: string, isHyper: boolean) {
  const base = ["key-tile"];
  if (["Escape", "Tab", "CapsLock", "Shift", "Ctrl", "Alt", "Win", "Enter", "Backspace"].includes(k)) {
    base.push("key-rule");
  }
  if (k.startsWith("F")) base.push("key-fn");
  if (["Left", "Right", "Up", "Down"].includes(k)) base.push("key-nav");
  if (["Space"].includes(k)) base.push("key-space");
  if (["Backspace", "CapsLock", "Enter", "Shift", "Tab"].includes(k)) base.push("key-wide");
  if (isHyper) base.push("key-hyper");
  return base.join(" ");
}

export function VisualKeyboard() {
  const data = useStore((s) => s.data);
  const active = useStore((s) => s.activeProfileId);
  const setPage = useStore((s) => s.setPage);
  const setPending = useStore((s) => s.setPendingKey);
  const setEditing = useStore((s) => s.setEditing);
  const deleteShortcut = useStore((s) => s.deleteShortcut);

  const hyperKeyConfig = data.settings?.shortcuts?.hyperKeyConfig;
  const isHyperKeyEnabled = hyperKeyConfig?.enabled;
  const hyperKeyName = hyperKeyConfig?.key;

  const activeShortcuts = useMemo(() => {
    return data.shortcuts.filter((s) => s.profileId === active);
  }, [data.shortcuts, active]);

  const shortcutsByKey = useMemo(() => {
    const m = new Map<string, Shortcut[]>();
    activeShortcuts.forEach((s) => {
      const list = m.get(s.key) || [];
      list.push(s);
      m.set(s.key, list);
    });
    return m;
  }, [activeShortcuts]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    shortcutsByKey.forEach((list, k) => m.set(k, list.length));
    return m;
  }, [shortcutsByKey]);

  const [popoverKey, setPopoverKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openCreate = (key: string, mouse = false) => {
    setEditing(null);
    setPending(key, mouse);
    setPage("create");
  };

  const handleEdit = (shortcut: Shortcut) => {
    setEditing(shortcut.id);
    setPending(shortcut.key, shortcut.mouse ?? false);
    setPage("create");
  };

  const handleDelete = (id: string) => {
    deleteShortcut(id);
    setConfirmDeleteId(null);
  };

  const popoverShortcuts = popoverKey ? shortcutsByKey.get(popoverKey) || [] : [];
  const isPopoverHyper = isHyperKeyEnabled && popoverKey?.toLowerCase() === hyperKeyName?.toLowerCase();

  return (
    <div className="content max-readable">
      <PageIntro
        eyebrow="MAP"
        title="Keyboard & Mouse Map"
        description="Interactive visual representation of your keyboard and mouse shortcuts. Click or hover any assigned keycap to inspect, edit, or delete actions."
      >
        <Button variant="primary" icon="create" onClick={() => openCreate("F")}>
          Create shortcut
        </Button>
      </PageIntro>

      <div className="col gap-md">
        {/* Visual Keyboard Board */}
        <Card className="keyboard-map-card">
          <div className="spread mb-md">
            <div>
              <h3 className="section-title no-margin">Physical Keyboard Layout</h3>
              <p className="muted tiny no-margin">
                Keys with active shortcuts are highlighted with assigned counts. Hover to inspect details.
              </p>
            </div>
            <div className="row gap-sm align-center">
              {isHyperKeyEnabled && hyperKeyName && (
                <span className="chip chip-accent">
                  <Icon name="zap" size={13} />
                  <span>Hyper Key ({hyperKeyName})</span>
                </span>
              )}
              <span className="chip chip-subtle">
                <span className="status-dot" />
                <span>Assigned key</span>
              </span>
            </div>
          </div>

          <div className="keyboard-grid pt-sm">
            {KEYBOARD_ROWS.map((row, i) => (
              <div className="key-row" key={i}>
                {row.map((k, idx) => {
                  const count = counts.get(k) || 0;
                  const isHyper = !!(isHyperKeyEnabled && hyperKeyName?.toLowerCase() === k.toLowerCase());
                  const isHovered = popoverKey === k;
                  return (
                    <div key={k + idx} className="key-tile-wrap" style={{ position: "relative" }}>
                      <button
                        type="button"
                        className={keyClass(k, isHyper) + (count ? " assigned" : "") + (isHovered ? " is-focused" : "")}
                        onClick={() => {
                          if (count > 0) {
                            setPopoverKey(popoverKey === k ? null : k);
                          } else {
                            openCreate(k, false);
                          }
                        }}
                        onMouseEnter={() => setPopoverKey(k)}
                        onFocus={() => setPopoverKey(k)}
                      >
                        <span className="key-tile-label">{k}</span>
                        {isHyper && <span className="key-hyper-badge">HYPER</span>}
                        {count > 0 && <span className="status-dot" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* Extra Mouse Buttons */}
        <Card className="mouse-map-card">
          <div className="spread mb-md">
            <div>
              <h3 className="section-title no-margin">Extra Mouse Buttons</h3>
              <p className="muted tiny no-margin">Assign shortcuts to side buttons (MB3/MB4/MB5).</p>
            </div>
          </div>

          <div className="grid cols-3 gap-sm">
            {MOUSE_BUTTONS.map((b) => {
              const count = counts.get(b.value) || 0;
              const isHovered = popoverKey === b.value;
              return (
                <div key={b.value} style={{ position: "relative" }}>
                  <button
                    type="button"
                    className={"preset-tile mouse-compact-tile" + (count ? " is-selected" : "") + (isHovered ? " is-focused" : "")}
                    onClick={() => {
                      if (count > 0) {
                        setPopoverKey(popoverKey === b.value ? null : b.value);
                      } else {
                        openCreate(b.value, true);
                      }
                    }}
                    onMouseEnter={() => setPopoverKey(b.value)}
                    onFocus={() => setPopoverKey(b.value)}
                  >
                    <div className="preset-tile-title">
                      <Icon name="mouse" size={16} />
                      <span>{b.label}</span>
                      {count > 0 && <span className="status-dot ml-auto" />}
                    </div>
                    <p className="preset-tile-desc">
                      {count ? `${count} shortcut${count > 1 ? "s" : ""} assigned` : "Click to assign"}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Assigned Key Popover Inspector Card */}
        {popoverKey && (popoverShortcuts.length > 0 || isPopoverHyper) && (
          <Card className="key-details-popover animate-fade-in">
            <div className="spread align-center mb-sm">
              <div className="row align-center gap-xs">
                <span className="badge badge-accent">{popoverKey}</span>
                <span className="font-medium text-main">
                  {popoverShortcuts.length > 0
                    ? `${popoverShortcuts.length} Assigned Shortcut${popoverShortcuts.length > 1 ? "s" : ""}`
                    : "Hyper Key"}
                </span>
              </div>
              <Button size="sm" variant="ghost" icon="cross" onClick={() => setPopoverKey(null)}>
                Close
              </Button>
            </div>

            {isPopoverHyper && (
              <div className="alert-banner alert-warning mb-sm">
                <div className="alert-header">
                  <Icon name="zap" size={16} />
                  <span>Configured Hyper Key</span>
                </div>
                <p className="tiny muted no-margin">
                  {hyperKeyConfig?.tapActionId
                    ? `Tap alone: ${hyperKeyConfig.tapActionId} | Acts as custom modifier when held.`
                    : "Acts as custom native modifier key when held with other keys."}
                </p>
              </div>
            )}

            <div className="col gap-xs">
              {popoverShortcuts.map((s) => {
                const actionType = s.actions[0]?.type || "custom";
                return (
                  <div key={s.id} className="spread align-center p-xs radius-md surface-card border-subtle">
                    <div className="col gap-xxs">
                      <div className="row align-center gap-xs">
                        <span className="font-medium text-main">{s.name || s.key}</span>
                        <span className="chip chip-subtle tiny">{s.trigger}</span>
                      </div>
                      <span className="muted tiny">Action: {actionType}</span>
                    </div>

                    <div className="row align-center gap-xs">
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => handleEdit(s)}>
                        Edit
                      </Button>

                      {confirmDeleteId === s.id ? (
                        <div className="row align-center gap-xxs">
                          <Button size="sm" variant="danger" onClick={() => handleDelete(s.id)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirmDeleteId(s.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="pt-xs spread align-center">
                <Button size="sm" variant="secondary" icon="create" onClick={() => openCreate(popoverKey)}>
                  Add another shortcut on {popoverKey}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
