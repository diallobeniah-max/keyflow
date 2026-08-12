import { ModifierKey, Settings, Shortcut } from "../types";
import { RISKY_KEYS } from "./constants";

export interface Conflict {
  level: "error" | "warning" | "info";
  message: string;
  existingId?: string;
}

const SYSTEM_SHORTCUTS = ["Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+S", "Ctrl+A", "Ctrl+P", "Alt+Tab", "Alt+F4", "Win+", "Ctrl+Shift+Esc", "Ctrl+Alt+Delete"];

function sameMods(a: ModifierKey[], b: ModifierKey[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function label(key: string, mods: ModifierKey[]): string {
  return (mods.length ? mods.join("+") + "+" : "") + key;
}

export function detectConflicts(candidate: Shortcut, all: Shortcut[], settings: Settings): Conflict[] {
  const out: Conflict[] = [];
  for (const s of all) {
    if (s.id === candidate.id) continue;
    const sameKey = s.key === candidate.key && sameMods(s.modifiers, candidate.modifiers);
    if (!sameKey) continue;

    if (s.profileId === candidate.profileId && s.trigger === candidate.trigger) {
      out.push({ level: "error", existingId: s.id, message: `Already used by "${s.name}" in this profile.` });
    }
    if (s.profileId === candidate.profileId && s.trigger !== candidate.trigger) {
      const tap = candidate.trigger === "single" || s.trigger === "single";
      const hold = candidate.trigger === "longPress" || candidate.trigger === "hold" || s.trigger === "longPress" || s.trigger === "hold";
      if (tap && hold) {
        out.push({ level: "warning", existingId: s.id, message: `${candidate.key} is assigned to "${candidate.name}" on ${candidate.trigger} and "${s.name}" on ${s.trigger}. KeyFlow runs only one action based on how long you hold the key.` });
      } else {
        out.push({ level: "warning", existingId: s.id, message: `Same key is also used by "${s.name}" with ${s.trigger}. Timing may overlap.` });
      }
    }
    if (s.profileId !== candidate.profileId && s.trigger === candidate.trigger) {
      out.push({ level: "info", existingId: s.id, message: `Same key/trigger exists in another profile. Active profile wins.` });
    }
  }

  if (RISKY_KEYS.includes(candidate.key) && !settings.shortcuts.allowRisky) {
    out.push({ level: "warning", message: `${candidate.key} is a risky/system key. Enable allow risky keys if you really want this.` });
  }
  if (!candidate.modifiers.length && /^[A-Z0-9]$/.test(candidate.key)) {
    out.push({ level: "warning", message: "Fast repeated typing of this key may activate the shortcut. Consider adding a modifier or limiting it to specific applications." });
  }
  const full = label(candidate.key, candidate.modifiers);
  if (SYSTEM_SHORTCUTS.some((sys) => full === sys || (sys.endsWith("+") && full.startsWith(sys)))) {
    out.push({ level: "warning", message: `${full} may conflict with Windows or app shortcuts.` });
  }
  return out;
}
