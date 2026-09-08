import type { Action, ModifierKey, PopupItem, Settings, Shortcut, TriggerType } from "../types/index.ts";
import { SCREEN_TINT_DEFAULT_COLOR } from "./constants.ts";

/**
 * Default editable popup menu. Mirrors the out-of-the-box menu so new users
 * see the same items the sample shortcuts used to embed.
 */
export function createDefaultPopupItems(): PopupItem[] {
  return [
    { id: "pop-code", label: "Open VS Code", icon: "terminal", category: "Launch", key: "1", enabled: true, actions: [{ id: "act-pop-code", type: "openApp", payload: { path: "code" } }] },
    { id: "pop-docs", label: "Open Docs Folder", icon: "folder", category: "Folders", key: "2", enabled: true, actions: [{ id: "act-pop-docs", type: "openFolder", payload: { path: "%USERPROFILE%\\Documents" } }] },
    { id: "pop-note", label: "Paste email sign-off", icon: "clipboard", category: "Text", key: "3", enabled: true, actions: [{ id: "act-pop-note", type: "pasteText", payload: { text: "Best regards,\nBeniah" } }] },
    { id: "pop-search", label: "Open Google", icon: "globe", category: "Web", key: "4", enabled: true, actions: [{ id: "act-pop-search", type: "openWebsite", payload: { url: "https://google.com" } }] },
  ];
}

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
      topHighlightColor: "#6A91FF",
      compactMode: false,
      reduceMotion: false,
      popupBlur: true,
      radiusIntensity: 1,
      uiScale: "100",
      fontSize: "default",
      backdropMaterial: "mica",
      headerAccentTint: "subtle",
      headerAccentFit: "full",
      appIcon: "monochrome",
      syncAccentWithAppIcon: false,
      showHoverHelp: true,
      colorCodedSettings: true,
      settingsWidth: "large",
      sidebarCollapsed: false,
      dockTooltips: true,
      dockLabelMode: "active",
      lockWindowSize: false,
    },
    shortcuts: {
      globalPause: "Ctrl+Shift+P",
      emergencySafe: "Ctrl+Shift+K",
      commandPaletteEnabled: true,
      commandPaletteShortcut: "Ctrl+K",
      clipboardShortcutEnabled: true,
      clipboardShortcut: "Win+V",
      commandPaletteShowCategories: true,
      commandPaletteMaxResults: 8,
      commandPaletteWindowMode: "expanded",
      commandPalettePosition: "center",
      commandPaletteDefaultShowMore: false,
      commandPaletteSideViewEnabled: true,
      commandPaletteDetailLevel: "detailed",
      altCapsLockBypass: true,
      defaultDoubleTap: 300,
      defaultTripleTap: 420,
      defaultHold: 600,
      keyRepeatProtection: true,
      preventAccidental: true,
      allowRisky: false,
      hyperKeyEnabled: true,
      hyperKey: "AltRight",
      hyperKeyOutput: "Hyper",
      hyperKeyConfig: {
        enabled: true,
        key: "AltRight",
        includeShift: false,
        tapActionId: "showPopup",
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
      closeOnBlur: true,
      animationSpeed: 160,
      opacity: 0.96,
      maxItems: 8,
      items: createDefaultPopupItems(),
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
      autoBackupEnabled: false,
      autoBackupPath: "",
      autoBackupIntervalMinutes: 360,
    },
    advanced: {
      debugLogs: false,
      hookMode: "Low-level Windows hooks",
      performanceMode: false,
      portableMode: false,
      extendedAccess: false,
    },
    audio: {
      enabled: true,
      volume: 80,
      soundPack: "crystal",
      playOnPopup: true,
      playOnTopmost: true,
      playOnNavigation: true,
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
    dragSwitcher: {
      enabled: false,
      zones: 0x02,
      activationMs: 250,
      hoverMs: 400,
      cornerSize: 16,
      preset: "topRight",
    },
    hotCorners: {
      enabled: false,
      activationMs: 400,
      cooldownMs: 800,
      cornerSize: 24,
      soundEnabled: true,
      corners: {
        topLeft: { type: "builtin", action: "none" },
        topRight: { type: "builtin", action: "none" },
        bottomLeft: { type: "builtin", action: "none" },
        bottomRight: { type: "builtin", action: "none" },
      },
      customPresets: [],
    },
    screenTint: {
      enabled: false,
      color: SCREEN_TINT_DEFAULT_COLOR,
      strength: 18,
      preset: "warm",
    },
    wasdNavigation: {
      cursorSize: 32,
      showStateCard: false,
    },
    notes: {
      saveLocation: "",
      autoSaveIntervalMs: 300,
      showWordCount: true,
      showCharCount: true,
      fontSize: "default",
      spellCheck: true,
      windowSizePreset: "comfortable",
      followMouseOnOpen: true,
    },
    smoothScroll: {
      enabled: true,
      preset: "smooth",
      stepSize: 100,
      animationTime: 280,
      accelerationEnabled: true,
      accelerationDelta: 50,
      accelerationMax: 3,
      keyboardScrolling: false,
      horizontalScrolling: true,
      trackpadPassThrough: true,
      customPresets: [],
    },
    dimScreen: {
      enabled: false,
      level: 30,
      extraDimEnabled: false,
      extraDimStrength: 40,
      applyTo: "all",
      selectedDisplayIds: [],
      startEnabled: false,
      rememberLevel: true,
    },
    mediaPlayer: {
      enabled: false,
      position: "top-center",
      autoHide: false,
    },
    hyperGestures: {
      enabled: false,
      activationThreshold: 24,
      tapToEnterMode: false,
      showTrail: true,
      gestures: [
        { id: "hg-up", name: "Maximize / Up", stroke: "U", actionId: "act-maximize", enabled: true },
        { id: "hg-down", name: "Minimize / Down", stroke: "D", actionId: "act-minimize", enabled: true },
        { id: "hg-left", name: "Snap Left", stroke: "L", actionId: "act-snap-left", enabled: true },
        { id: "hg-right", name: "Snap Right", stroke: "R", actionId: "act-snap-right", enabled: true },
        { id: "hg-close", name: "Close Window", stroke: "DR", actionId: "act-close-window", enabled: true },
      ],
    },
    touchpadDrag: {
      enabled: false,
      cursorMove: true,
      speed: 30,
      acceleration: 10,
      startThreshold: 100,
      stopThreshold: 10,
      releaseDelayMs: 500,
      allowReleaseAndRestart: true,
      maxFingerDistance: 150,
      cursorAveraging: 1,
    },
  };
}

/** Standard preset configurations for factory resets and preset switching. */
export const DEFAULT_SMOOTH_SCROLL_PRESETS: Record<string, {
  stepSize: number;
  animationTime: number;
  accelerationEnabled: boolean;
  accelerationDelta: number;
  accelerationMax: number;
}> = {
  smooth: {
    stepSize: 100,
    animationTime: 280,
    accelerationEnabled: true,
    accelerationDelta: 50,
    accelerationMax: 3,
  },
  silky: {
    stepSize: 100,
    animationTime: 450,
    accelerationEnabled: true,
    accelerationDelta: 50,
    accelerationMax: 2,
  },
  fast: {
    stepSize: 100,
    animationTime: 160,
    accelerationEnabled: true,
    accelerationDelta: 40,
    accelerationMax: 4,
  },
};

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
  if (modifiers && modifiers.some((m) => /^(win|meta)$/i.test(String(m)))) {
    return "suppress";
  }
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
  if (shortcut.modifiers && shortcut.modifiers.some((m) => /^(win|meta)$/i.test(String(m)))) {
    if (shortcut.keyBehavior === "disable" || shortcut.keyBehavior === "remap") {
      return shortcut.keyBehavior;
    }
    return "suppress";
  }
  if (shortcut.keyBehavior) {
    return shortcut.keyBehavior;
  }
  if (shortcut.suppressKey) {
    return "suppress";
  }
  return resolveDefaultKeyBehavior(shortcut.key, shortcut.trigger, shortcut.actions, shortcut.modifiers);
}

/** Idempotently migrate legacy Windows-key shortcuts from passThrough to suppress */
export function migrateWindowsShortcuts(shortcuts: Shortcut[]): Shortcut[] {
  return (shortcuts ?? []).map((s) => {
    if (!s || !s.modifiers || s.modifiers.length === 0) return s;
    const hasWin = s.modifiers.some((m) => /^(win|meta)$/i.test(String(m)));
    if (hasWin) {
      if (s.keyBehavior === "disable" || s.keyBehavior === "remap") {
        return s;
      }
      if (s.keyBehavior !== "suppress" || !s.suppressKey) {
        return {
          ...s,
          keyBehavior: "suppress",
          suppressKey: true,
        };
      }
    }
    return s;
  });
}

/**
 * Detects whether a legacy persisted state (which lacked `onboardingDone`)
 * represents an established Keyflow user rather than a blank/new initialization.
 */
export function isLegacyEstablishedUser(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const state = raw as Record<string, any>;

  // Established users have one or more configured shortcuts
  if (Array.isArray(state.shortcuts) && state.shortcuts.length > 0) {
    return true;
  }

  // Established users have custom profiles or application rules
  if (Array.isArray(state.profiles)) {
    if (state.profiles.length > 1) return true;
    if (state.profiles.some((p: any) => p && Array.isArray(p.appRules) && p.appRules.length > 0)) {
      return true;
    }
  }

  // Established users have an execution history
  if (Array.isArray(state.recent) && state.recent.length > 0) {
    return true;
  }

  // Established users have custom library actions
  if (Array.isArray(state.library) && state.library.length > 0) {
    return true;
  }

  return false;
}

/**
 * Resolves the effective onboarding status for a loaded persisted state.
 *
 * Rules:
 * 1. If `onboardingDone` is explicitly boolean, respect it strictly (never overwrite `false`).
 * 2. If `onboardingDone` is missing/undefined (legacy schema), evaluate whether
 *    the state contains established user artifacts (shortcuts, profiles, recents).
 * 3. Genuinely blank/empty states default to false so onboarding is shown.
 */
export function resolveOnboardingDone(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const state = raw as Record<string, any>;

  if (typeof state.onboardingDone === "boolean") {
    return state.onboardingDone;
  }

  return isLegacyEstablishedUser(raw);
}

/** Idempotently migrate legacy CASH ("Ctrl+Alt+Shift+Win") shortcuts to canonical native ["Hyper"] */
export function migrateHyperShortcuts(shortcuts: Shortcut[]): Shortcut[] {
  return (shortcuts ?? []).map((s) => {
    if (!s || !s.modifiers || s.modifiers.length === 0) return s;
    const norm = [...s.modifiers].map((m) => String(m).toLowerCase()).sort().join(",");
    if (norm === "alt,ctrl,shift,win" || (s.name && s.name.toLowerCase().includes("hyper") && norm.includes("ctrl") && norm.includes("win"))) {
      return {
        ...s,
        modifiers: ["Hyper"],
      };
    }
    return s;
  });
}

/** Idempotently migrate legacy or malformed "None" hyper config to canonical "AltRight" default */
export function migrateHyperConfig(current?: Partial<import("../types/index.js").HyperKeyConfig>): import("../types/index.js").HyperKeyConfig {
  const def = {
    enabled: true,
    key: "AltRight",
    includeShift: false,
    tapActionId: "showPopup",
    suppressOriginal: true,
  };
  if (!current) return def;
  const rawKey = (current.key ?? "").trim();
  // An explicit None is a supported opt-out. Only a missing/undefined key is
  // migrated to the safe Right Alt default for older persisted settings.
  const isExplicitNone = rawKey.toLowerCase() === "none";
  const isInvalidKey = !rawKey || rawKey.toLowerCase() === "undefined";
  if (isExplicitNone) {
    return {
      enabled: current.enabled ?? true,
      key: "None",
      includeShift: !!current.includeShift,
      tapActionId: current.tapActionId ?? "showPopup",
      suppressOriginal: current.suppressOriginal ?? true,
    };
  }
  if (isInvalidKey) {
    return {
      enabled: current.enabled ?? true,
      key: "AltRight",
      includeShift: !!current.includeShift,
      tapActionId: current.tapActionId ?? "showPopup",
      suppressOriginal: true,
    };
  }
  return {
    enabled: current.enabled ?? true,
    key: current.key || "AltRight",
    includeShift: !!current.includeShift,
    tapActionId: current.tapActionId ?? "showPopup",
    suppressOriginal: current.suppressOriginal ?? true,
  };
}

/** Translate semantic Hyper modifier token to actual Windows native modifier tokens */
export function compileHyperModifiers(modifiers: string[], includeShift = false): string[] {
  const hasHyper = (modifiers ?? []).some((m) => String(m).toLowerCase() === "hyper");
  if (!hasHyper) return (modifiers ?? []).map((m) => String(m).toLowerCase());

  const effectiveHyper = includeShift
    ? ["ctrl", "alt", "shift", "win"]
    : ["ctrl", "alt", "win"];

  const outSet = new Set<string>();
  for (const m of modifiers) {
    const lower = String(m).toLowerCase();
    if (lower === "hyper") {
      for (const h of effectiveHyper) outSet.add(h);
    } else {
      outSet.add(lower);
    }
  }
  return Array.from(outSet);
}

const MODIFIER_HYPER_KEY_NAMES = new Set([
  "alt", "ctrl", "control", "shift", "win", "meta",
  "altright", "rightalt", "ralt", "altgr", "altleft", "leftalt", "lalt",
  "controlright", "rightcontrol", "ctrlright", "rightctrl", "rctrl",
  "controlleft", "leftcontrol", "ctrlleft", "leftctrl", "lctrl",
  "shiftright", "rightshift", "rshift", "shiftleft", "leftshift", "lshift",
  "winright", "rightwin", "rwin", "winleft", "leftwin", "lwin",
]);

/** Raycast parity: modifier Hyper keys (Ctrl/Alt/Shift/Win variants) cannot
 * have a Quick Press / tap action. Only Caps Lock / function-key Hyper keys
 * can. */
export function isModifierHyperKeyName(key?: string): boolean {
  if (!key) return false;
  return MODIFIER_HYPER_KEY_NAMES.has(key.trim().toLowerCase().replace(/[\s\-_]/g, ""));
}

/**
 * Idempotent popup-menu migration: when the editable config has no items yet,
 * seed it from the user's first popup shortcut so their existing menu is
 * preserved. Never overwrites a configured menu.
 */
export function migratePopupMenuItems(settings: Settings, shortcuts: Shortcut[] | undefined): Settings {
  if (settings.popup?.items && settings.popup.items.length > 0) return settings;
  const seeded = (shortcuts ?? []).find((sc) =>
    sc?.actions?.some((a) => a.type === "showPopup" && Array.isArray(a.payload?.popupItems) && (a.payload?.popupItems as any[]).length > 0),
  );
  const items = seeded?.actions?.find((a) => a.type === "showPopup")?.payload?.popupItems as PopupItem[] | undefined;
  if (!Array.isArray(items) || items.length === 0) return settings;
  return {
    ...settings,
    popup: { ...settings.popup, items: items.map((it) => ({ ...it, enabled: it.enabled !== false })) },
  };
}
