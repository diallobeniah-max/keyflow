import { useState } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";

export function WindowsHistoryBar() {
  const navHistory = useStore((s) => s.navHistory);
  const navHistoryIndex = useStore((s) => s.navHistoryIndex);
  const jumpToHistory = useStore((s) => s.jumpToHistory);
  const appearance = useStore((s) => s.data.settings.appearance);

  const [collapsed, setCollapsed] = useState(false);

  // If only 1 item in history, no need to show a long breadcrumb trail unless user wants to
  if (!navHistory || navHistory.length <= 1) {
    return null;
  }

  // Show last 6 history items at most to stay sleek
  const visibleStart = Math.max(0, navHistory.length - 6);
  const visibleItems = navHistory.slice(visibleStart);

  return (
    <aside
      className={`windows-history-bar${collapsed ? " is-collapsed" : ""}${
        appearance?.navigationLayout === "horizontal" ? " is-dock-mode" : ""
      }`}
      aria-label="Recent windows history trail"
    >
      <div className="windows-history-inner">
        <button
          type="button"
          className="windows-history-toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Show windows history trail" : "Hide history trail"}
          aria-label={collapsed ? "Expand history" : "Collapse history"}
        >
          <Icon name="window" size={13} />
          {!collapsed && <span className="windows-history-brand">History</span>}
        </button>

        {!collapsed && (
          <div className="windows-history-items">
            {visibleItems.map((item, idx) => {
              const realIndex = visibleStart + idx;
              const isCurrent = realIndex === navHistoryIndex;
              return (
                <div key={`${item.page}-${item.section}-${realIndex}`} className="windows-history-segment">
                  <span className="windows-history-sep">›</span>
                  <button
                    type="button"
                    className={`windows-history-pill${isCurrent ? " is-current" : ""}`}
                    onClick={() => jumpToHistory(realIndex)}
                    title={`Jump back to ${item.label}`}
                  >
                    <span className="windows-history-pill-text">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
