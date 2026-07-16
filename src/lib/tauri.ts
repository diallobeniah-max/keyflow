declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: { invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T> } };
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

export async function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri() && window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke<T>(command, args);
  }
  throw new Error("invoke not available outside Tauri: " + command);
}

export async function tauriSave(data: unknown): Promise<void> {
  if (isTauri()) {
    try {
      await invoke("save_state", { data });
      return;
    } catch {
      // Browser fallback is intentional for the hybrid build.
    }
  }
  localStorage.setItem("keyflow:state", JSON.stringify(data));
}

export async function tauriLoad(): Promise<unknown | null> {
  if (isTauri()) {
    try {
      return await invoke<unknown>("load_state");
    } catch {
      // Browser fallback is intentional for the hybrid build.
    }
  }
  const raw = localStorage.getItem("keyflow:state");
  return raw ? JSON.parse(raw) : null;
}
