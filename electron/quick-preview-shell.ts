import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

// Run installed Windows thumbnail providers out of the Electron process. The
// path is passed as JSON on stdin, never inserted into the PowerShell script.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
[ComImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellItemImageFactory {
  [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr bitmap);
}
[StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx; public int cy; }
public static class KeyflowThumbnail {
  [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=true)]
  static extern int SHCreateItemFromParsingName(string path, IntPtr bind, ref Guid iid, out IShellItemImageFactory item);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  public static string Read(string path) {
    var iid = typeof(IShellItemImageFactory).GUID;
    IShellItemImageFactory item = null; IntPtr bitmap = IntPtr.Zero;
    try {
      if (SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item) != 0 || item == null) return null;
      // THUMBNAILONLY avoids presenting a generic file icon as a preview.
      if (item.GetImage(new SIZE { cx=1024, cy=1024 }, 8, out bitmap) != 0 || bitmap == IntPtr.Zero) return null;
      using (var image = Image.FromHbitmap(bitmap)) using (var output = new MemoryStream()) {
        image.Save(output, ImageFormat.Png); return Convert.ToBase64String(output.ToArray());
      }
    } finally { if (bitmap != IntPtr.Zero) DeleteObject(bitmap); if (item != null) Marshal.ReleaseComObject(item); }
  }
}
'@
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $null; $result = $null
  try {
    $request = $line | ConvertFrom-Json
    $result = [KeyflowThumbnail]::Read([string]$request.path)
  } catch { }
  if ($request) { [Console]::WriteLine(('{0}:{1}' -f $request.id, $result)) }
}
`;

let worker: ChildProcessWithoutNullStreams | null = null;
let sequence = 0;
const pending = new Map<string, { finish: (image: Buffer | null) => void }>();

export function disposeShellThumbnail(): void {
  const old = worker;
  worker = null;
  if (old) { old.stdin.end(); old.kill(); }
  for (const request of pending.values()) request.finish(null);
  pending.clear();
}

export function warmShellThumbnail(): void {
  if (process.platform !== "win32" || worker) return;
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {windowsHide:true, stdio:"pipe"});
  worker = child;
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
    if (output.length > 16 * 1024 * 1024) { disposeShellThumbnail(); return; }
    for (let end = output.indexOf("\n"); end >= 0; end = output.indexOf("\n")) {
      const line = output.slice(0, end).trim(); output = output.slice(end + 1);
      const separator = line.indexOf(":");
      const request = separator < 0 ? null : pending.get(line.slice(0, separator));
      if (!request) continue;
      const base64 = line.slice(separator + 1);
      const image = /^[A-Za-z0-9+/=]+$/.test(base64) ? Buffer.from(base64, "base64") : null;
      request.finish(image && image.length > 8 && image.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? image : null);
    }
  });
  child.stderr.resume();
  const stopped = () => { if (worker === child) disposeShellThumbnail(); };
  child.stdout.on("error", stopped);
  child.stdin.on("error", stopped);
  child.on("error", stopped);
  child.on("close", stopped);
}

export function readShellThumbnail(path: string, signal?: AbortSignal): Promise<Buffer | null> {
  if (process.platform !== "win32" || signal?.aborted) return Promise.resolve(null);
  warmShellThumbnail();
  const child = worker;
  if (!child) return Promise.resolve(null);
  return new Promise(resolve => {
    const id = String(++sequence);
    let finished = false;
    const finish = (result: Buffer | null) => {
      if (finished) return;
      finished = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); pending.delete(id); resolve(result);
    };
    // A hung provider must not delay subsequent previews.
    const abort = () => { if (worker === child) disposeShellThumbnail(); else finish(null); };
    const timer = setTimeout(abort, 10000);
    pending.set(id, {finish});
    signal?.addEventListener("abort", abort, {once:true});
    child.stdin.write(JSON.stringify({id,path}) + "\n");
  });
}
