import { useRef, useEffect } from "react";
import { useStore } from "../store/useStore";
import { AppPage } from "../types";
import { Icon } from "./Icon";
import { IconButton } from "./ui";
import { AppSelect } from "./ui/AppSelect";

interface NavItem {
  page: AppPage;
  label: string;
  icon: string;
  badge?: number;
}

export function Sidebar() {
  const current = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggle = useStore((s) => s.toggleSidebar);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const profiles = useStore((s) => s.data.profiles);
  const shortcuts = useStore((s) => s.data.shortcuts);
  const activeId = useStore((s) => s.activeProfileId);
  const setActive = useStore((s) => s.setActiveProfile);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const togglePaused = useStore((s) => s.togglePaused);
  const asideRef = useRef<HTMLElement>(null);

  const activeShortcutsCount = shortcuts.filter((s) => s.profileId === activeId && s.enabled).length;

  const NAV_MAIN: NavItem[] = [
    { page: "dashboard", label: "Overview", icon: "dashboard" },
    { page: "shortcuts", label: "Shortcuts", icon: "shortcuts", badge: activeShortcutsCount },
    { page: "create", label: "Create", icon: "create" },
    { page: "visual", label: "Keyboard Map", icon: "visual" },
  ];

  const NAV_MANAGE: NavItem[] = [
    { page: "profiles", label: "Profiles", icon: "profiles", badge: profiles.length },
    { page: "library", label: "Action Library", icon: "library" },
    { page: "settings", label: "Settings", icon: "settings" },
  ];

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (e.key === "Tab" && asideRef.current) {
        const focusable = asideRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [role="combobox"], [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    asideRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drawerOpen, setDrawerOpen]);

  const navigate = (page: AppPage) => {
    setPage(page);
    setDrawerOpen(false);
  };

  const isDrawer = drawerOpen ? " open" : "";

  return (
    <aside
      ref={asideRef}
      tabIndex={-1}
      className={"sidebar" + (collapsed ? " collapsed" : "") + isDrawer}
      aria-label="Application navigation"
    >
      <div className="sidebar-top">
        <div className="sidebar-brand">
          {!collapsed && (
            <div className="sidebar-brand-title">
              <span className="brand-logo-dot" />
              <span className="brand-lockup">
                <span className="brand-name">KeyFlow</span>
                <span className="brand-subtitle">CONTROL DECK</span>
              </span>
              <span className="brand-version-tag">v0.3</span>
            </div>
          )}
          <IconButton
            name={collapsed ? "chevronRight" : "chevronLeft"}
            onClick={toggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            size={16}
          />
        </div>

        <nav className="nav-group">
          {!collapsed && <div className="nav-group-label">OPERATE</div>}
          <div className="nav-list">
            {NAV_MAIN.map((n) => {
              const isActive = current === n.page;
              return (
                <button
                  key={n.page}
                  type="button"
                  onClick={() => navigate(n.page)}
                  title={n.label}
                  className={"nav-item" + (isActive ? " active" : "")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon name={n.icon} size={17} />
                  {!collapsed && (
                    <>
                      <span className="nav-item-label">{n.label}</span>
                      {typeof n.badge === "number" && n.badge > 0 && (
                        <span className="nav-item-badge">{n.badge}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        <nav className="nav-group">
          {!collapsed && <div className="nav-group-label">WORKSPACE</div>}
          <div className="nav-list">
            {NAV_MANAGE.map((n) => {
              const isActive = current === n.page;
              return (
                <button
                  key={n.page}
                  type="button"
                  onClick={() => navigate(n.page)}
                  title={n.label}
                  className={"nav-item" + (isActive ? " active" : "")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon name={n.icon} size={17} />
                  {!collapsed && (
                    <>
                      <span className="nav-item-label">{n.label}</span>
                      {typeof n.badge === "number" && n.badge > 0 && (
                        <span className="nav-item-badge">{n.badge}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      <div className="sidebar-foot">
        {!collapsed && (
          <div className="sidebar-profile-box">
            <div className="sidebar-profile-label">ACTIVE PROFILE</div>
            <AppSelect
              label=""
              value={activeId}
              onChange={setActive}
              options={profiles.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}

        <button
          type="button"
          className={"btn sidebar-pause-btn" + (paused || safeMode ? " is-paused" : " is-active-engine")}
          onClick={togglePaused}
          title={paused ? "Resume KeyFlow input hook" : "Pause KeyFlow input hook"}
        >
          <Icon name={paused ? "play" : "pause"} size={15} />
          {!collapsed && <span>{safeMode ? "Safe Mode" : paused ? "Resume Engine" : "Pause Engine"}</span>}
        </button>
      </div>
    </aside>
  );
}
