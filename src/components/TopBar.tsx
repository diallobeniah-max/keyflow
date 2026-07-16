import { useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";
import { IconButton } from "./ui";

const TITLES: Record<string,string> = { dashboard:"Dashboard", shortcuts:"Shortcuts", create:"Create shortcut", visual:"Visual keyboard", library:"Action library", profiles:"Profiles", settings:"Settings" };

export function TopBar() {
  const page=useStore((s)=>s.currentPage); const setPage=useStore((s)=>s.setPage); const setGlobalSearch=useStore((s)=>s.setGlobalSearch);
  const paused=useStore((s)=>s.paused); const togglePaused=useStore((s)=>s.togglePaused); const safeMode=useStore((s)=>s.safeMode); const focusedApp=useStore((s)=>s.focusedApp);
  const appearance=useStore((s)=>s.data.settings.appearance); const patch=useStore((s)=>s.patchSettings);
  const drawerOpen=useStore((s)=>s.drawerOpen); const setDrawerOpen=useStore((s)=>s.setDrawerOpen);
  const [q,setQ]=useState("");
  const hamburgerRef=useRef<HTMLButtonElement>(null);
  const nextTheme = appearance.theme === "dark" ? "light" : appearance.theme === "light" ? "system" : "dark";
  return <header className="topbar"><button ref={hamburgerRef} type="button" className="hamburger" aria-label="Open navigation menu" onClick={()=>setDrawerOpen(!drawerOpen)}><Icon name={drawerOpen?"close":"shortcuts"} size={22}/></button><h1 className="top-title">{TITLES[page]}</h1><form className="top-search" onSubmit={(e)=>{e.preventDefault(); setGlobalSearch(q); setPage("shortcuts");}}><Icon name="search" size={18}/><input placeholder="Search shortcuts, actions…" value={q} onChange={(e)=>setQ(e.target.value)}/></form><div className="top-actions"><span className="chip hide-mobile"><Icon name="window" size={14}/>{focusedApp}</span><span className="chip" style={{color: paused||safeMode ? "var(--warning)" : "var(--success)", borderColor: paused||safeMode ? "var(--warning)" : "var(--success)"}}><Icon name={paused||safeMode ? "pause" : "play"} size={14}/>{safeMode ? "Safe mode" : paused ? "Paused" : "Active"}</span><IconButton name={appearance.theme === "light" ? "sun" : appearance.theme === "dark" ? "moon" : "monitor"} title={"Theme: " + appearance.theme} onClick={()=>patch("appearance", { theme: nextTheme as any })}/><button type="button" className="btn" data-paused={paused} onClick={togglePaused}><Icon name={paused?"play":"pause"} size={18}/>{paused?"Resume":"Pause"}</button></div></header>;
}
