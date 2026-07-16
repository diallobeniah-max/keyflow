import { useState } from "react";
import { useStore } from "../store/useStore";
import { Button, Card } from "../components/ui";
import { Icon } from "../components/Icon";

const slides = [
  { title: "Welcome to KeyFlow", icon: "logo", text: "Turn ordinary keys into smart Tap Actions for apps, text snippets, commands, popup menus, and workflows." },
  { title: "Tap Actions", icon: "key", text: "Use single tap, double tap, triple tap, long press, combos, and sequences with custom timing." },
  { title: "Private by design", icon: "shield", text: "KeyFlow is local-only. It does not save typed words or upload data." },
  { title: "Profiles", icon: "profiles", text: "Create different shortcut sets for coding, design, gaming, school, browser work, and editing." },
  { title: "Try the simulator", icon: "play", text: "Browser mode lets you test the UI and timing engine now. The real Windows build adds global hooks." },
];
export function Onboarding(){ const done=useStore((s)=>s.finishOnboarding); const [i,setI]=useState(0); const s=slides[i]; return <div className="onboarding"><Card className="onboarding-card"><span className="onboarding-icon"><Icon name={s.icon} size={34}/></span><h1>{s.title}</h1><p>{s.text}</p><div className="dots">{slides.map((_,idx)=><span key={idx} className={idx===i?"active":""}/>)}</div><div className="spread"><Button variant="ghost" onClick={done}>Skip</Button>{i<slides.length-1?<Button variant="primary" icon="arrowRight" onClick={()=>setI(i+1)}>Next</Button>:<Button variant="primary" icon="check" onClick={done}>Open dashboard</Button>}</div></Card></div> }
