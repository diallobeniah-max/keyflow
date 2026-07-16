import { Settings } from "../types";

export function createDefaultSettings(): Settings {
  return {
    general: {
      launchOnStartup: false,
      startMinimized: false,
      minimizeToTray: true,
      showNotifications: true,
      soundFeedback: false,
      showRecentOnDashboard: true,
      defaultProfileId: "prof-default",
      language: "English",
    },
    appearance: {
      theme: "dark",
      accent: "#4F7CFF",
      compactMode: false,
      reduceMotion: false,
      popupBlur: true,
      radiusIntensity: 1,
      uiScale: "100",
      fontSize: "normal",
    },
    shortcuts: {
      globalPause: "Ctrl+Shift+P",
      emergencySafe: "Ctrl+Shift+K",
      defaultDoubleTap: 300,
      defaultTripleTap: 420,
      defaultHold: 600,
      keyRepeatProtection: true,
      preventAccidental: true,
      allowRisky: false,
      hyperKeyEnabled: true,
      hyperKey: "CapsLock",
      hyperKeyOutput: "Ctrl+Alt+Shift+Win",
    },
    popup: {
      position: "cursor",
      size: "comfortable",
      showIcons: true,
      showNumbers: true,
      search: true,
      closeAfterAction: true,
      animationSpeed: 160,
      opacity: 0.96,
      maxItems: 8,
    },
    profiles: {
      defaultProfileId: "prof-default",
      enableAppProfiles: true,
      autoSwitchByApp: true,
    },
    privacy: {
      showPrivacy: true,
      pauseInPassword: true,
      blacklistedApps: [],
      safeMode: false,
    },
    data: {
      storageType: "json",
      dataLocation: "%APPDATA%/keyflow/keyflow-state.json",
    },
    advanced: {
      debugLogs: false,
      hookMode: "Low-level Windows hooks",
      performanceMode: false,
      portableMode: false,
    },
  };
}
