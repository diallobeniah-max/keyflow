import { useEffect, useRef, useState, type AriaRole } from "react";
import { getEngine } from "../lib/engine";
import { CaptureCoordinator } from "../lib/capture";
import { ModifierKey } from "../types";
import { Button, KeycapBadge } from "./ui";
import { Icon } from "./Icon";
import { useStore } from "../store/useStore";
import { KeyPicker } from "./KeyPicker";

const STANDARD_MODS: ModifierKey[] = ["Ctrl", "Alt", "Shift", "Win"];

export function KeyCapture({
  value,
  modifiers,
  onChangeKey,
  onChangeMods,
  id,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  role = "group",
  mode = "edit",
}: {
  value: string;
  modifiers: ModifierKey[];
  onChangeKey: (k: string) => void;
  onChangeMods: (m: ModifierKey[]) => void;
  id?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  role?: AriaRole;
  /** "create" labels the button "Create key"; "edit" labels it "Change key". */
  mode?: "create" | "edit";
}) {
  const [capturing, setCapturing] = useState(false);
  const [listening, setListening] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const settings = useStore((s) => s.data.settings);
  const hyperEnabled = settings?.shortcuts?.hyperKeyConfig?.enabled ?? false;
  const coordinatorRef = useRef<CaptureCoordinator | null>(null);

  const availableMods: ModifierKey[] = hyperEnabled ? [...STANDARD_MODS, "Hyper"] : STANDARD_MODS;

  if (!coordinatorRef.current) {
    coordinatorRef.current = new CaptureCoordinator((token, mods) => {
      const line = `[key-capture-ui] received key=${token}`;
      console.log(line);
      (window as any).electronAPI?.input?.logCapture?.(line);
      setCapturing(false);
      setListening(false);
      onChangeKey(token);
      onChangeMods(availableMods.filter((m) => mods.includes(m)));
    });
  }

  const coordinator = coordinatorRef.current;
  coordinator.setOnCaptured((token, mods) => {
    const line = `[key-capture-ui] received key=${token}`;
    console.log(line);
    (window as any).electronAPI?.input?.logCapture?.(line);
    setCapturing(false);
    setListening(false);
    onChangeKey(token);
    onChangeMods(availableMods.filter((m) => mods.includes(m)));
  });
  // Escape cancels listening. In native capture mode the hook swallows Escape
  // and emits CaptureCancelled (handled above); this renderer-side listener is
  // the fallback for the DOM-capture path where the keydown still reaches us.
  coordinator.setOnCancelled(() => {
    setCapturing(false);
    setListening(false);
  });

  const start = () => {
    console.log("[key-capture-ui] begin");
    (window as any).electronAPI?.input?.logCapture?.("[key-capture-ui] begin");
    // Blur the initiating button so Enter/Space (used as capturable keys) do
    // not re-trigger it via the default click-on-activate behaviour.
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
    } catch {
      /* ignore */
    }
    setCapturing(true);
    // Only switch to the listening label once native capture is confirmed
    // armed (or DOM capture is active); never leave the UI "listening" with
    // nothing armed.
    void coordinator.start(getEngine()).then((backend) => {
      if (backend !== "none") {
        console.log(`[key-capture-ui] armed backend=${backend}`);
        (window as any).electronAPI?.input?.logCapture?.(`[key-capture-ui] armed backend=${backend}`);
        if (coordinator.isActive) {
          setListening(true);
        }
      } else {
        setCapturing(false);
      }
    }).catch(() => {
      setCapturing(false);
      setListening(false);
    });
  };

  const cancel = () => {
    console.log("[key-capture-ui] cancel");
    (window as any).electronAPI?.input?.logCapture?.("[key-capture-ui] cancel");
    coordinator.cancel();
    setCapturing(false);
    setListening(false);
  };

  // Cleanup on unmount: abort any active native capture so the helper never
  // stays armed after the picker / page goes away.
  useEffect(() => {
    return () => {
      coordinator.dispose();
    };
  }, [coordinator]);

  // Escape cancels an active capture (renderer-side fallback for DOM capture;
  // in native capture mode the hook swallows Escape and the coordinator's
  // onCancelled already handled it, so this is a no-op there).
  useEffect(() => {
    if (!capturing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [capturing]);

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
          onClick={capturing ? cancel : start}
        >
          {capturing ? (listening ? "Press a key…" : "Listening…") : mode === "edit" ? "Change key" : "Create key"}
        </Button>
        <Button
          variant="ghost"
          icon="search"
          onClick={() => setPickerOpen(true)}
          disabled={capturing}
        >
          Browse…
        </Button>

        {value && !capturing ? (
          <div className="row gap-xs items-center">
            <KeycapBadge keys={[...modifiers, value]} size="lg" />
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              title="Deselect key"
              onClick={() => onChangeKey("")}
              aria-label="Deselect key"
            >
              <Icon name="close" size={13} />
              <span>Deselect</span>
            </button>
          </div>
        ) : !capturing ? (
          <span className="muted tiny row items-center">No key selected</span>
        ) : null}
      </div>

      {!capturing && (
        <div className="row wrap gap-xs" style={{ marginTop: 2 }}>
          <span className="muted tiny" style={{ marginRight: 4 }}>Modifiers:</span>
          {availableMods.map((m) => {
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
      )}

      <KeyPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={value}
        onPick={(key) => {
          // Pick matches physical capture: keep the current modifier set, the
          // captured key itself is the single source of truth shared by both.
          onChangeKey(key);
          onChangeMods(modifiers);
        }}
      />
    </div>
  );
}