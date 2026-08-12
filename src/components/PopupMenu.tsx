import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { PopupItem } from "../types";
import { runActions } from "../lib/actions";
import { Input } from "./ui";
import { Icon } from "./Icon";

const W: Record<string, number> = { compact: 360, comfortable: 420, large: 500 };
const H: Record<string, number> = { compact: 380, comfortable: 560, large: 640 };

export function PopupMenu() {
  const popup=useStore((s)=>s.popup); const close=useStore((s)=>s.closePopup); const settings=useStore((s)=>s.data.settings.popup);
  const [q,setQ]=useState(""); const [active,setActive]=useState(0);
  const items=useMemo<PopupItem[]>(()=>{ if(!popup) return []; let list=[...popup.items]; if(settings.showNumbers) list=list.map((it,i)=>i<9&&!it.hint?{...it,hint:String(i+1)}:it); if(q.trim()){ const t=q.toLowerCase(); list=list.filter((it)=>it.label.toLowerCase().includes(t)||(it.category??"").toLowerCase().includes(t)); } list.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)); return list.slice(0,settings.maxItems); },[popup,q,settings]);
  useEffect(()=>{ setQ(""); setActive(0); },[popup]);
  useEffect(()=>{ if(!popup) return; const onKey=(e:KeyboardEvent)=>{ const t=e.target as HTMLElement|null; if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.isContentEditable)) return; if(e.key==="Escape") close(); if(e.key==="ArrowDown"){e.preventDefault(); setActive((a)=>Math.min(a+1,items.length-1));} if(e.key==="ArrowUp"){e.preventDefault(); setActive((a)=>Math.max(a-1,0));} if(e.key==="Enter"&&items[active]) select(items[active]); if(/^[1-9]$/.test(e.key)){ const i=Number(e.key)-1; if(items[i]) select(items[i]); } }; window.addEventListener("keydown", onKey, true); return()=>window.removeEventListener("keydown", onKey, true); },[popup,items,active]);
  if(!popup) return null;
  const select=(item:PopupItem)=>{ void runActions(item.actions); useStore.getState().addRecent({ shortcutName:"Popup: "+item.label, actionLabel:item.label, profileId:useStore.getState().activeProfileId }); if(settings.closeAfterAction) close(); };
  const w=W[settings.size];
  return <div className="popup-layer" role="presentation" onMouseDown={close}><div className="popup-menu" role="dialog" aria-modal="true" aria-label={popup.title ?? "KeyFlow actions"} onMouseDown={(e)=>e.stopPropagation()} style={{ left: Math.max(12, Math.min(popup.x, window.innerWidth-w-12)), top: Math.max(12, Math.min(popup.y, window.innerHeight-260)), width:w, maxHeight:H[settings.size], opacity:settings.opacity, animationDuration:`${settings.animationSpeed}ms`, backdropFilter: useStore.getState().data.settings.appearance.popupBlur ? "blur(20px)" : "none" }}><div className="popup-title">{popup.title ?? "KeyFlow"}</div>{settings.search&&<Input aria-label="Search popup actions" autoFocus className="input" placeholder="Search actions…" value={q} onChange={(e)=>{setQ(e.target.value); setActive(0);}}/>}<div className="popup-list" role="listbox" aria-label="Popup actions">{items.length===0&&<div className="empty-text">No matching actions</div>}{items.map((it,i)=><button type="button" role="option" aria-selected={active===i} key={it.id} onMouseEnter={()=>setActive(i)} onClick={()=>select(it)} className={"popup-item"+(active===i?" active":"")}>{settings.showIcons&&<span className="popup-icon"><Icon name={it.icon??"command"} size={18}/></span>}<span className="popup-copy"><b>{it.label}</b>{it.category&&<small>{it.category}</small>}</span>{settings.showNumbers&&it.hint&&<kbd>{it.hint}</kbd>}</button>)}</div></div></div>;
}
