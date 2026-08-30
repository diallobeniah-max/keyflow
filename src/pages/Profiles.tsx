import { useState } from "react";
import { useStore } from "../store/useStore";
import { uid } from "../store/sampleData";
import { AppRule, Profile } from "../types";
import { Button, Card, Field, IconButton, Input, Modal, PageHeader, Select } from "../components/ui";
import { Icon } from "../components/Icon";

function newProfile(): Profile {
  return {
    id: uid("prof"),
    name: "New profile",
    icon: "profiles",
    appRules: [],
    createdAt: Date.now(),
  };
}

export function Profiles() {
  const data = useStore((s) => s.data);
  const active = useStore((s) => s.activeProfileId);
  const setActive = useStore((s) => s.setActiveProfile);
  const add = useStore((s) => s.addProfile);
  const update = useStore((s) => s.updateProfile);
  const remove = useStore((s) => s.deleteProfile);
  const duplicate = useStore((s) => s.duplicateProfile);
  const setDefault = useStore((s) => s.setDefaultProfile);
  const removeRule = useStore((s) => s.removeAppRule);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [ruleExe, setRuleExe] = useState("");
  const [ruleMode, setRuleMode] = useState<AppRule["mode"]>("assign");

  return (
    <div className="content">
      <PageHeader
        eyebrow="WORKSPACES"
        title="Profiles"
        description="Create shortcut collections for different activities and switch them manually or by active application."
        usage="Click a profile to edit its settings, assign application rules, or switch the active profile."
      >
        <Button variant="primary" icon="create" onClick={() => setEditing(newProfile())}>
          New profile
        </Button>
      </PageHeader>

      <div className="grid cols-2 gap-md">
        {data.profiles.map((p, idx) => {
          const count = data.shortcuts.filter((s) => s.profileId === p.id).length;
          const isCurrent = active === p.id;
          const staggerClass = `anim-stagger-${Math.min(6, (idx % 6) + 1)}`;

          return (
            <Card key={p.id} hover className={`anim-card-enter ${staggerClass}`}>
              <div className="spread mb-md">
                <div className="row gap-sm">
                  <div className={"stat-icon" + (isCurrent ? " chip-accent" : "")}>
                    <Icon name={p.icon ?? "profiles"} size={18} />
                  </div>
                  <div>
                    <h3 className="section-title no-margin">{p.name}</h3>
                    <div className="muted tiny">
                      {count} shortcut{count !== 1 ? "s" : ""} · {p.appRules.length} app rule{p.appRules.length !== 1 ? "s" : ""}
                      {p.isDefault ? " · Default" : ""}
                    </div>
                  </div>
                </div>

                <div className="row gap-xs">
                  <IconButton
                    name="edit"
                    size={15}
                    title="Edit profile"
                    onClick={() => setEditing({ ...p, appRules: p.appRules.map((rule) => ({ ...rule })) })}
                  />
                  <IconButton
                    name="copy"
                    size={15}
                    title="Duplicate profile"
                    onClick={() => duplicate(p.id)}
                  />
                  <IconButton
                    name="trash"
                    size={15}
                    title="Delete profile"
                    disabled={p.id === "prof-default"}
                    onClick={() => remove(p.id)}
                  />
                </div>
              </div>

              <div className="spread mb-md">
                <div className="row gap-xs">
                  <Button
                    size="sm"
                    variant={isCurrent ? "primary" : "secondary"}
                    onClick={() => setActive(p.id)}
                  >
                    {isCurrent ? "Active now" : "Use profile"}
                  </Button>
                  {!p.isDefault && (
                    <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)}>
                      Set default
                    </Button>
                  )}
                </div>
              </div>

              {p.appRules.length > 0 && (
                <div className="col gap-xs pt-sm border-top-subtle">
                  <div className="muted tiny bold">AUTOMATIC APP RULES:</div>
                  <div className="row wrap gap-xs">
                    {p.appRules.map((r) => (
                      <span key={r.id} className="chip chip-subtle">
                        <span className="bold">{r.mode}</span>
                        <span>{r.exe}</span>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => removeRule(p.id, r.id)}
                          title="Remove rule"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Edit Profile Modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Profile Settings"
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!editing) return;
                data.profiles.some((p) => p.id === editing.id)
                  ? update(editing)
                  : add(editing);
                setEditing(null);
              }}
            >
              Save profile
            </Button>
          </>
        }
      >
        {editing && (
          <div className="col gap-md">
            <div className="grid cols-2 gap-md">
              <Field label="Profile name">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <Field label="Icon">
                <Input
                  value={editing.icon ?? "profiles"}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                />
              </Field>
            </div>

            <Card>
              <h4 className="bold small mb-xs">Add Automatic App Rule</h4>
              <p className="muted tiny mb-sm">
                Automatically activate this profile whenever the specified application is focused.
              </p>
              <div className="grid cols-3 gap-sm">
                <Input
                  placeholder="e.g. chrome.exe"
                  value={ruleExe}
                  onChange={(e) => setRuleExe(e.target.value)}
                />
                <Select
                  value={ruleMode}
                  onChange={(v) => setRuleMode(v as AppRule["mode"])}
                  options={[
                    { value: "assign", label: "Assign (Auto-switch)" },
                    { value: "whitelist", label: "Whitelist only" },
                    { value: "blacklist", label: "Blacklist" },
                  ]}
                />
                <Button
                  icon="create"
                  onClick={() => {
                    if (!ruleExe.trim() || !editing) return;
                    const rule: AppRule = {
                      id: uid("rule"),
                      exe: ruleExe.trim(),
                      profileId: editing.id,
                      mode: ruleMode,
                    };
                    setEditing({
                      ...editing,
                      appRules: [...editing.appRules, rule],
                    });
                    setRuleExe("");
                  }}
                >
                  Add rule
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
