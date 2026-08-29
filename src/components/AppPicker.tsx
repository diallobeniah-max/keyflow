import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppScope } from "../types";
import {
  diffRunningApps,
  filterRunningApps,
  formatScopeLabel,
  normalizeExecutablePath,
  savedScopes,
  scopeFromBrowsePath,
  scopeFromPickedApp,
} from "../lib/app-scope";
import { useStore } from "../store/useStore";
import { Button, Field, Input, Modal } from "./ui";
import { Icon } from "./Icon";

interface RunningApp {
  executablePath: string;
  processName: string;
  displayName: string;
  icon?: string;
}

function formatIconSrc(icon?: string): string | null {
  if (!icon || !icon.trim()) return null;
  const trimmed = icon.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("http:") || trimmed.startsWith("https:") || trimmed.startsWith("file:")) {
    return trimmed;
  }
  if (trimmed.startsWith("Qk")) {
    return `data:image/bmp;base64,${trimmed}`;
  }
  if (trimmed.startsWith("iVBOR")) {
    return `data:image/png;base64,${trimmed}`;
  }
  return `data:image/png;base64,${trimmed}`;
}

function AppPickerItemIcon({ icon, name }: { icon?: string; name: string }) {
  const [error, setError] = useState(false);
  const src = formatIconSrc(icon);

  if (!src || error) {
    const cleanName = (name || "App").replace(/\.exe$/i, "").trim();
    const initial = cleanName.charAt(0).toUpperCase() || "A";
    return (
      <span className="app-picker-fallback-icon" aria-hidden="true">
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={20}
      height={20}
      onError={() => setError(true)}
      style={{ objectFit: "contain", borderRadius: "var(--radius-xs)" }}
    />
  );
}

/** Live scanner cadence (ms) while the picker is open. */
const REFRESH_MS = 1000;

async function listRunningApps(): Promise<RunningApp[]> {
  const eapi = (window as any).electronAPI;
  if (!eapi?.input?.listApps) return [];
  try {
    return filterRunningApps((await eapi.input.listApps()) as RunningApp[]);
  } catch {
    return [];
  }
}

async function browseForExe(): Promise<string | null> {
  const eapi = (window as any).electronAPI;
  if (!eapi?.input?.browseExe) return null;
  try {
    return (await eapi.input.browseExe()) as string | null;
  } catch {
    return null;
  }
}

async function activeAppKey(): Promise<string> {
  const eapi = (window as any).electronAPI;
  if (!eapi?.input?.getActiveApp) return "";
  try {
    const app = await eapi.input.getActiveApp();
    return normalizeExecutablePath(app?.executablePath);
  } catch {
    return "";
  }
}

interface AppPickerProps {
  value: AppScope | undefined;
  onChange: (scope: AppScope | undefined) => void;
  disabled?: boolean;
}

/**
 * "Works In" selector: Everywhere by default, or restricted to one app by
 * normalized executable identity. The native engine resolves the foreground
 * app; this component only builds the AppScope value.
 *
 * The picker shows two lists:
 *  - **Running now**: a LIVE scanner, refreshed every ~1s while open, on open,
 *    and whenever KeyFlow regains focus. Apps that close drop out here only.
 *  - **Saved apps**: scopes already referenced by shortcuts in the active
 *    profile. These persist even when the app is not running — closing an app
 *    never deletes a saved scope.
 */
export function AppPicker({ value, onChange, disabled }: AppPickerProps) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<RunningApp[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [currentKey, setCurrentKey] = useState("");
  const appsRef = useRef<RunningApp[]>([]);
  appsRef.current = apps;

  const shortcuts = useStore((s) => s.data.shortcuts);
  const activeProfileId = useStore((s) => s.activeProfileId);

  const loadApps = useCallback(async () => {
    // Diff against the last snapshot so list updates don't churn React state
    // when nothing changed (keeps the live list stable while the user hovers).
    const next = await listRunningApps();
    const prev = appsRef.current;
    const diff = diffRunningApps(prev, next);
    if (diff.added.length === 0 && diff.removed.length === 0) {
      return;
    }
    setApps(next);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setLoading(true);
      void listRunningApps().then((next) => {
        setApps(next);
        setLoading(false);
      });
      void activeAppKey().then(setCurrentKey);
      const timer = window.setInterval(loadApps, REFRESH_MS);
      const onFocus = () => {
        void loadApps();
        void activeAppKey().then(setCurrentKey);
      };
      window.addEventListener("focus", onFocus);
      return () => {
        window.clearInterval(timer);
        window.removeEventListener("focus", onFocus);
      };
    }
    return undefined;
  }, [open, loadApps]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return apps;
    return apps.filter((a) =>
      (a.displayName + " " + a.processName + " " + a.executablePath).toLowerCase().includes(query)
    );
  }, [apps, q]);

  // Saved app scopes referenced by shortcuts in the active profile — never
  // removed when the app is not running.
  const saved = useMemo(() => {
    const profileShortcuts = shortcuts.filter((s) => !activeProfileId || s.profileId === activeProfileId);
    return savedScopes(profileShortcuts);
  }, [shortcuts, activeProfileId]);

  const runningKeys = useMemo(() => new Set(apps.map((a) => normalizeExecutablePath(a.executablePath))), [apps]);

  const savedNotRunning = useMemo(
    () => saved.filter((s) => !runningKeys.has(normalizeExecutablePath(s.executablePath))),
    [saved, runningKeys]
  );

  const pickApp = (app: RunningApp) => {
    onChange(scopeFromPickedApp(app));
    setOpen(false);
  };

  const browse = async () => {
    const path = await browseForExe();
    if (!path) return;
    const scope = scopeFromBrowsePath(path);
    if (scope) {
      onChange(scope);
      setOpen(false);
    }
  };

  const current = formatScopeLabel(value);
  const isScoped = !!value && value.scopeType === "executable";

  return (
    <>
      <Field label="Works In" hint="Everywhere (default) or only in one specific app">
        <div className="segmented-control" role="group" aria-label="Works In">
          <button
            type="button"
            className={"seg-btn" + (!isScoped ? " is-active" : "")}
            aria-pressed={!isScoped}
            disabled={disabled}
            onClick={() => onChange(undefined)}
          >
            <Icon name="globe" size={14} />
            Everywhere
          </button>
          <button
            type="button"
            className={"seg-btn" + (isScoped ? " is-active" : "")}
            aria-pressed={isScoped}
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            <Icon name="window" size={14} />
            {isScoped ? current : "Specific App"}
          </button>
        </div>
        {isScoped && (
          <div className="app-scope-chip">
            <span className="chip chip-subtle">{current}</span>
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              Change app
            </Button>
          </div>
        )}
      </Field>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose an app"
        width={480}
        footer={
          <div className="spread">
            <Button size="sm" variant="ghost" onClick={browse}>
              <Icon name="folder" size={13} />
              Browse for application…
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="mb-sm">
          <Input
            aria-label="Search running apps"
            placeholder="Search running apps…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="app-picker-list" role="listbox" aria-label="Running apps">
          <div className="app-picker-section" role="presentation">
            <span className="app-picker-section-title">
              Running now
              {loading && <span className="app-picker-live">refreshing…</span>}
            </span>
            {filtered.map((app) => {
              const isCurrent = currentKey === normalizeExecutablePath(app.executablePath);
              return (
                <button
                  key={app.executablePath}
                  type="button"
                  role="option"
                  className="app-picker-item"
                  onClick={() => pickApp(app)}
                >
                  <span className="app-picker-icon">
                    <AppPickerItemIcon icon={app.icon} name={app.displayName || app.processName} />
                  </span>
                  <span className="app-picker-copy">
                    <b>{app.displayName || app.processName}</b>
                    <small>{app.executablePath}</small>
                  </span>
                  {isCurrent && (
                    <span className="app-picker-current" title="Active foreground application">
                      Current
                    </span>
                  )}
                </button>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="muted tiny">No running apps found. Browse for an application instead.</div>
            )}
          </div>

          {savedNotRunning.length > 0 && (
            <div className="app-picker-section" role="presentation">
              <span className="app-picker-section-title">Saved apps</span>
              <span className="app-picker-saved-hint">
                Apps you have shortcuts for stay here even when they are not running.
              </span>
              {savedNotRunning.map((s) => {
                const label = formatScopeLabel(s);
                return (
                  <button
                    key={normalizeExecutablePath(s.executablePath)}
                    type="button"
                    role="option"
                    className="app-picker-item"
                    onClick={() => {
                      onChange(s);
                      setOpen(false);
                    }}
                  >
                    <span className="app-picker-icon">
                      <AppPickerItemIcon name={label} />
                    </span>
                    <span className="app-picker-copy">
                      <b>{label}</b>
                      <small>{s.executablePath}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}