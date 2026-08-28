/**
 * KeyFlow High-Fidelity Audio Feedback Engine
 * Uses the Web Audio API for zero-latency, cross-platform audio feedback
 * supporting 5 distinct sound profiles (Crystal, Bubble, Click, Blip, Marimba)
 * with user-configurable volume.
 */

import type { SoundPack } from "../types";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export interface PlaySoundOptions {
  pack?: SoundPack;
  volume?: number; // 0 to 100
}

export function playFeedbackSound(
  kind: "on" | "off" | "popup" | "action",
  options: PlaySoundOptions = {}
): void {
  const pack = options.pack ?? "crystal";
  const vol = Math.max(0, Math.min(100, options.volume ?? 80)) / 100;
  if (vol <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(vol * 0.45, now);
  masterGain.connect(ctx.destination);

  const isPositive = kind === "on" || kind === "popup";

  switch (pack) {
    case "bubble": {
      // Warm rounded tactile pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const startFreq = isPositive ? 320 : 480;
      const endFreq = isPositive ? 640 : 220;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.1);
      break;
    }

    case "click": {
      // Crisp mechanical click
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(isPositive ? 1600 : 1200, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.035);

      gain.gain.setValueAtTime(1.0, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.045);
      break;
    }

    case "blip": {
      // Futuristic digital blip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      const freq = isPositive ? 1046.5 : 783.99;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.setValueAtTime(freq * (isPositive ? 1.25 : 0.8), now + 0.04);

      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.13);
      break;
    }

    case "marimba": {
      // Acoustic marimba tone
      const fundamental = isPositive ? 523.25 : 440.0;
      [1, 2.76, 5.4].forEach((harmonic, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(fundamental * harmonic, now);

        const decay = 0.15 / (idx + 1);
        gain.gain.setValueAtTime(0.7 / (idx + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + decay);
      });
      break;
    }

    case "crystal":
    default: {
      // Crisp modern KeyFlow chime
      const baseFreq = isPositive ? 880 : 659.25;
      const secondFreq = isPositive ? 1318.51 : 523.25;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(baseFreq, now);
      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.19);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(secondFreq, now + 0.05);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.setValueAtTime(0.8, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.23);
      break;
    }
  }
}
