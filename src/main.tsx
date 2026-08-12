import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./design/tokens.css";
import "./index.css";
import { useStore } from "./store/useStore";
import { initEngine, getEngine } from "./lib/engine";
import { initNativeInput } from "./lib/native-input";

const isPopup = window.location.search.includes("window=popup");

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (isPopup) {
  root.render(<React.StrictMode><App /></React.StrictMode>);
} else {
  initEngine();
  useStore.getState().load().then(() => {
    root.render(<React.StrictMode><App /></React.StrictMode>);
    if (typeof window !== "undefined" && (window as any).electronAPI?.input) {
      // Keyboard shortcut matching runs in the main process (native helper or
      // uiohook); the renderer engine must not double-fire real key presses.
      getEngine().setDesktopNative(true);
      console.log("[input] renderer keyboard engine disabled (desktop)");
      initNativeInput();
    }
  });
}
