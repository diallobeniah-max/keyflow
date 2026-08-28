import { comboToVks, isExtendedVk, isSecureVkCombo, keyToVk } from "./win-vk.js";

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
    includeShift?: boolean;
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
  modifiers: string[];
  trigger: { kind: string; tapInterval: number; holdDuration: number; cooldown: number; delay: number };
  behavior: "pass" | "suppress" | "disable" | "remap";
  remapTo: number;
  enabled: boolean;
  /** App-specific scope (executable path identity), or undefined = Everywhere. */
  appScope?: {
    scopeType: "executable";
    executablePath: string;
    processName?: string;
    displayName?: string;
  };
}

export const HYPER_TAP_SYNTHETIC_ID = "__keyflow_hyper_tap__";

/**
 * Raycast-parity rule: a Hyper key that is itself a Windows modifier
 * (Ctrl / Alt / Shift / Win variants) activates Ctrl+Alt+Win immediately and
 * must NOT have a Quick Press / tap action. Only non-modifier Hyper keys
 * (Caps Lock, F1–F12, Apps, Scroll/Num Lock) may use a tap-vs-chord gesture.
 */
export function isModifierHyperKey(key: string | undefined): boolean {
  const vk = keyToVk(key);
  if (vk === undefined) return false;
  switch (vk) {
    case 0x11: case 0xa2: case 0xa3: // Ctrl / L / R
    case 0x12: case 0xa4: case 0xa5: // Alt / L / R
    case 0x10: case 0xa0: case 0xa1: // Shift / L / R
    case 0x5b: case 0x5c:            // Win / L / R
      return true;
    default:
      return false;
  }
}

export function resolveActionForHyperTap(target: string | undefined): any[] {
  if (!target || target === "" || target === "none") return [];
  if (target === "showPopup" || target === "popup" || target === "sc-f-popup") {
    return [{ id: "act-hyper-tap-popup", type: "showPopup", payload: {} }];
  }
  if (target === "notesPopup" || target === "notes") {
    return [{ id: "act-hyper-tap-notes", type: "notesPopup", payload: {} }];
  }
  if (target === "screenshot" || target === "snip") {
    return [{ id: "act-hyper-tap-snip", type: "screenshot", payload: { screenshotMode: "snipOverlay" } }];
  }
  if (target === "alwaysOnTop" || target === "topmost") {
    return [{ id: "act-hyper-tap-topmost", type: "alwaysOnTop", payload: { topmostMode: "toggle", highlight: true, sound: true } }];
  }
  if (target === "openSettings") {
    return [{ id: "act-hyper-tap-settings", type: "openSettings", payload: {} }];
  }
  return [];
}

export function compileHyperModifiers(modifiers: string[], includeShift = false): string[] {
  const hasHyper = (modifiers ?? []).some((m) => String(m).toLowerCase() === "hyper");
  if (!hasHyper) return (modifiers ?? []).map((m) => String(m).toLowerCase());

  const effectiveHyper = includeShift
    ? ["ctrl", "alt", "shift", "win"]
    : ["ctrl", "alt", "win"];

  const outSet = new Set<string>();
  for (const m of modifiers) {
    const lower = String(m).toLowerCase();
    if (lower === "hyper") {
      for (const h of effectiveHyper) outSet.add(h);
    } else {
      outSet.add(lower);
    }
  }
  return Array.from(outSet);
}

export function buildNativeHyperSpec(context: SuppressionContext, entries: any[] = []) {
  const cfg = context.hyperKeyConfig;
  if (!cfg || !cfg.enabled || !cfg.key) return null;
  const vk = keyToVk(cfg.key);
  if (vk === undefined) return null;

  // Modifier Hyper keys (Right Alt, Ctrl, Shift, Win variants) must NOT carry a
  // tap action — Raycast parity. Quick Press is only for non-modifier keys.
  let tapActionId: string | undefined;
  if (!isModifierHyperKey(cfg.key)) {
    tapActionId = cfg.tapActionId || undefined;
    if (tapActionId) {
      const existing = (entries ?? []).find((e: any) => e && e.id === tapActionId);
      if (!existing) {
        const actions = resolveActionForHyperTap(tapActionId);
        if (actions.length > 0) {
          tapActionId = HYPER_TAP_SYNTHETIC_ID;
        }
      }
    }
  }

  return {
    enabled: true,
    vk,
    includeShift: !!cfg.includeShift,
    suppressOriginal: cfg.suppressOriginal ?? true,
    tapActionId,
  };
}

/**
 * Normalize a shortcut's app scope into the native `appScope` shape, or return
 * undefined for Everywhere / invalid scopes. The executable path is the only
 * identity the engine matches on; name fields are friendly metadata only.
 */
export function normalizeAppScope(scope: any): NativeShortcutSpec["appScope"] {
  if (!scope || scope.scopeType !== "executable") return undefined;
  const path = String(scope.executablePath ?? "").trim();
  if (!path) return undefined;
  return {
    scopeType: "executable",
    executablePath: path,
    processName: scope.processName ? String(scope.processName) : undefined,
    displayName: scope.displayName ? String(scope.displayName) : undefined,
  };
}

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
  const includeShift = !!context.hyperKeyConfig?.includeShift;

  for (const entry of entries ?? []) {
    if (!entry?.enabled || entry?.mouse) continue;
    let vk = keyToVk(entry.key);
    if (vk === undefined && (entry.key?.toLowerCase() === "hyper" || entry.key?.toLowerCase() === "hyperkey")) {
      vk = keyToVk(context.hyperKeyConfig?.key) ?? 0xa5;
    }
    if (vk === undefined) continue;
    const kind = String(entry.trigger ?? "single");
    if (kind === "sequence") continue; // no spec, ignored by engine
    const behavior = shortcutBehavior(entry);
    const t = entry.timing ?? {};
    const appScope = normalizeAppScope(entry.appScope);
    out.push({
      id: entry.id,
      name: entry.name,
      key: { vk, scanCode: 0, extended: isExtendedVk(vk, entry.key) },
      modifiers: compileHyperModifiers(entry.modifiers ?? [], includeShift),
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
      ...(appScope ? { appScope } : {}),
    });
  }

  // Inject synthetic Hyper Tap shortcut entry if the configured tap action is
  // not an existing shortcut. Only non-modifier Hyper keys (Caps Lock, F-keys,
  // Apps, Scroll/Num Lock) can have a Quick Press / tap action.
  const cfg = context.hyperKeyConfig;
  if (cfg?.enabled && cfg?.tapActionId && cfg.tapActionId !== "none" && !isModifierHyperKey(cfg.key)) {
    const existing = (entries ?? []).find((e: any) => e && e.id === cfg.tapActionId);
    if (!existing) {
      const actions = resolveActionForHyperTap(cfg.tapActionId);
      if (actions.length > 0) {
        const vk = keyToVk(cfg.key) ?? 0xa5;
        out.push({
          id: HYPER_TAP_SYNTHETIC_ID,
          name: "Hyper Tap Action",
          key: { vk, scanCode: 0, extended: isExtendedVk(vk, cfg.key) },
          modifiers: [],
          trigger: { kind: "single", tapInterval: 0, holdDuration: 0, cooldown: 0, delay: 0 },
          behavior: "pass",
          remapTo: 0,
          enabled: true,
        });
      }
    }
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
