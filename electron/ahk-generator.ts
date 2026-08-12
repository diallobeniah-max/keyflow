/**
 * Generates an AutoHotkey v2 suppression script. Pure module, no Electron import.
 *
 * Each configured key gets a `$*Key` hotkey (down) and `$*Key up` hotkey.
 * The missing `~` prefix means AHK consumes the key (its normal Windows
 * behavior is suppressed, e.g. Caps Lock no longer toggles). The `$` prefix
 * stops our own SendEvent replacement from re-triggering the hotkey.
 */
export interface SuppressKey {
  ahkKey: string;
  mode: "suppress" | "disable" | "remap";
  remapTo?: string;
}

export function generateAhkScript(keys: SuppressKey[]): string {
  const lines: string[] = [];
  lines.push("#Requires AutoHotkey v2.0");
  lines.push("#SingleInstance Force");
  lines.push("Persistent");
  lines.push("KF_Seq := 0");
  lines.push("Emit(state, key) {");
  lines.push("  global KF_Seq");
  lines.push("  KF_Seq += 1");
  lines.push('  FileAppend(\'{"type":"key","state":"\' . state . \'","key":"\' . key . \'","source":"autohotkey-suppression","sequence":\' . KF_Seq . \'}\' . "`n", "*")');
  lines.push("}");
  lines.push('FileAppend(\'{"type":"ready","source":"autohotkey-suppression"}\' . "`n", "*")');
  for (const k of keys) {
    if (k.mode === "remap" && k.remapTo) {
      lines.push(`Hotkey("$*${k.ahkKey}", (*) => { Emit("down", "${k.ahkKey}"); SendEvent("{${k.remapTo}}") })`);
      lines.push(`Hotkey("$*${k.ahkKey} up", (*) => Emit("up", "${k.ahkKey}"))`);
    } else {
      lines.push(`Hotkey("$*${k.ahkKey}", (*) => Emit("down", "${k.ahkKey}"))`);
      lines.push(`Hotkey("$*${k.ahkKey} up", (*) => Emit("up", "${k.ahkKey}"))`);
    }
  }
  lines.push("");
  return lines.join("\n");
}