import { useEffect, useState } from "react";
import type { DimScreenSettings } from "../types";

const DEFAULT_CONFIG: DimScreenSettings = {
  enabled: false,
  level: 30,
  extraDimEnabled: false,
  extraDimStrength: 40,
  applyTo: "all",
  selectedDisplayIds: [],
  startEnabled: false,
  rememberLevel: true,
};

export function DimScreenOverlay() {
  const [config, setConfig] = useState<DimScreenSettings>(DEFAULT_CONFIG);

  useEffect(() => {
    document.documentElement.classList.add("dim-screen-window");

    window.electronAPI?.dimScreen?.getState?.().then((state) => {
      if (state) setConfig(state as DimScreenSettings);
    }).catch(() => {});

    const unsubscribe = window.electronAPI?.dimScreen?.onStateChanged?.((next) => {
      if (next) setConfig(next as DimScreenSettings);
    });

    return () => {
      document.documentElement.classList.remove("dim-screen-window");
      unsubscribe?.();
    };
  }, []);

  if (!config.enabled) return null;

  // Level is dim darkness (0 = clear/no dim, 100 = full dark)
  const clampedLevel = Math.max(0, Math.min(100, Number(config.level ?? 0)));
  const baseDim = (clampedLevel / 100) * 0.70;

  let extraDim = 0;
  if (config.extraDimEnabled) {
    const clampedExtra = Math.max(0, Math.min(100, Number(config.extraDimStrength ?? 40)));
    extraDim = (clampedExtra / 100) * 0.15;
  }

  const totalOpacity = Math.min(0.85, Math.max(0, baseDim + extraDim));

  if (totalOpacity <= 0) return null;

  return (
    <div
      id="dim"
      className="dim-screen-overlay"
      aria-hidden="true"
      style={{
        opacity: Number(totalOpacity.toFixed(4)),
      }}
    />
  );
}
