import { useState, type AriaRole } from "react";
import { getEngine } from "../lib/engine";
import { ModifierKey } from "../types";
import { Button } from "./ui";

const MODS: ModifierKey[] = ["Ctrl", "Alt", "Shift", "Win"];
export function KeyCapture({ value, modifiers, onChangeKey, onChangeMods, id, "aria-labelledby": ariaLabelledBy, "aria-describedby": ariaDescribedBy, role = "group" }: { value: string; modifiers: ModifierKey[]; onChangeKey: (k:string)=>void; onChangeMods: (m:ModifierKey[])=>void; id?: string; "aria-labelledby"?: string; "aria-describedby"?: string; role?: AriaRole }) {
  const [capturing,setCapturing]=useState(false);
  const start=()=>{ setCapturing(true); getEngine().captureNext((token,mods)=>{ setCapturing(false); onChangeKey(token); onChangeMods(MODS.filter((m)=>mods.includes(m))); }); };
  const toggle=(m:ModifierKey)=>onChangeMods(modifiers.includes(m)?modifiers.filter((x)=>x!==m):[...modifiers,m]);
  return <div id={id} role={role} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy} className="row wrap"><Button variant="secondary" icon={capturing?"pause":"key"} onClick={start}>{capturing?"Press a key…":value||"Capture key"}</Button>{MODS.map((m)=><button type="button" className="chip clickable" key={m} onClick={()=>toggle(m)} aria-pressed={modifiers.includes(m)} aria-label={`${m} modifier`} style={{borderColor: modifiers.includes(m)?"var(--accent)":"var(--border)", color:modifiers.includes(m)?"var(--accent)":"var(--text-secondary)"}}>{m}</button>)}</div>;
}
