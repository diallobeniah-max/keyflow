export type ModifierKey = "Ctrl" | "Alt" | "Shift" | "Win";

export type TriggerType =
  | "single"
  | "double"
  | "triple"
  | "longPress"
  | "hold"
  | "combo"
  | "tapThenHold"
  | "sequence";

export type ActionType =
  | "openApp"
  | "openFile"
  | "openFolder"
  | "openWebsite"
  | "runCommand"
  | "runPowershell"
  | "runBatch"
  | "pasteText"
  | "typeText"
  | "pressShortcut"
  | "multiAction"
  | "volumeControl"
  | "mediaControl"
  | "toggleMute"
  | "brightnessControl"
  | "screenshot"
  | "lockScreen"
  | "openSettings"
  | "switchProfile"
  | "showPopup"
  | "showNotification"
  | "copySelected"
  | "clipboardHistory"
  | "minimizeWindow"
  | "maximizeWindow"
  | "closeWindow"
  | "moveWindow"
  | "alwaysOnTop"
  | "delay";

export interface ActionPayload {
  path?: string;
  args?: string;
  url?: string;
  text?: string;
  shortcut?: string;
  actions?: Action[];
  volume?: "up" | "down" | "mute" | "unmute" | "toggle" | number;
  media?: "playpause" | "play" | "pause" | "next" | "prev" | "stop";
  brightness?: "up" | "down" | number;
  settingsPage?: string;
  profileId?: string;
  popupItems?: PopupItem[];
  direction?: "left" | "right";
  delayMs?: number;
  script?: string;
  notificationTitle?: string;
  notificationBody?: string;
  screenshotMode?: "snipOverlay" | "fullscreenClip" | "windowClip" | "fullscreenSave";
  title?: string;
  topmostMode?: "toggle" | "pin" | "unpin";
  highlight?: boolean;
  highlightColor?: string;
  borderThickness?: "thin" | "medium" | "thick" | "custom";
  sound?: boolean;
}

export interface Action {
  id: string;
  type: ActionType;
  label?: string;
  payload: ActionPayload;
}

export interface PopupItem {
  id: string;
  label: string;
  icon?: string;
  actions: Action[];
  category?: string;
  pinned?: boolean;
  hint?: string;
}

export interface ShortcutCondition {
  type: "appActive" | "appNotActive";
  exe: string;
}

export interface ShortcutTiming {
  tapInterval: number;
  holdDuration: number;
  delay: number;
  cooldown: number;
  timingMode?: "auto" | "custom";
}

export interface Shortcut {
  id: string;
  name: string;
  profileId: string;
  key: string;
  mouse?: boolean;
  modifiers: ModifierKey[];
  trigger: TriggerType;
  timing: ShortcutTiming;
  actions: Action[];
  conditions?: ShortcutCondition[];
  enabled: boolean;
  suppressKey?: boolean;
  /** Original key behavior: passThrough (default), suppress, disable, or remap. */
  keyBehavior?: "passThrough" | "suppress" | "disable" | "remap";
  remapTo?: string;
  createdAt: number;
  lastUsed?: number;
  useCount?: number;
  favorite?: boolean;
}

export interface AppRule {
  id: string;
  exe: string;
  profileId: string;
  mode: "assign" | "whitelist" | "blacklist";
}

export interface Profile {
  id: string;
  name: string;
  icon?: string;
  isDefault?: boolean;
  appRules: AppRule[];
  createdAt: number;
}

export interface GeneralSettings {
  launchOnStartup: boolean;
  startMinimized: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  soundFeedback: boolean;
  showRecentOnDashboard: boolean;
  defaultProfileId: string;
  language: string;
}

export type ThemeMode = "dark" | "light" | "system";
export type UIScale = "90" | "100" | "110" | "125";
export type FontSize = "small" | "normal" | "large";

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: string;
  compactMode: boolean;
  reduceMotion: boolean;
  popupBlur: boolean;
  radiusIntensity: number;
  uiScale: UIScale;
  fontSize: FontSize;
}

export interface ShortcutSettings {
  globalPause: string;
  emergencySafe: string;
  defaultDoubleTap: number;
  defaultTripleTap: number;
  defaultHold: number;
  keyRepeatProtection: boolean;
  preventAccidental: boolean;
  allowRisky: boolean;
  hyperKeyEnabled: boolean;
  hyperKey: string;
  hyperKeyOutput: string;
}

export type PopupPosition = "cursor" | "center" | "last";
export type PopupSize = "compact" | "comfortable" | "large";

export interface PopupSettings {
  position: PopupPosition;
  size: PopupSize;
  showIcons: boolean;
  showNumbers: boolean;
  search: boolean;
  closeAfterAction: boolean;
  animationSpeed: number;
  opacity: number;
  maxItems: number;
}

export interface ProfilesSettings {
  defaultProfileId: string;
  enableAppProfiles: boolean;
  autoSwitchByApp: boolean;
}

export interface PrivacySettings {
  showPrivacy: boolean;
  pauseInPassword: boolean;
  blacklistedApps: string[];
  safeMode: boolean;
}

export interface DataSettings {
  storageType: "json" | "sqlite";
  dataLocation: string;
}

export interface AdvancedSettings {
  debugLogs: boolean;
  hookMode: string;
  performanceMode: boolean;
  portableMode: boolean;
  extendedAccess?: boolean;
}

export interface WindowControlSettings {
  defaultTopmostMode: "toggle" | "pin" | "unpin";
  highlightPinned: boolean;
  highlightColor: string;
  borderThickness: "thin" | "medium" | "thick" | "custom";
  customThickness?: number;
  soundFeedback: boolean;
  showFloatingPin: boolean;
}

export interface Settings {
  general: GeneralSettings;
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
  popup: PopupSettings;
  profiles: ProfilesSettings;
  privacy: PrivacySettings;
  data: DataSettings;
  advanced: AdvancedSettings;
  windowControl?: WindowControlSettings;
}

export interface RecentAction {
  id: string;
  shortcutId?: string;
  shortcutName: string;
  actionLabel: string;
  at: number;
  profileId: string;
}

export interface PersistedState {
  version: number;
  profiles: Profile[];
  shortcuts: Shortcut[];
  library: Action[];
  settings: Settings;
  recent: RecentAction[];
  blacklist: string[];
  onboardingDone: boolean;
}

export type AppPage =
  | "dashboard"
  | "shortcuts"
  | "create"
  | "visual"
  | "library"
  | "profiles"
  | "settings";

export interface PopupRequest {
  items: PopupItem[];
  x: number;
  y: number;
  title?: string;
}
