import { CSSProperties, useEffect, useState } from "react";
import { SCREEN_TINT_DEFAULT_COLOR } from "../lib/constants";

interface TintConfig {
  enabled: boolean;
  color: string;
  strength: number;
}

const DEFAULT_CONFIG: TintConfig = { enabled: true, color: SCREEN_TINT_DEFAULT_COLOR, strength: 18 };

export function ScreenTintOverlay() {
  const [config, setConfig] = useState<TintConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    document.documentElement.classList.add("screen-tint-window");
    const unsubscribe = window.electronAPI?.screenTint?.onUpdate((next) => setConfig(next));
    return () => {
      document.documentElement.classList.remove("screen-tint-window");
      unsubscribe?.();
    };
  }, []);

  if (!config.enabled || config.strength <= 0) return null;

  // Transparent, see-through warmth overlay:
  // Map 0-100% slider strength to a gentle, comfortable 0.02 - 0.40 opacity
  const opacity = Math.min(0.45, Math.max(0.02, (config.strength / 100) * 0.40));

  return (
    <div
      className="screen-tint-overlay"
      aria-hidden="true"
      style={{
        backgroundColor: config.color || SCREEN_TINT_DEFAULT_COLOR,
        opacity: opacity,
      } as CSSProperties}
    />
  );
}
