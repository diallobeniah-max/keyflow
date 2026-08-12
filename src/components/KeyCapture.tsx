import { useState, type AriaRole } from "react";
import { getEngine } from "../lib/engine";
import { ModifierKey } from "../types";
import { Button, KeycapBadge } from "./ui";

const MODS: ModifierKey[] = ["Ctrl", "Alt", "Shift", "Win"];

export function KeyCapture({
  value,
  modifiers,
  onChangeKey,
  onChangeMods,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  role = "group",
}: {
  value: string;
  modifiers: ModifierKey[];
  onChangeKey: (k: string) => void;
  onChangeMods: (m: ModifierKey[]) => void;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  role?: AriaRole;
}) {
  const [capturing, setCapturing] = useState(false);

  const start = () => {
    setCapturing(true);
    getEngine().captureNext((token, mods) => {
      setCapturing(false);
      onChangeKey(token);
      onChangeMods(MODS.filter((m) => mods.includes(m)));
    });
  };

  const toggle = (m: ModifierKey) =>
    onChangeMods(modifiers.includes(m) ? modifiers.filter((x) => x !== m) : [...modifiers, m]);

  return (
    <div
      id={id}
      role={role}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className="col gap-xs"
    >
      <div className="row wrap gap-sm">
        <Button
          variant={capturing ? "primary" : "secondary"}
          icon={capturing ? "pause" : "key"}
          onClick={start}
        >
          {capturing ? "Press any key on keyboard…" : "Change key"}
        </Button>

        {value && !capturing && (
          <KeycapBadge keys={[...modifiers, value]} size="lg" />
        )}
      </div>

      <div className="row wrap gap-xs" style={{ marginTop: 2 }}>
        <span className="muted tiny" style={{ marginRight: 4 }}>Modifiers:</span>
        {MODS.map((m) => {
          const active = modifiers.includes(m);
          return (
            <button
              type="button"
              className={"chip clickable" + (active ? " chip-accent" : " chip-subtle")}
              key={m}
              onClick={() => toggle(m)}
              aria-pressed={active}
              aria-label={`${m} modifier`}
            >
              <span>{m}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
