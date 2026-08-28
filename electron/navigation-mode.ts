/**
 * WASD Navigation Mode controller (Electron main process).
 *
 * Toggling flips a single in-process state, then:
 *   1. tells the native helper to map W/A/S/D to arrows (SetWasdNavigation),
 *   2. plays the navigation on/off sound,
 *   3. shows the cursor halo overlay,
 *   4. notifies the renderer so the Visual Keyboard / Shortcuts can reflect it.
 *
 * Dependencies are injected so Node tests can exercise the toggle with spies.
 */

import type { BrowserWindow } from "electron";
import { feedbackSoundName, SoundName } from "./sound-paths.js";

export type NavigationSound = SoundName;

export interface CursorConfig {
  size: number;
  customPath?: string;
}

export interface NavigationModeDeps {
  sendToNative: (enabled: boolean, cursor?: CursorConfig) => void;
  getMainWindow: () => BrowserWindow | null;
  playSound: (name: NavigationSound) => void;
  showOverlay: (active: boolean) => void;
  setCursor?: (active: boolean) => void;
}

export interface NavigationToggleResult {
  ok: boolean;
  action: string;
  mode: "on" | "off";
  error?: string;
}

export class NavigationModeController {
  private active = false;
  private deps: NavigationModeDeps;
  private cursorConfig: CursorConfig = { size: 32 };

  constructor(deps: NavigationModeDeps) {
    this.deps = deps;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Update cursor config from renderer settings. */
  setCursorConfig(config: CursorConfig): void {
    this.cursorConfig = config;
    // If already active, re-apply with new config
    if (this.active) {
      this.deps.sendToNative(true, this.cursorConfig);
    }
  }

  toggle(): NavigationToggleResult {
    this.active = !this.active;
    const mode: "on" | "off" = this.active ? "on" : "off";
    try {
      this.deps.sendToNative(this.active, this.active ? this.cursorConfig : undefined);
      this.deps.playSound(feedbackSoundName("navigation", this.active));
      this.deps.showOverlay(this.active);
      this.deps.setCursor?.(this.active);
      this.deps.getMainWindow()?.webContents.send("navigation:state-changed", this.active);
    } catch (err) {
      return {
        ok: false,
        action: "toggleWasdNavigation",
        mode,
        error: err instanceof Error ? err.message : String(err),
      };
    }
    return { ok: true, action: "toggleWasdNavigation", mode };
  }
}