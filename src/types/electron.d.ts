interface WindowControls {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setTitleBarTheme: (theme: "light" | "dark") => Promise<boolean>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

interface AppInfo {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getLoginItemSettings: () => Promise<{ openAtLogin: boolean; openAsHidden?: boolean }>;
  setLoginItemSettings: (config: { openAtLogin: boolean; openAsHidden?: boolean }) => Promise<{ openAtLogin: boolean; openAsHidden?: boolean }>;
  updateTray: (settings: { enabled: boolean; theme?: "dark" | "light" | "system"; paused?: boolean; appIcon?: "monochrome" | "blue" | "green" | "red" }) => Promise<boolean>;
  updateIcon: (icon: "monochrome" | "blue" | "green" | "red") => Promise<boolean>;
  onTrayTogglePause: (callback: () => void) => () => void;
  onTrayOpenSettings: (callback: () => void) => () => void;
}

interface ActionResult {
  ok: boolean;
  action?: string;
  mode?: string;
  path?: string;
  isTopmost?: boolean;
  title?: string;
  highlightApplied?: boolean;
  error?: string;
}

interface ActionAPI {
  run: (action: any) => Promise<ActionResult>;
}

type ClipboardKind = "text" | "html" | "url" | "email" | "image" | "screenshot" | "files" | "color" | "code" | "json" | "xml" | "csv";
type ClipboardSurface = "edge" | "bottom" | "center";
type ClipboardOverlayLayout = "horizontal" | "center" | "right";
type ClipboardHorizontalPosition = "bottom" | "top";
type ClipboardScrollDirection = "horizontal" | "vertical";
type ClipboardGridRows = 1 | 2 | 3;

interface ClipboardUrlMeta {
  domain: string;
  title?: string;
  description?: string;
  favicon?: string;
  siteName?: string;
  /** Direct URL to a preview thumbnail (og:image or YouTube HQ thumbnail) */
  thumbnailUrl?: string;
  /** True when the URL points to a YouTube video */
  isYouTube?: boolean;
}

interface ClipboardItemSummary { id: string; kind: ClipboardKind; title: string; preview: string; capturedAt: number; lastUsedAt?: number; copyCount: number; useCount: number; pinned: boolean; pinboardIds: string[]; sourceApp?: string; bytes?: number; fileCount?: number; color?: string; dimensions?: { width: number; height: number }; thumbnailDataUrl?: string; urlMeta?: ClipboardUrlMeta; }
interface ClipboardItemDetail extends ClipboardItemSummary { text?: string; html?: string; url?: string; paths?: string[]; imageDataUrl?: string; formats: string[]; nativeFormats: string[]; }
interface ClipboardPinboard { id: string; name: string; color: string; order: number; icon?: string; }
interface ClipboardSettings { paused: boolean; maxItems: number; defaultSurface: ClipboardSurface; excludedApps: string[]; layout?: ClipboardOverlayLayout; horizontalPosition?: ClipboardHorizontalPosition; scrollDirection?: ClipboardScrollDirection; gridRows?: ClipboardGridRows; useAppAccentColor?: boolean; closeOnBlur?: boolean; activationMode?: "copy" | "paste"; copyFeedbackEnabled?: boolean; edgeHoverScrollEnabled?: boolean; edgeHoverScrollSpeed?: "slow" | "normal" | "fast"; captureText: boolean; captureImages: boolean; captureFiles: boolean; captureLinks: boolean; ignorePasswordManagers: boolean; retentionDays: 0 | 7 | 30; }
interface ClipboardSnapshot { items: ClipboardItemSummary[]; pinboards: ClipboardPinboard[]; settings: ClipboardSettings; }
interface ClipboardAPI {
  getSnapshot: () => Promise<ClipboardSnapshot>; getItem: (id: string) => Promise<ClipboardItemDetail | null>; setSettings: (patch: Partial<ClipboardSettings>) => Promise<ClipboardSnapshot>;
  createPinboard: (input: { name: string; color?: string; icon?: string }) => Promise<ClipboardSnapshot>; updatePinboard: (id: string, patch: Partial<ClipboardPinboard>) => Promise<ClipboardSnapshot>; deletePinboard: (id: string) => Promise<ClipboardSnapshot>;
  setPinned: (id: string, pinned: boolean) => Promise<ClipboardSnapshot>; moveToPinboard: (id: string, pinboardId: string | null) => Promise<ClipboardSnapshot>; rename: (id: string, title: string) => Promise<ClipboardSnapshot>; delete: (id: string) => Promise<ClipboardSnapshot>; clearUnpinned: () => Promise<ClipboardSnapshot>;
  reorderItems?: (sourceId: string, targetId: string) => Promise<ClipboardSnapshot>; assignPinboard?: (itemId: string, pinboardId: string) => Promise<ClipboardSnapshot>; unassignPinboard?: (itemId: string, pinboardId: string) => Promise<ClipboardSnapshot>;
  copy: (id: string, plainText?: boolean) => Promise<{ ok: boolean }>; paste: (id: string, plainText?: boolean, keepOpen?: boolean) => Promise<ActionResult>; addDroppedFiles: (paths: string[]) => Promise<ClipboardSnapshot>; startDrag: (id: string) => void; openSurface: (surface: ClipboardSurface) => Promise<boolean>;
  toggle?: () => Promise<boolean>; show?: () => Promise<boolean>; setKeepOpen?: (keepOpen: boolean) => Promise<boolean>;
  probeFormats?: () => Promise<Array<{ format: string; size?: number }>>; hidePopup?: () => Promise<void>;
  onChanged: (callback: (snapshot: ClipboardSnapshot) => void) => () => void; onOpenSurface: (callback: (surface: ClipboardSurface) => void) => () => void;
  onPopupShow?: (callback: () => void) => () => void; onPopupRequestClose?: (callback: () => void) => () => void; onPopupLayoutChanged?: (callback: (value: { layout?: ClipboardOverlayLayout; position?: ClipboardHorizontalPosition; scrollDirection?: ClipboardScrollDirection; gridRows?: ClipboardGridRows }) => void) => () => void; onPopupFocusSearch?: (callback: () => void) => () => void;
  onCopyFeedbackShow?: (callback: (value: { kind: string; title: string; anchor: "top" | "bottom" | "right" }) => void) => () => void; onCopyFeedbackHide?: (callback: () => void) => () => void;
}

interface NativeStatus {
  backend: string;
  engineStatus: string;
  configSynced: boolean;
  requestedVersion: number;
  ackedVersion: number;
  ruleCount: number;
  hyperEnabled: boolean;
  hyperVk: number;
  includeShift: boolean;
  extendedAccess: boolean;
}

interface NativeAppInfo {
  executablePath: string;
  processName?: string;
  displayName?: string;
  icon?: string;
}

interface NativeCapturedKey {
  type: "capturedKey";
  vk: number;
  scanCode: number;
  extended: boolean;
  name: string;
}

interface InputAPI {
  updateShortcuts: (entries: any[], context?: any) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  setDragSwitcher: (config: { enabled: boolean; zones: number; activationMs: number; hoverMs: number; cornerSize: number }) => Promise<boolean>;
  getStatus: () => Promise<string>;
  getSuppression: () => Promise<{ available: boolean; status: string; backend: string }>;
  getNativeStatus: () => Promise<NativeStatus>;
  listApps: () => Promise<NativeAppInfo[]>;
  getActiveApp: () => Promise<NativeAppInfo | null>;
  browseExe: () => Promise<string | null>;
  getWasdNavigationState: () => Promise<boolean>;
  setWasdCursorConfig?: (config: { size: number; customPath?: string }) => Promise<boolean>;
  setWasdFeedbackConfig?: (config: { showStateCard: boolean; accent?: string }) => Promise<boolean>;
  setWasdMouseChord?: (enabled: boolean) => Promise<boolean>;
  browseCursorFile?: () => Promise<string | null>;
  setSmoothScroll?: (config: any) => Promise<boolean>;
  setHyperGestures?: (config: any) => Promise<boolean>;
  setTouchpadDrag?: (config: any) => Promise<boolean>;
  getTouchpadStatus?: () => Promise<{ version: number; supported: boolean; deviceCount: number; deviceName?: string }>;
  openWindowsTouchpadSettings?: () => Promise<boolean>;
  getWindowsConflicts?: () => Promise<{ clipboardHistoryDisabled: boolean; touchpadThreeFingerDisabled: boolean }>;
  setWindowsClipboardDisabled?: (disabled: boolean) => Promise<boolean>;
  setWindowsTouchpadGesturesDisabled?: (disabled: boolean) => Promise<boolean>;
  onGestureTrail?: (callback: (trail: any) => void) => () => void;
  onWasdNavigationState: (callback: (active: boolean) => void) => () => void;
  onTriggered: (callback: (shortcut: any, results?: any[]) => void) => () => void;
  beginCapture?: () => Promise<boolean>;
  cancelCapture?: () => Promise<boolean>;
  onCapturedKey?: (callback: (key: NativeCapturedKey) => void) => () => void;
  onCaptureCancelled?: (callback: () => void) => () => void;
  logCapture?: (line: string) => void;
}

interface HotCornersAPI {
  configure: (config: any, shortcuts: any[]) => Promise<boolean>;
  onTriggered: (callback: (data: { corner: string; shortcutId?: string }) => void) => () => void;
}

interface ScreenTintAPI {
  update: (config: { enabled: boolean; color: string; strength: number }) => Promise<boolean>;
  onUpdate: (callback: (config: { enabled: boolean; color: string; strength: number }) => void) => () => void;
}

interface MediaPlayerAPI {
  getState: () => Promise<{ enabled: boolean; position: string; customX?: number; customY?: number }>;
  updateConfig: (config: { enabled?: boolean; position?: string; customX?: number; customY?: number; autoHide?: boolean }) => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  toggle: () => Promise<boolean>;
  onStateChanged: (callback: (state: { enabled: boolean; position: string; customX?: number; customY?: number }) => void) => () => void;
  onPositionChanged?: (callback: (pos: { customX: number; customY: number }) => void) => () => void;
}

interface DimScreenDisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  hasHardwareBrightness: boolean;
}

interface DimScreenState {
  enabled: boolean;
  level: number;
  extraDimEnabled: boolean;
  extraDimStrength: number;
  applyTo: "all" | "primary" | "selected";
  selectedDisplayIds?: number[];
  startEnabled?: boolean;
  rememberLevel?: boolean;
}

interface DimScreenAPI {
  getState: () => Promise<DimScreenState>;
  update: (config: Partial<DimScreenState>) => Promise<DimScreenState>;
  setEnabled: (enabled: boolean) => Promise<DimScreenState>;
  setLevel: (level: number) => Promise<DimScreenState>;
  setExtraDim: (enabled: boolean, strength?: number) => Promise<DimScreenState>;
  toggle: () => Promise<DimScreenState>;
  listDisplays: () => Promise<DimScreenDisplayInfo[]>;
  onStateChanged: (callback: (state: DimScreenState) => void) => () => void;
}

interface PopupData {
  items: any[];
  settings: any;
  theme: string;
  accent?: string;
  profileId?: string;
  title?: string;
  material?: "acrylic" | "fallback";
}

interface PopupAPI {
  show: (data: { items: any[]; title?: string }) => Promise<ActionResult>;
  updateData: (snapshot: any) => Promise<void>;
  executeAction: (actions: any[]) => Promise<ActionResult[]>;
  hide: (gen?: string) => Promise<void>;
  reportContentSize: (width: number, height: number) => Promise<void>;
  onActivate: (callback: () => void) => () => void;
  onClosing: (callback: () => void) => () => void;
  onData: (callback: (data: PopupData) => void) => () => void;
}

interface NotesItem {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface NotesWindowPreferences {
  windowSizePreset: "comfortable" | "compact";
  followMouseOnOpen: boolean;
  windowPresetSizes: Record<"comfortable" | "compact", { width: number; height: number }>;
}

interface NotesAPI {
  getAll: () => Promise<NotesItem[]>;
  save: (note: NotesItem) => Promise<NotesItem[]>;
  delete: (id: string) => Promise<NotesItem[]>;
  close: () => Promise<void>;
  toggle: () => Promise<void>;
  openTestMode?: (options?: { presetId?: string; presetName?: string }) => Promise<{ success: boolean }>;
  exitTestMode?: () => Promise<{ success: boolean }>;
  getTestMode?: () => Promise<{ active: boolean; presetId?: string; presetName?: string }>;
  syncTestMode?: () => Promise<{ active: boolean; presetId?: string; presetName?: string }>;
  onTestModeState?: (callback: (state: { active: boolean; presetId?: string; presetName?: string }) => void) => () => void;
  getSaveLocation?: () => Promise<string>;
  selectSaveLocation?: () => Promise<{ path: string; notes: NotesItem[] } | null>;
  setSaveLocation?: (dirPath: string) => Promise<{ path: string; notes: NotesItem[] }>;
  getPreferences?: () => Promise<NotesWindowPreferences>;
  updatePreferences?: (patch: Partial<NotesWindowPreferences>) => Promise<NotesWindowPreferences>;
  resetWindowSize?: () => Promise<NotesWindowPreferences>;
  saveCurrentWindowSize?: (preset: string) => Promise<NotesWindowPreferences>;
  pickFile?: (options: { type?: "image" | "video" | "file" }) => Promise<string | null>;
  minimize?: () => Promise<void>;
  maximize?: () => Promise<void>;
}

interface DragSwitcherWindowEntry {
  hwnd: string;
  title: string;
  app: string;
  icon?: string;
}

interface DragSwitcherData {
  monitorIndex: number;
  monitorLeft: number;
  monitorTop: number;
  monitorRight: number;
  monitorBottom: number;
  workLeft: number;
  workTop: number;
  workRight: number;
  workBottom: number;
  cursorX: number;
  cursorY: number;
  sourceHwnd: string;
  hoverDwellMs: number;
  windows: DragSwitcherWindowEntry[];
}

interface DragSwitcherAPI {
  activate: (hwnd: string) => Promise<boolean>;
  onData: (callback: (data: DragSwitcherData) => void) => () => void;
  onMove: (callback: (data: { x: number; y: number }) => void) => () => void;
  onHide: (callback: (data: { reason: string }) => void) => () => void;
}

interface BackupAPI {
  selectFolder: () => Promise<string | null>;
  setConfig: (config: { enabled: boolean; path: string; intervalMinutes: number }) => Promise<void>;
  getConfig: () => Promise<{ enabled: boolean; path: string; intervalMinutes: number; lastBackupTime: number }>;
  runNow: () => Promise<{ success: boolean; path?: string; error?: string }>;
  updateState: (state: any) => Promise<void>;
}

interface ElectronAPI {
  windowControls: WindowControls;
  appInfo: AppInfo;
  actions: ActionAPI;
  clipboard: ClipboardAPI;
  executeAction?: (action: any) => Promise<ActionResult>;
  input: InputAPI;
  hotCorners?: HotCornersAPI;
  screenTint?: ScreenTintAPI;
  dimScreen?: DimScreenAPI;
  mediaPlayer?: MediaPlayerAPI;
  popup: PopupAPI;
  dragSwitcher?: DragSwitcherAPI;
  notes?: NotesAPI;
  backup?: BackupAPI;
}

interface Window {
  electronAPI?: ElectronAPI;
}
