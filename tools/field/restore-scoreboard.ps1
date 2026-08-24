param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 0
)

$ErrorActionPreference = "Stop"
$BackupPath = (Resolve-Path $BackupPath).Path
$Root = (Resolve-Path $Root).Path
if ($Port -le 0) {
  if ($env:PORT -match '^\d+$' -and [int]$env:PORT -gt 0) { $Port = [int]$env:PORT }
  else { $Port = 3000 }
}

$manifestPath = Join-Path $BackupPath "manifest.json"
if (-not (Test-Path $manifestPath)) { throw "Invalid backup: manifest.json not found in $BackupPath" }

$pidFile = Join-Path $Root "runtime\scoreboard.pid.json"
if (Test-Path $pidFile) {
  try { $record = Get-Content $pidFile -Raw | ConvertFrom-Json }
  catch { throw "Invalid scoreboard PID file: $pidFile. Verify the scoreboard is stopped before restoring." }

  $managedPid = [int]$record.pid
  if (Get-Process -Id $managedPid -ErrorAction SilentlyContinue) {
    throw "Managed Robot Scoreboard PID $managedPid is still running. Run STOP-SCOREBOARD.cmd before restore."
  }

  Remove-Item $pidFile -Force
  Write-Host "Removed stale scoreboard PID record for PID $managedPid."
}

$listening = $false
try { $listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
catch { $listening = [bool](netstat -ano | Select-String -Pattern (":$Port\s+.*LISTENING")) }
if ($listening) { throw "A process is still listening on TCP $Port. Stop the scoreboard and verify the port is free before restore." }

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
