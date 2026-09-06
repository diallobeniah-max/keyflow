import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface HardwareBrightnessStatus {
  supported: boolean;
  currentBrightness: number | null;
  minBrightness: number;
  maxBrightness: number;
  provider: "wmi" | "none";
}

/**
 * HardwareBrightnessProvider
 *
 * Communicates with Windows WMI (root/wmi: WmiMonitorBrightness / WmiMonitorBrightnessMethods)
 * to control physical backlight brightness on internal laptop displays and supported panels.
 *
 * Includes:
 *   • Baseline brightness capture & restoration
 *   • Non-blocking sequential execution queue (prevents spawning multiple overlapping PowerShell processes)
 *   • Graceful fallback detection when WMI brightness is unsupported (e.g. desktop external monitors)
 */
export class HardwareBrightnessProvider {
  private baselineBrightness: number | null = null;
  private isWmiSupported: boolean | null = null;
  private pendingLevel: number | null = null;
  private isApplying = false;

  /** Check if WMI hardware brightness is supported on this system */
  async isSupported(): Promise<boolean> {
    if (this.isWmiSupported !== null) {
      return this.isWmiSupported;
    }
    const current = await this.getBrightness();
    this.isWmiSupported = current !== null;
    return this.isWmiSupported;
  }

  /** Get current physical hardware brightness (0–100), or null if unsupported */
  async getBrightness(): Promise<number | null> {
    try {
      const script = `
        try {
          $b = (Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction Stop).CurrentBrightness;
          if ($b -ne $null) { [Console]::WriteLine([int]$b); exit 0 }
        } catch {}
        exit 1
      `;
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ], { windowsHide: true });
      const val = parseInt(stdout.trim(), 10);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        return val;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Capture the pre-dim baseline brightness if not already captured.
   * Call this right before applying a dim level.
   */
  async captureBaseline(): Promise<number | null> {
    if (this.baselineBrightness !== null) {
      return this.baselineBrightness;
    }
    const current = await this.getBrightness();
    if (current !== null) {
      this.baselineBrightness = current;
      console.log(`[hardware-brightness] captured baseline brightness: ${this.baselineBrightness}%`);
    }
    return this.baselineBrightness;
  }

  /**
   * Set physical hardware brightness (0–100).
   * Coalesces rapid calls through a sequential queue so the latest requested
   * value is always applied cleanly.
   */
  async setBrightness(level: number): Promise<boolean> {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    this.pendingLevel = clamped;

    if (this.isApplying) {
      return true;
    }

    this.isApplying = true;
    try {
      while (this.pendingLevel !== null) {
        const target = this.pendingLevel;
        this.pendingLevel = null;
        await this.executeWmiSet(target);
      }
      return true;
    } finally {
      this.isApplying = false;
    }
  }

  /**
   * Restore the baseline brightness that was captured before dimming was engaged.
   */
  async restoreBaseline(): Promise<boolean> {
    if (this.baselineBrightness === null) {
      return false;
    }
    const target = this.baselineBrightness;
    this.baselineBrightness = null;
    console.log(`[hardware-brightness] restoring baseline brightness: ${target}%`);
    return this.setBrightness(target);
  }

  /** Get the current saved baseline brightness */
  getSavedBaseline(): number | null {
    return this.baselineBrightness;
  }

  /** Set an explicit baseline (e.g. from persisted session) */
  setSavedBaseline(level: number | null): void {
    this.baselineBrightness = level;
  }

  private async executeWmiSet(level: number): Promise<void> {
    try {
      const script = `
        try {
          $methods = Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop;
          foreach ($m in $methods) {
            $m.WmiSetBrightness(1, [byte]${level}) | Out-Null
          }
        } catch {}
      `;
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ], { windowsHide: true });
    } catch (err) {
      console.warn(`[hardware-brightness] failed to set WMI brightness to ${level}:`, (err as Error)?.message);
    }
  }
}
