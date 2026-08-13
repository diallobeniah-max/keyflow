import { comboToVks, isSecureVkCombo, keyToVk } from "./win-vk.js";

export type KeyBehavior = "passThrough" | "suppress" | "disable" | "remap";

export interface SuppressionEntry {
  vk: number;
  keyName: string;
  mode: "suppress" | "disable" | "remap";
  remapTo?: number;
  remapToName?: string;
  /** For Caps Lock suppression, pass through when the Hyper key + Shift are held. */
  conditionalCapsPassThrough?: boolean;
  hyperVk?: number;
}

export interface SuppressionConfig {
  entries: SuppressionEntry[];
  consumed: number[];
  remaps: Record<number, number>;
  disabled: number[];
  ignoreInMatcher: number[];
}

export interface SuppressionContext {
  emergencySafe?: string;
  hyperKey?: string;
  hyperKeyConfig?: {
    enabled: boolean;
    key: string;
    tapActionId?: string;
    suppressOriginal?: boolean;
  };
  paused?: boolean;
  safeMode?: boolean;
}

export function behaviorOf(shortcut: any): KeyBehavior {
  if (shortcut?.keyBehavior) return shortcut.keyBehavior;
  return shortcut?.suppressKey ? "suppress" : "passThrough";
}

/** Canonical native behavior for a shortcut ("pass" | "suppress" | "disable" | "remap"). */
export function shortcutBehavior(shortcut: any): "pass" | "suppress" | "disable" | "remap" {
  if (!shortcut?.enabled) return "pass";
  const kb = shortcut.keyBehavior;
  if (kb === "suppress" || kb === "disable" || kb === "remap") return kb;
  if (kb === "passThrough") return "pass";
  if (shortcut.suppressKey) return "suppress";
  return "pass";
}

export interface NativeShortcutSpec {
  id: string;
  name?: string;
  key: { vk: number; scanCode: number; extended: boolean };
  modifiers: number[];
  trigger: { kind: string; tapInterval: number; holdDuration: number; cooldown: number; delay: number };
  behavior: "pass" | "suppress" | "disable" | "remap";
  remapTo: number;
  enabled: boolean;
}

export function buildNativeHyperSpec(context: SuppressionContext) {
  const cfg = context.hyperKeyConfig;
  if (!cfg || !cfg.enabled || !cfg.key) return null;
  const vk = keyToVk(cfg.key);
  if (vk === undefined) return null;
  return {
    enabled: true,
    vk,
    suppressOriginal: cfg.suppressOriginal ?? true,
    tapActionId: cfg.tapActionId || undefined,
  };
}

const MOD_BIT_HYPER = 16;

/**
 * Build the canonical shortcut configuration the Rust engine consumes. Every
 * enabled keyboard shortcut becomes one spec; key/trigger/behavior values are
 * the single source of truth for the native gesture engine. Sequence triggers
 * have no implemented spec and are skipped (Rust agrees).
 */
export function buildNativeShortcutConfig(entries: any[], context: SuppressionContext = {}): NativeShortcutSpec[] {
  if (context.paused || context.safeMode) return [];
  const out: NativeShortcutSpec[] = [];
  const timing = { tapInterval: 0, holdDuration: 0, cooldown: 0, delay: 0 };
  for (const entry of entries ?? []) {
    if (!entry?.enabled || entry?.mouse) continue;
    const vk = keyToVk(entry.key);
    if (vk === undefined) continue;
    const kind = String(entry.trigger ?? "single");
    if (kind === "sequence") continue; // no spec, ignored by engine
    const behavior = shortcutBehavior(entry);
    const t = entry.timing ?? {};
    out.push({
      id: entry.id,
      name: entry.name,
      key: { vk, scanCode: 0, extended: false },
      modifiers: (entry.modifiers ?? []).map((m: string) => (m === "Hyper" ? MOD_BIT_HYPER : keyToVk(m))).filter((v: number | undefined): v is number => v !== undefined),
      trigger: {
        kind,
        tapInterval: t.tapInterval ?? timing.tapInterval,
        holdDuration: t.holdDuration ?? timing.holdDuration,
        cooldown: t.cooldown ?? timing.cooldown,
        delay: t.delay ?? timing.delay,
      },
      behavior,
      remapTo: behavior === "remap" ? keyToVk(entry.remapTo) ?? 0 : 0,
      enabled: true,
    });
  }
  return out;
}

export function buildSuppressionConfig(entries: any[], context: SuppressionContext = {}): SuppressionConfig {
  const out: SuppressionConfig = { entries: [], consumed: [], remaps: {}, disabled: [], ignoreInMatcher: [] };

  if (context.paused || context.safeMode) return out;

  const emergencyVks = comboToVks(context.emergencySafe);
  const hyperVk = keyToVk(context.hyperKey);

  for (const entry of entries ?? []) {
    if (!entry?.enabled || entry?.mouse) continue;
    const behavior = behaviorOf(entry);
    if (behavior === "passThrough") continue;
    // Only plain (no-modifier) keys are suppressible; combos need full combo
    // state matching in the hook and are intentionally left untouched.
    if (entry.modifiers?.length) continue;
    const vk = keyToVk(entry.key);
    if (vk === undefined) continue;
    if (emergencyVks.has(vk)) continue;
    if (isSecureVkCombo([entry.key], entry.modifiers ?? [])) continue;

    if (behavior === "disable") {
      out.disabled.push(vk);
      out.consumed.push(vk);
      out.ignoreInMatcher.push(vk);
      out.entries.push({ vk, keyName: entry.key, mode: "disable" });
      continue;
    }

    if (behavior === "remap") {
      const outVk = keyToVk(entry.remapTo);
      if (outVk !== undefined && outVk !== vk) {
        out.remaps[vk] = outVk;
        out.consumed.push(vk);
        out.entries.push({ vk, keyName: entry.key, mode: "remap", remapTo: outVk, remapToName: entry.remapTo });
      }
      continue;
    }

    out.consumed.push(vk);
    out.entries.push({
      vk,
      keyName: entry.key,
      mode: "suppress",
      conditionalCapsPassThrough: entry.key === "CapsLock" && hyperVk !== undefined,
      hyperVk: entry.key === "CapsLock" ? hyperVk : undefined,
    });
  }

  out.consumed = [...new Set(out.consumed)];
  out.disabled = [...new Set(out.disabled)];
  out.ignoreInMatcher = [...new Set(out.ignoreInMatcher)];
  return out;
}
