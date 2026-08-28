import { useState } from "react";
import { useStore } from "../store/useStore";
import { getEngine } from "../lib/engine";
import { Shortcut } from "../types";
import { ACTION_META } from "../lib/constants";
import { formatTriggerLabel } from "../lib/conflict";
import { Button, KeycapBadge, Modal, SettingsRow, Toggle } from "./ui";
import { Icon } from "./Icon";

function triggerShortcut(s: Shortcut) {
  const e = getEngine();
  const k = s.key;
  const m = s.modifiers;
  if (s.trigger === "remap") return; // remap is a native per-key behavior, not a gesture
  if (s.trigger === "double") {
    e.simulateTap(k, m);
    setTimeout(() => e.simulateTap(k, m), 70);
    return;
  }
  if (s.trigger === "triple") {
    e.simulateTap(k, m);
    setTimeout(() => e.simulateTap(k, m), 70);
    setTimeout(() => e.simulateTap(k, m), 140);
    return;
  }
  if (s.trigger === "longPress" || s.trigger === "hold") {
    e.simulateHold(k, m, s.timing.holdDuration + 140);
    return;
  }
  if (s.trigger === "tapThenHold") {
    e.simulateTap(k, m);
    setTimeout(() => e.simulateHold(k, m, s.timing.holdDuration + 140), 90);
    return;
  }
  e.simulateTap(k, m);
}

export function Simulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeId = useStore((s) => s.activeProfileId);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const [capture, setCapture] = useState(getEngine().isCapturing());
  const list = shortcuts.filter((s) => s.profileId === activeId);

  const toggleCapture = () => {
    const next = !capture;
    setCapture(next);
    getEngine().setCapture(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Gesture Simulator" width={600}>
      <div className="col gap-md">
        <SettingsRow
          title="In-window gesture capture"
          desc="Capture physical keystrokes inside this window for instant testing"
        >
          <Toggle
            label="In-window gesture capture"
            checked={capture}
            onChange={toggleCapture}
          />
        </SettingsRow>

        <div className="col gap-xs">
          <div className="bold small">Active Profile Shortcuts ({list.length})</div>
          <div className="shortcuts-table" style={{ maxHeight: 340, overflowY: "auto" }}>
            {list.length === 0 ? (
              <div className="empty-text">No shortcuts configured in this profile.</div>
            ) : (
              list.map((s) => {
                const meta = s.actions[0] ? ACTION_META[s.actions[0].type] : ACTION_META.openApp;
                const triggerLabel = formatTriggerLabel(s);

                return (
                  <div key={s.id} className="shortcut-row">
                    <div className="shortcut-row-left">
                      <KeycapBadge keys={[...s.modifiers, s.key]} mouse={s.mouse} size="sm" />
                      <div className="shortcut-row-info">
                        <div className="shortcut-row-title">{s.name || meta.label}</div>
                        <div className="shortcut-row-meta">
                          <span>{triggerLabel}</span>
                          <span>· {meta.label}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      icon="play"
                      disabled={!s.enabled || s.trigger === "remap"}
                      onClick={() => triggerShortcut(s)}
                    >
                      Trigger
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
