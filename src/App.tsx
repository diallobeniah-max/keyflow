import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { PopupMenu } from "./components/PopupMenu";
import { ToastHost } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Shortcuts } from "./pages/Shortcuts";
import { CreateShortcut } from "./pages/CreateShortcut";
import { VisualKeyboard } from "./pages/VisualKeyboard";
import { ActionLibrary } from "./pages/ActionLibrary";
import { Profiles } from "./pages/Profiles";
import { Settings } from "./pages/Settings";
import { Onboarding } from "./pages/Onboarding";
import { useStore } from "./store/useStore";

function Router(){
  const page=useStore((s)=>s.currentPage);
  switch(page){
    case "dashboard": return <Dashboard/>;
    case "shortcuts": return <Shortcuts/>;
    case "create": return <CreateShortcut/>;
    case "visual": return <VisualKeyboard/>;
    case "library": return <ActionLibrary/>;
    case "profiles": return <Profiles/>;
    case "settings": return <Settings/>;
    default: return <Dashboard/>;
  }
}

export default function App(){
  const onboardingDone=useStore((s)=>s.data.onboardingDone);
  const drawerOpen=useStore((s)=>s.drawerOpen);
  const setDrawerOpen=useStore((s)=>s.setDrawerOpen);
  return <div className="app-shell"><Sidebar/>{
    drawerOpen && <div className="drawer-backdrop" onClick={()=>setDrawerOpen(false)} aria-hidden="true"/>
  }<main className="main"><TopBar/><Router/></main><PopupMenu/><ToastHost/>{!onboardingDone&&<Onboarding/>}</div>;
}
