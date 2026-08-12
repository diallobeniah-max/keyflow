import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { KEYBOARD_ROWS, MOUSE_BUTTONS } from "../lib/constants";
import { Button, Card, PageIntro } from "../components/ui";
import { Icon } from "../components/Icon";

function keyClass(k: string) {
  const base = ["key-tile"];
  if (["Escape", "Tab", "CapsLock", "Shift", "Ctrl", "Alt", "Win", "Enter", "Backspace"].includes(k)) {
    base.push("key-rule");
  }
  if (k.startsWith("F")) base.push("key-fn");
  if (["Left", "Right", "Up", "Down"].includes(k)) base.push("key-nav");
  if (["Space"].includes(k)) base.push("key-space");
  if (["Backspace", "CapsLock", "Enter", "Shift", "Tab"].includes(k)) base.push("key-wide");
  return base.join(" ");
}

export function VisualKeyboard() {
  const data = useStore((s) => s.data);
  const active = useStore((s) => s.activeProfileId);
  const setPage = useStore((s) => s.setPage);
  const setPending = useStore((s) => s.setPendingKey);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    data.shortcuts
      .filter((s) => s.profileId === active)
      .forEach((s) => m.set(s.key, (m.get(s.key) || 0) + 1));
    return m;
  }, [data.shortcuts, active]);

  const openCreate = (key: string, mouse = false) => {
    useStore.getState().setEditing(null);
    setPending(key, mouse);
    setPage("create");
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow="MAP"
        title="Keyboard & Mouse Map"
        description="Interactive visual representation of your keyboard and mouse shortcuts. Click any keycap to assign an action."
      >
        <Button variant="primary" icon="create" onClick={() => openCreate("F")}>
          Create shortcut
        </Button>
      </PageIntro>

      <div className="col gap-md">
        {/* Visual Keyboard Board */}
        <Card>
          <div className="spread mb-md">
            <div>
              <h3 className="section-title no-margin">Physical Keyboard Layout</h3>
              <p className="muted tiny no-margin">
                Keys with active shortcuts are highlighted with their assigned count.
              </p>
            </div>
            <div className="row gap-sm">
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
                  return (
                    <button
                      type="button"
                      key={k + idx}
                      className={keyClass(k) + (count ? " assigned" : "")}
                      onClick={() => openCreate(k, false)}
                      title={`Key: ${k}${count ? ` (${count} shortcuts assigned)` : " (Click to assign)"}`}
                    >
                      <span>{k}</span>
                      {count > 0 && <span className="status-dot" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        {/* Mouse Button Shortcuts */}
        <Card>
          <div className="spread mb-md">
            <div>
              <h3 className="section-title no-margin">Extra Mouse Buttons</h3>
              <p className="muted tiny no-margin">Assign shortcuts to side buttons (MB3/MB4/MB5).</p>
            </div>
          </div>

          <div className="grid cols-4 gap-sm">
            {MOUSE_BUTTONS.map((b) => {
              const count = counts.get(b.value) || 0;
              return (
                <button
                  key={b.value}
                  type="button"
                  className={"preset-tile" + (count ? " is-selected" : "")}
                  onClick={() => openCreate(b.value, true)}
                >
                  <div className="preset-tile-title">
                    <Icon name="mouse" size={17} />
                    <span>{b.label}</span>
                  </div>
                  <p className="preset-tile-desc">
                    {count ? `${count} shortcut${count > 1 ? "s" : ""} assigned` : "Click to assign"}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
