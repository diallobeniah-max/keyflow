import { useState } from "react";
import { useStore } from "../store/useStore";
import { getEngine } from "../lib/engine";
import { Shortcut } from "../types";
import { ACTION_META } from "../lib/constants";
import { Button, Modal, Toggle } from "./ui";
import { Icon } from "./Icon";

function triggerShortcut(s: Shortcut) {
  const e=getEngine(); const k=s.key; const m=s.modifiers;
  if(s.trigger==="double"){ e.simulateTap(k,m); setTimeout(()=>e.simulateTap(k,m),70); return; }
  if(s.trigger==="triple"){ e.simulateTap(k,m); setTimeout(()=>e.simulateTap(k,m),70); setTimeout(()=>e.simulateTap(k,m),140); return; }
  if(s.trigger==="longPress"||s.trigger==="hold"){ e.simulateHold(k,m,s.timing.holdDuration+140); return; }
  if(s.trigger==="tapThenHold"){ e.simulateTap(k,m); setTimeout(()=>e.simulateHold(k,m,s.timing.holdDuration+140),90); return; }
  e.simulateTap(k,m);
}

export function Simulator({ open, onClose }: { open:boolean; onClose:()=>void }) {
  const activeId=useStore((s)=>s.activeProfileId); const shortcuts=useStore((s)=>s.data.shortcuts); const [capture,setCapture]=useState(getEngine().isCapturing());
  const list=shortcuts.filter((s)=>s.profileId===activeId);
  const toggleCapture=()=>{ const next=!capture; setCapture(next); getEngine().setCapture(next); };
  return <Modal open={open} onClose={onClose} title="Shortcut simulator" width={620}><div className="col"><div className="settings-row"><div><b>Keyboard capture inside this window</b><p className="muted tiny">Browser mode only listens while this app tab/window is focused.</p></div><Toggle label="Keyboard capture inside this window" checked={capture} onChange={toggleCapture}/></div><div className="col gap-sm sim-list">{list.map((s)=>{ const meta=s.actions[0]?ACTION_META[s.actions[0].type]:ACTION_META.openApp; return <div key={s.id} className="sim-item" data-disabled={!s.enabled}><div className="row"><span className="small-icon"><Icon name={meta.icon} size={17}/></span><div><b>{s.name}</b><div className="muted tiny">{[...s.modifiers,s.key].join("+")} · {s.trigger}</div></div></div><Button variant="secondary" size="sm" icon="play" disabled={!s.enabled} onClick={()=>triggerShortcut(s)}>Trigger</Button></div>})}</div></div></Modal>;
}
