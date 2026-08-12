interface WindowControls {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
}

interface AppInfo {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
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

interface InputAPI {
  updateShortcuts: (entries: any[], context?: any) => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  getStatus: () => Promise<string>;
  getSuppression: () => Promise<{ available: boolean; status: string; backend: string }>;
  onTriggered: (callback: (shortcut: any, results?: any[]) => void) => () => void;
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

interface ElectronAPI {
  windowControls: WindowControls;
  appInfo: AppInfo;
  actions: ActionAPI;
  input: InputAPI;
  popup: PopupAPI;
}

interface Window {
  electronAPI?: ElectronAPI;
}
