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

        {/* Extra Mouse Buttons Diagram */}
        <Card className="mouse-map-card">
          <div className="spread mb-md">
            <div>
              <h3 className="section-title no-margin">Mouse Button Map</h3>
              <p className="muted tiny no-margin">
                Visual representation of your primary, middle, and side extra mouse buttons (MB1–MB5). Click any button on the diagram or list to assign or inspect.
              </p>
            </div>
          </div>

          <div className="mouse-map-layout">
            {/* SVG Mouse Silhouette Diagram */}
            <div className="mouse-svg-container">
              <svg viewBox="0 0 220 320" className="mouse-diagram-svg" aria-label="Interactive Mouse Layout">
                <defs>
                  <linearGradient id="mouseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--color-bg-surface-elevated)" />
                    <stop offset="100%" stopColor="var(--color-bg-surface)" />
                  </linearGradient>
                </defs>

                {/* Outer Body Outline */}
                <path
                  d="M 65 30 C 95 10, 125 10, 155 30 C 185 60, 195 120, 190 200 C 185 270, 160 305, 110 305 C 60 305, 35 270, 30 200 C 25 120, 35 60, 65 30 Z"
                  fill="url(#mouseGrad)"
                  stroke="var(--color-border-default)"
                  strokeWidth="2"
                />

                {/* Center Divider Line */}
                <line x1="110" y1="32" x2="110" y2="120" stroke="var(--color-border-subtle)" strokeWidth="1.5" strokeDasharray="3 3" />

                {/* Left Button (MB1) */}
                {(() => {
                  const count = counts.get("MB1") || 0;
                  const isHovered = popoverKey === "MB1";
                  return (
                    <path
                      d="M 64 34 C 80 20, 106 20, 106 34 L 106 115 L 40 115 C 37 80, 48 50, 64 34 Z"
                      className={"mouse-svg-btn" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
                      onClick={() => (count > 0 ? setPopoverKey(popoverKey === "MB1" ? null : "MB1") : openCreate("MB1", true))}
                      onMouseEnter={() => setPopoverKey("MB1")}
                    >
                      <title>Left Click (MB1)</title>
                    </path>
                  );
                })()}

                {/* Right Button (MB2) */}
                {(() => {
                  const count = counts.get("MB2") || 0;
                  const isHovered = popoverKey === "MB2";
                  return (
                    <path
                      d="M 114 34 C 114 20, 140 20, 156 34 C 172 50, 183 80, 180 115 L 114 115 Z"
                      className={"mouse-svg-btn" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
                      onClick={() => (count > 0 ? setPopoverKey(popoverKey === "MB2" ? null : "MB2") : openCreate("MB2", true))}
                      onMouseEnter={() => setPopoverKey("MB2")}
                    >
                      <title>Right Click (MB2)</title>
                    </path>
                  );
                })()}

                {/* Scroll Wheel / Middle (MB3) */}
                {(() => {
                  const count = counts.get("MB3") || 0;
                  const isHovered = popoverKey === "MB3";
                  return (
                    <rect
                      x="103"
                      y="50"
                      width="14"
                      height="38"
                      rx="7"
                      className={"mouse-svg-wheel" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
                      onClick={() => (count > 0 ? setPopoverKey(popoverKey === "MB3" ? null : "MB3") : openCreate("MB3", true))}
                      onMouseEnter={() => setPopoverKey("MB3")}
                    >
                      <title>Middle Click / Wheel (MB3)</title>
                    </rect>
                  );
                })()}

                {/* Side Button 4 (MB4 - Thumb Forward) */}
                {(() => {
                  const count = counts.get("MB4") || 0;
                  const isHovered = popoverKey === "MB4";
                  return (
                    <path
                      d="M 27 130 C 23 130, 20 135, 20 145 C 20 155, 23 160, 27 160 L 33 160 C 33 150, 32 140, 31 130 Z"
                      className={"mouse-svg-side" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
                      onClick={() => (count > 0 ? setPopoverKey(popoverKey === "MB4" ? null : "MB4") : openCreate("MB4", true))}
                      onMouseEnter={() => setPopoverKey("MB4")}
                    >
                      <title>Side Button 4 (MB4)</title>
                    </path>
                  );
                })()}

                {/* Side Button 5 (MB5 - Thumb Back) */}
                {(() => {
                  const count = counts.get("MB5") || 0;
                  const isHovered = popoverKey === "MB5";
                  return (
                    <path
                      d="M 28 170 C 24 170, 22 175, 22 185 C 22 195, 25 200, 29 200 L 34 200 C 33 190, 32 180, 31 170 Z"
                      className={"mouse-svg-side" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
                      onClick={() => (count > 0 ? setPopoverKey(popoverKey === "MB5" ? null : "MB5") : openCreate("MB5", true))}
                      onMouseEnter={() => setPopoverKey("MB5")}
                    >
                      <title>Side Button 5 (MB5)</title>
                    </path>
                  );
                })()}
              </svg>
            </div>

            {/* Side Controls Detail List */}
            <div className="mouse-controls-list">
              {MOUSE_BUTTONS.map((b) => {
                const count = counts.get(b.value) || 0;
                const isHovered = popoverKey === b.value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    className={"mouse-list-item" + (count ? " is-assigned" : "") + (isHovered ? " is-focused" : "")}
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
                    <div className="mouse-list-item-left">
                      <span className="mouse-btn-badge">{b.value}</span>
                      <span className="font-medium text-main">{b.label}</span>
                    </div>

                    <div className="mouse-list-item-right">
                      {count > 0 ? (
                        <span className="chip chip-accent tiny">{count} shortcut{count > 1 ? "s" : ""}</span>
                      ) : (
                        <span className="tiny muted">+ Assign</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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
