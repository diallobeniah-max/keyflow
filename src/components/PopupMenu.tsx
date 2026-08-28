import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { PopupItem } from "../types";
import { runActions } from "../lib/actions";
import { resolvePopupItems, effectivePopupKey, popupKeyMap } from "../lib/popup-items";
import { Icon } from "./Icon";

const W: Record<string, number> = { compact: 380, comfortable: 460, large: 540 };
const H: Record<string, number> = { compact: 380, comfortable: 560, large: 640 };

export function PopupMenu() {
  const popup = useStore((s) => s.popup);
  const close = useStore((s) => s.closePopup);
  const settings = useStore((s) => s.data.settings.popup);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo<PopupItem[]>(() => {
    if (!popup) return [];
    let list = [...resolvePopupItems(popup.items, settings.items)];
    if (settings.showNumbers) {
      list = list.map((it, i) =>
        i < 9 && !it.hint ? { ...it, hint: effectivePopupKey(it, i) } : it
      );
    }
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter(
        (it) =>
          it.label.toLowerCase().includes(t) ||
          (it.category ?? "").toLowerCase().includes(t)
      );
    }
    list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    return list.slice(0, settings.maxItems);
  }, [popup, q, settings]);

  useEffect(() => {
    setQ("");
    setActive(0);
  }, [popup]);

  useEffect(() => {
    if (!popup) return;
    const keyMap = popupKeyMap(items);
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === "Enter" && items[active]) select(items[active]);
      const i = keyMap.get(e.key);
      if (i !== undefined && items[i]) select(items[i]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [popup, items, active]);

  if (!popup) return null;

  const select = (item: PopupItem) => {
    void runActions(item.actions);
    useStore.getState().addRecent({
      shortcutName: "Popup: " + item.label,
      actionLabel: item.label,
      profileId: useStore.getState().activeProfileId,
    });
    if (settings.closeAfterAction) close();
  };

  const w = W[settings.size] ?? 460;
  const h = H[settings.size] ?? 560;

  return (
    <div className="popup-layer" role="presentation" onMouseDown={close}>
      <div
        className="popup-menu"
        role="dialog"
        aria-modal="true"
        aria-label={popup.title ?? "KeyFlow actions"}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          left: Math.max(12, Math.min(popup.x, window.innerWidth - w - 12)),
          top: Math.max(12, Math.min(popup.y, window.innerHeight - 260)),
          width: w,
          maxHeight: h,
          opacity: settings.opacity,
          animationDuration: `${settings.animationSpeed}ms`,
          backdropFilter: useStore.getState().data.settings.appearance.popupBlur
            ? "blur(24px)"
            : "none",
        }}
      >
        <div className="popup-brand">
          <div className="popup-brand-left">
            <span className="brand-logo-dot" />
            <span className="popup-title">{popup.title ?? "KeyFlow"}</span>
          </div>
          <button
            type="button"
            className="popup-close"
            aria-label="Close popup"
            title="Close (Esc)"
            onClick={close}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {settings.search && (
          <div className="popup-search-bar">
            <Icon name="search" size={16} className="popup-search-icon" />
            <input
              aria-label="Search popup actions"
              autoFocus
              className="input popup-search"
              placeholder="Type a command or search actions…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
            />
            {q && (
              <button
                type="button"
                className="popup-search-clear"
                onClick={() => {
                  setQ("");
                  setActive(0);
                }}
                title="Clear"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        )}

        <div className="popup-list" role="listbox" aria-label="Popup actions">
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
              onMouseEnter={() => setActive(i)}
              onClick={() => select(it)}
              className={"popup-item" + (active === i ? " active" : "")}
            >
              {settings.showIcons && (
                <span className="popup-icon">
                  <Icon name={it.icon ?? "command"} size={16} />
                </span>
              )}
              <span className="popup-copy">
                <b className="popup-item-label">{it.label}</b>
                {it.category && <span className="popup-item-category">{it.category}</span>}
              </span>
              {settings.showNumbers && it.hint && <kbd className="popup-num">{it.hint}</kbd>}
            </button>
          ))}
        </div>

        <div className="popup-footer">
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
      </div>
    </div>
  );
}
