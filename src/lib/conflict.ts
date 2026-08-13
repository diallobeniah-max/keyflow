import type { ModifierKey, Settings, Shortcut, TriggerType } from "../types";

const TRIGGER_LABELS: Record<string, string> = {
  single: "Tap",
  double: "Double tap",
  triple: "Triple tap",
  hold: "Hold",
  longPress: "Hold",
  tapThenHold: "Tap then hold",
  combo: "Combination",
  sequence: "Sequence",
};

const RISKY_SYSTEM_KEYS = ["F12", "Meta", "Win", "Control", "Alt", "Shift"];

export type ConflictLevel = "error" | "warning" | "info";
export type ConflictType =
  | "exact_duplicate"
  | "gesture_overlap"
  | "risky_bare_key"
  | "profile_overlap"
  | "system_reserved";

export interface SuggestedShortcut {
  key: string;
  modifiers: ModifierKey[];
  trigger: TriggerType;
  label: string;
}

export interface Conflict {
  level: ConflictLevel;
  type: ConflictType;
  message: string;
  existingId?: string;
  existingName?: string;
  existingTrigger?: TriggerType;
  suggestions?: SuggestedShortcut[];
}

export interface ConflictReport {
  hasBlockingConflict: boolean;
  hasWarning: boolean;
  conflicts: Conflict[];
  suggestions: SuggestedShortcut[];
}

const SYSTEM_SHORTCUTS = [
  "Ctrl+C",
  "Ctrl+V",
  "Ctrl+X",
  "Ctrl+Z",
  "Ctrl+S",
  "Ctrl+A",
  "Ctrl+P",
  "Alt+Tab",
  "Alt+F4",
  "Win+",
  "Ctrl+Shift+Esc",
  "Ctrl+Alt+Delete",
];

export function sameModifiers(a: ModifierKey[] = [], b: ModifierKey[] = []): boolean {
  const normA = [...a].map((m) => m.toLowerCase()).sort();
  const normB = [...b].map((m) => m.toLowerCase()).sort();
  return JSON.stringify(normA) === JSON.stringify(normB);
}

export function isPrintableKey(key: string): boolean {
  if (!key) return false;
  // A-Z single character
  if (/^[a-zA-Z0-9]$/.test(key)) return true;
  // Common symbols and punctuation
  const printableSpecial = new Set([
    "Space", "Enter", "Backspace", "Tab",
    ";", "=", ",", "-", ".", "/", "`", "[", "\\", "]", "'",
    "Semicolon", "Equal", "Comma", "Minus", "Period", "Slash", "Backquote",
    "BracketLeft", "Backslash", "BracketRight", "Quote",
  ]);
  return printableSpecial.has(key);
}

export function formatShortcutLabel(modifiers: ModifierKey[] = [], key: string): string {
  const prefix = modifiers.length ? modifiers.join(" + ") + " + " : "";
  return `${prefix}${key}`;
}

/**
 * Checks if two triggers on the exact same physical key & modifier chord
 * create a gesture overlap / timing collision.
 */
export function areTriggersConflicting(t1: TriggerType, t2: TriggerType): { conflicting: boolean; exact: boolean } {
  if (t1 === t2) {
    return { conflicting: true, exact: true };
  }

  // Single tap collides with double tap, triple tap, tap-then-hold, and hold
  // because single tap fires on key down or release before multi-tap can complete.
  const isSingle = (t: TriggerType) => t === "single";
  const isMulti = (t: TriggerType) => t === "double" || t === "triple" || t === "tapThenHold" || t === "longPress" || t === "hold";
  if ((isSingle(t1) && isMulti(t2)) || (isSingle(t2) && isMulti(t1))) {
    return { conflicting: true, exact: false };
  }

  // Double tap collides with triple tap
  const isDouble = (t: TriggerType) => t === "double";
  const isTriple = (t: TriggerType) => t === "triple";
  if ((isDouble(t1) && isTriple(t2)) || (isDouble(t2) && isTriple(t1))) {
    return { conflicting: true, exact: false };
  }

  // Hold vs LongPress (synonyms)
  if ((t1 === "hold" && t2 === "longPress") || (t1 === "longPress" && t2 === "hold")) {
    return { conflicting: true, exact: true };
  }

  return { conflicting: false, exact: false };
}

/**
 * Suggest 2-4 clean, unused alternative modifier combinations for the given key.
 */
export function getSuggestedShortcuts(
  candidate: Partial<Shortcut>,
  allShortcuts: Shortcut[] = [],
  options: { limit?: number; excludeId?: string; activeProfileId?: string } = {}
): SuggestedShortcut[] {
  const baseKey = candidate.key || "F";
  const trigger = candidate.trigger || "single";
  const limit = options.limit ?? 3;
  const currentId = options.excludeId ?? candidate.id;
  const profileId = options.activeProfileId ?? candidate.profileId;

  const candidateChords: ModifierKey[][] = [
    ["Ctrl", "Shift"],
    ["Alt", "Shift"],
    ["Ctrl", "Alt"],
    ["Ctrl", "Alt", "Shift"],
    ["Win", "Shift"],
    ["Ctrl"],
    ["Alt"],
  ];

  const suggestions: SuggestedShortcut[] = [];

  for (const mods of candidateChords) {
    if (sameModifiers(candidate.modifiers, mods)) continue;

    const testShortcut: Shortcut = {
      id: "candidate-test",
      name: "Test",
      profileId: profileId || "prof-default",
      key: baseKey,
      modifiers: mods,
      trigger,
      timing: { tapInterval: 300, holdDuration: 500, delay: 0, cooldown: 350 },
      actions: [],
      enabled: true,
      createdAt: 0,
    };

    // Check if this chord conflicts with any enabled shortcut
    const report = analyzeShortcutConflicts(testShortcut, allShortcuts, undefined, {
      currentShortcutId: currentId,
      activeProfileId: profileId,
      skipSuggestions: true,
    });

    if (!report.hasBlockingConflict) {
      suggestions.push({
        key: baseKey,
        modifiers: mods,
        trigger,
        label: formatShortcutLabel(mods, baseKey),
      });
      if (suggestions.length >= limit) break;
    }
  }

  return suggestions;
}

/**
 * Central Conflict Analysis Engine.
 * Examines candidate shortcut against all existing shortcuts in the workspace.
 */
export function analyzeShortcutConflicts(
  candidate: Partial<Shortcut>,
  allShortcuts: Shortcut[] = [],
  settings?: Settings,
  options: { currentShortcutId?: string; activeProfileId?: string; skipSuggestions?: boolean } = {}
): ConflictReport {
  const conflicts: Conflict[] = [];
  const candidateKey = (candidate.key ?? "").trim();
  if (!candidateKey) {
    return { hasBlockingConflict: false, hasWarning: false, conflicts: [], suggestions: [] };
  }

  const candidateMods = candidate.modifiers ?? [];
  const candidateTrigger = candidate.trigger ?? "single";
  const candidateProfile = options.activeProfileId ?? candidate.profileId ?? "prof-default";
  const currentId = options.currentShortcutId ?? candidate.id;

  for (const s of allShortcuts) {
    // Skip checking against itself when editing
    if (s.id === currentId) continue;
    if (!s.enabled) continue; // Disabled shortcuts do not block active matching

    const isSameKey = s.key.toLowerCase() === candidateKey.toLowerCase();
    const isSameChord = isSameKey && sameModifiers(s.modifiers, candidateMods);

    if (!isSameChord) continue;

    const sameProfile = !s.profileId || !candidateProfile || s.profileId === candidateProfile;
    const triggerMatch = areTriggersConflicting(candidateTrigger, s.trigger);

    if (sameProfile) {
      if (triggerMatch.exact) {
        conflicts.push({
          level: "error",
          type: "exact_duplicate",
          existingId: s.id,
          existingName: s.name || s.key,
          existingTrigger: s.trigger,
          message: `${formatShortcutLabel(candidateMods, candidateKey)} is already used by “${s.name || "Existing shortcut"}”.`,
        });
      } else if (triggerMatch.conflicting) {
        const existTrigLabel = TRIGGER_LABELS[s.trigger] ?? s.trigger;
        const candTrigLabel = TRIGGER_LABELS[candidateTrigger] ?? candidateTrigger;
        conflicts.push({
          level: "error",
          type: "gesture_overlap",
          existingId: s.id,
          existingName: s.name || s.key,
          existingTrigger: s.trigger,
          message: `“${s.name || s.key}” is already assigned to ${existTrigLabel}. A ${candTrigLabel} on the same key will conflict and fire the wrong action.`,
        });
      }
    } else {
      // Disjoint profile with identical trigger
      if (triggerMatch.exact) {
        conflicts.push({
          level: "info",
          type: "profile_overlap",
          existingId: s.id,
          existingName: s.name || s.key,
          existingTrigger: s.trigger,
          message: `Same shortcut exists in another profile. The active profile will take precedence.`,
        });
      }
    }
  }

  // Risky bare printable key check (e.g. bare "F" or "T" single tap)
  const isBarePrintable = candidateMods.length === 0 && isPrintableKey(candidateKey);
  if (isBarePrintable && candidateTrigger === "single") {
    conflicts.push({
      level: "warning",
      type: "risky_bare_key",
      message: `Single printable key '${candidateKey}' may activate while typing. We recommend adding a modifier chord like Ctrl + Shift.`,
    });
  }

  // Risky system keys check (e.g. F12, WinKey)
  if (RISKY_SYSTEM_KEYS.includes(candidateKey) && !settings?.shortcuts?.allowRisky) {
    conflicts.push({
      level: "warning",
      type: "risky_bare_key",
      message: `${candidateKey} is a reserved system key.`,
    });
  }

  // Reserved OS shortcuts check
  const fullLabel = formatShortcutLabel(candidateMods, candidateKey);
  if (SYSTEM_SHORTCUTS.some((sys) => fullLabel === sys || (sys.endsWith("+") && fullLabel.startsWith(sys)))) {
    conflicts.push({
      level: "warning",
      type: "system_reserved",
      message: `${fullLabel} is a standard Windows combination and may override app behavior.`,
    });
  }

  const hasBlockingConflict = conflicts.some((c) => c.level === "error");
  const hasWarning = conflicts.some((c) => c.level === "warning");

  let suggestions: SuggestedShortcut[] = [];
  if ((hasBlockingConflict || hasWarning) && !options.skipSuggestions) {
    suggestions = getSuggestedShortcuts(candidate, allShortcuts, {
      excludeId: currentId,
      activeProfileId: candidateProfile,
    });
    // Attach suggestions to blocking conflicts
    for (const c of conflicts) {
      if (c.level === "error" || c.type === "risky_bare_key") {
        c.suggestions = suggestions;
      }
    }
  }

  return {
    hasBlockingConflict,
    hasWarning,
    conflicts,
    suggestions,
  };
}

/**
 * Backward-compatible wrapper for existing components (Shortcuts list, etc.).
 */
export function detectConflicts(candidate: Shortcut, all: Shortcut[] = [], settings?: Settings): Conflict[] {
  const report = analyzeShortcutConflicts(candidate, all, settings, {
    currentShortcutId: candidate.id,
    activeProfileId: candidate.profileId,
  });
  return report.conflicts;
}

/**
 * Returns safe, unused physical key candidates for assignment as Hyper Key.
 * Excludes CapsLock if CapsLock is already assigned to a shortcut (e.g. Screenshot).
 * Excludes keys already assigned in the active profile.
 */
export function getSafeHyperKeySuggestions(
  allShortcuts: Shortcut[] = [],
  activeProfileId?: string,
  activeHyperKey?: string,
): { value: string; label: string; safe: boolean; warning?: string }[] {
  const CANDIDATES = [
    { value: "AltRight", label: "Right Alt" },
    { value: "ControlRight", label: "Right Ctrl" },
    { value: "Apps", label: "Menu / Application Key" },
    { value: "ScrollLock", label: "Scroll Lock" },
    { value: "NumLock", label: "Num Lock" },
    { value: "CapsLock", label: "Caps Lock" },
  ];

  const assignedKeys = new Set(
    allShortcuts
      .filter((s) => s.enabled && (!activeProfileId || s.profileId === activeProfileId))
      .map((s) => s.key.toLowerCase()),
  );

  return CANDIDATES.map((c) => {
    const isCurrent = activeHyperKey?.toLowerCase() === c.value.toLowerCase();
    const isAssigned = assignedKeys.has(c.value.toLowerCase());
    let warning: string | undefined;
    let safe = true;

    if (isAssigned) {
      safe = false;
      if (c.value === "CapsLock") {
        warning = "Caps Lock is assigned to Screenshot. Choosing it as Hyper Key will conflict.";
      } else {
        warning = `${c.label} is currently assigned to a shortcut.`;
      }
    }

    return {
      value: c.value,
      label: isCurrent ? `${c.label} (Current)` : c.label,
      safe,
      warning,
    };
  });
}
