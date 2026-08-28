/**
 * Pure media/volume key plan resolution. No Electron import so Node tests can
 * verify the canonical VK mapping (0xAD-0xB3) used by mediaControl, volumeControl
 * and toggleMute without importing electron.
 */

import { isExtendedVk } from "./win-vk.js";

export interface MediaKeyPlan {
  /** VIRTUAL_KEYS name (PlayPause, NextTrack, …). */
  key: string;
  /** Canonical Win32 VK. */
  vk: number;
  extended: boolean;
  /** Forensics label, e.g. "playpause" or "volume:down". */
  command: string;
}

/** Canonical media/volume VKs. Keep in sync with vk-catalog.ts and native inject.rs. */
export const MEDIA_VKS: Record<string, number> = {
  PlayPause: 0xb3,
  NextTrack: 0xb0,
  PrevTrack: 0xb1,
  Stop: 0xb2,
  VolumeUp: 0xaf,
  VolumeDown: 0xae,
  VolumeMute: 0xad,
};

export function mediaKeyPlan(command: string): MediaKeyPlan {
  const key = command === "next" ? "NextTrack" : command === "prev" ? "PrevTrack" : command === "stop" ? "Stop" : "PlayPause";
  const vk = MEDIA_VKS[key];
  return { key, vk, extended: isExtendedVk(vk), command };
}

export function volumeKeyPlan(volume: string, label?: string): MediaKeyPlan {
  const key = volume === "down" ? "VolumeDown" : volume === "mute" || volume === "toggle" ? "VolumeMute" : "VolumeUp";
  const vk = MEDIA_VKS[key];
  return { key, vk, extended: isExtendedVk(vk), command: label ?? `volume:${volume}` };
}
