import { useRef, useEffect } from "react";
import { useStore } from "../store/useStore";
import { AppPage } from "../types";
import { Icon } from "./Icon";
import { IconButton } from "./ui";

const NAV: { page: AppPage; label: string; icon: string }[] = [
  { page: "dashboard", label: "Dashboard", icon: "dashboard" },
  { page: "shortcuts", label: "Shortcuts", icon: "shortcuts" },
  { page: "create", label: "Create", icon: "create" },
  { page: "visual", label: "Keyboard", icon: "visual" },
  { page: "library", label: "Library", icon: "library" },
  { page: "profiles", label: "Profiles", icon: "profiles" },
  { page: "settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  const current = useStore((s) => s.currentPage);
  const setPage = useStore((s) => s.setPage);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const toggle = useStore((s) => s.toggleSidebar);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const profiles = useStore((s) => s.data.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const setActive = useStore((s) => s.setActiveProfile);
  const paused = useStore((s) => s.paused);
  const togglePaused = useStore((s) => s.togglePaused);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!drawerOpen) {
      const h = document.querySelector<HTMLElement>(".hamburger");
      h?.focus();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrawerOpen(false); return; }
      if (e.key === "Tab" && asideRef.current) {
        const focusable = asideRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
  return <aside ref={asideRef} tabIndex={-1} className={"sidebar" + (collapsed ? " collapsed" : "") + isDrawer}>
    <div className="sidebar-brand">
      {!collapsed && <div className="row"><span className="brand-logo"><Icon name="logo" size={20}/></span><span className="brand-title">KeyFlow</span></div>}
      <IconButton name={collapsed ? "chevronRight" : "chevronLeft"} onClick={toggle} title="Toggle sidebar"/>
    </div>
    <nav className="nav-list">{NAV.map((n)=><button key={n.page} type="button" onClick={()=>navigate(n.page)} title={n.label} className={"nav-item" + (current===n.page ? " active" : "")}>{<Icon name={n.icon} size={20}/>} {!collapsed && <span>{n.label}</span>}</button>)}</nav>
    <div className="sidebar-foot">
      {!collapsed && <div className="tiny muted">ACTIVE PROFILE</div>}
      {collapsed ? <IconButton name="profiles" title="Profiles" onClick={()=>navigate("profiles")}/> : <select className="select" value={activeId} onChange={(e)=>setActive(e.target.value)}>{profiles.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <button type="button" className="btn pause-btn" onClick={togglePaused} data-paused={paused}>{<Icon name={paused ? "play" : "pause"} size={18}/>} {!collapsed && (paused ? "Resume" : "Pause")}</button>
    </div>
  </aside>;
}
