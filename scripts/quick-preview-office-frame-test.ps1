$ErrorActionPreference = 'Stop'
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\electron\office-handler-worker.ps1') -Raw
$match = [regex]::Match($source, "(?s)-TypeDefinition @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) { throw 'Office handler source not found' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition $match.Groups[1].Value
$frameType = [OfficePreview].Assembly.GetType('Frame', $true)
$flags = [Reflection.BindingFlags]'Instance,Public,NonPublic'
$frame = [Activator]::CreateInstance($frameType, $flags, $null, [object[]]@(32, 0, $true), $null)
$message = [NativeMessage]::new()
$message.message = 0x100
$message.wParam = [IntPtr]27
$arguments = [object[]]@($message)
$result = $frameType.GetMethod('TranslateAccelerator', $flags).Invoke($frame, $arguments)
if ($result -ne 0) { throw "Enabled Escape was not handled: $result" }
$disabled = [Activator]::CreateInstance($frameType, $flags, $null, [object[]]@(32, 0, $false), $null)
$arguments = [object[]]@($message)
$result = $frameType.GetMethod('TranslateAccelerator', $flags).Invoke($disabled, $arguments)
if ($result -ne 1) { throw "Disabled Escape was handled: $result" }
$shouldClose = $frameType.GetMethod('ShouldClose', [Reflection.BindingFlags]'Static,NonPublic')
function Assert-Decision([bool]$expected, [object[]]$values) {
  $actual = $shouldClose.Invoke($null, $values)
  if ($actual -ne $expected) { throw "Unexpected shortcut decision for $($values -join ', '): $actual" }
}
Assert-Decision $true  ([object[]]@(32,0,32,0,$true,$false))
Assert-Decision $false ([object[]]@(32,0,32,0,$true,$true))
Assert-Decision $true  ([object[]]@(32,2,32,2,$true,$false))
Assert-Decision $false ([object[]]@(32,0,32,2,$true,$false))
Assert-Decision $true  ([object[]]@(27,0,32,0,$true,$true))
Assert-Decision $false ([object[]]@(27,2,32,0,$true,$false))
Assert-Decision $false ([object[]]@(27,0,32,0,$false,$false))
Write-Output 'PASS: Office frame Escape, custom shortcut, modifiers, and typing guard'
