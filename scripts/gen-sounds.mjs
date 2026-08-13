/**
 * KeyFlow Sound Asset Generator
 * Generates topmost-on.wav and topmost-off.wav as 16-bit PCM mono WAV files.
 * Run once: node scripts/gen-sounds.mjs
 * Output: public/sounds/topmost-on.wav, public/sounds/topmost-off.wav
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "sounds");

mkdirSync(outDir, { recursive: true });

const SAMPLE_RATE = 44100;
const CHANNELS = 1;
const BIT_DEPTH = 16;
const MAX_AMP = 0x7fff;

/**
 * Writes a 16-bit PCM WAV buffer from a float32 samples array.
 * Samples must be in [-1.0, 1.0].
 */
function toWavBuffer(samples) {
  const dataBytes = samples.length * 2; // 16-bit = 2 bytes each
  const buf = Buffer.alloc(44 + dataBytes);

  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);

  // fmt chunk
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);           // chunk size
  buf.writeUInt16LE(1, 20);            // PCM format
  buf.writeUInt16LE(CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8), 28); // byte rate
  buf.writeUInt16LE(CHANNELS * (BIT_DEPTH / 8), 32);  // block align
  buf.writeUInt16LE(BIT_DEPTH, 34);

  // data chunk
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1.0, Math.min(1.0, samples[i]));
    const intVal = Math.round(clamped * MAX_AMP);
    buf.writeInt16LE(intVal, 44 + i * 2);
  }

  return buf;
}

/**
 * Envelope: smooth fade-in then fade-out using a raised cosine (Hann) shape.
 */
function hann(i, total) {
  return 0.5 * (1.0 - Math.cos((2 * Math.PI * i) / (total - 1)));
}

/**
 * topmost-on: soft upward chirp (C5→E5, 523→659 Hz), 260ms, peak 38%
 * Two harmonics (fundamental + 0.3× second) for a warm tone.
 */
function generateTopmostOn() {
  const durationSec = 0.26;
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(numSamples);

  const freqStart = 523.25;  // C5
  const freqEnd   = 659.25;  // E5
  const peakAmp   = 0.38;

  // Fade out starts at 70% of duration (short decay tail)
  const attackEnd  = Math.floor(numSamples * 0.15);
  const decayStart = Math.floor(numSamples * 0.70);

  let phase = 0.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;

    // Linear frequency glide
    const freq = freqStart + (freqEnd - freqStart) * t;

    // Envelope: attack → sustain → release
    let env;
    if (i < attackEnd) {
      env = i / attackEnd;                                   // linear attack
    } else if (i < decayStart) {
      env = 1.0;                                             // sustain
    } else {
      const d = (i - decayStart) / (numSamples - decayStart);
      env = 1.0 - d * d;                                    // quadratic decay
    }

    env = env * peakAmp;

    // Fundamental + soft second harmonic
    const sample = (Math.sin(phase) + 0.28 * Math.sin(2 * phase)) / 1.28;

    samples[i] = sample * env;

    // Advance phase
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
  }

  // Very slight high-frequency roll-off via 3-sample smoothing
  for (let i = 1; i < numSamples - 1; i++) {
    samples[i] = 0.25 * samples[i - 1] + 0.5 * samples[i] + 0.25 * samples[i + 1];
  }

  return samples;
}

/**
 * topmost-off: soft descending settle (E5→C5, 659→523 Hz), 220ms, peak 32%
 * Slightly more damped than the ON sound for perceptual asymmetry.
 */
function generateTopmostOff() {
  const durationSec = 0.22;
  const numSamples = Math.floor(SAMPLE_RATE * durationSec);
  const samples = new Float32Array(numSamples);

  const freqStart = 659.25;  // E5
  const freqEnd   = 523.25;  // C5
  const peakAmp   = 0.32;

  const attackEnd  = Math.floor(numSamples * 0.10);
  const decayStart = Math.floor(numSamples * 0.55);

  let phase = 0.0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    const freq = freqStart + (freqEnd - freqStart) * t;

    let env;
    if (i < attackEnd) {
      env = i / attackEnd;
    } else if (i < decayStart) {
      env = 1.0;
    } else {
      const d = (i - decayStart) / (numSamples - decayStart);
      env = Math.pow(1.0 - d, 1.6);   // faster decay for "settling" feel
    }

    env = env * peakAmp;

    const sample = (Math.sin(phase) + 0.22 * Math.sin(2 * phase)) / 1.22;
    samples[i] = sample * env;

    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
  }

  for (let i = 1; i < numSamples - 1; i++) {
    samples[i] = 0.25 * samples[i - 1] + 0.5 * samples[i] + 0.25 * samples[i + 1];
  }

  return samples;
}

const onSamples  = generateTopmostOn();
const offSamples = generateTopmostOff();

const onPath  = join(outDir, "topmost-on.wav");
const offPath = join(outDir, "topmost-off.wav");

writeFileSync(onPath,  toWavBuffer(onSamples));
writeFileSync(offPath, toWavBuffer(offSamples));

console.log(`[gen-sounds] topmost-on.wav  (${onSamples.length} samples, ${(onSamples.length / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
console.log(`[gen-sounds] topmost-off.wav (${offSamples.length} samples, ${(offSamples.length / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
console.log(`[gen-sounds] Output: ${outDir}`);
