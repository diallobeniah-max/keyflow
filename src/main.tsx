import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { useStore } from "./store/useStore";
import { initEngine } from "./lib/engine";

initEngine();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
useStore.getState().load().then(() => {
  root.render(<React.StrictMode><App /></React.StrictMode>);
});
