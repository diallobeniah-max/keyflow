import { Action, ActionType, PopupItem } from "../types";
import { ACTION_META, WINDOWS_SETTINGS } from "../lib/constants";
import { useStore } from "../store/useStore";
import { uid } from "../store/sampleData";
import { Button, Field, IconButton, Input, Select, Textarea } from "./ui";
import { Icon } from "./Icon";

function defaultAction(type: ActionType = "openApp"): Action { return { id: uid("act"), type, payload: {} }; }
const ACTION_OPTIONS = Object.keys(ACTION_META).map((t)=>({ value:t, label:ACTION_META[t as ActionType].label }));

export function ActionListEditor({ actions, onChange, depth = 0 }: { actions: Action[]; onChange: (a:Action[])=>void; depth?: number }) {
  const update=(i:number,a:Action)=>onChange(actions.map((x,idx)=>idx===i?a:x));
  const remove=(i:number)=>onChange(actions.filter((_,idx)=>idx!==i));
  const move=(i:number,dir:-1|1)=>{ const j=i+dir; if(j<0||j>=actions.length) return; const c=actions.slice(); [c[i],c[j]]=[c[j],c[i]]; onChange(c); };
  return <div className="col gap-sm">{actions.map((a,i)=><ActionRow key={a.id} a={a} index={i} total={actions.length} onChange={(na)=>update(i,na)} onRemove={()=>remove(i)} onMove={(d)=>move(i,d)} depth={depth}/>) }{depth<2&&<Button variant="secondary" size="sm" icon="create" onClick={()=>onChange([...actions, defaultAction()])}>Add action</Button>}</div>;
}

function ActionRow({ a, index, total, onChange, onRemove, onMove, depth }: { a:Action; index:number; total:number; onChange:(a:Action)=>void; onRemove:()=>void; onMove:(d:-1|1)=>void; depth:number }) {
  const profiles=useStore((s)=>s.data.profiles); const meta=ACTION_META[a.type];
  const setType=(t:ActionType)=>onChange({...a,type:t,payload:{}}); const setPayload=(p:Partial<Action["payload"]>)=>onChange({...a,payload:{...a.payload,...p}});
  return <div className="action-row"><div className="spread"><div className="row"><span className="action-num">{index+1}</span><span className="action-icon"><Icon name={meta.icon} size={16}/></span><Select value={a.type} onChange={(v)=>setType(v as ActionType)} options={ACTION_OPTIONS}/></div><div className="row tiny-gap"><IconButton name="chevronUp" onClick={()=>onMove(-1)} disabled={index===0}/><IconButton name="chevronDown" onClick={()=>onMove(1)} disabled={index===total-1}/><IconButton name="trash" onClick={onRemove}/></div></div><div className="col gap-sm action-fields">
    {(a.type==="openApp"||a.type==="openFile"||a.type==="openFolder"||a.type==="runCommand"||a.type==="runBatch")&&<Field label="Path / command"><Input value={a.payload.path??""} placeholder="code, notepad.exe, C:\\Apps\\app.exe" onChange={(e)=>setPayload({path:e.target.value})}/></Field>}
    {a.type==="openWebsite"&&<Field label="URL"><Input value={a.payload.url??""} placeholder="https://…" onChange={(e)=>setPayload({url:e.target.value})}/></Field>}
    {a.type==="runCommand"&&<Field label="Arguments"><Input value={a.payload.args??""} onChange={(e)=>setPayload({args:e.target.value})}/></Field>}
    {(a.type==="runPowershell"||a.type==="runBatch")&&<Field label="Script"><Textarea rows={3} value={a.payload.script??""} onChange={(e)=>setPayload({script:e.target.value})}/></Field>}
    {(a.type==="pasteText"||a.type==="typeText")&&<Field label="Text"><Textarea rows={3} value={a.payload.text??""} onChange={(e)=>setPayload({text:e.target.value})}/></Field>}
    {a.type==="pressShortcut"&&<Field label="Shortcut"><Input value={a.payload.shortcut??""} placeholder="Ctrl+C, Alt+Left" onChange={(e)=>setPayload({shortcut:e.target.value})}/></Field>}
    {a.type==="volumeControl"&&<Field label="Volume action"><Select value={String(a.payload.volume??"up")} onChange={(v)=>setPayload({volume:v as any})} options={["up","down","mute","unmute","toggle"].map((x)=>({value:x,label:x}))}/></Field>}
    {a.type==="mediaControl"&&<Field label="Media action"><Select value={a.payload.media??"playpause"} onChange={(v)=>setPayload({media:v as any})} options={["playpause","next","prev","stop"].map((x)=>({value:x,label:x}))}/></Field>}
    {a.type==="openSettings"&&<Field label="Windows Settings page"><Select value={a.payload.settingsPage??"ms-settings:"} onChange={(v)=>setPayload({settingsPage:v})} options={WINDOWS_SETTINGS}/></Field>}
    {a.type==="switchProfile"&&<Field label="Profile"><Select value={a.payload.profileId??profiles[0]?.id??""} onChange={(v)=>setPayload({profileId:v})} options={profiles.map((p)=>({value:p.id,label:p.name}))}/></Field>}
    {a.type==="showNotification"&&<><Field label="Title"><Input value={a.payload.notificationTitle??""} onChange={(e)=>setPayload({notificationTitle:e.target.value})}/></Field><Field label="Body"><Input value={a.payload.notificationBody??""} onChange={(e)=>setPayload({notificationBody:e.target.value})}/></Field></>}
    {a.type==="delay"&&<Field label="Wait milliseconds"><Input type="number" value={a.payload.delayMs??500} onChange={(e)=>setPayload({delayMs:Number(e.target.value)})}/></Field>}
    {a.type==="multiAction"&&<Field label="Actions in sequence" group><ActionListEditor actions={a.payload.actions??[]} onChange={(list)=>setPayload({actions:list})} depth={depth+1}/></Field>}
    {a.type==="showPopup"&&<PopupItemsEditor items={a.payload.popupItems??[]} onChange={(items)=>setPayload({popupItems:items})}/>} 
    {a.type==="screenshot"&&<Field label="Screenshot mode"><Select value={a.payload.screenshotMode??"snipOverlay"} onChange={(v)=>setPayload({screenshotMode:v as any})} options={[{value:"snipOverlay",label:"Snipping overlay (default)"},{value:"fullscreenClip",label:"Copy full screen to clipboard"},{value:"fullscreenSave",label:"Save full screen to Pictures"}]}/></Field>}
    {a.type==="alwaysOnTop"&&<div className="grid cols-2"><Field label="Mode"><Select value={a.payload.topmostMode??"toggle"} onChange={(v)=>setPayload({topmostMode:v as any})} options={[{value:"toggle",label:"Toggle on/off"},{value:"pin",label:"Pin on top"},{value:"unpin",label:"Remove from top"}]}/></Field><Field label="Highlight"><Select value={a.payload.highlight!==false?"yes":"no"} onChange={(v)=>setPayload({highlight:v==="yes"})} options={[{value:"yes",label:"Colored border"},{value:"no",label:"No highlight"}]}/></Field></div>}
    {a.type==="moveWindow"&&<Field label="Direction"><Select value={a.payload.direction??"left"} onChange={(v)=>setPayload({direction:v as any})} options={[{value:"left",label:"Left"},{value:"right",label:"Right"}]}/></Field>}
  </div></div>;
}

function PopupItemsEditor({ items, onChange }: { items:PopupItem[]; onChange:(i:PopupItem[])=>void }) {
  const add=()=>onChange([...items,{id:uid("pop"),label:"New item",icon:"command",category:"General",actions:[defaultAction("showNotification")]}]);
  const update=(i:number,it:PopupItem)=>onChange(items.map((x,idx)=>idx===i?it:x)); const remove=(i:number)=>onChange(items.filter((_,idx)=>idx!==i));
  return <div className="popup-editor"><div className="muted tiny">Popup menu items</div>{items.map((it,i)=><div key={it.id} className="popup-edit-item"><div className="grid cols-3"><Input value={it.label} placeholder="Label" onChange={(e)=>update(i,{...it,label:e.target.value})}/><Input value={it.category??""} placeholder="Category" onChange={(e)=>update(i,{...it,category:e.target.value})}/><Input value={it.icon??"command"} placeholder="Icon" onChange={(e)=>update(i,{...it,icon:e.target.value})}/></div><ActionListEditor actions={it.actions} onChange={(list)=>update(i,{...it,actions:list})} depth={2}/><Button variant="ghost" size="sm" icon="trash" onClick={()=>remove(i)}>Remove item</Button></div>)}<Button variant="secondary" size="sm" icon="create" onClick={add}>Add item</Button></div>;
}
