import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { KEYBOARD_ROWS, MOUSE_BUTTONS } from "../lib/constants";
import { Button, Card, PageIntro } from "../components/ui";

function keyClass(k:string){
  const base = ["key-tile"];
  if(["Escape","Tab","CapsLock","Shift","Ctrl","Alt","Win","Enter","Backspace"].includes(k)) base.push("key-rule");
  if(k.startsWith("F")) base.push("key-fn");
  if(["Left","Right","Up","Down"].includes(k)) base.push("key-nav");
  if(["Space"].includes(k)) base.push("key-space");
  if(["Backspace","CapsLock","Enter","Shift","Tab"].includes(k)) base.push("key-wide");
  return base.join(" ");
}
export function VisualKeyboard(){
  const data=useStore((s)=>s.data); const active=useStore((s)=>s.activeProfileId); const setPage=useStore((s)=>s.setPage); const setPending=useStore((s)=>s.setPendingKey);
  const counts=useMemo(()=>{ const m=new Map<string,number>(); data.shortcuts.filter((s)=>s.profileId===active).forEach((s)=>m.set(s.key,(m.get(s.key)||0)+1)); return m; },[data.shortcuts,active]);
  const mouseShortcuts = data.shortcuts.filter((s)=>s.profileId===active && s.mouse);
  const openCreate=(key:string, mouse=false)=>{ useStore.getState().setEditing(null); setPending(key, mouse); setPage("create"); };
  return <div className="content"><PageIntro eyebrow="visual map" title="Visual keyboard" description="Click any key or mouse button to create a Tap Action. Colored keys show the type of key, and badges show how many shortcuts are assigned."><Button variant="primary" icon="create" onClick={()=>openCreate("F")}>Create shortcut</Button></PageIntro><Card className="visual-card"><div className="visual-board"><div className="keyboard-panel"><p className="muted">Function keys, rule keys, letters, and navigation keys are color-coded so the map feels closer to a real keyboard.</p><div className="keyboard full-width">{KEYBOARD_ROWS.map((row,i)=><div className="key-row" key={i}>{row.map((k,idx)=>{ const count=counts.get(k)||0; return <button type="button" key={k+idx} className={keyClass(k)+(count?" assigned":"")} onClick={()=>openCreate(k,false)}><span>{k}</span>{count>0&&<small>{count}</small>}</button>})}</div>)}</div><div className="key-legend"><span><i className="legend-dot fn"/> Function</span><span><i className="legend-dot rule"/> Rule keys</span><span><i className="legend-dot nav"/> Navigation</span><span><i className="legend-dot assigned"/> Assigned</span></div></div><aside className="mouse-panel"><h3 className="section-title">Mouse shortcuts</h3><p className="muted tiny">Use the empty side area to create and review shortcuts for extra mouse buttons.</p><div className="mouse-grid">{MOUSE_BUTTONS.map((b)=>{ const count=counts.get(b.value)||0; return <button key={b.value} type="button" className={"mouse-tile"+(count?" assigned":"")} onClick={()=>openCreate(b.value,true)}><b>{b.label}</b><span>{count ? `${count} action${count>1?"s":""}` : "Click to assign"}</span></button>})}</div>{mouseShortcuts.length>0&&<div className="mouse-list">{mouseShortcuts.map((s)=><button key={s.id} type="button" className="chip clickable" onClick={()=>{useStore.getState().setEditing(s.id); setPage("create");}}>{s.key} · {s.name}</button>)}</div>}</aside></div></Card></div>;
}
