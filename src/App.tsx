import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
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
import { PopupShell } from "./components/PopupShell";
import { NotesPopupShell } from "./components/NotesPopupShell";
import { useStore } from "./store/useStore";

function isPopupWindow(): boolean {
  return window.location.search.includes("window=popup");
}

function isNotesWindow(): boolean {
  return window.location.search.includes("window=notes");
}

function Router() {
  const page = useStore((s) => s.currentPage);
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "shortcuts":
      return <Shortcuts />;
    case "create":
      return <CreateShortcut />;
    case "visual":
      return <VisualKeyboard />;
    case "library":
      return <ActionLibrary />;
    case "profiles":
      return <Profiles />;
    case "settings":
      return <Settings />;
    default:
      return <Dashboard />;
  }
}

export default function App() {
  if (isPopupWindow()) return <PopupShell />;
  if (isNotesWindow()) return <NotesPopupShell />;

  const onboardingDone = useStore((s) => s.data.onboardingDone);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const appearance = useStore((s) => s.data.settings.appearance);

  useEffect(() => {
    const fontSize = appearance?.fontSize ?? "default";
    document.documentElement.setAttribute("data-font-size", fontSize);
  }, [appearance?.fontSize]);

  useEffect(() => {
    if (appearance?.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [appearance?.reduceMotion]);

  return (
    <div className="app-shell" data-font-size={appearance?.fontSize ?? "default"}>
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        {drawerOpen && (
          <div
            className="drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
        )}
        <main className="main">
          <TopBar />
          <Router />
        </main>
      </div>
      <PopupMenu />
      <ToastHost />
      {!onboardingDone && <Onboarding />}
    </div>
  );
}
