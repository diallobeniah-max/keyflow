const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
    setTitleBarTheme: (theme) => ipcRenderer.invoke("window:set-titlebar-theme", theme),
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
    updateTray: (settings) => ipcRenderer.invoke("app:update-tray", settings),
    updateIcon: (icon) => ipcRenderer.invoke("app:update-icon", icon),
    onTrayTogglePause: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("tray:toggle-pause", handler);
      return () => ipcRenderer.removeListener("tray:toggle-pause", handler);
    },
    onTrayOpenSettings: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("tray:open-settings", handler);
      return () => ipcRenderer.removeListener("tray:open-settings", handler);
    },
  },
  actions: {
    run: (action) => ipcRenderer.invoke("action:run", action),
  },
  clipboard: {
    getSnapshot: () => ipcRenderer.invoke("clipboard:get-snapshot"),
    getItem: (id) => ipcRenderer.invoke("clipboard:get-item", id),
    setSettings: (patch) => ipcRenderer.invoke("clipboard:set-settings", patch),
    createPinboard: (input) => ipcRenderer.invoke("clipboard:create-pinboard", input),
    updatePinboard: (id, patch) => ipcRenderer.invoke("clipboard:update-pinboard", id, patch),
    deletePinboard: (id) => ipcRenderer.invoke("clipboard:delete-pinboard", id),
    setPinned: (id, pinned) => ipcRenderer.invoke("clipboard:set-pinned", id, pinned),
    moveToPinboard: (id, pinboardId) => ipcRenderer.invoke("clipboard:move-to-pinboard", id, pinboardId),
    rename: (id, title) => ipcRenderer.invoke("clipboard:rename", id, title),
    delete: (id) => ipcRenderer.invoke("clipboard:delete", id),
    clearUnpinned: () => ipcRenderer.invoke("clipboard:clear-unpinned"),
    copy: (id, plainText = false) => ipcRenderer.invoke("clipboard:copy", id, plainText),
    paste: (id, plainText = false, keepOpen = false) => ipcRenderer.invoke("clipboard:paste", id, plainText, keepOpen),
    assignPinboard: (id, board) => ipcRenderer.invoke("clipboard:assign-pinboard", id, board),
    unassignPinboard: (id, board) => ipcRenderer.invoke("clipboard:unassign-pinboard", id, board),
    reorderItems: (source, target) => ipcRenderer.invoke("clipboard:reorder-items", source, target),
    addDroppedFiles: (paths) => ipcRenderer.invoke("clipboard:add-dropped-files", paths),
    startDrag: (id) => ipcRenderer.send("clipboard:start-drag", id),
    openSurface: (surface) => ipcRenderer.invoke("clipboard:open-surface", surface),
    toggle: () => ipcRenderer.invoke("clipboard:toggle"),
    show: () => ipcRenderer.invoke("clipboard:show"),
    setKeepOpen: (keepOpen: boolean) => ipcRenderer.invoke("clipboard:set-keep-open", keepOpen),
    probeFormats: () => ipcRenderer.invoke("clipboard:probe-formats"),
    hidePopup: () => ipcRenderer.invoke("clipboard:hide-popup"),
    onChanged: (callback) => {
      const handler = (_event, snapshot) => callback(snapshot);
      ipcRenderer.on("clipboard:changed", handler);
      return () => ipcRenderer.removeListener("clipboard:changed", handler);
    },
    onOpenSurface: (callback) => {
      const handler = (_event, surface) => callback(surface);
      ipcRenderer.on("clipboard:open-surface", handler);
      return () => ipcRenderer.removeListener("clipboard:open-surface", handler);
    },
    onPopupShow: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("clipboard-popup:show", handler);
      return () => ipcRenderer.removeListener("clipboard-popup:show", handler);
    },
    onPopupRequestClose: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("clipboard-popup:request-close", handler);
      return () => ipcRenderer.removeListener("clipboard-popup:request-close", handler);
    },
    onPopupLayoutChanged: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("clipboard-popup:layout-changed", handler);
      return () => ipcRenderer.removeListener("clipboard-popup:layout-changed", handler);
    },
    onPopupFocusSearch: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("clipboard-popup:focus-search", handler);
      return () => ipcRenderer.removeListener("clipboard-popup:focus-search", handler);
    },
    onCopyFeedbackShow: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("clipboard-copy-feedback:show", handler);
      return () => ipcRenderer.removeListener("clipboard-copy-feedback:show", handler);
    },
    onCopyFeedbackHide: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("clipboard-copy-feedback:hide", handler);
      return () => ipcRenderer.removeListener("clipboard-copy-feedback:hide", handler);
    },
  },
  executeAction: (action) => ipcRenderer.invoke("action:run", action),
  input: {
    updateShortcuts: (entries, context) => ipcRenderer.invoke("input:update-shortcuts", entries, context),
    setPaused: (paused) => ipcRenderer.invoke("input:set-paused", paused),
    setDragSwitcher: (config) => ipcRenderer.invoke("input:set-drag-switcher", config),
    setSmoothScroll: (config) => ipcRenderer.invoke("input:set-smooth-scroll", config),
    getStatus: () => ipcRenderer.invoke("input:get-status"),
    getSuppression: () => ipcRenderer.invoke("input:get-suppression"),
    getNativeStatus: () => ipcRenderer.invoke("native:get-status"),
    listApps: () => ipcRenderer.invoke("native:list-apps"),
    getActiveApp: () => ipcRenderer.invoke("native:get-active-app"),
    browseExe: () => ipcRenderer.invoke("native:browse-exe"),
    getWasdNavigationState: () => ipcRenderer.invoke("navigation:get-state"),
    setWasdCursorConfig: (config) => ipcRenderer.invoke("navigation:set-cursor-config", config),
    setWasdFeedbackConfig: (config) => ipcRenderer.invoke("navigation:set-feedback-config", config),
    setWasdMouseChord: (enabled) => ipcRenderer.invoke("navigation:set-mouse-chord", enabled),
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
    setHyperGestures: (config) => ipcRenderer.invoke("input:set-hyper-gestures", config),
    setTouchpadDrag: (config) => ipcRenderer.invoke("input:set-touchpad-drag", config),
    getTouchpadStatus: () => ipcRenderer.invoke("input:get-touchpad-status"),
    openWindowsTouchpadSettings: () => ipcRenderer.invoke("input:open-windows-touchpad-settings"),
    getWindowsConflicts: () => ipcRenderer.invoke("system:get-windows-conflicts"),
    setWindowsClipboardDisabled: (disabled) => ipcRenderer.invoke("system:set-windows-clipboard-disabled", disabled),
    setWindowsTouchpadGesturesDisabled: (disabled) => ipcRenderer.invoke("system:set-windows-touchpad-gestures-disabled", disabled),
    onGestureTrail: (callback) => {
      const handler = (_event, trail) => callback(trail);
      ipcRenderer.on("gesture:trail", handler);
      return () => {
        ipcRenderer.removeListener("gesture:trail", handler);
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
  mediaPlayer: {
    getState: () => ipcRenderer.invoke("media-player:get-state"),
    updateConfig: (config) => ipcRenderer.invoke("media-player:update", config),
    setEnabled: (enabled) => ipcRenderer.invoke("media-player:update", { enabled }),
    toggle: () => ipcRenderer.invoke("media-player:toggle"),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("media-player:state-changed", handler);
      return () => ipcRenderer.removeListener("media-player:state-changed", handler);
    },
    onPositionChanged: (callback) => {
      const handler = (_event, pos) => callback(pos);
      ipcRenderer.on("media-player:position-changed", handler);
      return () => ipcRenderer.removeListener("media-player:position-changed", handler);
    },
  },
  dimScreen: {
    getState: () => ipcRenderer.invoke("dim-screen:get-state"),
    update: (config) => ipcRenderer.invoke("dim-screen:update", config),
    setEnabled: (enabled) => ipcRenderer.invoke("dim-screen:set-enabled", enabled),
    setLevel: (level) => ipcRenderer.invoke("dim-screen:set-level", level),
    setExtraDim: (enabled, strength) => ipcRenderer.invoke("dim-screen:set-extra-dim", enabled, strength),
    toggle: () => ipcRenderer.invoke("dim-screen:toggle"),
    listDisplays: () => ipcRenderer.invoke("dim-screen:list-displays"),
    onStateChanged: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("dim-screen:state-changed", handler);
      return () => ipcRenderer.removeListener("dim-screen:state-changed", handler);
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
    openTestMode: (options) => ipcRenderer.invoke("notes:open-test-mode", options),
    exitTestMode: () => ipcRenderer.invoke("notes:exit-test-mode"),
    getTestMode: () => ipcRenderer.invoke("notes:get-test-mode"),
    syncTestMode: () => ipcRenderer.invoke("notes:sync-test-mode"),
    onTestModeState: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("notes:test-mode-state", handler);
      return () => {
        ipcRenderer.removeListener("notes:test-mode-state", handler);
      };
    },
    getSaveLocation: () => ipcRenderer.invoke("notes:get-save-location"),
    selectSaveLocation: () => ipcRenderer.invoke("notes:select-save-location"),
    setSaveLocation: (dirPath) => ipcRenderer.invoke("notes:set-save-location", dirPath),
    getPreferences: () => ipcRenderer.invoke("notes:get-preferences"),
    updatePreferences: (patch) => ipcRenderer.invoke("notes:update-preferences", patch),
    resetWindowSize: () => ipcRenderer.invoke("notes:reset-window-size"),
    saveCurrentWindowSize: (preset) => ipcRenderer.invoke("notes:save-current-window-size", preset),
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
