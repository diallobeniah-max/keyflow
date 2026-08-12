import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { ACTION_META, TRIGGER_META } from "../lib/constants";
import { detectConflicts } from "../lib/conflict";
import { ActionType, TriggerType } from "../types";
import { Button, Card, EmptyState, Field, IconButton, Input, KeycapBadge, PageIntro, Select, Toggle } from "../components/ui";
import { Icon } from "../components/Icon";

export function Shortcuts() {
  const data = useStore((s) => s.data);
  const globalSearch = useStore((s) => s.globalSearch);
  const setGlobalSearch = useStore((s) => s.setGlobalSearch);
  const setPage = useStore((s) => s.setPage);
  const toggleShortcut = useStore((s) => s.toggleShortcut);
  const deleteShortcut = useStore((s) => s.deleteShortcut);
  const duplicateShortcut = useStore((s) => s.duplicateShortcut);
  const toggleFavorite = useStore((s) => s.toggleFavoriteShortcut);
  const setPending = useStore((s) => s.setPendingKey);

  const [q, setQ] = useState(globalSearch);
  const [profile, setProfile] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [sort, setSort] = useState("name");

  const actionTypes = useMemo(
    () => Array.from(new Set(data.shortcuts.flatMap((s) => s.actions.map((a) => a.type)))),
    [data.shortcuts]
  );

  const filtered = useMemo(() => {
    let list = data.shortcuts.slice();
    const query = q.toLowerCase().trim();
    if (query) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.key.toLowerCase().includes(query) ||
          s.actions.some((a) => a.type.toLowerCase().includes(query))
      );
    }
    if (profile !== "all") list = list.filter((s) => s.profileId === profile);
    if (trigger !== "all") list = list.filter((s) => s.trigger === trigger);
    if (actionType !== "all") list = list.filter((s) => s.actions.some((a) => a.type === actionType));

    list.sort((a, b) => {
      if (sort === "key") return a.key.localeCompare(b.key);
      if (sort === "recent") return (b.lastUsed ?? 0) - (a.lastUsed ?? 0);
      if (sort === "profile") return a.profileId.localeCompare(b.profileId);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [data.shortcuts, q, profile, trigger, actionType, sort]);

  const create = () => {
    useStore.getState().setEditing(null);
    setPending("F", false);
    setPage("create");
  };

  return (
    <div className="content">
      <PageIntro
        eyebrow="AUTOMATIONS"
        title="Shortcuts"
        description="Search, organize, edit, and toggle all keyboard and mouse shortcuts across your profiles."
      >
        <Button variant="primary" icon="create" onClick={create}>
          New shortcut
        </Button>
      </PageIntro>

      {/* Filter & Search Bar */}
      <Card className="mb-md">
        <div className="grid cols-4 gap-sm">
          <Field label="Search">
            <Input
              placeholder="Search shortcuts…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setGlobalSearch(e.target.value);
              }}
            />
          </Field>

          <Field label="Profile">
            <Select
              value={profile}
              onChange={setProfile}
              options={[
                { value: "all", label: "All profiles" },
                ...data.profiles.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Field>

          <Field label="Trigger type">
            <Select
              value={trigger}
              onChange={setTrigger}
              options={[
                { value: "all", label: "All triggers" },
                ...Object.keys(TRIGGER_META).map((t) => ({
                  value: t,
                  label: TRIGGER_META[t as TriggerType].label,
                })),
              ]}
            />
          </Field>

          <Field label="Sort by">
            <Select
              value={sort}
              onChange={setSort}
              options={[
                { value: "name", label: "Name" },
                { value: "key", label: "Keycap" },
                { value: "recent", label: "Recently used" },
                { value: "profile", label: "Profile" },
              ]}
            />
          </Field>
        </div>
      </Card>

      {/* Shortcuts Native Table List */}
      <div className="shortcuts-table">
        {filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="No matching shortcuts"
            description="No shortcuts match your current search and filter criteria."
            action={
              (q || profile !== "all" || trigger !== "all") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQ("");
                    setGlobalSearch("");
                    setProfile("all");
                    setTrigger("all");
                    setActionType("all");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          filtered.map((s) => {
            const firstAction = s.actions[0];
            const meta = firstAction ? ACTION_META[firstAction.type] : ACTION_META.openApp;
            const profileName = data.profiles.find((p) => p.id === s.profileId)?.name ?? "Default";
            const conflicts = detectConflicts(s, data.shortcuts, data.settings);
            const err = conflicts.find((c) => c.level === "error");
            const warn = conflicts.find((c) => c.level === "warning");

            return (
              <div key={s.id} className="shortcut-row">
                <div className="shortcut-row-left">
                  <div className="shortcut-row-key">
                    <KeycapBadge keys={[...s.modifiers, s.key]} mouse={s.mouse} size="md" />
                  </div>

                  <div className="shortcut-row-info">
                    <div className="shortcut-row-title">
                      <span>{s.name || meta.label}</span>
                      {s.favorite && <Icon name="star" size={13} />}
                    </div>
                    <div className="shortcut-row-meta">
                      <span className="chip chip-subtle">{TRIGGER_META[s.trigger]?.label ?? s.trigger}</span>
                      <span className="chip chip-subtle">
                        <Icon name={meta.icon} size={11} />
                        <span>{meta.label}</span>
                      </span>
                      <span>· {profileName}</span>
                      {s.mouse && <span className="chip chip-subtle">Mouse button</span>}
                      {err && <span className="danger-text">⚠ Conflict</span>}
                      {!err && warn && <span className="warning-text">⚠ Warning</span>}
                    </div>
                  </div>
                </div>

                <div className="shortcut-row-right">
                  <div className="shortcut-row-actions">
                    <IconButton
                      name="star"
                      size={15}
                      title={s.favorite ? "Unstar shortcut" : "Star as favorite"}
                      active={!!s.favorite}
                      onClick={() => toggleFavorite(s.id)}
                    />
                    <IconButton
                      name="edit"
                      size={15}
                      title="Edit shortcut"
                      onClick={() => {
                        useStore.getState().setEditing(s.id);
                        setPage("create");
                      }}
                    />
                    <IconButton
                      name="copy"
                      size={15}
                      title="Duplicate shortcut"
                      onClick={() => duplicateShortcut(s.id)}
                    />
                    <IconButton
                      name="trash"
                      size={15}
                      title="Delete shortcut"
                      onClick={() => deleteShortcut(s.id)}
                    />
                  </div>

                  <Toggle
                    label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                    checked={s.enabled}
                    onChange={() => toggleShortcut(s.id)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
