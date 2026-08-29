const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    onMaximizedChange: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("window:maximized-change", handler);
      return () => {
        ipcRenderer.removeListener("window:maximized-change", handler);
      };
    },
  },
  appInfo: {
    getVersion: () => ipcRenderer.invoke("app:get-version"),
    getPlatform: () => ipcRenderer.invoke("app:get-platform"),
    getLoginItemSettings: () => ipcRenderer.invoke("app:get-login-item-settings"),
    setLoginItemSettings: (config) => ipcRenderer.invoke("app:set-login-item-settings", config),
  },
  actions: {
    run: (action) => ipcRenderer.invoke("action:run", action),
  },
  input: {
    updateShortcuts: (entries, context) => ipcRenderer.invoke("input:update-shortcuts", entries, context),
    setPaused: (paused) => ipcRenderer.invoke("input:set-paused", paused),
    setDragSwitcher: (config) => ipcRenderer.invoke("input:set-drag-switcher", config),
    getStatus: () => ipcRenderer.invoke("input:get-status"),
    getSuppression: () => ipcRenderer.invoke("input:get-suppression"),
    getNativeStatus: () => ipcRenderer.invoke("native:get-status"),
    listApps: () => ipcRenderer.invoke("native:list-apps"),
    getActiveApp: () => ipcRenderer.invoke("native:get-active-app"),
    browseExe: () => ipcRenderer.invoke("native:browse-exe"),
    getWasdNavigationState: () => ipcRenderer.invoke("navigation:get-state"),
    setWasdCursorConfig: (config) => ipcRenderer.invoke("navigation:set-cursor-config", config),
    browseCursorFile: () => ipcRenderer.invoke("dialog:open-cursor-file"),
    onWasdNavigationState: (callback) => {
      const handler = (_event, active) => callback(active);
      ipcRenderer.on("navigation:state-changed", handler);
      return () => {
        ipcRenderer.removeListener("navigation:state-changed", handler);
      };
    },
    onTriggered: (callback) => {
      const handler = (_event, shortcut, results) => callback(shortcut, results);
      ipcRenderer.on("shortcut:triggered", handler);
      return () => {
        ipcRenderer.removeListener("shortcut:triggered", handler);
      };
    },
    beginCapture: () => ipcRenderer.invoke("native:begin-capture"),
    cancelCapture: () => ipcRenderer.invoke("native:cancel-capture"),
    logCapture: (line) => ipcRenderer.send("native:capture-log", line),
    onCapturedKey: (callback) => {
      const handler = (_event, msg) => callback(msg);
      ipcRenderer.on("native:captured-key", handler);
      return () => {
        ipcRenderer.removeListener("native:captured-key", handler);
      };
    },
    onCaptureCancelled: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("native:capture-cancelled", handler);
      return () => {
        ipcRenderer.removeListener("native:capture-cancelled", handler);
      };
    },
  },
  hotCorners: {
    configure: (config, shortcuts) => ipcRenderer.invoke("hot-corners:configure", config, shortcuts),
    onTriggered: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("hot-corners:triggered", handler);
      return () => ipcRenderer.removeListener("hot-corners:triggered", handler);
    },
  },
  screenTint: {
    update: (config) => ipcRenderer.invoke("screen-tint:update", config),
    onUpdate: (callback) => {
      const handler = (_event, config) => callback(config);
      ipcRenderer.on("screen-tint:update", handler);
      return () => ipcRenderer.removeListener("screen-tint:update", handler);
    },
  },
  popup: {
    show: (data) => ipcRenderer.invoke("popup:show", data),
    updateData: (snapshot) => ipcRenderer.invoke("popup:update-data", snapshot),
    executeAction: (actions) => ipcRenderer.invoke("popup:execute-action", actions),
    hide: (gen) => ipcRenderer.invoke("popup:hide", gen),
    reportContentSize: (width, height) => ipcRenderer.invoke("popup:report-content-size", width, height),
    onActivate: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("popup:activate", handler);
      return () => {
        ipcRenderer.removeListener("popup:activate", handler);
      };
    },
    onClosing: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("popup:closing", handler);
      return () => {
        ipcRenderer.removeListener("popup:closing", handler);
      };
    },
    onData: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("popup:data", handler);
      return () => {
        ipcRenderer.removeListener("popup:data", handler);
      };
    },
  },
  dragSwitcher: {
    activate: (hwnd) => ipcRenderer.invoke("drag-switcher:activate", hwnd),
    onData: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("drag-switcher:data", handler);
      return () => {
        ipcRenderer.removeListener("drag-switcher:data", handler);
      };
    },
    onMove: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("drag-switcher:move", handler);
      return () => {
        ipcRenderer.removeListener("drag-switcher:move", handler);
      };
    },
    onHide: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("drag-switcher:hide", handler);
      return () => {
        ipcRenderer.removeListener("drag-switcher:hide", handler);
      };
    },
  },
  notes: {
    getAll: () => ipcRenderer.invoke("notes:get-all"),
    save: (note) => ipcRenderer.invoke("notes:save", note),
    delete: (id) => ipcRenderer.invoke("notes:delete", id),
    close: () => ipcRenderer.invoke("notes:close"),
    toggle: () => ipcRenderer.invoke("notes:toggle"),
    getSaveLocation: () => ipcRenderer.invoke("notes:get-save-location"),
    selectSaveLocation: () => ipcRenderer.invoke("notes:select-save-location"),
    setSaveLocation: (dirPath) => ipcRenderer.invoke("notes:set-save-location", dirPath),
    pickFile: (options) => ipcRenderer.invoke("notes:pick-file", options),
    minimize: () => ipcRenderer.invoke("notes:minimize"),
    maximize: () => ipcRenderer.invoke("notes:maximize"),
  },
  backup: {
    selectFolder: () => ipcRenderer.invoke("backup:select-folder"),
    setConfig: (config) => ipcRenderer.invoke("backup:set-config", config),
    getConfig: () => ipcRenderer.invoke("backup:get-config"),
    runNow: () => ipcRenderer.invoke("backup:run-now"),
    updateState: (state) => ipcRenderer.invoke("backup:update-state", state),
  },
});
