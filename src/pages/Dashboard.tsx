import { useState } from "react";
import { useStore } from "../store/useStore";
import { ACTION_META } from "../lib/constants";
import { formatTriggerLabel } from "../lib/conflict";
import { getEngine } from "../lib/engine";
import { Button, Card, EmptyState, IconButton, KeycapBadge, PageHeader, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";
import { Simulator } from "../components/Simulator";
import { EditShortcutModal } from "../components/EditShortcutModal";
import { playFeedbackSound } from "../lib/sound";

function timeAgo(at: number): string {
  const seconds = Math.floor((Date.now() - at) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function Dashboard() {
  const data = useStore((s) => s.data);
  const activeId = useStore((s) => s.activeProfileId);
  const paused = useStore((s) => s.paused);
  const safeMode = useStore((s) => s.safeMode);
  const setPage = useStore((s) => s.setPage);
  const toggleShortcut = useStore((s) => s.toggleShortcut);
  const togglePaused = useStore((s) => s.togglePaused);
  const setActive = useStore((s) => s.setActiveProfile);
  const wasdNavActive = useStore((s) => s.wasdNavigationActive);
  const setWasdNav = useStore((s) => s.setWasdNavigationActive);
  const patch = useStore((s) => s.patchSettings);
  const focusedApp = useStore((s) => s.focusedApp);

  const [simOpen, setSimOpen] = useState(false);
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);

  const activeProfile = data.profiles.find((p) => p.id === activeId);
  const activeShortcuts = data.shortcuts.filter((s) => s.profileId === activeId && s.enabled);
  const favorites = data.shortcuts.filter((s) => s.favorite);
  const displayedShortcuts = favorites.length > 0 ? favorites : data.shortcuts.slice(0, 6);

  const hyperConfig = data.settings.shortcuts?.hyperKeyConfig;
  const hyperEnabled = hyperConfig?.enabled ?? false;
  const hyperKey = hyperConfig?.key || "CapsLock";
  const soundEnabled = data.settings.audio?.enabled ?? true;
  const dragZonesEnabled = !!data.settings.dragSwitcher?.enabled;
  const repeatProtection = !!data.settings.shortcuts?.keyRepeatProtection;

  return (
    <div className="content">
      <PageHeader
        eyebrow="UTILITY HUB"
        title="KeyFlow Dashboard"
        description="Modular desktop automation suite. Manage background hooks, gesture shortcuts, Super Key chords, and navigation tools."
        usage="Toggle modules in real-time, test gestures with the simulator, or configure new shortcuts."
      >
        <Button
          variant="secondary"
          icon="play"
          onClick={() => setSimOpen(true)}
          title="Open interactive gesture simulator"
        >
          Test Simulator
        </Button>
        <Button
          variant="primary"
          icon="create"
          onClick={() => {
            useStore.getState().setEditing(null);
            setPage("create");
          }}
        >
          New Shortcut
        </Button>
      </PageHeader>

      <div className="dashboard-signal-strip" aria-label="KeyFlow runtime status">
        <div className="signal-cell">
          <span className="signal-label">ENGINE</span>
          <span className={safeMode ? "signal-value signal-danger" : paused ? "signal-value signal-warning" : "signal-value signal-live"}>
            <span className="status-dot" />
            {safeMode ? "Safe mode" : paused ? "Paused" : "Listening"}
          </span>
        </div>
        <div className="signal-cell">
          <span className="signal-label">PROFILE</span>
          <span className="signal-value">{activeProfile?.name ?? "Default"}</span>
        </div>
        <div className="signal-cell">
          <span className="signal-label">ACTIVE RULES</span>
          <span className="signal-value">{activeShortcuts.length.toString().padStart(2, "0")}</span>
        </div>
        <div className="signal-cell signal-cell-action">
          <span className="signal-label">FOREGROUND</span>
          <span className="signal-value signal-value-truncate" title={focusedApp || "Desktop Shell"}>{focusedApp || "Desktop Shell"}</span>
        </div>
      </div>

      {/* Hero Live System Telemetry Bar (Vorssaint Header Style) */}
      <div className="overview-banner mb-md">
        <div className="row gap-md">
          <div className="stat-icon-hero">
            <Icon name={paused ? "pause" : "sparkles"} size={22} />
          </div>
          <div>
            <div className="row gap-sm mb-xs">
              <h2 className="overview-banner-title no-margin">
                {safeMode ? "Safe Mode Active" : paused ? "Engine Paused" : "KeyFlow Engine Live"}
              </h2>
              <span
                className={`chip ${
                  safeMode ? "chip-danger" : paused ? "chip-warning" : "chip-success"
                }`}
              >
                <span className="status-dot" />
                <span>{safeMode ? "Safe Mode" : paused ? "Paused" : "Zero CPU Idle"}</span>
              </span>
            </div>
            <p className="overview-banner-desc">
              Profile: <b>{activeProfile?.name ?? "Default"}</b> · {activeShortcuts.length} active shortcuts · Active app: <code>{focusedApp || "Desktop"}</code>
            </p>
          </div>
        </div>

        <div className="row gap-sm">
          <Button
            variant={paused ? "primary" : "secondary"}
            size="sm"
            icon={paused ? "play" : "pause"}
            onClick={togglePaused}
          >
            {paused ? "Resume Hook" : "Pause Hook"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="settings"
            onClick={() => setPage("settings")}
          >
            Settings
          </Button>
        </div>
      </div>

      {/* Vorssaint Modular Toolkits Grid (6 Rich Feature Cards) */}
      <div className="spread mb-sm">
        <div>
          <h3 className="section-title no-margin">Modular Toolkits</h3>
          <p className="muted tiny no-margin">Instant status and real-time control over core automation modules</p>
        </div>
        <span className="chip chip-subtle">
          <Icon name="sparkles" size={12} />
          <span>6 Active Tools</span>
        </span>
      </div>

      <div className="grid cols-3 gap-md mb-lg">
        {/* Module 1: Super Key (Hyper) */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="sparkles" size={18} />
              </div>
              <div>
                <div className="bold small">Super Key (Hyper)</div>
                <div className="muted tiny">Modifier Chord Engine</div>
              </div>
            </div>
            <Toggle
              label="Toggle Super Key"
              checked={hyperEnabled}
              onChange={() => patch("shortcuts", {
                hyperKeyConfig: {
                  ...(hyperConfig ?? {
                    key: "AltRight",
                    includeShift: false,
                    tapActionId: "showPopup",
                    suppressOriginal: true,
                  }),
                  enabled: !hyperEnabled,
                },
              })}
            />
          </div>
          <p className="muted tiny mb-sm">
            Turns {hyperKey} into an extra modifier key for system-wide shortcuts with zero shortcut collisions.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className="chip chip-subtle">
              <span>Trigger: <b>{hyperKey}</b></span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage("settings")}
            >
              Configure →
            </Button>
          </div>
        </div>

        {/* Module 2: WASD Navigation Mode */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="shortcuts" size={18} />
              </div>
              <div>
                <div className="bold small">WASD Navigation</div>
                <div className="muted tiny">Arrow Key Routing</div>
              </div>
            </div>
            <Toggle
              label="Toggle WASD Navigation"
              checked={wasdNavActive}
              onChange={() => setWasdNav(!wasdNavActive)}
            />
          </div>
          <p className="muted tiny mb-sm">
            Control cursor and text navigation using W/A/S/D with custom blue pointer visual feedback everywhere.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className={`chip ${wasdNavActive ? "chip-accent" : "chip-subtle"}`}>
              <span>{wasdNavActive ? "Active Everywhere" : "Inactive"}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWasdNav(!wasdNavActive)}
            >
              {wasdNavActive ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>

        {/* Module 3: Spotlight Popup Menu */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="popup" size={18} />
              </div>
              <div>
                <div className="bold small">Spotlight Menu</div>
                <div className="muted tiny">Double-Tap F Command Bar</div>
              </div>
            </div>
            <span className="chip chip-accent">Live</span>
          </div>
          <p className="muted tiny mb-sm">
            Floating spotlight launcher triggered by Double-Tap F with direct key actions (1-9) and command search.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className="chip chip-subtle">
              <span>Trigger: <b>Double-Tap F</b></span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const eapi = (window as any).electronAPI;
                if (eapi?.popup?.toggle) eapi.popup.toggle();
              }}
            >
              Test Popup →
            </Button>
          </div>
        </div>

        {/* Module 4: Floating Scratchpad Notes */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="edit" size={18} />
              </div>
              <div>
                <div className="bold small">Floating Scratchpad</div>
                <div className="muted tiny">Instant Borderless Notes</div>
              </div>
            </div>
            <span className="chip chip-subtle">Double-Tap N</span>
          </div>
          <p className="muted tiny mb-sm">
            Always-on-top distraction-free scratchpad with instant history, auto-saving, and quick formatting.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className="chip chip-subtle">
              <span>Trigger: <b>Double-Tap N</b></span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const eapi = (window as any).electronAPI;
                if (eapi?.notes?.toggle) eapi.notes.toggle();
              }}
            >
              Open Notes →
            </Button>
          </div>
        </div>

        {/* Module 5: Screen Drag Switcher */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="pinTop" size={18} />
              </div>
              <div>
                <div className="bold small">Screen Drag Switcher</div>
                <div className="muted tiny">Corner & Edge Snapping</div>
              </div>
            </div>
            <Toggle
              label="Toggle Screen Drag Switcher"
              checked={dragZonesEnabled}
              onChange={() => patch("dragSwitcher", { enabled: !dragZonesEnabled })}
            />
          </div>
          <p className="muted tiny mb-sm">
            Switch applications effortlessly by dragging a window to configured monitor edges and corner zones.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className={`chip ${dragZonesEnabled ? "chip-accent" : "chip-subtle"}`}>
              <span>{dragZonesEnabled ? "Zones Armed" : "Disabled"}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPage("settings")}
            >
              Edit Zones →
            </Button>
          </div>
        </div>

        {/* Module 6: Tactile Audio Chimes */}
        <div className="card utility-card">
          <div className="spread mb-sm">
            <div className="row gap-sm">
              <div className="utility-card-icon">
                <Icon name="volume" size={18} />
              </div>
              <div>
                <div className="bold small">Tactile Audio Chimes</div>
                <div className="muted tiny">Acoustic Feedback</div>
              </div>
            </div>
            <Toggle
              label="Toggle Sound Feedback"
              checked={soundEnabled}
              onChange={() => patch("audio", { enabled: !soundEnabled })}
            />
          </div>
          <p className="muted tiny mb-sm">
            Provides instant audio confirmation whenever a gesture triggers or a tool mode turns on/off.
          </p>
          <div className="spread pt-sm border-top-subtle">
            <span className="chip chip-subtle">
              <span>{data.settings.audio?.soundPack ?? "Modern"}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => playFeedbackSound("action", {
                pack: data.settings.audio?.soundPack,
                volume: data.settings.audio?.volume,
              })}
            >
              Play Chime ♫
            </Button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout: Priority Shortcuts & Diagnostics */}
      <div className="grid cols-2 gap-md mb-md">
        {/* Important / Favorite Shortcuts */}
        <Card>
          <div className="spread mb-sm">
            <div>
              <h3 className="section-title no-margin">
                {favorites.length > 0 ? "Pinned Automations" : "Active Shortcuts"}
              </h3>
              <p className="muted tiny no-margin">
                {favorites.length > 0 ? "Your pinned priority shortcuts" : "Quick access shortcuts"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="shortcuts"
              onClick={() => setPage("shortcuts")}
            >
              View all ({data.shortcuts.length})
            </Button>
          </div>

          <div className="dashboard-list">
            {displayedShortcuts.length === 0 ? (
              <EmptyState
                icon="shortcuts"
                title="No shortcuts yet"
                description="Create your first shortcut or preset to automate your workflow."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon="create"
                    onClick={() => {
                      useStore.getState().setEditing(null);
                      setPage("create");
                    }}
                  >
                    Create shortcut
                  </Button>
                }
              />
            ) : (
              displayedShortcuts.map((s) => {
                const firstAction = s.actions[0];
                const meta = firstAction ? ACTION_META[firstAction.type] : ACTION_META.openApp;
                const triggerLabel = formatTriggerLabel(s);

                return (
                  <div key={s.id} className="shortcut-mini">
                    <div className="row gap-sm min-w-0">
                      <KeycapBadge keys={[...s.modifiers, s.key]} mouse={s.mouse} size="sm" />
                      <div className="min-w-0">
                        <div className="bold small text-ellipsis">
                          {s.name || meta.label}
                        </div>
                        <div className="muted tiny">
                          {triggerLabel} → {meta.label}
                        </div>
                      </div>
                    </div>

                    <div className="row gap-xs">
                      <IconButton
                        name="edit"
                        title="Edit shortcut"
                        size={15}
                        onClick={() => setEditingShortcutId(s.id)}
                      />
                      <IconButton
                        name="play"
                        title="Simulate shortcut"
                        size={15}
                        onClick={() => getEngine().simulateTap(s.key, s.modifiers)}
                      />
                      <Toggle
                        label={`Enable ${s.name}`}
                        checked={s.enabled}
                        onChange={() => toggleShortcut(s.id)}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Live System Diagnostics & Scope */}
        <Card>
          <div className="spread mb-sm">
            <div>
              <h3 className="section-title no-margin">System Telemetry</h3>
              <p className="muted tiny no-margin">Live low-level input hook and application scope monitor</p>
            </div>
            <span className="chip chip-success">
              <span className="status-dot" />
              <span>Native Hook</span>
            </span>
          </div>

          <div className="col gap-sm">
            <div className="card card-subtle p-sm">
              <div className="spread mb-xs">
                <span className="bold small">Active Foreground Process</span>
                <span className="chip chip-subtle tiny">{focusedApp || "Desktop Shell"}</span>
              </div>
              <p className="muted tiny no-margin">
                App-scoped shortcuts automatically filter when this window is active.
              </p>
            </div>

            <div className="card card-subtle p-sm">
              <div className="spread mb-xs">
                <span className="bold small">Key Repeat Protection</span>
                <Toggle
                  label="Toggle Repeat Protection"
                  checked={repeatProtection}
                  onChange={() => patch("shortcuts", { keyRepeatProtection: !repeatProtection })}
                />
              </div>
              <p className="muted tiny no-margin">
                Prevents accidental multi-triggers when holding down physical keys.
              </p>
            </div>

            <div className="card card-subtle p-sm">
              <div className="spread mb-xs">
                <span className="bold small">Active Profile Context</span>
                <span className="chip chip-accent tiny">{activeProfile?.name ?? "Default"}</span>
              </div>
              <p className="muted tiny no-margin">
                {activeShortcuts.length} of {data.shortcuts.length} shortcuts currently enabled in this profile.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Profiles Quick Switcher */}
      <Card>
        <div className="spread mb-xs">
          <h3 className="section-title no-margin">Workspace Profiles</h3>
          <Button variant="ghost" size="sm" icon="profiles" onClick={() => setPage("profiles")}>
            Manage profiles
          </Button>
        </div>
        <p className="muted tiny mb-sm">
          Switch active profiles or assign rules to automatically activate them when specific apps are focused.
        </p>
        <div className="row wrap gap-sm">
          {data.profiles.map((p) => {
            const isCurrent = p.id === activeId;
            return (
              <button
                key={p.id}
                type="button"
                className={"chip clickable" + (isCurrent ? " chip-accent" : " chip-subtle")}
                onClick={() => setActive(p.id)}
              >
                <Icon name={p.icon ?? "profiles"} size={13} />
                <span>{p.name}</span>
                {isCurrent && <span className="status-dot" />}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Simulator Modal */}
      <Simulator open={simOpen} onClose={() => setSimOpen(false)} />

      {/* Edit Shortcut Modal */}
      <EditShortcutModal
        shortcutId={editingShortcutId}
        open={!!editingShortcutId}
        onClose={() => setEditingShortcutId(null)}
      />
    </div>
  );
}
