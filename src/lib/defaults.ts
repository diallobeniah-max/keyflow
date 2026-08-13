import type { Action, ModifierKey, Settings, Shortcut, TriggerType } from "../types/index.js";

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
      fontSize: "default",
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
      hyperKeyConfig: {
        enabled: false,
        key: "AltRight",
        tapActionId: undefined,
        suppressOriginal: true,
      },
      typingProtection: "balanced",
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
      extendedAccess: false,
    },
    windowControl: {
      defaultTopmostMode: "toggle",
      highlightPinned: true,
      highlightColor: "#4F7CFF",
      borderThickness: "medium",
      customThickness: 4,
      soundFeedback: true,
      showFloatingPin: false,
    },
  };
}

/**
 * Canonical resolver for default key behavior (pass-through vs suppress).
 * Normal users do not need to configure this manually.
 *
 * Rules:
 * - CapsLock assigned to custom actions (e.g. Screenshot, Hyper Key) defaults to "suppress"
 *   so the physical Caps Lock toggle is consumed and doesn't switch on.
 * - Standard alphanumeric keys (A-Z, 0-9) on multi-tap (e.g. Double-tap F) default to "passThrough"
 *   so ordinary typing is never suppressed.
 * - Combos and mouse buttons always pass through.
 * - Other normal shortcuts default to "passThrough".
 */
export function resolveDefaultKeyBehavior(
  key?: string,
  trigger?: TriggerType,
  _actions?: Action[],
  modifiers?: ModifierKey[],
): "passThrough" | "suppress" | "disable" | "remap" {
  if (modifiers && modifiers.length > 0) {
    return "passThrough";
  }
  const k = (key ?? "").trim().toLowerCase();
  if (k === "capslock") {
    return "suppress";
  }
  // Letters/numbers with multi-tap or hold: pass through so typing works
  return "passThrough";
}

/**
 * Resolves the effective behavior of a shortcut, honoring explicit overrides
 * or falling back to the canonical default resolver.
 */
export function resolveShortcutBehavior(
  shortcut: Partial<Shortcut>,
): "passThrough" | "suppress" | "disable" | "remap" {
  if (shortcut.keyBehavior) {
    return shortcut.keyBehavior;
  }
  if (shortcut.suppressKey) {
    return "suppress";
  }
  return resolveDefaultKeyBehavior(shortcut.key, shortcut.trigger, shortcut.actions, shortcut.modifiers);
}
