import { useEffect } from "react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { PopupMenu } from "./components/PopupMenu";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastHost } from "./components/ui";
import { GlobalTooltip } from "./components/GlobalTooltip";
import { Dashboard } from "./pages/Dashboard";
import { Shortcuts } from "./pages/Shortcuts";
import { CreateShortcut } from "./pages/CreateShortcut";
import { VisualKeyboard } from "./pages/VisualKeyboard";
import { ActionLibrary } from "./pages/ActionLibrary";
import { Profiles } from "./pages/Profiles";
import { Settings } from "./pages/Settings";
import { NotesSettingsPage } from "./pages/NotesSettingsPage";
import { Onboarding } from "./pages/Onboarding";
import { PopupShell } from "./components/PopupShell";
import { NotesPopupShell } from "./components/NotesPopupShell";
import { DragSwitcherOverlay } from "./pages/DragSwitcherOverlay";
import { ScreenTintOverlay } from "./pages/ScreenTintOverlay";
import { useStore } from "./store/useStore";
import { useActiveApp } from "./lib/useActiveApp";

function isPopupWindow(): boolean {
  return window.location.search.includes("window=popup");
}

function isNotesWindow(): boolean {
  return window.location.search.includes("window=notes");
}

function isDragSwitcherWindow(): boolean {
  return window.location.search.includes("window=drag-switcher");
}

function isScreenTintWindow(): boolean {
  return window.location.search.includes("window=screen-tint");
}

function Router() {
  const page = useStore((s) => s.currentPage);
  return (
    <div key={page} className="page-transition-wrap anim-page-enter">
      {(() => {
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
          case "notes":
            return <NotesSettingsPage />;
          default:
            return <Dashboard />;
        }
      })()}
    </div>
  );
}

export default function App() {
  if (isPopupWindow()) return <><GlobalTooltip /><PopupShell /></>;
  if (isNotesWindow()) return <><GlobalTooltip /><NotesPopupShell /></>;
  if (isDragSwitcherWindow()) return <><GlobalTooltip /><DragSwitcherOverlay /></>;
  if (isScreenTintWindow()) return <><GlobalTooltip /><ScreenTintOverlay /></>;

  const onboardingDone = useStore((s) => s.data.onboardingDone);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const setDrawerOpen = useStore((s) => s.setDrawerOpen);
  const appearance = useStore((s) => s.data.settings.appearance);

  useActiveApp();

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

  const wasdNavigationActive = useStore((s) => s.wasdNavigationActive);
  const wasdSettings = useStore((s) => s.data.settings?.wasdNavigation);

  useEffect(() => {
    if (wasdNavigationActive) {
      const activeId = wasdSettings?.activeCursorId ?? "default";
      const customItem = wasdSettings?.customCursors?.find((c) => c.id === activeId);
      const customPath = customItem?.dataUrl || wasdSettings?.customCursorPath;
      const cursorUrl = customPath
        ? (customPath.startsWith("data:") ? `url("${customPath}") 0 0, auto` : `url("file://${customPath.replace(/\\/g, "/")}") 0 0, auto`)
        : `url("/cursors/blue-cursor.png") 5 2, auto`;
      document.documentElement.style.setProperty("--wasd-cursor", cursorUrl);
      document.documentElement.classList.add("blue-cursor-active");
    } else {
      document.documentElement.classList.remove("blue-cursor-active");
      document.documentElement.style.removeProperty("--wasd-cursor");
    }
  }, [wasdNavigationActive, wasdSettings?.activeCursorId, wasdSettings?.customCursors, wasdSettings?.customCursorPath]);

  return (
    <div className="app-shell" data-font-size={appearance?.fontSize ?? "default"}>
      <GlobalTooltip />
      <TitleBar />
      <div className={`app-body${appearance?.navigationLayout === "horizontal" ? " is-horizontal-nav" : ""}`}>
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
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </main>
      </div>
      <PopupMenu />
      <ErrorBoundary>
        <CommandPalette />
      </ErrorBoundary>
      <ToastHost />
      {!onboardingDone && <Onboarding />}
    </div>
  );
}
