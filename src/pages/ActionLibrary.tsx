import { useState } from "react";
import { useStore } from "../store/useStore";
import { Action } from "../types";
import { uid } from "../store/sampleData";
import { ACTION_META } from "../lib/constants";
import { runAction } from "../lib/actions";
import { ActionListEditor } from "../components/ActionEditor";
import { Button, Card, Modal, PageIntro } from "../components/ui";
import { Icon } from "../components/Icon";

export function ActionLibrary(){ const library=useStore((s)=>s.data.library); const add=useStore((s)=>s.addLibraryAction); const remove=useStore((s)=>s.removeLibraryAction); const [open,setOpen]=useState(false); const [draft,setDraft]=useState<Action[]>([{id:uid("act"),type:"openWebsite",payload:{url:"https://"}}]); const save=()=>{ if(draft[0]) add(draft[0]); setOpen(false); }; return <div className="content"><PageIntro eyebrow="reusable pieces" title="Action library" description="Save reusable actions such as websites, text snippets, media controls, brightness controls, and command templates. Add them to shortcuts later instead of recreating them."><Button variant="primary" icon="create" onClick={()=>setOpen(true)}>New action</Button></PageIntro><div className="grid cards-grid library-grid">{library.map((a)=>{ const meta=ACTION_META[a.type]; return <Card key={a.id} hover><div className="spread"><span className="small-icon"><Icon name={meta.icon} size={18}/></span><div className="row tiny-gap"><Button size="sm" variant="ghost" icon="play" onClick={()=>void runAction(a)}>Run</Button><Button size="sm" variant="ghost" icon="trash" onClick={()=>remove(a.id)}>Remove</Button></div></div><h3>{a.label??meta.label}</h3><p className="muted tiny">{meta.category} · {a.payload.path||a.payload.url||a.payload.text||a.payload.shortcut||a.payload.media||a.payload.brightness||"Reusable action"}</p></Card>})}</div><Modal open={open} onClose={()=>setOpen(false)} title="New library action" width={640} footer={<><Button variant="secondary" onClick={()=>setOpen(false)}>Cancel</Button><Button variant="primary" onClick={save}>Save action</Button></>}><ActionListEditor actions={draft} onChange={setDraft}/></Modal></div>; }
