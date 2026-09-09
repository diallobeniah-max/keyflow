import { Check, ClipboardText } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";

export function ClipboardCopyFeedback() {
  const [payload, setPayload] = useState<{ kind: string; title: string; anchor: "top" | "bottom" | "right" } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.clipboard;
    const offShow = api?.onCopyFeedbackShow?.((next) => {
      setPayload(next);
      setVisible(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    });
    const offHide = api?.onCopyFeedbackHide?.(() => setVisible(false));
    return () => {
      offShow?.();
      offHide?.();
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "keyflow:state" || event.key === "keyflow_state") {
        void useStore.getState().load().then(() => useStore.getState().applyAppearance());
      }
    };
    useStore.getState().applyAppearance();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className={`clipboard-copy-feedback anchor-${payload?.anchor ?? "bottom"}${visible ? " is-visible" : ""}`} role="status" aria-live="polite">
      <span className="clipboard-copy-feedback__icon"><Check size={18} weight="bold" /></span>
      <span className="clipboard-copy-feedback__copy">
        <strong>Copied to KeyFlow</strong>
        <small><ClipboardText size={13} /> {payload?.title || payload?.kind || "Clipboard item"}</small>
      </span>
    </div>
  );
}
