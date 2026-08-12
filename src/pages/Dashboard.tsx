import { useState } from "react";
import { useStore } from "../store/useStore";
import { ACTION_META, TRIGGER_META } from "../lib/constants";
import { getEngine } from "../lib/engine";
import { Button, Card, EmptyState, IconButton, KeycapBadge, StatCard, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";
import { Simulator } from "../components/Simulator";

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
  const setActive = useStore((s) => s.setActiveProfile);
  const clearRecent = useStore((s) => s.clearRecent);

  const [simOpen, setSimOpen] = useState(false);
  const activeProfile = data.profiles.find((p) => p.id === activeId);
  const activeShortcuts = data.shortcuts.filter((s) => s.profileId === activeId && s.enabled);
  const favorites = data.shortcuts.filter((s) => s.favorite);
  const displayedShortcuts = favorites.length > 0 ? favorites : data.shortcuts.slice(0, 5);

  return (
    <div className="content">
      {/* Overview Banner */}
      <div className="overview-banner">
        <div>
          <div className="eyebrow">KEYFLOW DESKTOP</div>
          <h2 className="overview-banner-title">
            {safeMode ? "Safe Mode is Active" : paused ? "Engine is Paused" : "KeyFlow is Active"}
          </h2>
          <p className="overview-banner-desc">
            {safeMode
              ? "All shortcuts are temporarily blocked. Click resume to restore keyboard automations."
              : paused
              ? "Keyboard hooks are paused. Your normal typing passes through untouched."
              : `Listening for gestures in the active profile (${activeProfile?.name ?? "Default"}).`}
          </p>
        </div>

        <div className="row gap-sm">
          <Button
            variant="secondary"
            icon="play"
            onClick={() => setSimOpen(true)}
            title="Open test simulator to safely test gestures"
          >
            Test gestures
          </Button>
          <Button
            variant="primary"
            icon="create"
            onClick={() => {
              useStore.getState().setEditing(null);
              setPage("create");
            }}
          >
            New shortcut
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid cols-3 gap-md mb-md">
        <StatCard
          title="Active profile"
          value={activeProfile?.name ?? "Default"}
          icon="profiles"
          subtitle={`${activeShortcuts.length} active shortcuts`}
        />
        <StatCard
          title="Engine status"
          value={safeMode ? "Safe Mode" : paused ? "Paused" : "Active"}
          icon={paused || safeMode ? "pause" : "play"}
          subtitle="Low-level Windows hook"
        />
        <StatCard
          title="Total shortcuts"
          value={data.shortcuts.length}
          icon="shortcuts"
          subtitle={`${data.profiles.length} profiles configured`}
        />
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid cols-2 gap-md mb-md">
        {/* Important / Favorite Shortcuts */}
        <Card>
          <div className="spread mb-sm">
            <div>
              <h3 className="section-title no-margin">
                {favorites.length > 0 ? "Favorite Shortcuts" : "Configured Shortcuts"}
              </h3>
              <p className="muted tiny no-margin">
                {favorites.length > 0 ? "Star shortcuts to pin them here" : "Quick access shortcuts"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon="shortcuts"
              onClick={() => setPage("shortcuts")}
            >
              View all
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
                const triggerLabel = TRIGGER_META[s.trigger]?.label ?? s.trigger;

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

        {/* Recent Activity Log */}
        <Card>
          <div className="spread mb-sm">
            <div>
              <h3 className="section-title no-margin">Recent Activity</h3>
              <p className="muted tiny no-margin">Live record of executed actions</p>
            </div>
            {data.recent.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearRecent}>
                Clear
              </Button>
            )}
          </div>

          <div className="dashboard-list">
            {data.recent.length === 0 ? (
              <EmptyState
                icon="play"
                title="No recent triggers"
                description="When you press a configured key gesture, its activity will be logged here."
              />
            ) : (
              data.recent.slice(0, 6).map((r) => (
                <div key={r.id} className="recent-row">
                  <div className="row gap-sm">
                    <div className="stat-icon">
                      <Icon name="sparkles" size={14} />
                    </div>
                    <div>
                      <div className="bold small">{r.shortcutName}</div>
                      <div className="muted tiny">{r.actionLabel}</div>
                    </div>
                  </div>
                  <span className="muted tiny">{timeAgo(r.at)}</span>
                </div>
              ))
            )}
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
    </div>
  );
}
