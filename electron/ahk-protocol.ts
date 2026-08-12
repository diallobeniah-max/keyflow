/**
 * Narrow AutoHotkey v2 stdout protocol: newline-delimited JSON events.
 * Pure module, no Electron import.
 */
export interface AhkKeyEvent {
  type: "key";
  state: "down" | "up";
  key: string;
  source: "autohotkey-suppression";
  sequence: number;
}

export interface AhkReadyEvent {
  type: "ready";
  source: "autohotkey-suppression";
}

export function parseAhkEvent(line: string): AhkKeyEvent | AhkReadyEvent | null {
  if (!line) return null;
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  if (obj.type === "ready" && obj.source === "autohotkey-suppression") {
    return { type: "ready", source: "autohotkey-suppression" };
  }
  if (obj.type !== "key") return null;
  if (obj.state !== "down" && obj.state !== "up") return null;
  if (typeof obj.key !== "string" || obj.key.length === 0) return null;
  if (obj.source !== "autohotkey-suppression") return null;
  const sequence = Number(obj.sequence);
  if (!Number.isFinite(sequence)) return null;
  return { type: "key", state: obj.state, key: obj.key, source: "autohotkey-suppression", sequence };
}

export function encodeAhkKeyEvent(state: "down" | "up", key: string, sequence: number): string {
  return JSON.stringify({ type: "key", state, key, source: "autohotkey-suppression", sequence });
}
