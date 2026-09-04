import { useState, type ChangeEvent, type FC } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { Button, Select, SettingsGroup, SettingsRow, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { SettingsPageHeader } from "./SettingsPageHeader";
import type { PersistedState } from "../../types";

interface BackupPageProps {
  onBack?: () => void;
}

export const BackupPage: FC<BackupPageProps> = ({ onBack }) => {
  const data = useStore((s) => s.data);
  const settings = data.settings;
  const patch = useStore((s) => s.patchSettings);
  const importState = useStore((s) => s.importState);
  const resetAll = useStore((s) => s.resetAll);

  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyflow-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const backup = parsed as Partial<PersistedState>;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray(backup.profiles) ||
        !Array.isArray(backup.shortcuts) ||
        !Array.isArray(backup.library) ||
        !backup.settings ||
        typeof backup.settings !== "object"
      ) {
        throw new Error("invalid-backup");
      }
      importState(backup as PersistedState);
      setBackupStatus("Backup imported successfully.");
      setTimeout(() => setBackupStatus(null), 3500);
    } catch {
      setBackupStatus("Could not import that file. Choose a valid KeyFlow backup.");
      setTimeout(() => setBackupStatus(null), 4000);
    } finally {
      input.value = "";
    }
  };

  const handleSelectBackupFolder = async () => {
    if (window.electronAPI?.backup?.selectFolder) {
      const folder = await window.electronAPI.backup.selectFolder();
      if (folder) {
        patch("data", { autoBackupPath: folder });
        setBackupStatus(`Folder set: ${folder}`);
        setTimeout(() => setBackupStatus(null), 3000);
      }
    }
  };

  const handleRunBackupNow = async () => {
    if (window.electronAPI?.backup?.runNow) {
      setBackupStatus("Backing up…");
      const res = await window.electronAPI.backup.runNow();
      if (res.success) {
        setBackupStatus("Backup saved successfully!");
      } else {
        setBackupStatus(`Backup failed: ${res.error || "Unknown error"}`);
      }
      setTimeout(() => setBackupStatus(null), 4000);
    }
  };

  const isAutoBackup = settings.data.autoBackupEnabled ?? false;

  return (
    <div className="settings-page-container anim-tab-enter">
      <SettingsPageHeader
        title="Backup & Restore"
        description="Export, import, and automatically safeguard your automation workspace and profiles."
        onBack={onBack}
      />

      <SettingsGroup
        title="Transfer & Migration"
        icon="folder"
        desc="Import and export your complete KeyFlow configuration file"
        accentColor="blue"
      >
        <SettingsRow
          id="row-data-export"
          title="Export configuration"
          desc="Save all shortcuts, profiles, and settings to a JSON backup file"
        >
          <Button variant="secondary" size="sm" icon="file" onClick={exportJson}>
            Export JSON
          </Button>
        </SettingsRow>

        <SettingsRow
          id="row-data-import"
          title="Import configuration"
          desc="Restore shortcuts and profiles from a previously exported backup file"
        >
          <div className="row gap-xs items-center">
            {backupStatus && <span className="tiny text-accent bold">{backupStatus}</span>}
            <label className="btn btn-secondary btn-sm">
              <Icon name="folder" size={14} />
              <span>Import JSON</span>
              <input type="file" accept="application/json" hidden onChange={importJson} />
            </label>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Automatic Backups"
        icon="sync"
        desc="Scheduled snapshots saved to a dedicated local directory"
        accentColor="indigo"
      >
        <SettingsRow
          id="row-data-auto-backup"
          title="Automatic backups"
          desc="Periodically export a full backup of all shortcuts and preferences"
        >
          <Toggle
            label="Automatic backup"
            checked={isAutoBackup}
            onChange={(v) => patch("data", { autoBackupEnabled: v })}
          />
        </SettingsRow>

        <div className={isAutoBackup ? "" : "settings-progressive-disabled"}>
          <SettingsRow
            id="row-data-backup-path"
            title="Auto-backup folder"
            desc={settings.data.autoBackupPath || "No folder selected"}
          >
            <Button
              variant="secondary"
              size="sm"
              icon="folder"
              disabled={!isAutoBackup}
              onClick={handleSelectBackupFolder}
            >
              {settings.data.autoBackupPath ? "Change Folder" : "Select Folder…"}
            </Button>
          </SettingsRow>

          <SettingsRow
            id="row-data-backup-interval"
            title="Backup frequency"
            desc="How often KeyFlow automatically creates a new timestamped snapshot"
          >
            <div className="w-220">
              <Select
                value={String(settings.data.autoBackupIntervalMinutes ?? 360)}
                disabled={!isAutoBackup}
                onChange={(v: string) => patch("data", { autoBackupIntervalMinutes: Number(v) })}
                options={[
                  { value: "5", label: "Every 5 minutes" },
                  { value: "15", label: "Every 15 minutes" },
                  { value: "30", label: "Every 30 minutes" },
                  { value: "60", label: "Every 1 hour" },
                  { value: "360", label: "Every 6 hours (Recommended)" },
                  { value: "720", label: "Every 12 hours" },
                  { value: "1440", label: "Every 24 hours" },
                ]}
              />
            </div>
          </SettingsRow>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Manual Backup"
        icon="clock"
        desc="Instant on-demand configuration snapshot"
        accentColor="cyan"
      >
        <SettingsRow
          id="row-data-backup-now"
          title="Create backup snapshot now"
          desc="Immediately save a new timestamped backup to your chosen storage location"
        >
          <div className="row gap-xs items-center">
            {backupStatus && <span className="tiny text-accent bold">{backupStatus}</span>}
            <Button variant="secondary" size="sm" icon="sync" onClick={handleRunBackupNow}>
              Backup Now
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* Visually Separated Danger Zone for Factory Reset */}
      <div className="settings-danger-zone mt-lg">
        <SettingsGroup
          title="Danger Zone"
          icon="trash"
          desc="Irreversible workspace and data reset operations"
          accentColor="rose"
        >
          <SettingsRow
            id="row-data-reset"
            title="Factory reset"
            desc="Delete all shortcuts, custom profiles, and return KeyFlow to initial out-of-box state"
          >
            <Button variant="danger" size="sm" icon="trash" onClick={() => setShowResetModal(true)}>
              Reset All Data…
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </div>

      {showResetModal &&
        createPortal(
          <div className="modal-backdrop anim-fade-in" onClick={() => setShowResetModal(false)}>
            <div className="modal-dialog anim-modal-enter" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Reset KeyFlow to Factory Defaults?</h3>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => setShowResetModal(false)}
                >
                  ✕
                </button>
              </div>
              <div className="p-md col gap-sm">
                <p className="small text-secondary no-margin">
                  This will permanently erase all created shortcuts, custom profiles, and preferences.
                  Your active automations will stop immediately.
                </p>
                <p className="tiny text-muted no-margin">
                  Tip: If you want to keep your configuration, use <strong>Export JSON</strong> above
                  before proceeding.
                </p>
                <div className="row gap-sm justify-end mt-md">
                  <Button variant="secondary" size="sm" onClick={() => setShowResetModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      resetAll();
                      setShowResetModal(false);
                    }}
                  >
                    Yes, Reset Everything
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
