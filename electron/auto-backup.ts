import { writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

interface AutoBackupConfig {
  enabled: boolean;
  path: string;
  intervalMinutes: number;
}

export class AutoBackupService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: AutoBackupConfig = { enabled: false, path: "", intervalMinutes: 360 };
  private getState: (() => unknown) | null = null;
  public lastBackupTime: number = 0;

  /**
   * Initialize with a state getter function that returns the current PersistedState.
   */
  init(getState: () => unknown) {
    this.getState = getState;
  }

  /**
   * Update the auto-backup configuration and restart the timer if needed.
   */
  setConfig(config: Partial<AutoBackupConfig>) {
    this.config = { ...this.config, ...config };
    this.restartTimer();
  }

  getConfig(): AutoBackupConfig & { lastBackupTime: number } {
    return { ...this.config, lastBackupTime: this.lastBackupTime };
  }

  /**
   * Run an immediate backup.
   * Returns { success: boolean, path?: string, error?: string }
   */
  runNow(): { success: boolean; path?: string; error?: string } {
    if (!this.config.path || !this.getState) {
      return { success: false, error: "No backup path or state getter configured" };
    }

    try {
      const state = this.getState();
      if (!state) {
        return { success: false, error: "No application state is available to back up yet" };
      }

      // Ensure directory exists
      if (!existsSync(this.config.path)) {
        mkdirSync(this.config.path, { recursive: true });
      }

      // Keep the timestamp readable while guaranteeing repeated backups never
      // overwrite one another, even when created within the same minute.
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, "-");
      const filename = `keyflow-backup-${timestamp}-${randomUUID().slice(0, 8)}.json`;
      const filePath = join(this.config.path, filename);

      // Write backup
      writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
      this.lastBackupTime = Date.now();

      // Auto-prune: keep only last 10 backups
      this.pruneOldBackups();

      console.log(`[auto-backup] Saved backup to ${filePath}`);
      return { success: true, path: filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[auto-backup] Failed:`, msg);
      return { success: false, error: msg };
    }
  }

  private pruneOldBackups() {
    try {
      const files = readdirSync(this.config.path)
        .filter((f) => f.startsWith("keyflow-backup-") && f.endsWith(".json"))
        .sort()
        .reverse();

      // Keep only the 10 most recent
      const toDelete = files.slice(10);
      for (const f of toDelete) {
        unlinkSync(join(this.config.path, f));
        console.log(`[auto-backup] Pruned old backup: ${f}`);
      }
    } catch (err) {
      console.error("[auto-backup] Prune failed:", err);
    }
  }

  private restartTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.config.enabled && this.config.path && this.config.intervalMinutes > 0) {
      const ms = this.config.intervalMinutes * 60 * 1000;
      this.timer = setInterval(() => {
        this.runNow();
      }, ms);
      console.log(`[auto-backup] Timer started: every ${this.config.intervalMinutes} minutes to ${this.config.path}`);
    } else {
      console.log("[auto-backup] Timer stopped");
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const autoBackupService = new AutoBackupService();
