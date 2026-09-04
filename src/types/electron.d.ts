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
  browseCursorFile?: () => Promise<string | null>;
  setSmoothScroll?: (config: any) => Promise<boolean>;
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
  input: InputAPI;
  hotCorners?: HotCornersAPI;
  screenTint?: ScreenTintAPI;
  popup: PopupAPI;
  dragSwitcher?: DragSwitcherAPI;
  notes?: NotesAPI;
  backup?: BackupAPI;
}

interface Window {
  electronAPI?: ElectronAPI;
}
