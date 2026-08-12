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
  },
  actions: {
    run: (action) => ipcRenderer.invoke("action:run", action),
  },
  input: {
    updateShortcuts: (entries, context) => ipcRenderer.invoke("input:update-shortcuts", entries, context),
    setPaused: (paused) => ipcRenderer.invoke("input:set-paused", paused),
    getStatus: () => ipcRenderer.invoke("input:get-status"),
    getSuppression: () => ipcRenderer.invoke("input:get-suppression"),
    onTriggered: (callback) => {
      const handler = (_event, shortcut, results) => callback(shortcut, results);
      ipcRenderer.on("shortcut:triggered", handler);
      return () => {
        ipcRenderer.removeListener("shortcut:triggered", handler);
      };
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
});
