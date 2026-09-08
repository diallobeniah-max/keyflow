import { execFile } from "child_process";

export interface WindowsConflictStatus {
  clipboardHistoryDisabled: boolean;
  touchpadThreeFingerDisabled: boolean;
}

function regQuery(key: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["query", key, "/v", value],
      { windowsHide: true, timeout: 2500 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(stdout);
      }
    );
  });
}

function regAdd(
  key: string,
  value: string,
  type: "REG_DWORD" | "REG_SZ",
  data: string
): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["add", key, "/v", value, "/t", type, "/d", data, "/f"],
      { windowsHide: true, timeout: 2500 },
      (err) => {
        if (err) {
          console.warn(`[windows-conflicts] Failed to add ${key} -> ${value}:`, err.message);
          return resolve(false);
        }
        resolve(true);
      }
    );
  });
}

function regDelete(key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["delete", key, "/v", value, "/f"],
      { windowsHide: true, timeout: 2500 },
      (err) => {
        if (err) return resolve(false);
        resolve(true);
      }
    );
  });
}

/**
 * Checks whether Windows built-in clipboard history and Win+V hotkey are disabled.
 * Checks:
 * 1. HKCU\Software\Microsoft\Clipboard -> EnableClipboardHistory == 0
 * 2. HKCU\SOFTWARE\Policies\Microsoft\Windows\System -> AllowClipboardHistory == 0
 * 3. HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced -> DisabledHotkeys contains 'V'
 */
export async function getWindowsClipboardHistoryDisabled(): Promise<boolean> {
  const [enableOut, policyOut, hotkeysOut] = await Promise.all([
    regQuery("HKCU\\Software\\Microsoft\\Clipboard", "EnableClipboardHistory"),
    regQuery("HKCU\\SOFTWARE\\Policies\\Microsoft\\Windows\\System", "AllowClipboardHistory"),
    regQuery("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", "DisabledHotkeys"),
  ]);

  const enableVal = enableOut ? /EnableClipboardHistory\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i.exec(enableOut) : null;
  const enableDisabled = !enableVal || parseInt(enableVal[1], 16) === 0;

  const policyVal = policyOut ? /AllowClipboardHistory\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i.exec(policyOut) : null;
  const policyDisabled = !policyVal || parseInt(policyVal[1], 16) === 0;

  const hotkeysVal = hotkeysOut ? /DisabledHotkeys\s+REG_SZ\s+(.*)/i.exec(hotkeysOut) : null;
  const hotkeysDisabled = !!hotkeysVal && hotkeysVal[1].toUpperCase().includes("V");

  return enableDisabled && policyDisabled && hotkeysDisabled;
}

/**
 * Sets Windows built-in clipboard history and Win+V hotkey suppression.
 */
export async function setWindowsClipboardHistoryDisabled(disabled: boolean): Promise<boolean> {
  const dword = disabled ? "0" : "1";

  // 1. EnableClipboardHistory
  const res1 = await regAdd(
    "HKCU\\Software\\Microsoft\\Clipboard",
    "EnableClipboardHistory",
    "REG_DWORD",
    dword
  );

  // 2. AllowClipboardHistory policy
  const res2 = await regAdd(
    "HKCU\\SOFTWARE\\Policies\\Microsoft\\Windows\\System",
    "AllowClipboardHistory",
    "REG_DWORD",
    dword
  );

  // 3. DisabledHotkeys in Explorer\Advanced
  const currentHotkeysRaw = await regQuery(
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
    "DisabledHotkeys"
  );
  const match = currentHotkeysRaw ? /DisabledHotkeys\s+REG_SZ\s+(.*)/i.exec(currentHotkeysRaw) : null;
  let currentHotkeys = match ? match[1].trim() : "";

  let hotkeysUpdated = true;
  if (disabled) {
    if (!currentHotkeys.toUpperCase().includes("V")) {
      currentHotkeys += "V";
      hotkeysUpdated = await regAdd(
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
        "DisabledHotkeys",
        "REG_SZ",
        currentHotkeys
      );
    }
  } else {
    if (currentHotkeys.toUpperCase().includes("V")) {
      const remaining = currentHotkeys.replace(/v/gi, "");
      if (remaining.length > 0) {
        hotkeysUpdated = await regAdd(
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
          "DisabledHotkeys",
          "REG_SZ",
          remaining
        );
      } else {
        hotkeysUpdated = await regDelete(
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
          "DisabledHotkeys"
        );
      }
    }
  }

  console.log(
    `[windows-conflicts] Windows clipboard history ${disabled ? "disabled" : "enabled"} (enable: ${res1}, policy: ${res2}, hotkeys: ${hotkeysUpdated})`
  );
  return res1 && res2 && hotkeysUpdated;
}

/**
 * Checks whether Windows 3-finger touchpad gestures are disabled (both slide and tap = 0).
 * Key: HKCU\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad
 * Values: ThreeFingerSlideEnabled, ThreeFingerTapEnabled (both 0 = disabled)
 */
export function getWindowsTouchpadThreeFingerDisabled(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad", "/v", "ThreeFingerSlideEnabled"],
      { windowsHide: true, timeout: 2500 },
      (errSlide, stdoutSlide) => {
        if (errSlide || !stdoutSlide) return resolve(true);
        const matchSlide = /ThreeFingerSlideEnabled\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i.exec(stdoutSlide);
        const slideVal = matchSlide ? parseInt(matchSlide[1], 16) : 0;

        execFile(
          "reg.exe",
          ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad", "/v", "ThreeFingerTapEnabled"],
          { windowsHide: true, timeout: 2500 },
          (errTap, stdoutTap) => {
            const matchTap = stdoutTap ? /ThreeFingerTapEnabled\s+REG_DWORD\s+(0x[0-9a-fA-F]+|\d+)/i.exec(stdoutTap) : null;
            const tapVal = matchTap ? parseInt(matchTap[1], 16) : 0;
            resolve(slideVal === 0 && tapVal === 0);
          }
        );
      }
    );
  });
}

/**
 * Sets Windows 3-finger touchpad gestures (slide & tap) to disabled (0) or enabled (1).
 */
export function setWindowsTouchpadThreeFingerDisabled(disabled: boolean): Promise<boolean> {
  const dword = disabled ? "0" : "1";
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad",
        "/v",
        "ThreeFingerSlideEnabled",
        "/t",
        "REG_DWORD",
        "/d",
        dword,
        "/f",
      ],
      { windowsHide: true, timeout: 2500 },
      (errSlide) => {
        if (errSlide) {
          console.warn("[windows-conflicts] Failed to update ThreeFingerSlideEnabled:", errSlide.message);
        }
        execFile(
          "reg.exe",
          [
            "add",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PrecisionTouchPad",
            "/v",
            "ThreeFingerTapEnabled",
            "/t",
            "REG_DWORD",
            "/d",
            dword,
            "/f",
          ],
          { windowsHide: true, timeout: 2500 },
          (errTap) => {
            if (errTap) {
              console.warn("[windows-conflicts] Failed to update ThreeFingerTapEnabled:", errTap.message);
              return resolve(false);
            }
            console.log(
              `[windows-conflicts] Windows Precision Touchpad 3-finger gestures ${disabled ? "disabled" : "enabled"}`
            );
            resolve(true);
          }
        );
      }
    );
  });
}

/**
 * Returns the current status of both Windows conflict settings.
 */
export async function getWindowsConflictStatus(): Promise<WindowsConflictStatus> {
  const [clipboardHistoryDisabled, touchpadThreeFingerDisabled] = await Promise.all([
    getWindowsClipboardHistoryDisabled(),
    getWindowsTouchpadThreeFingerDisabled(),
  ]);
  return { clipboardHistoryDisabled, touchpadThreeFingerDisabled };
}
