import { isSecureVkCombo, keyToVk } from './win-vk.js';

export interface QuickPreviewBinding { key: string; vk: number; modifiers: number }

/** Parse only explicit, non-system-reserved chords. A bare Space is valid. */
export function parseQuickPreviewBinding(value: unknown): QuickPreviewBinding | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const trimmed = value.trim();
  const numPlus = /(?:^|\+)Num\+$/i.test(trimmed);
  const parts = (numPlus ? trimmed.slice(0, -4) : trimmed).split('+').map(x => x.trim()).filter(Boolean);
  const key = numPlus ? 'Num+' : parts.pop();
  if (!key || !parts.every(p => /^(ctrl|alt|shift|win)$/i.test(p))) return null;
  const names = parts.map(p => p.toLowerCase());
  if (new Set(names).size !== names.length || isSecureVkCombo([key], names)) return null;
  const vk = keyToVk(key);
  // Modifier keys alone are not useful bindings. Preserve the emergency chord.
  if (vk === undefined || [0x10,0x11,0x12,0x5b,0x5c,0xa0,0xa1,0xa2,0xa3,0xa4,0xa5].includes(vk)) return null;
  if (vk === 0x7b && ['ctrl','alt','shift'].every(m => names.includes(m))) return null;
  const modifiers = names.reduce((mask, m) => mask | ({ ctrl: 1, alt: 2, shift: 4, win: 8 }[m] ?? 0), 0);
  return { key, vk, modifiers };
}

/** Compare virtual keys and modifier masks so aliases cannot bypass a conflict. */
export function conflictsWithEmergencyShortcut(binding: QuickPreviewBinding, shortcut: unknown): boolean {
  const emergency = parseQuickPreviewBinding(shortcut);
  return !!emergency && binding.vk === emergency.vk && binding.modifiers === emergency.modifiers;
}

export function conflictsWithActiveShortcuts(binding: QuickPreviewBinding, shortcuts: unknown): boolean {
  if (!Array.isArray(shortcuts)) return false;
  return shortcuts.slice(0, 5000).some(shortcut => {
    const active = parseQuickPreviewBinding(shortcut);
    return !!active && binding.vk === active.vk && binding.modifiers === active.modifiers;
  });
}
