param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
$BackupPath = (Resolve-Path $BackupPath).Path
$manifestPath = Join-Path $BackupPath "manifest.json"
if (-not (Test-Path $manifestPath)) { throw "Invalid backup: manifest.json not found in $BackupPath" }

$listening = $false
try { $listening = [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) }
catch { $listening = [bool](netstat -ano | Select-String -Pattern ':3000\s+.*LISTENING') }
if ($listening) { throw "Scoreboard server is still listening on TCP 3000. Run STOP-SCOREBOARD.cmd before restore." }

foreach ($name in @("data", "obs", "config")) {
  if (-not (Test-Path (Join-Path $BackupPath $name))) { throw "Invalid backup: missing $name directory" }
}

$backupScript = Join-Path $PSScriptRoot "backup-scoreboard.ps1"
& $backupScript -Root $Root -Label "pre-restore" | Out-Null

$runtimeRoot = Join-Path $Root "runtime"
foreach ($name in @("data", "obs", "config")) {
  $target = Join-Path $runtimeRoot $name
  $source = Join-Path $BackupPath $name
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -Path $target -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
  Get-ChildItem -Path $source -Force | Copy-Item -Destination $target -Recurse -Force
}

Write-Host "Restore completed from: $BackupPath"
Write-Host "Start the scoreboard and open /status before returning to field operation."
