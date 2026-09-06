import { execFile } from "child_process";

// Windows file lists must use CF_HDROP, not a text copy of the paths. Pass data
// through stdin so file names are never interpreted as PowerShell source.
async function fileDropCommand(paths?: string[]): Promise<string[]> {
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$request = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd())) | ConvertFrom-Json
if ($request.write) {
  $files = [System.Collections.Specialized.StringCollection]::new()
  foreach ($entry in $request.paths) { [void]$files.Add([string]$entry) }
  [System.Windows.Forms.Clipboard]::SetFileDropList($files)
}
ConvertTo-Json -Compress -InputObject @([System.Windows.Forms.Clipboard]::GetFileDropList())`;
  return new Promise((resolve, reject) => {
    const child = execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) { reject(new Error("Windows clipboard is busy or the file list is unavailable. Please try again.")); return; }
        try { resolve(JSON.parse(stdout.trim() || "[]")); } catch { reject(new Error("Could not read the Windows file list.")); }
      });
    child.stdin?.end(Buffer.from(JSON.stringify({ write: paths !== undefined, paths: paths ?? [] }), "utf8").toString("base64"));
  });
}

export const readClipboardFiles = () => fileDropCommand();
export const writeClipboardFiles = (paths: string[]) => fileDropCommand(paths);
