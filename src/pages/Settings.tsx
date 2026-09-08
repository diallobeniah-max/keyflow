import { useEffect, useRef, useState, type FC } from "react";
import { useStore } from "../store/useStore";
import { useSmoothScroll } from "../hooks/useSmoothScroll";
import { SettingsSidebar } from "./settings/SettingsSidebar";
import { resolveSettingsSectionId, type SettingsSectionId } from "./settings/types";

// Dedicated Detail Pages
import { AppBehaviorPage } from "./settings/AppBehaviorPage";
import { NotificationsPage } from "./settings/NotificationsPage";
import { KeyboardPage } from "./settings/KeyboardPage";
import { CommandPalettePage } from "./settings/CommandPalettePage";
import { WasdPage } from "./settings/WasdPage";
import { HotCornersPage } from "./settings/HotCornersPage";
import { AlwaysOnTopPage } from "./settings/AlwaysOnTopPage";
import { AppearancePage } from "./settings/AppearancePage";
import { ScreenTintPage } from "./settings/ScreenTintPage";
import { DimScreenPage } from "./settings/DimScreenPage";
import { AppIconPage } from "./settings/AppIconPage";
import { PopupMenuPage } from "./settings/PopupMenuPage";
import { PrivacyPage } from "./settings/PrivacyPage";
import { BackupPage } from "./settings/BackupPage";
import { AdvancedPage } from "./settings/AdvancedPage";
import { AboutPage } from "./settings/AboutPage";
import { ShortcutBindingPage } from "./settings/ShortcutBindingPage";
import { GesturesTrackpadPage } from "./settings/GesturesTrackpadPage";
import { SmoothScrollPage } from "./settings/SmoothScrollPage";
import { MediaPlayerPage } from "./settings/MediaPlayerPage";

export function Settings() {
  const settings = useStore((s) => s.data.settings);
  const focusTarget = useStore((s) => s.settingsFocusTarget);
  const setFocusTarget = useStore((s) => s.setSettingsFocusTarget);
  const patchSettings = useStore((s) => s.patchSettings);

  const activeSection = (useStore((s) => s.activeSettingsSection) as SettingsSectionId) || "appBehavior";
  const setActiveSection = useStore((s) => s.setActiveSettingsSection);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const settingsContentRef = useRef<HTMLElement>(null);
  useSmoothScroll(settingsContentRef, settings.smoothScroll);

  const [isContentScrolling, setIsContentScrolling] = useState(false);
  const contentScrollTimerRef = useRef<number | null>(null);

  const handleContentScroll = () => {
    setIsContentScrolling(true);
    if (contentScrollTimerRef.current !== null) {
      window.clearTimeout(contentScrollTimerRef.current);
    }
    contentScrollTimerRef.current = window.setTimeout(() => {
      setIsContentScrolling(false);
      contentScrollTimerRef.current = null;
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (contentScrollTimerRef.current !== null) {
        window.clearTimeout(contentScrollTimerRef.current);
      }
    };
  }, []);

  // Scroll right detail panel to top when switching sections (unless deep linking to an anchor)
  useEffect(() => {
    if (!focusTarget && settingsContentRef.current) {
      settingsContentRef.current.scrollTop = 0;
    }
  }, [activeSection, focusTarget]);

  // Handle deep-linking from Command Palette or Settings Search
  useEffect(() => {
    if (focusTarget) {
      const resolved = resolveSettingsSectionId(focusTarget.category);
      setActiveSection(resolved);
      setMobileDetailOpen(true);
      setTimeout(() => {
        const el = document.getElementById(focusTarget.anchorId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("setting-row-highlight");
          setTimeout(() => el.classList.remove("setting-row-highlight"), 1800);
        }
      }, 120);
      setFocusTarget(null);
    }
  }, [focusTarget, setFocusTarget]);

  const openCommandPalette = () => {
    window.dispatchEvent(new CustomEvent("keyflow:open-command-palette"));
  };

  const handleSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    setMobileDetailOpen(true);
  };

  const handleBackToRoot = () => {
    setMobileDetailOpen(false);
  };

  const isColorCoded = settings.appearance.colorCodedSettings !== false;

  const renderActivePage = () => {
    const props = { onBack: handleBackToRoot };
    switch (activeSection) {
      case "appBehavior":
        return <AppBehaviorPage {...props} />;
      case "notifications":
        return <NotificationsPage {...props} />;
      case "keyboard":
        return <KeyboardPage {...props} />;
      case "gesturesTrackpad":
        return <GesturesTrackpadPage {...props} />;
      case "commandPalette":
        return <CommandPalettePage {...props} />;
      case "shortcutBinding":
        return <ShortcutBindingPage {...props} />;
      case "wasd":
        return <WasdPage {...props} />;
      case "hotCorners":
        return <HotCornersPage {...props} />;
      case "alwaysOnTop":
        return <AlwaysOnTopPage {...props} />;
      case "appearance":
        return <AppearancePage {...props} />;
      case "smoothScroll":
        return <SmoothScrollPage {...props} />;
      case "screenTint":
        return <ScreenTintPage {...props} />;
      case "dimScreen":
        return <DimScreenPage {...props} />;
      case "mediaPlayer":
        return <MediaPlayerPage {...props} />;
      case "appIcon":
        return <AppIconPage {...props} />;
      case "popup":
        return <PopupMenuPage {...props} />;
      case "privacy":
        return <PrivacyPage {...props} />;
      case "backup":
        return <BackupPage {...props} />;
      case "advanced":
        return <AdvancedPage {...props} />;
      case "about":
        return <AboutPage {...props} />;
      default:
        return <AppBehaviorPage {...props} />;
    }
  };

  const settingsWidth = settings.appearance.settingsWidth || "large";
  const isNavCollapsed = settings.appearance.sidebarCollapsed ?? false;
  const toggleNavCollapse = () => {
    patchSettings("appearance", { sidebarCollapsed: !isNavCollapsed });
  };

  return (
    <div className="settings-root-container">
      <div className={`settings-view-container is-width-${settingsWidth}`}>
        <div
          className={`settings-layout is-width-${settingsWidth} ${isColorCoded ? "is-color-coded" : ""} ${
            isNavCollapsed ? "is-nav-collapsed" : ""
          } ${mobileDetailOpen ? "mobile-detail-open" : "mobile-root-open"}`}
        >
          {/* Left Category Navigation Menu */}
          <SettingsSidebar
            activeSection={activeSection}
            onSelectSection={handleSelectSection}
            isColorCoded={isColorCoded}
            settingsWidth={settingsWidth}
            isCollapsed={isNavCollapsed}
            onToggleCollapse={toggleNavCollapse}
            onOpenSearch={openCommandPalette}
          />

          {/* Right Settings Detail Content */}
          <main
            ref={settingsContentRef}
            className={`settings-content ${isContentScrolling ? "is-scrolling" : ""}`}
            data-scroll-owner="settings-detail"
            onScroll={handleContentScroll}
          >
            <div key={activeSection} className="settings-page-content-pane">
              {renderActivePage()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
