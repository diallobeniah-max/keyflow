import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Icon } from "./Icon";

interface PopupItemData {
  id: string;
  label: string;
  icon?: string;
  category?: string;
  hint?: string;
  pinned?: boolean;
  actions: any[];
}

interface PopupShellSettings {
  size?: string;
  showIcons?: boolean;
  showNumbers?: boolean;
  search?: boolean;
  closeAfterAction?: boolean;
  maxItems?: number;
  opacity?: number;
  animationSpeed?: number;
  popupBlur?: boolean;
}

type Phase = "hidden" | "preparing" | "opening" | "open" | "closing";

const OPEN_DURATION_MS = 150;
const CLOSE_DURATION_MS = 130;
const FOCUS_FAILSAFE_MS = 400;

function isEditableEventTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function PopupMenu({ items, settings, q, active, onSetQ, onSetActive, onSelect, searchRef }: {
  items: PopupItemData[];
  settings: PopupShellSettings;
  q: string;
  active: number;
  onSetQ: (v: string) => void;
  onSetActive: (i: number) => void;
  onSelect: (item: PopupItemData) => void;
  searchRef: RefObject<HTMLInputElement>;
}) {
  return (
    <>
      {settings.search && (
        <input
          ref={searchRef}
          aria-label="Search popup actions"
          className="input popup-search no-drag-region"
          placeholder="Search actions\u2026"
          value={q}
          onChange={(e) => { onSetQ(e.target.value); onSetActive(0); }}
        />
      )}
      <div
        className="popup-list no-drag-region"
        role="listbox"
        aria-label="Popup actions"
      >
        {items.length === 0 && <div className="empty-text">No matching actions</div>}
        {items.map((it, i) => (
          <button
            type="button"
            role="option"
            aria-selected={active === i}
            key={it.id}
            onMouseEnter={() => onSetActive(i)}
            onClick={() => onSelect(it)}
            className={"popup-item" + (active === i ? " active" : "")}
          >
            {settings.showIcons && <span className="popup-icon"><Icon name={it.icon ?? "command"} size={18} /></span>}
            <span className="popup-copy"><b>{it.label}</b>{it.category && <small>{it.category}</small>}</span>
            {settings.showNumbers && it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ))}
      </div>
    </>
  );
}

export function PopupShell() {
  const [items, setItems] = useState<PopupItemData[]>([]);
  const [settings, setSettings] = useState<PopupShellSettings>({});
  const [theme, setTheme] = useState<string>("dark");
  const [title, setTitle] = useState<string>("KeyFlow");
  const [material, setMaterial] = useState<string>("fallback");
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<Phase>("hidden");
  const searchRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("hidden");
  const closedRef = useRef(false);
  const genRef = useRef<string | null>(null);
  /**
   * Close epoch — incremented on every new close cycle AND on every reopen.
   * A finishClose callback captures the epoch at close time. If it fires
   * after a reopen (epoch changed), it returns early and does not call
   * hide() or set phase=hidden. This is the primary protection against the
   * stale-close bug where an old setTimeout(finishClose) fires after a new
   * popup:data arrives and resets closedRef to false.
   */
  const closeEpochRef = useRef(0);

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const eapi = (window as any).electronAPI;

  useEffect(() => {
    document.documentElement.classList.add("popup-window");
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.classList.remove("popup-window");
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-popup-material", material);
  }, [material]);

  // Measure and report the popup panel size to the main process.
  // The BrowserWindow is sized to match so no empty gutter or clipped bottom.
  // The ResizeObserver path handles size changes during a session.
  // The onData path (below) handles the initial report on every open cycle.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !eapi?.popup?.reportContentSize) return;
    let handle = 0;
    const report = () => {
      if (phaseRef.current === "closing" || phaseRef.current === "hidden") return;
      const el = overlayRef.current ?? root;
      const rect = el.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(rect.height);
      void eapi.popup.reportContentSize(width, height);
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(handle);
      handle = window.setTimeout(report, 60);
    });
    observer.observe(root);
    window.requestAnimationFrame(report);
    return () => {
      window.clearTimeout(handle);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusSearch = () => {
    window.requestAnimationFrame(() => {
      if (settings.search !== false) searchRef.current?.focus();
    });
  };

  // ── Close helpers ─────────────────────────────────────────────────────────
  //
  // beginClose() creates a close callback bound to the current epoch. Any
  // callback from an older epoch (i.e., the popup was reopened since the close
  // began) is silently discarded.

  const beginClose = () => {
    if (phaseRef.current === "closing" || phaseRef.current === "hidden") return;

    // Increment epoch so all callbacks registered from here are tied to this
    // close cycle. Any callback from a previous cycle that fires later will
    // see a mismatched epoch and return early.
    const epoch = ++closeEpochRef.current;
    const closeGen = genRef.current;
    setPhaseBoth("closing");
    console.log(`[popup-renderer] closing epoch=${epoch} gen=${closeGen ?? "?"}`);

    const finishClose = () => {
      // Stale-close guard: epoch must still be current (no reopen happened).
      if (closeEpochRef.current !== epoch) {
        console.log(`[popup-renderer] finishClose STALE epoch=${epoch} current=${closeEpochRef.current} gen=${closeGen ?? "?"} — ignored`);
        return;
      }
      // Double-fire guard within the same cycle.
      if (closedRef.current) return;
      closedRef.current = true;
      setPhaseBoth("hidden");
      console.log(`[popup-renderer] closed epoch=${epoch} gen=${closeGen ?? "?"}`);
      // Tell the main process to hide the BrowserWindow. The gen stamp lets
      // the main process discard this if the popup was reopened.
      if (eapi?.popup) void eapi.popup.hide(closeGen ?? undefined);
    };

    const overlay = overlayRef.current;
    overlay?.addEventListener("animationend", finishClose, { once: true });
    window.setTimeout(finishClose, CLOSE_DURATION_MS + 40);
  };

  // Main process sends popup:closing when the trigger toggle closes the popup.
  useEffect(() => {
    if (!eapi?.popup?.onClosing) return;
    const unsub = eapi.popup.onClosing(beginClose);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eapi?.popup?.onData) return;
    const unsub = eapi.popup.onData((data: any) => {
      // ── Invalidate any stale close callbacks from the previous cycle ───
      // Incrementing the epoch here means any finishClose registered by the
      // previous beginClose() will see a mismatched epoch and return early,
      // even if closedRef was reset below. This is the fix for the stale
      // setTimeout(finishClose) that fires after onData resets closedRef.
      closeEpochRef.current++;
      closedRef.current = false;
      genRef.current = data?.gen ?? null;

      setItems(data?.items ?? []);
      setSettings(data?.settings ?? {});
      setTheme(data?.theme ?? "dark");
      setTitle(data?.title ?? "KeyFlow");
      setMaterial(data?.material ?? "fallback");
      setQ("");
      setActive(0);
      setPhaseBoth("preparing");
      console.log(`[popup-renderer] opening gen=${genRef.current ?? "?"} epoch=${closeEpochRef.current}`);

      window.requestAnimationFrame(() => {
        // ── Eager size report ──────────────────────────────────────────────
        //
        // Primary fix for the FF#3 "preparing deadlock":
        //
        // On re-opens, ResizeObserver may not fire because the content size
        // hasn't changed. Without this call, reportContentSize never reaches
        // the main process while it is in "preparing" state, so finalizeAndShow
        // is never called, and the BrowserWindow stays hidden.
        //
        // We call reportContentSize directly here on every open cycle before
        // transitioning to "opening" so the main process always has a size.
        if (eapi?.popup?.reportContentSize) {
          const el = overlayRef.current ?? rootRef.current;
          if (el) {
            const rect = el.getBoundingClientRect();
            const w = Math.ceil(rect.width);
            const h = Math.ceil(rect.height);
            if (w > 0 && h > 0) {
              console.log(`[popup-renderer] eager reportContentSize ${w}×${h} gen=${genRef.current ?? "?"}`);
              void eapi.popup.reportContentSize(w, h);
            }
          }
        }

        setPhaseBoth("opening");
        window.setTimeout(() => {
          if (phaseRef.current !== "closing") {
            setPhaseBoth("open");
            console.log(`[popup-renderer] open gen=${genRef.current ?? "?"}`);
          }
        }, OPEN_DURATION_MS);
      });
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the search field after the main process activates the popup.
  useEffect(() => {
    if (!eapi?.popup?.onActivate) return;
    const unsub = eapi.popup.onActivate(focusSearch);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(focusSearch, FOCUS_FAILSAFE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const t = q.toLowerCase();
    return items.filter((it) => it.label.toLowerCase().includes(t) || (it.category ?? "").toLowerCase().includes(t));
  }, [items, q]);

  const select = (item: PopupItemData) => {
    if (eapi?.popup) {
      void eapi.popup.executeAction(item.actions ?? []);
      if (settings.closeAfterAction !== false) beginClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Only handle keys when the popup is actually interactive.
      // When hidden or closing, let all keys pass through to Windows.
      const p = phaseRef.current;
      if (p === "hidden" || p === "closing") return;

      if (isEditableEventTarget(e.target)) return;
      const listLength = filtered.length;
      if (e.key === "Escape") { e.preventDefault(); beginClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => listLength ? Math.min(a + 1, listLength - 1) : 0); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
      if (e.key === "Enter" && filtered[active]) { e.preventDefault(); select(filtered[active]); return; }
      if (/^[1-9]$/.test(e.key) && !q && settings.showNumbers) {
        const target = filtered[Number(e.key) - 1];
        if (target) { e.preventDefault(); select(target); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, active, q, settings, eapi]);

  const overlayClass = [
    "popup-overlay",
    phase === "opening" ? "popup-opening" : phase === "open" ? "popup-open" : phase === "closing" ? "popup-closing" : "popup-hidden",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={rootRef}
      className="popup-window-root"
      onMouseDown={(e) => { if (e.target === e.currentTarget) beginClose(); }}
    >
      <div
        ref={overlayRef}
        className={overlayClass}
        style={{
          /* Dynamic opacity from settings.opacity (token-backed range 0.85–1).
             Not a static colour value; cannot be expressed as a CSS token. */
          opacity: Math.min(1, Math.max(0.85, settings.opacity ?? 1)),
        }}
      >
        {/* Header — drag region. Interactive controls carry no-drag-region. */}
        <div className="popup-brand popup-drag-region">
          <span className="brand-logo no-drag-region">
            <Icon name="logo" size={18} />
          </span>
          <span className="popup-title no-drag-region">
            {title}
          </span>
          {/* Grip handle — inherits drag region from popup-brand */}
          <span className="popup-drag-handle" aria-hidden="true" />
          <button
            type="button"
            className="popup-close no-drag-region"
            aria-label="Close popup"
            title="Close"
            onClick={beginClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <PopupMenu
          items={filtered.slice(0, settings.maxItems ?? 50)}
          settings={settings}
          q={q}
          active={active}
          onSetQ={setQ}
          onSetActive={setActive}
          onSelect={(item) => select(item)}
          searchRef={searchRef}
        />
      </div>
    </div>
  );
}