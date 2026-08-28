import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
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
  appearance?: {
    fontSize?: string;
    theme?: string;
  };
}

type Phase = "hidden" | "preparing" | "opening" | "open" | "closing";

const OPEN_DURATION_MS = 140;
const CLOSE_DURATION_MS = 120;
const FOCUS_FAILSAFE_MS = 350;

function isEditableEventTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

function PopupMenu({
  items,
  settings,
  q,
  active,
  onSetQ,
  onSetActive,
  onSelect,
  searchRef,
  openTimeRef,
}: {
  items: PopupItemData[];
  settings: PopupShellSettings;
  q: string;
  active: number;
  onSetQ: (v: string) => void;
  onSetActive: (i: number) => void;
  onSelect: (item: PopupItemData) => void;
  searchRef: RefObject<HTMLInputElement>;
  openTimeRef: RefObject<number>;
}) {
  return (
    <>
      {settings.search !== false && (
        <div className="popup-search-bar no-drag-region">
          <Icon name="search" size={16} className="popup-search-icon" />
          <input
            ref={searchRef}
            aria-label="Search popup actions"
            className="input popup-search no-drag-region"
            placeholder="Type a command or search actions…"
            value={q}
            onChange={(e) => {
              // Ignore spurious character typed from the shortcut trigger key (e.g. T in Hyper+T)
              if (openTimeRef.current && Date.now() - openTimeRef.current < 90 && e.target.value.length === 1) {
                return;
              }
              onSetQ(e.target.value);
              onSetActive(0);
            }}
          />
          {q ? (
            <button
              type="button"
              className="popup-search-clear"
              onClick={() => {
                onSetQ("");
                onSetActive(0);
                searchRef.current?.focus();
              }}
              title="Clear search"
            >
              <Icon name="close" size={12} />
            </button>
          ) : (
            <kbd className="popup-search-hint">↵</kbd>
          )}
        </div>
      )}
      <div className="popup-list no-drag-region" role="listbox" aria-label="Popup actions">
        {items.length === 0 && (
          <div className="empty-text">
            <Icon name="search" size={24} className="muted mb-xs" />
            <div>No matching actions found</div>
          </div>
        )}
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
            {settings.showIcons !== false && (
              <span className="popup-icon">
                <Icon name={it.icon ?? "app"} size={16} />
              </span>
            )}
            <span className="popup-copy">
              <b className="popup-item-label">{it.label}</b>
              {it.category && <span className="popup-item-category">{it.category}</span>}
            </span>
            {settings.showNumbers !== false && it.hint && (
              <kbd className="popup-num">{it.hint}</kbd>
            )}
          </button>
        ))}
      </div>
      <div className="popup-footer no-drag-region">
        <span className="popup-footer-count">
          {items.length} {items.length === 1 ? "action" : "actions"}
        </span>
        <div className="popup-footer-hints">
          <span className="popup-footer-hint">
            <kbd>↵</kbd> Select
          </span>
          <span className="popup-footer-hint">
            <kbd>↑↓</kbd> Navigate
          </span>
          <span className="popup-footer-hint">
            <kbd>Esc</kbd> Close
          </span>
        </div>
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
   * hide() or set phase=hidden.
   */
  const closeEpochRef = useRef(0);
  const openTimeRef = useRef<number>(0);

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

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

  // Layout effect to measure and report exact rendered content height whenever items/search update.
  useLayoutEffect(() => {
    if (phaseRef.current === "closing" || phaseRef.current === "hidden") return;
    const el = overlayRef.current;
    if (!el || !eapi?.popup?.reportContentSize) return;
    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(Math.max(rect.height, el.scrollHeight));
    if (width > 0 && height > 0) {
      void eapi.popup.reportContentSize(width, height);
    }
  }, [items, q, settings, eapi]);

  // ResizeObserver as an additional fallback for dynamic DPI or font changes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !eapi?.popup?.reportContentSize) return;
    let handle = 0;
    const report = () => {
      if (phaseRef.current === "closing" || phaseRef.current === "hidden") return;
      const el = overlayRef.current ?? root;
      const rect = el.getBoundingClientRect();
      const width = Math.ceil(rect.width);
      const height = Math.ceil(Math.max(rect.height, el.scrollHeight));
      if (width > 0 && height > 0) {
        void eapi.popup.reportContentSize(width, height);
      }
    };
    const observer = new ResizeObserver(() => {
      window.clearTimeout(handle);
      handle = window.setTimeout(report, 30);
    });
    observer.observe(root);
    return () => {
      window.clearTimeout(handle);
      observer.disconnect();
    };
  }, [eapi]);

  const focusSearch = () => {
    window.requestAnimationFrame(() => {
      if (settings.search !== false) searchRef.current?.focus();
    });
  };

  const beginClose = () => {
    if (phaseRef.current === "closing" || phaseRef.current === "hidden") return;

    const epoch = ++closeEpochRef.current;
    const closeGen = genRef.current;
    setPhaseBoth("closing");
    console.log(`[popup-renderer] closing epoch=${epoch} gen=${closeGen ?? "?"}`);

    const finishClose = () => {
      if (closeEpochRef.current !== epoch) {
        console.log(`[popup-renderer] finishClose STALE epoch=${epoch} current=${closeEpochRef.current} gen=${closeGen ?? "?"} — ignored`);
        return;
      }
      if (closedRef.current) return;
      closedRef.current = true;
      setPhaseBoth("hidden");
      console.log(`[popup-renderer] closed epoch=${epoch} gen=${closeGen ?? "?"}`);
      if (eapi?.popup) void eapi.popup.hide(closeGen ?? undefined);
    };

    const overlay = overlayRef.current;
    overlay?.addEventListener("animationend", finishClose, { once: true });
    window.setTimeout(finishClose, CLOSE_DURATION_MS + 30);
  };

  // Main process sends popup:closing when trigger toggle closes the popup.
  useEffect(() => {
    if (!eapi?.popup?.onClosing) return;
    const unsub = eapi.popup.onClosing(beginClose);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eapi?.popup?.onData) return;
    const unsub = eapi.popup.onData((data: any) => {
      closeEpochRef.current++;
      closedRef.current = false;
      genRef.current = data?.gen ?? null;

      const fallbackDefaults = [
        { id: "pop-code", label: "Open VS Code", icon: "terminal", category: "Launch", hint: "1", enabled: true, actions: [{ id: "act-pop-code", type: "openApp", payload: { path: "code" } }] },
        { id: "pop-docs", label: "Open Documents", icon: "folder", category: "Folders", hint: "2", enabled: true, actions: [{ id: "act-pop-docs", type: "openFolder", payload: { path: "%USERPROFILE%\\Documents" } }] },
        { id: "pop-topmost", label: "Always on Top", icon: "pinTop", category: "Window", hint: "3", enabled: true, actions: [{ id: "act-top", type: "alwaysOnTop", payload: { topmostMode: "toggle", highlight: true, sound: true } }] },
        { id: "pop-note", label: "Quick Note", icon: "file", category: "Tools", hint: "4", enabled: true, actions: [{ id: "act-note", type: "notesPopup", payload: {} }] },
      ];

      const rawItems = data?.items && data.items.length > 0
        ? data.items
        : (data?.settings?.items && data.settings.items.length > 0 ? data.settings.items : fallbackDefaults);

      setItems(rawItems);
      setSettings(data?.settings ?? {});
      setTheme(data?.theme ?? "dark");
      setTitle(data?.title ?? "KeyFlow");
      setMaterial(data?.material ?? "fallback");
      setQ("");
      setActive(0);
      setPhaseBoth("preparing");
      openTimeRef.current = Date.now();

      const fontSize = data?.settings?.appearance?.fontSize ?? "default";
      document.documentElement.setAttribute("data-font-size", fontSize);

      console.log(`[popup-renderer] opening gen=${genRef.current ?? "?"} epoch=${closeEpochRef.current}`);

      // Calculate initial estimated height for eager display to prevent pop-in delay
      const itemCount = Math.min(rawItems.length || 4, data?.settings?.maxItems ?? 8);
      const estimatedHeight = Math.min(520, Math.max(150, 38 + 48 + (itemCount * 44) + 16));
      const estimatedWidth = 440;

      if (eapi?.popup?.reportContentSize) {
        console.log(`[popup-renderer] eager reportContentSize ${estimatedWidth}×${estimatedHeight} gen=${genRef.current ?? "?"}`);
        void eapi.popup.reportContentSize(estimatedWidth, estimatedHeight);
      }

      window.requestAnimationFrame(() => {
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
    return items.filter(
      (it) => it.label.toLowerCase().includes(t) || (it.category ?? "").toLowerCase().includes(t)
    );
  }, [items, q]);

  const select = (item: PopupItemData) => {
    if (eapi?.popup) {
      void eapi.popup.executeAction(item.actions ?? []);
      if (settings.closeAfterAction !== false) beginClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = phaseRef.current;
      if (p === "hidden" || p === "closing") return;

      if (isEditableEventTarget(e.target)) return;
      const listLength = filtered.length;
      if (e.key === "Escape") {
        e.preventDefault();
        beginClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (listLength ? Math.min(a + 1, listLength - 1) : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[active]) {
        e.preventDefault();
        select(filtered[active]);
        return;
      }
      if (/^[1-9]$/.test(e.key) && !q && settings.showNumbers !== false) {
        const target = filtered[Number(e.key) - 1];
        if (target) {
          e.preventDefault();
          select(target);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, active, q, settings, eapi]);

  const overlayClass = [
    "popup-overlay",
    phase === "opening"
      ? "popup-opening"
      : phase === "open"
      ? "popup-open"
      : phase === "closing"
      ? "popup-closing"
      : "popup-hidden",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rootRef}
      className="popup-window-root"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) beginClose();
      }}
    >
      <div
        ref={overlayRef}
        className={overlayClass}
        style={{
          opacity: Math.min(1, Math.max(0.85, settings.opacity ?? 1)),
        }}
      >
        {/* Header — drag region. Interactive controls carry no-drag-region. */}
        <div className="popup-brand popup-drag-region">
          <div className="popup-brand-left no-drag-region">
            <span className="brand-logo-dot" />
            <span className="popup-title">{title}</span>
          </div>
          {/* Grip handle — inherits drag region from popup-brand */}
          <span className="popup-drag-handle" aria-hidden="true" />
          <button
            type="button"
            className="popup-close no-drag-region"
            aria-label="Close popup"
            title="Close (Esc)"
            onClick={beginClose}
          >
            <Icon name="close" size={14} />
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
          openTimeRef={openTimeRef}
        />
      </div>
    </div>
  );
}