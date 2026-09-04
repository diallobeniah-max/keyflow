import { useEffect, useState, type FC } from "react";
import { useStore } from "../store/useStore";
import { PageIntro } from "../components/ui";
import { Icon } from "../components/Icon";
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
import { AppIconPage } from "./settings/AppIconPage";
import { PopupMenuPage } from "./settings/PopupMenuPage";
import { PrivacyPage } from "./settings/PrivacyPage";
import { BackupPage } from "./settings/BackupPage";
import { AdvancedPage } from "./settings/AdvancedPage";
import { AboutPage } from "./settings/AboutPage";

export function Settings() {
  const settings = useStore((s) => s.data.settings);
  const focusTarget = useStore((s) => s.settingsFocusTarget);
  const setFocusTarget = useStore((s) => s.setSettingsFocusTarget);
  const patchSettings = useStore((s) => s.patchSettings);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>("appBehavior");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

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
      case "commandPalette":
        return <CommandPalettePage {...props} />;
      case "wasd":
        return <WasdPage {...props} />;
      case "hotCorners":
        return <HotCornersPage {...props} />;
      case "alwaysOnTop":
        return <AlwaysOnTopPage {...props} />;
      case "appearance":
        return <AppearancePage {...props} />;
      case "screenTint":
        return <ScreenTintPage {...props} />;
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
    <div className="content">
      <div className={`settings-view-container is-width-${settingsWidth}`}>
        <PageIntro
          eyebrow="PREFERENCES"
          title="Settings"
          description="Configure desktop behaviors, visual appearance, gesture timings, and privacy settings."
        />

        {/* Fast search entry for Settings and Command Palette */}
        <div className="settings-search-wrapper mb-md">
          <div className="settings-search-box">
            <Icon name="search" size={16} className="settings-search-icon" />
            <button
              type="button"
              className="settings-search-input settings-search-command-trigger"
              aria-label="Search all commands and settings"
              title="Search all commands and settings (Ctrl+K)"
              onClick={openCommandPalette}
            >
              Search commands and settings…
            </button>
            <button
              type="button"
              className="settings-search-palette-badge"
              title="Open full Command Palette (Ctrl+K)"
              onClick={openCommandPalette}
            >
              <Icon name="command" size={12} />
              <span>Ctrl+K</span>
            </button>
          </div>
        </div>

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
          />

          {/* Right Settings Detail Content */}
          <main key={activeSection} className="settings-content">
            {renderActivePage()}
          </main>
        </div>
      </div>
    </div>
  );
}
