export type ModifierKey = "Ctrl" | "Alt" | "Shift" | "Win" | "Hyper";

export type TriggerType =
  | "single"
  | "double"
  | "triple"
  | "longPress"
  | "hold"
  | "combo"
  | "tapThenHold"
  | "sequence"
  | "remap";

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
  | "notesPopup"
  | "toggleWasdNavigation"
  | "toggleCapsLock"
  | "delay"
  | "remapKey";

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
  /** Remap target key name (remapKey action / TriggerType "remap"). */
  remapTarget?: string;
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
  /** Activation key (single character) when explicit; defaults to position 1-9. */
  key?: string;
  /** Disabled items are kept in the config but hidden from the popup. */
  enabled?: boolean;
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
  /** App-specific scope (executable identity), or undefined = Everywhere. */
  appScope?: AppScope;
  createdAt: number;
  lastUsed?: number;
  useCount?: number;
  favorite?: boolean;
}

/** An app-specific scope. Matching uses ONLY the normalized executable path. */
export interface AppScope {
  scopeType: "executable";
  executablePath: string;
  processName?: string;
  displayName?: string;
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
export type FontSize = "small" | "default" | "normal" | "large" | "xlarge";

export type BackdropMaterial = "mica" | "acrylic" | "solid";
export type HeaderAccentTint = "none" | "subtle" | "medium" | "glow";
export type HeaderAccentFit = "full" | "compact" | "banner";
export type AppIconId = "monochrome" | "blue" | "green" | "red";
export type NavigationLayout = "sidebar" | "horizontal";

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: string;
  topHighlightColor?: string;
  compactMode: boolean;
  reduceMotion: boolean;
  popupBlur: boolean;
  radiusIntensity: number;
  uiScale: UIScale;
  fontSize: FontSize;
  backdropMaterial?: BackdropMaterial;
  headerAccentTint?: HeaderAccentTint;
  headerAccentFit?: HeaderAccentFit;
  /** Navigation layout orientation: standard left sidebar or horizontal Apple-style top dock. */
  navigationLayout?: NavigationLayout;
  /** Selected KeyFlow window and notification-area icon. */
  appIcon?: AppIconId;
  /** Keep the interface accent aligned with the selected KeyFlow app icon. */
  syncAccentWithAppIcon?: boolean;
  /** Show contextual hover help for icon-only controls and keyboard hints. */
  showHoverHelp?: boolean;
  /** Display iOS-style color-coded category icons and group headers across Settings. */
  colorCodedSettings?: boolean;
  /** Settings width mode: "small" (compact 220px rail, focused view) or "large" (wide 284px rail with summaries, expanded view). */
  settingsWidth?: "small" | "large";
  /** Whether the Settings navigation sidebar is collapsed into an icon-only rail. */
  sidebarCollapsed?: boolean;
}

export interface HyperKeyConfig {
  enabled: boolean;
  key: string;
  includeShift?: boolean;
  tapActionId?: string;
  suppressOriginal?: boolean;
}

export interface ShortcutSettings {
  globalPause: string;
  emergencySafe: string;
  /** Enable the in-window searchable command registry shortcut. */
  commandPaletteEnabled: boolean;
  commandPaletteShortcut?: string;
  commandPaletteShowCategories?: boolean;
  commandPaletteMaxResults?: number;
  commandPaletteWindowMode?: "compact" | "expanded";
  commandPalettePosition?: "center" | "top";
  commandPaletteDefaultShowMore?: boolean;
  /** Allow pressing Ctrl+Enter to open the details side view in the Command Palette. */
  commandPaletteSideViewEnabled?: boolean;
  /** Level of detail in the details side view: 'detailed' (interactive controls) or 'compact' (simple info). */
  commandPaletteDetailLevel?: "detailed" | "compact";
  altCapsLockBypass?: boolean;
  defaultDoubleTap: number;
  defaultTripleTap: number;
  defaultHold: number;
  keyRepeatProtection: boolean;
  preventAccidental: boolean;
  allowRisky: boolean;
  hyperKeyEnabled: boolean;
  hyperKey: string;
  hyperKeyOutput: string;
  hyperKeyConfig?: HyperKeyConfig;
  typingProtection?: "balanced" | "strict" | "off";
  typingIdleMs?: number;
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
  closeOnBlur?: boolean;
  animationSpeed: number;
  opacity: number;
  maxItems: number;
  /**
   * Editable popup menu contents (the menu shown when a showPopup action has
   * no per-shortcut override). Seeded from the default menu on first run.
   */
  items?: PopupItem[];
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
  autoBackupEnabled?: boolean;
  autoBackupPath?: string;
  autoBackupIntervalMinutes?: number;
}

export interface NotesSettings {
  saveLocation?: string;
  autoSaveIntervalMs?: number;
  defaultSlashCommands?: string[];
  showWordCount?: boolean;
  showCharCount?: boolean;
  fontSize?: "small" | "default" | "large";
  spellCheck?: boolean;
  enableSpotlight?: boolean;
  defaultSidebarOpen?: boolean;
  enableRevisionHistory?: boolean;
  windowSizePreset?: "comfortable" | "compact";
  followMouseOnOpen?: boolean;
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

/** Hot-zone bitmask values (mirror the native engine; ZONE_TR = 2 = default). */
export const DRAG_ZONE_TOP_LEFT = 0x01;
export const DRAG_ZONE_TOP_RIGHT = 0x02;
export const DRAG_ZONE_BOTTOM_LEFT = 0x04;
export const DRAG_ZONE_BOTTOM_RIGHT = 0x08;
export const DRAG_ZONE_TOP = 0x10;
export const DRAG_ZONE_LEFT = 0x20;
export const DRAG_ZONE_RIGHT = 0x40;
export const DRAG_ZONE_BOTTOM = 0x80;

export type DragZonePreset = "topRight" | "allCorners" | "allEdges" | "all" | "custom";

export interface DragSwitcherSettings {
  enabled: boolean;
  /** Enabled hot-zone bitmask. */
  zones: number;
  /** Activation dwell in ms; 0 = Instant. */
  activationMs: number;
  hoverMs: number;
  cornerSize: number;
  preset: DragZonePreset;
}

export type HotCornerPosition = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
export type HotCornerBuiltinAction =
  | "none"
  | "taskView"
  | "start"
  | "search"
  | "desktop"
  | "quickSettings"
  | "previousDesktop"
  | "nextDesktop";

export type HotCornerAction =
  | { type: "builtin"; action: HotCornerBuiltinAction; delayMs?: number }
  | { type: "shortcut"; shortcutId: string; delayMs?: number };

export interface HotCornersCustomPreset {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  corners: Record<HotCornerPosition, HotCornerAction>;
}

export interface HotCornersSettings {
  enabled: boolean;
  activationMs: number;
  cooldownMs: number;
  cornerSize: number;
  soundEnabled?: boolean;
  corners: Record<HotCornerPosition, HotCornerAction>;
  customPresets?: HotCornersCustomPreset[];
}

export type ScreenTintPreset = "warm" | "rose" | "yellow" | "blue" | "mint" | "neutral" | "custom";

export interface ScreenTintSettings {
  enabled: boolean;
  color: string;
  strength: number;
  preset: ScreenTintPreset;
}

export type SoundPack = "crystal" | "bubble" | "click" | "blip" | "marimba";

export interface AudioSettings {
  enabled: boolean;
  volume: number;
  soundPack: SoundPack;
  playOnPopup: boolean;
  playOnTopmost: boolean;
  playOnNavigation: boolean;
}

export interface CustomCursorItem {
  id: string;
  name: string;
  dataUrl: string;
  format?: string;
}

export interface WasdNavigationSettings {
  showStateCard?: boolean;
  cursorSize: number;        // 16–64, default 32
  customCursorPath?: string; // user-uploaded cursor image path (absolute)
  activeCursorId?: string;   // 'default' or custom cursor id
  customCursors?: CustomCursorItem[];
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
  audio?: AudioSettings;
  windowControl?: WindowControlSettings;
  dragSwitcher?: DragSwitcherSettings;
  hotCorners?: HotCornersSettings;
  screenTint?: ScreenTintSettings;
  wasdNavigation?: WasdNavigationSettings;
  notes?: NotesSettings;
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
  | "settings"
  | "notes";

export interface PopupRequest {
  items: PopupItem[];
  x: number;
  y: number;
  title?: string;
}
